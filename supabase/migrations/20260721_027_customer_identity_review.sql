-- Customer (motorist) Tier 2 ID review queue
-- Submissions must land in DB with an explicit review status so admin can find them.

alter table public.motorist_profiles
  add column if not exists identity_review_status text not null default 'none',
  add column if not exists identity_submitted_at timestamptz,
  add column if not exists identity_reviewed_at timestamptz,
  add column if not exists identity_reviewed_by uuid references public.profiles (id) on delete set null,
  add column if not exists identity_rejection_reason text,
  add column if not exists gov_id_kind text,
  add column if not exists gov_id_front_url text,
  add column if not exists gov_id_back_url text,
  add column if not exists gov_id_meta jsonb not null default '{}'::jsonb,
  add column if not exists phone_verified boolean not null default false,
  add column if not exists first_service_at timestamptz;

comment on column public.motorist_profiles.identity_review_status is
  'none | submitted | approved | rejected — Customer Tier 2 government ID review';

comment on column public.motorist_profiles.gov_id_front_url is
  'Customer ID photo (URL or data URL) for admin review';

comment on column public.motorist_profiles.first_service_at is
  'First gated request timestamp — starts 30-day free window';

-- Backfill: anyone with ID digits on file but not verified → submitted (pending review)
update public.motorist_profiles
set
  identity_review_status = 'submitted',
  identity_submitted_at = coalesce(identity_submitted_at, updated_at, created_at, now())
where identity_review_status = 'none'
  and identity_verified_at is null
  and (nin_verified is not true)
  and (
    (nin_last4 is not null and length(trim(nin_last4)) > 0)
    or (bvn_last4 is not null and length(trim(bvn_last4)) > 0)
  );

-- Already approved by care
update public.motorist_profiles
set identity_review_status = 'approved'
where identity_verified_at is not null
  and identity_review_status = 'none';

create index if not exists motorist_identity_review_idx
  on public.motorist_profiles (identity_review_status, identity_submitted_at desc nulls last);
