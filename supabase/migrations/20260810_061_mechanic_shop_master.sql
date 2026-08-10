-- ============================================================
-- ONA Mechanic Shop — master catalog + seller listings
-- Extends existing shop_* (does not replace).
-- Rules:
--   - Master product has NO price columns
--   - Listing/inventory layer owns status + commercial data
--   - product_trades M:N for cross-trade products
-- ============================================================

-- Listing availability statuses (six + convenience ALL is UI-only)
do $$ begin
  create type public.shop_listing_status as enum (
    'available',
    'low_stock',
    'out_of_stock',
    'pre_order',
    'coming_soon',
    'discontinued'
  );
exception when duplicate_object then null;
end $$;

-- Platform seller (Ona is the v1 seller)
create table if not exists public.shop_sellers (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  seller_type text not null default 'platform'
    check (seller_type in ('platform', 'partner', 'workshop')),
  is_active boolean not null default true,
  verification_status text not null default 'verified'
    check (verification_status in ('unverified', 'pending', 'verified', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.shop_sellers (slug, name, seller_type, verification_status)
values ('ona-platform', 'Ona Catalog', 'platform', 'verified')
on conflict (slug) do nothing;

-- Product ↔ trade many-to-many (master product identity)
create table if not exists public.shop_product_trades (
  product_id uuid not null references public.shop_products (id) on delete cascade,
  trade_key text not null,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (product_id, trade_key)
);

create index if not exists shop_product_trades_trade_idx
  on public.shop_product_trades (trade_key);

-- Backfill: every existing product gets its trade_key as primary trade
insert into public.shop_product_trades (product_id, trade_key, is_primary)
select p.id, p.trade_key, true
from public.shop_products p
where p.trade_key is not null
on conflict (product_id, trade_key) do nothing;

-- Product family (optional grouping under subcategory)
create table if not exists public.shop_product_families (
  id uuid primary key default gen_random_uuid(),
  trade_key text not null default 'mechanic',
  category_id uuid references public.shop_trade_categories (id) on delete set null,
  slug text not null,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  unique (trade_key, slug)
);

alter table public.shop_products
  add column if not exists family_id uuid references public.shop_product_families (id) on delete set null,
  add column if not exists part_number text,
  add column if not exists authenticity text
    check (authenticity is null or authenticity in (
      'oem_genuine', 'oem_equivalent', 'aftermarket', 'unknown', 'unverified'
    )),
  add column if not exists nigeria_priority int not null default 50,
  add column if not exists needs_admin_review boolean not null default false,
  add column if not exists verification_notes text;

-- Seller listings — commercial layer (status lives here, not master price)
create table if not exists public.shop_seller_listings (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.shop_products (id) on delete cascade,
  variant_id uuid references public.shop_product_variants (id) on delete set null,
  seller_id uuid not null references public.shop_sellers (id) on delete restrict,
  listing_status public.shop_listing_status not null default 'available',
  low_stock_threshold int not null default 5,
  qty_available int not null default 0 check (qty_available >= 0),
  -- Price on LISTING only (never on master product)
  currency text not null default 'NGN',
  price_minor bigint check (price_minor is null or price_minor >= 0),
  compare_at_minor bigint,
  location_city text,
  location_state text,
  is_active boolean not null default true,
  seller_claimed_condition text,
  warranty_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists shop_seller_listings_product_idx
  on public.shop_seller_listings (product_id);
create index if not exists shop_seller_listings_status_idx
  on public.shop_seller_listings (listing_status)
  where is_active = true;
create index if not exists shop_seller_listings_seller_idx
  on public.shop_seller_listings (seller_id);

-- Zero-result / demand intelligence
create table if not exists public.shop_product_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  trade_key text not null default 'mechanic',
  search_term text not null,
  vehicle_context jsonb not null default '{}'::jsonb,
  location text,
  notify_requested boolean not null default false,
  status text not null default 'open'
    check (status in ('open', 'reviewing', 'fulfilled', 'rejected', 'closed')),
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists shop_product_requests_term_idx
  on public.shop_product_requests (lower(search_term));
create index if not exists shop_product_requests_status_idx
  on public.shop_product_requests (status);

-- Enrich search events for analytics
alter table public.shop_search_events
  add column if not exists trade_key text,
  add column if not exists zero_result boolean not null default false,
  add column if not exists vehicle_make text,
  add column if not exists vehicle_model text,
  add column if not exists vehicle_year int;

create index if not exists shop_search_events_zero_idx
  on public.shop_search_events (zero_result)
  where zero_result = true;

-- View: listing availability for mechanic shop filters
create or replace view public.shop_listing_availability_view as
select
  l.id as listing_id,
  l.product_id,
  l.variant_id,
  l.seller_id,
  l.listing_status,
  l.qty_available,
  l.price_minor,
  l.currency,
  l.is_active,
  p.slug as product_slug,
  p.name as product_name,
  p.trade_key as primary_trade_key,
  p.status as product_status,
  p.primary_image_url,
  p.needs_admin_review
from public.shop_seller_listings l
join public.shop_products p on p.id = l.product_id;

comment on table public.shop_seller_listings is
  'Commercial listing layer. Prices and availability statuses live here — never on master product.';
comment on table public.shop_product_trades is
  'Many-to-many product ↔ Ona trade (Mechanic primary, cross-trade allowed).';
comment on table public.shop_product_requests is
  'Zero-result / demand intelligence from Mechanic search.';
