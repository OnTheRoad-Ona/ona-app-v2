-- Motorist identity verification fields (mirror repair_pro_profiles)
alter table public.motorist_profiles
  add column if not exists nin_last4 text,
  add column if not exists bvn_last4 text,
  add column if not exists nin_verified boolean not null default false,
  add column if not exists bvn_verified boolean not null default false,
  add column if not exists identity_verified_at timestamptz;
