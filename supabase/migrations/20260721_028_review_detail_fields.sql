-- Full review detail fields for Customer + Repair Pro admin queues

-- Customer (motorist)
alter table public.motorist_profiles
  add column if not exists phone_verified_at timestamptz,
  add column if not exists gov_id_number text,
  add column if not exists bank_id_number text,
  add column if not exists identity_country_iso text,
  add column if not exists review_checklist jsonb not null default '{}'::jsonb;

comment on column public.motorist_profiles.gov_id_number is
  'Full government ID number for admin/care review (sensitive)';
comment on column public.motorist_profiles.bank_id_number is
  'Secondary ID e.g. BVN full number for admin review (sensitive)';
comment on column public.motorist_profiles.review_checklist is
  'Admin checklist ticks during Tier 2 review';

-- Repair Pro — mirror for ID images / numbers in DB (not only local artisan store)
alter table public.repair_pro_profiles
  add column if not exists gov_id_kind text,
  add column if not exists gov_id_number text,
  add column if not exists gov_id_front_url text,
  add column if not exists gov_id_back_url text,
  add column if not exists gov_id_review_status text not null default 'none',
  add column if not exists gov_id_submitted_at timestamptz,
  add column if not exists gov_id_reviewed_at timestamptz,
  add column if not exists phone_verified boolean not null default false,
  add column if not exists phone_verified_at timestamptz,
  add column if not exists face_liveness_selfie_url text,
  add column if not exists review_checklist jsonb not null default '{}'::jsonb;

comment on column public.repair_pro_profiles.gov_id_review_status is
  'none | submitted | approved | rejected';

-- Backfill customer full numbers from encrypted if present
update public.motorist_profiles
set gov_id_number = coalesce(gov_id_number, nin_encrypted)
where gov_id_number is null and nin_encrypted is not null;

update public.motorist_profiles
set bank_id_number = coalesce(bank_id_number, bvn_encrypted)
where bank_id_number is null and bvn_encrypted is not null;
