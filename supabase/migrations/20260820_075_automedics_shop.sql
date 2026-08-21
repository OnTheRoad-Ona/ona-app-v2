-- Automedics Shop: soft-delete products, job part recommendations.

alter table public.shop_products
  add column if not exists deleted_at timestamptz;

create index if not exists shop_products_deleted_at_idx
  on public.shop_products (deleted_at)
  where deleted_at is not null;

create table if not exists public.shop_job_recommendations (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.service_requests (id) on delete cascade,
  product_id uuid not null references public.shop_products (id) on delete cascade,
  variant_id uuid references public.shop_product_variants (id) on delete set null,
  recommended_by uuid not null,
  note text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists shop_job_recommendations_active_uniq
  on public.shop_job_recommendations (job_id, product_id)
  where deleted_at is null;

create index if not exists shop_job_recommendations_job_idx
  on public.shop_job_recommendations (job_id)
  where deleted_at is null;

alter table public.shop_job_recommendations enable row level security;
