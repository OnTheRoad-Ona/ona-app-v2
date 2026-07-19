-- Unlimited motorist vehicles (JSON array on motorist_profiles)
alter table public.motorist_profiles
  add column if not exists vehicles jsonb not null default '[]'::jsonb;
