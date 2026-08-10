-- ============================================================
-- ONA SHOP data engine (Phase 2)
-- Data acquisition: sources → connectors → import jobs → batches
-- → staging records → validation → dedup → canonical catalog.
-- Every connector reports: source, license/status, records
-- discovered/imported/rejected/updated, errors, last/next sync.
-- ============================================================

create extension if not exists pg_trgm;

-- ------------------------------------------------------------
-- 1) Product catalog enrichment
-- ------------------------------------------------------------
alter table public.shop_products
  add column if not exists attributes jsonb not null default '{}'::jsonb,
  add column if not exists keywords text[] not null default '{}'::text[],
  add column if not exists is_demo boolean not null default false,
  add column if not exists source_key text,
  add column if not exists external_item_id text;

-- Phase 2 product statuses: catalog existence vs availability vs lifecycle.
-- "unavailable" = catalog exists but not purchasable right now (never "does not exist").
alter table public.shop_products drop constraint if exists shop_products_status_check;
alter table public.shop_products
  add constraint shop_products_status_check
  check (status in (
    'draft', 'active', 'archived',
    'inactive', 'unavailable', 'discontinued',
    'pending_verification', 'source_pending', 'future_product'
  ));

-- Dedup + normalized part keys on variants (canonical part identity).
alter table public.shop_product_variants
  add column if not exists dedup_key text,
  add column if not exists normalized_mpn text,
  add column if not exists normalized_oem text;

create unique index if not exists shop_product_variants_dedup_key_uidx
  on public.shop_product_variants (dedup_key)
  where dedup_key is not null;

-- Partial search (SKU / part number / name substring)
create index if not exists shop_products_name_trgm_idx
  on public.shop_products using gin (name gin_trgm_ops);
create index if not exists shop_products_subtitle_trgm_idx
  on public.shop_products using gin (subtitle gin_trgm_ops);
create index if not exists shop_variants_sku_trgm_idx
  on public.shop_product_variants using gin (sku gin_trgm_ops);
create index if not exists shop_variants_mpn_trgm_idx
  on public.shop_product_variants using gin (mpn gin_trgm_ops);
create index if not exists shop_variants_oem_trgm_idx
  on public.shop_product_variants using gin (oem_number gin_trgm_ops);

-- Attribute + keyword search
create index if not exists shop_products_attributes_gin_idx
  on public.shop_products using gin (attributes);
create index if not exists shop_products_keywords_gin_idx
  on public.shop_products using gin (keywords);

-- Keep search_document in sync (name + subtitle + keywords)
create or replace function public.ona_shop_rebuild_search_document()
returns trigger
language plpgsql
as $$
begin
  new.search_document := to_tsvector(
    'english',
    coalesce(new.name, '') || ' ' ||
    coalesce(new.subtitle, '') || ' ' ||
    coalesce(array_to_string(new.keywords, ' '), '') || ' ' ||
    coalesce(new.slug, '')
  );
  return new;
end;
$$;

drop trigger if exists trg_ona_shop_search_document
  on public.shop_products;
create trigger trg_ona_shop_search_document
  before insert or update of name, subtitle, keywords, slug
  on public.shop_products
  for each row
  execute function public.ona_shop_rebuild_search_document();

-- ------------------------------------------------------------
-- 2) Data source registry
-- ------------------------------------------------------------
create table if not exists public.shop_data_sources (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  kind text not null default 'api'
    check (kind in ('api', 'demo', 'manual', 'csv', 'feed')),
  license text,
  license_url text,
  homepage_url text,
  status text not null default 'ok'
    check (status in ('ok', 'error', 'disabled')),
  records_discovered int not null default 0,
  records_imported int not null default 0,
  records_rejected int not null default 0,
  records_updated int not null default 0,
  last_sync_at timestamptz,
  next_sync_at timestamptz,
  last_error text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shop_source_connectors (
  id uuid primary key default gen_random_uuid(),
  data_source_id uuid not null references public.shop_data_sources (id) on delete cascade,
  code text not null unique,
  name text not null,
  connector_type text not null default 'generic',
  config jsonb not null default '{}'::jsonb,
  status text not null default 'idle'
    check (status in ('idle', 'running', 'ok', 'error')),
  records_discovered int not null default 0,
  records_imported int not null default 0,
  records_rejected int not null default 0,
  records_updated int not null default 0,
  last_sync_at timestamptz,
  next_sync_at timestamptz,
  last_error text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists shop_source_connectors_source_idx
  on public.shop_source_connectors (data_source_id);

-- ------------------------------------------------------------
-- 3) Import jobs + batches
-- ------------------------------------------------------------
create table if not exists public.shop_import_jobs (
  id uuid primary key default gen_random_uuid(),
  data_source_id uuid references public.shop_data_sources (id) on delete set null,
  connector_id uuid references public.shop_source_connectors (id) on delete set null,
  job_type text not null default 'full'
    check (job_type in ('full', 'incremental', 'demo', 'verify')),
  status text not null default 'queued'
    check (status in ('queued', 'running', 'succeeded', 'failed', 'partial')),
  records_discovered int not null default 0,
  records_imported int not null default 0,
  records_rejected int not null default 0,
  records_updated int not null default 0,
  started_at timestamptz,
  finished_at timestamptz,
  error_summary jsonb not null default '[]'::jsonb,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists shop_import_jobs_source_idx
  on public.shop_import_jobs (data_source_id, created_at desc);

create table if not exists public.shop_import_batches (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.shop_import_jobs (id) on delete cascade,
  batch_no int not null default 1,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'succeeded', 'failed')),
  records_total int not null default 0,
  records_imported int not null default 0,
  records_rejected int not null default 0,
  records_updated int not null default 0,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  unique (job_id, batch_no)
);

-- ------------------------------------------------------------
-- 4) Staging records + validation + dedup + change log
-- ------------------------------------------------------------
create table if not exists public.shop_staging_records (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.shop_import_jobs (id) on delete cascade,
  batch_id uuid references public.shop_import_batches (id) on delete set null,
  data_source_id uuid references public.shop_data_sources (id) on delete set null,
  external_id text,
  external_category text,
  trade_key text,
  category_slug text,
  subcategory_slug text,
  product_type text,
  raw_data jsonb not null default '{}'::jsonb,
  normalized_data jsonb,
  dedup_key text,
  checksum text,
  status text not null default 'staged'
    check (status in (
      'staged', 'validated', 'rejected', 'duplicate', 'imported', 'error'
    )),
  errors jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists shop_staging_records_job_idx
  on public.shop_staging_records (job_id);
create index if not exists shop_staging_records_status_idx
  on public.shop_staging_records (status);
create index if not exists shop_staging_records_dedup_idx
  on public.shop_staging_records (dedup_key);

create table if not exists public.shop_validation_results (
  id uuid primary key default gen_random_uuid(),
  staging_record_id uuid not null references public.shop_staging_records (id) on delete cascade,
  job_id uuid references public.shop_import_jobs (id) on delete cascade,
  rule_key text not null,
  rule_level text not null default 'error'
    check (rule_level in ('error', 'warning')),
  field text,
  message text not null,
  passed boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists shop_validation_results_record_idx
  on public.shop_validation_results (staging_record_id);

create table if not exists public.shop_dedup_results (
  id uuid primary key default gen_random_uuid(),
  staging_record_id uuid not null references public.shop_staging_records (id) on delete cascade,
  job_id uuid references public.shop_import_jobs (id) on delete cascade,
  candidate_product_id uuid references public.shop_products (id) on delete set null,
  candidate_variant_id uuid references public.shop_product_variants (id) on delete set null,
  match_type text not null default 'none'
    check (match_type in ('exact', 'fuzzy', 'none')),
  score numeric not null default 0,
  decided boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.shop_source_change_log (
  id uuid primary key default gen_random_uuid(),
  data_source_id uuid references public.shop_data_sources (id) on delete set null,
  job_id uuid references public.shop_import_jobs (id) on delete set null,
  staging_record_id uuid references public.shop_staging_records (id) on delete set null,
  action text not null
    check (action in ('insert', 'update', 'noop', 'reject')),
  product_id uuid references public.shop_products (id) on delete set null,
  variant_id uuid references public.shop_product_variants (id) on delete set null,
  field text,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);

create index if not exists shop_source_change_log_source_idx
  on public.shop_source_change_log (data_source_id, created_at desc);

-- ------------------------------------------------------------
-- 5) External category → Ona taxonomy mapping
--    external category → Ona trade → Ona category → subcategory
-- ------------------------------------------------------------
create table if not exists public.shop_external_category_map (
  id uuid primary key default gen_random_uuid(),
  data_source_id uuid references public.shop_data_sources (id) on delete cascade,
  external_path text not null,
  trade_key text not null,
  category_slug text,
  subcategory_slug text,
  product_type text,
  status text not null default 'mapped'
    check (status in ('mapped', 'unmapped', 'ignored')),
  created_at timestamptz not null default now(),
  unique (data_source_id, external_path)
);

-- ------------------------------------------------------------
-- 6) Availability view — catalog existence vs stock vs price.
--    A product that exists but has no stock/price is "unavailable",
--    never "not found".
-- ------------------------------------------------------------
create or replace view public.shop_availability_view as
select
  p.id as product_id,
  p.slug,
  p.name,
  p.trade_key,
  p.status as product_status,
  (p.status in ('active', 'inactive', 'unavailable', 'discontinued', 'pending_verification', 'source_pending', 'future_product')) as catalog_exists,
  (p.status = 'active') as catalog_active,
  exists (
    select 1 from public.shop_product_variants v
    where v.product_id = p.id and v.status = 'active'
  ) as has_variant,
  exists (
    select 1 from public.shop_prices pr
    join public.shop_product_variants v on v.id = pr.variant_id
    where v.product_id = p.id and pr.is_active = true
  ) as has_price,
  exists (
    select 1 from public.shop_inventory inv
    join public.shop_product_variants v on v.id = inv.variant_id
    where v.product_id = p.id and inv.qty_on_hand - inv.qty_reserved > 0
  ) as in_stock,
  (
    p.status = 'active'
    and exists (
      select 1 from public.shop_prices pr
      join public.shop_product_variants v on v.id = pr.variant_id
      where v.product_id = p.id and pr.is_active = true
    )
    and exists (
      select 1 from public.shop_inventory inv
      join public.shop_product_variants v on v.id = inv.variant_id
      where v.product_id = p.id and inv.qty_on_hand - inv.qty_reserved > 0
    )
  ) as available
from public.shop_products p;

comment on view public.shop_availability_view is
  'Availability is separate from catalog existence: an existing product with no stock/price is "unavailable", not "does not exist".';

-- ------------------------------------------------------------
-- 7) Seed: demo + NHTSA data sources
-- ------------------------------------------------------------
insert into public.shop_data_sources (code, name, kind, license, license_url, homepage_url, status)
values (
  'ona_demo',
  'Ona Demo Catalog',
  'demo',
  'Ona proprietary demo data (synthetic, non-infringing)',
  null,
  null,
  'ok'
)
on conflict (code) do nothing;

insert into public.shop_data_sources (code, name, kind, license, license_url, homepage_url, status)
values (
  'nhtsa_vpic',
  'NHTSA vPIC',
  'api',
  'NHTSA Open Data (public domain, free of charge)',
  'https://vpic.nhtsa.dot.gov/',
  'https://vpic.nhtsa.dot.gov/api/vehicles',
  'ok'
)
on conflict (code) do nothing;
