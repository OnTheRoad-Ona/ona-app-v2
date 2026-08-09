-- Smart catalog extensions: fitment verification, vehicle source metadata, garage helper index

-- Fitment confidence (E1: only show "Fits" for real data statuses)
alter table public.shop_product_fitments
  add column if not exists verification_status text not null default 'source_verified'
    check (verification_status in (
      'unverified', 'source_verified', 'ona_verified', 'admin_verified', 'conflicted', 'rejected'
    ));

alter table public.shop_product_fitments
  add column if not exists quantity_required int;

alter table public.shop_product_fitments
  add column if not exists notes_public text;

-- External IDs for free-source ingest (NHTSA etc.) — never overwrite Ona UUIDs
alter table public.vehicle_makes
  add column if not exists source text,
  add column if not exists source_id text,
  add column if not exists region text default 'NG';

alter table public.vehicle_models
  add column if not exists source text,
  add column if not exists source_id text,
  add column if not exists year_start int,
  add column if not exists year_end int;

create unique index if not exists vehicle_makes_source_id_uidx
  on public.vehicle_makes (source, source_id)
  where source is not null and source_id is not null;

create index if not exists user_vehicles_default_idx
  on public.user_vehicles (user_id)
  where is_default = true;

create index if not exists shop_fitments_make_model_year_idx
  on public.shop_product_fitments (make_id, model_id, year_start, year_end);

comment on column public.shop_product_fitments.verification_status is
  'Fitment confidence. UI must not show Fits badge unless source/ona/admin verified.';
