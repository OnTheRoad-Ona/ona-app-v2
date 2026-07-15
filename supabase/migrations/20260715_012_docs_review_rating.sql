-- Certification document review + one-time +1 star on admin approval
-- New pros start under_review (set on signup). Existing rows default approved.

alter table public.repair_pro_profiles
  add column if not exists docs_status text not null default 'approved',
  add column if not exists docs_rating_boost_applied boolean not null default false,
  add column if not exists certification_file_name text,
  add column if not exists certification_file_url text,
  add column if not exists docs_submitted_at timestamptz,
  add column if not exists docs_reviewed_at timestamptz,
  add column if not exists docs_reviewed_by uuid;

-- Constrain status values (idempotent)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'repair_pro_profiles_docs_status_check'
  ) then
    alter table public.repair_pro_profiles
      add constraint repair_pro_profiles_docs_status_check
      check (docs_status in ('none', 'under_review', 'approved', 'rejected'));
  end if;
end $$;

comment on column public.repair_pro_profiles.docs_status is
  'Certification review: under_review caps discovery at 2 km until approved.';
comment on column public.repair_pro_profiles.docs_rating_boost_applied is
  'True after one-time +1 rating_avg on document approval (never re-apply).';
