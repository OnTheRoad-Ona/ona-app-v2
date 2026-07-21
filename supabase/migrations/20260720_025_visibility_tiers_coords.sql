-- Visibility ladder (Repair Pros) + location tracking metadata.
-- Tier 1 register · Tier 2 30% / 30-day Live · Tier 3 70% / 3km · Tier 4 100% / 10km

alter table public.repair_pro_profiles
  add column if not exists visibility_tier smallint not null default 1
    check (visibility_tier between 1 and 4);

alter table public.repair_pro_profiles
  add column if not exists tier2_approved_at timestamptz;

alter table public.repair_pro_profiles
  add column if not exists tier3_approved_at timestamptz;

alter table public.repair_pro_profiles
  add column if not exists tier4_approved_at timestamptz;

alter table public.repair_pro_profiles
  add column if not exists go_live_window_ends_at timestamptz;

alter table public.repair_pro_profiles
  add column if not exists is_new_artisan boolean not null default true;

alter table public.repair_pro_profiles
  add column if not exists tier4_one_star_seeded boolean not null default false;

-- Live GPS pin timestamps (lat/lng already exist)
alter table public.repair_pro_profiles
  add column if not exists location_updated_at timestamptz;

comment on column public.repair_pro_profiles.visibility_tier is
  'Admin ladder 1–4: discovery visibility and Go Live rights';
comment on column public.repair_pro_profiles.lat is
  'Live GPS latitude while is_online (required for discovery)';
comment on column public.repair_pro_profiles.lng is
  'Live GPS longitude while is_online (required for discovery)';
comment on column public.repair_pro_profiles.location_updated_at is
  'Last time lat/lng were written (Go Live or GPS heartbeat)';
comment on column public.repair_pro_profiles.go_live_window_ends_at is
  'Tier 2: Go Live expires 30 days after tier2_approved_at';

-- Spatial-ish lookup for nearby live pros
create index if not exists repair_pro_live_coords_idx
  on public.repair_pro_profiles (is_online, lat, lng)
  where is_online = true and lat is not null and lng is not null;

create index if not exists repair_pro_visibility_tier_idx
  on public.repair_pro_profiles (visibility_tier);

-- Motorist default pin timestamp
alter table public.motorist_profiles
  add column if not exists location_updated_at timestamptz;

comment on column public.motorist_profiles.default_lat is
  'Last known / home latitude for the motorist';
comment on column public.motorist_profiles.default_lng is
  'Last known / home longitude for the motorist';
