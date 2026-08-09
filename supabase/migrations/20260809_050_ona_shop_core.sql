-- ============================================================
-- ONA SHOP core schema (Phase 3)
-- Ona is the only seller. Buyers = profiles (customer + pro).
-- Shop payments are SEPARATE from job escrow (public.payments).
-- ============================================================

-- Extensions (safe if already present)
create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- Trade category tree (unlimited depth)
-- ------------------------------------------------------------
create table if not exists public.shop_trade_categories (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.shop_trade_categories (id) on delete cascade,
  trade_key text not null,
  slug text not null,
  name text not null,
  description text,
  icon_key text,
  sort_order int not null default 0,
  is_active boolean not null default true,
  depth int not null default 0,
  path text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (parent_id, slug)
);

create index if not exists shop_trade_categories_parent_idx
  on public.shop_trade_categories (parent_id);
create index if not exists shop_trade_categories_trade_key_idx
  on public.shop_trade_categories (trade_key);
create index if not exists shop_trade_categories_path_idx
  on public.shop_trade_categories using btree (path);

-- ------------------------------------------------------------
-- Brands / manufacturers
-- ------------------------------------------------------------
create table if not exists public.shop_brands (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  logo_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.shop_manufacturers (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  country text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- Products + variants
-- ------------------------------------------------------------
create table if not exists public.shop_products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.shop_trade_categories (id) on delete restrict,
  brand_id uuid references public.shop_brands (id) on delete set null,
  manufacturer_id uuid references public.shop_manufacturers (id) on delete set null,
  trade_key text not null,
  slug text not null unique,
  name text not null,
  subtitle text,
  description text,
  condition_type text
    check (condition_type is null or condition_type in (
      'oem', 'original', 'aftermarket', 'compatible', 'used', 'refurbished'
    )),
  primary_image_url text,
  status text not null default 'draft'
    check (status in ('draft', 'active', 'archived')),
  is_professional_only boolean not null default false,
  search_document tsvector,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists shop_products_category_idx
  on public.shop_products (category_id);
create index if not exists shop_products_trade_key_idx
  on public.shop_products (trade_key);
create index if not exists shop_products_status_idx
  on public.shop_products (status);
create index if not exists shop_products_search_idx
  on public.shop_products using gin (search_document);

create table if not exists public.shop_product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.shop_products (id) on delete cascade,
  sku text not null unique,
  mpn text,
  oem_number text,
  gtin text,
  barcode text,
  title text not null,
  option_label text,
  unit text not null default 'each',
  weight_grams int,
  length_mm int,
  width_mm int,
  height_mm int,
  status text not null default 'active'
    check (status in ('active', 'discontinued', 'hidden')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists shop_product_variants_product_idx
  on public.shop_product_variants (product_id);
create index if not exists shop_product_variants_mpn_idx
  on public.shop_product_variants (mpn);
create index if not exists shop_product_variants_oem_idx
  on public.shop_product_variants (oem_number);

-- Dynamic attributes
create table if not exists public.shop_attributes (
  id uuid primary key default gen_random_uuid(),
  trade_key text,
  key text not null,
  label text not null,
  data_type text not null default 'text'
    check (data_type in ('text', 'number', 'boolean', 'enum')),
  unit text,
  enum_values jsonb,
  filterable boolean not null default true,
  unique (trade_key, key)
);

create table if not exists public.shop_product_attributes (
  product_id uuid not null references public.shop_products (id) on delete cascade,
  attribute_id uuid not null references public.shop_attributes (id) on delete cascade,
  value_text text,
  value_number numeric,
  value_bool boolean,
  primary key (product_id, attribute_id)
);

-- ------------------------------------------------------------
-- Vehicle garage + fitment
-- ------------------------------------------------------------
create table if not exists public.vehicle_makes (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null
);

create table if not exists public.vehicle_models (
  id uuid primary key default gen_random_uuid(),
  make_id uuid not null references public.vehicle_makes (id) on delete cascade,
  slug text not null,
  name text not null,
  unique (make_id, slug)
);

create table if not exists public.vehicle_generations (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null references public.vehicle_models (id) on delete cascade,
  name text not null,
  year_start int,
  year_end int
);

create table if not exists public.vehicle_variants (
  id uuid primary key default gen_random_uuid(),
  generation_id uuid not null references public.vehicle_generations (id) on delete cascade,
  name text not null,
  engine text,
  engine_code text,
  transmission text,
  fuel_type text,
  drive_type text,
  trim text
);

create table if not exists public.user_vehicles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  make_id uuid references public.vehicle_makes (id) on delete set null,
  model_id uuid references public.vehicle_models (id) on delete set null,
  generation_id uuid references public.vehicle_generations (id) on delete set null,
  variant_id uuid references public.vehicle_variants (id) on delete set null,
  make_name text not null,
  model_name text not null,
  year int,
  engine text,
  engine_code text,
  transmission text,
  fuel_type text,
  drive_type text,
  trim text,
  vin text,
  nickname text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_vehicles_user_idx
  on public.user_vehicles (user_id);

create table if not exists public.shop_product_fitments (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references public.shop_product_variants (id) on delete cascade,
  make_id uuid references public.vehicle_makes (id) on delete cascade,
  model_id uuid references public.vehicle_models (id) on delete cascade,
  generation_id uuid references public.vehicle_generations (id) on delete set null,
  year_start int,
  year_end int,
  engine text,
  engine_code text,
  transmission text,
  fuel_type text,
  trim text,
  position text,
  fitment_status text not null default 'compatible'
    check (fitment_status in (
      'direct_fit', 'compatible', 'conditional', 'unknown', 'not_compatible'
    )),
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists shop_product_fitments_variant_idx
  on public.shop_product_fitments (variant_id);
create index if not exists shop_product_fitments_make_model_idx
  on public.shop_product_fitments (make_id, model_id);

-- Non-auto equipment compatibility
create table if not exists public.shop_equipment_models (
  id uuid primary key default gen_random_uuid(),
  trade_key text not null,
  brand text,
  model_name text not null,
  model_number text,
  year int,
  specs jsonb not null default '{}'::jsonb,
  unique (trade_key, brand, model_name, model_number)
);

create table if not exists public.shop_product_compatibility (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references public.shop_product_variants (id) on delete cascade,
  equipment_id uuid references public.shop_equipment_models (id) on delete cascade,
  status text not null default 'compatible'
    check (status in (
      'direct_fit', 'compatible', 'conditional', 'unknown', 'not_compatible'
    )),
  notes text,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- Inventory + pricing
-- ------------------------------------------------------------
create table if not exists public.shop_inventory_locations (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  city text,
  state text,
  lat double precision,
  lng double precision,
  is_active boolean not null default true
);

create table if not exists public.shop_inventory (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references public.shop_product_variants (id) on delete cascade,
  location_id uuid not null references public.shop_inventory_locations (id) on delete cascade,
  qty_on_hand int not null default 0 check (qty_on_hand >= 0),
  qty_reserved int not null default 0 check (qty_reserved >= 0),
  reorder_level int not null default 0,
  updated_at timestamptz not null default now(),
  unique (variant_id, location_id),
  check (qty_reserved <= qty_on_hand)
);

create table if not exists public.shop_inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references public.shop_product_variants (id) on delete cascade,
  location_id uuid not null references public.shop_inventory_locations (id) on delete cascade,
  delta int not null,
  reason text not null,
  ref_type text,
  ref_id uuid,
  actor_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.shop_prices (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references public.shop_product_variants (id) on delete cascade,
  currency text not null default 'NGN',
  amount_minor bigint not null check (amount_minor >= 0),
  compare_at_minor bigint,
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  is_active boolean not null default true
);

create index if not exists shop_prices_variant_active_idx
  on public.shop_prices (variant_id, is_active);

-- ------------------------------------------------------------
-- Cart / orders / payments (NOT job escrow)
-- ------------------------------------------------------------
create table if not exists public.shop_carts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  account_context text not null default 'motorist'
    check (account_context in ('motorist', 'professional')),
  currency text not null default 'NGN',
  status text not null default 'open'
    check (status in ('open', 'converted', 'abandoned')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists shop_carts_one_open_per_user_ctx
  on public.shop_carts (user_id, account_context)
  where status = 'open';

create table if not exists public.shop_cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references public.shop_carts (id) on delete cascade,
  variant_id uuid not null references public.shop_product_variants (id) on delete restrict,
  qty int not null check (qty > 0),
  unit_price_minor bigint not null check (unit_price_minor >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cart_id, variant_id)
);

create table if not exists public.shop_orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  user_id uuid not null references public.profiles (id) on delete restrict,
  account_context text not null default 'motorist'
    check (account_context in ('motorist', 'professional')),
  status text not null default 'pending_payment'
    check (status in (
      'pending_payment',
      'paid',
      'fulfilling',
      'out_for_delivery',
      'delivered',
      'cancelled',
      'refunded',
      'partially_refunded'
    )),
  currency text not null default 'NGN',
  subtotal_minor bigint not null default 0,
  delivery_fee_minor bigint not null default 0,
  discount_minor bigint not null default 0,
  total_minor bigint not null default 0,
  ship_to_address_id uuid references public.user_addresses (id) on delete set null,
  ship_to_snapshot jsonb not null default '{}'::jsonb,
  notes text,
  paid_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists shop_orders_user_idx
  on public.shop_orders (user_id, created_at desc);
create index if not exists shop_orders_status_idx
  on public.shop_orders (status);

create table if not exists public.shop_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.shop_orders (id) on delete cascade,
  variant_id uuid not null references public.shop_product_variants (id) on delete restrict,
  product_name text not null,
  variant_title text not null,
  sku text not null,
  qty int not null check (qty > 0),
  unit_price_minor bigint not null,
  line_total_minor bigint not null,
  created_at timestamptz not null default now()
);

create table if not exists public.shop_order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.shop_orders (id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  actor_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

-- Direct pay-now ledger (never FK to service_requests)
create table if not exists public.shop_payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.shop_orders (id) on delete restrict,
  user_id uuid not null references public.profiles (id) on delete restrict,
  provider text not null default 'flutterwave',
  provider_ref text unique,
  amount_minor bigint not null check (amount_minor >= 0),
  currency text not null default 'NGN',
  status text not null default 'pending'
    check (status in (
      'pending', 'processing', 'succeeded', 'failed', 'refunded', 'cancelled'
    )),
  raw_init jsonb,
  raw_verify jsonb,
  idempotency_key text unique,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists shop_payments_order_idx
  on public.shop_payments (order_id);

create table if not exists public.shop_deliveries (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.shop_orders (id) on delete cascade,
  status text not null default 'pending'
    check (status in (
      'pending',
      'assigned',
      'picked_up',
      'in_transit',
      'delivered',
      'failed',
      'cancelled'
    )),
  courier_name text,
  courier_phone text,
  tracking_code text,
  assigned_admin_id uuid,
  eta_at timestamptz,
  delivered_at timestamptz,
  notes text,
  events jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- Engagement + catalog ingestion + analytics
-- ------------------------------------------------------------
create table if not exists public.shop_saved_products (
  user_id uuid not null references public.profiles (id) on delete cascade,
  product_id uuid not null references public.shop_products (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

create table if not exists public.shop_recently_viewed (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  product_id uuid not null references public.shop_products (id) on delete cascade,
  viewed_at timestamptz not null default now()
);

create index if not exists shop_recently_viewed_user_idx
  on public.shop_recently_viewed (user_id, viewed_at desc);

create table if not exists public.shop_catalog_sources (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  license_notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.shop_catalog_import_jobs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.shop_catalog_sources (id) on delete set null,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'succeeded', 'failed', 'partial')),
  started_at timestamptz,
  finished_at timestamptz,
  stats jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.shop_catalog_import_errors (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.shop_catalog_import_jobs (id) on delete cascade,
  row_number int,
  raw jsonb,
  error_message text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.shop_search_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  query text not null,
  intent jsonb,
  result_count int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.shop_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- Feature flag + notification category extension
-- ------------------------------------------------------------
insert into public.feature_flags (key, enabled, description)
values (
  'shop',
  true,
  'ONA Shop repair commerce (catalog, cart, pay-now, delivery tracking)'
)
on conflict (key) do update set description = excluded.description;

-- Notifications: allow shop category if constrained
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'notifications_category_check'
  ) then
    alter table public.notifications drop constraint notifications_category_check;
  end if;
exception when undefined_table then
  null;
when undefined_object then
  null;
end $$;

do $$
begin
  alter table public.notifications
    add constraint notifications_category_check
    check (category in (
      'requests', 'messages', 'payments', 'system', 'shop'
    ));
exception when duplicate_object then
  null;
when undefined_table then
  null;
end $$;

-- ------------------------------------------------------------
-- Seed: inventory hub + top-level trades (match PRO_TRADE_OPTIONS)
-- ------------------------------------------------------------
insert into public.shop_inventory_locations (code, name, city, state)
values ('LOS-HUB-1', 'Lagos Hub', 'Lagos', 'Lagos')
on conflict (code) do nothing;

insert into public.shop_trade_categories (trade_key, slug, name, sort_order, depth, path)
values
  ('mechanic', 'mechanic', 'Mechanic', 1, 0, 'mechanic'),
  ('vulcanizer', 'vulcanizer', 'Vulcanizer', 2, 0, 'vulcanizer'),
  ('towing', 'towing', 'Tow', 3, 0, 'towing'),
  ('battery', 'battery', 'Battery', 4, 0, 'battery'),
  ('ac', 'ac', 'A/C', 5, 0, 'ac'),
  ('body', 'body', 'Body', 6, 0, 'body'),
  ('electrical', 'electrical', 'Electric', 7, 0, 'electrical'),
  ('diagnostics', 'diagnostics', 'Scan', 8, 0, 'diagnostics'),
  ('wash', 'wash', 'Wash', 9, 0, 'wash'),
  ('plumber', 'plumber', 'Plumber', 10, 0, 'plumber'),
  ('carpenter', 'carpenter', 'Carpenter', 11, 0, 'carpenter'),
  ('painter', 'painter', 'Painter', 12, 0, 'painter'),
  ('solar', 'solar', 'Solar', 13, 0, 'solar'),
  ('generator', 'generator', 'Generator', 14, 0, 'generator')
on conflict do nothing;

-- Subcategories (sample under mechanic / solar / plumber)
insert into public.shop_trade_categories (parent_id, trade_key, slug, name, sort_order, depth, path)
select c.id, 'mechanic', 'brake-system', 'Brake System', 1, 1, 'mechanic/brake-system'
from public.shop_trade_categories c
where c.slug = 'mechanic' and c.depth = 0
on conflict do nothing;

insert into public.shop_trade_categories (parent_id, trade_key, slug, name, sort_order, depth, path)
select c.id, 'mechanic', 'engine-oil', 'Engine Oil & Filters', 2, 1, 'mechanic/engine-oil'
from public.shop_trade_categories c
where c.slug = 'mechanic' and c.depth = 0
on conflict do nothing;

insert into public.shop_trade_categories (parent_id, trade_key, slug, name, sort_order, depth, path)
select c.id, 'solar', 'inverters', 'Inverters', 1, 1, 'solar/inverters'
from public.shop_trade_categories c
where c.slug = 'solar' and c.depth = 0
on conflict do nothing;

insert into public.shop_trade_categories (parent_id, trade_key, slug, name, sort_order, depth, path)
select c.id, 'plumber', 'pipes-fittings', 'Pipes & Fittings', 1, 1, 'plumber/pipes-fittings'
from public.shop_trade_categories c
where c.slug = 'plumber' and c.depth = 0
on conflict do nothing;

insert into public.shop_trade_categories (parent_id, trade_key, slug, name, sort_order, depth, path)
select c.id, 'generator', 'portable', 'Portable Generators', 1, 1, 'generator/portable'
from public.shop_trade_categories c
where c.slug = 'generator' and c.depth = 0
on conflict do nothing;

insert into public.shop_brands (slug, name)
values
  ('bosch', 'Bosch'),
  ('ngk', 'NGK'),
  ('toyota-genuine', 'Toyota Genuine'),
  ('luminous', 'Luminous'),
  ('felicity', 'Felicity'),
  ('generic-pro', 'Ona Pro')
on conflict (slug) do nothing;

insert into public.vehicle_makes (slug, name)
values ('toyota', 'Toyota'), ('honda', 'Honda'), ('mercedes-benz', 'Mercedes-Benz')
on conflict (slug) do nothing;

insert into public.vehicle_models (make_id, slug, name)
select m.id, 'camry', 'Camry' from public.vehicle_makes m where m.slug = 'toyota'
on conflict do nothing;

insert into public.vehicle_models (make_id, slug, name)
select m.id, 'corolla', 'Corolla' from public.vehicle_makes m where m.slug = 'toyota'
on conflict do nothing;

comment on table public.shop_payments is
  'Shop retail pay-now ledger. NEVER use public.payments (job escrow).';
comment on table public.shop_orders is
  'Shop merchandise orders. Distinct from /orders pro job desk.';
