-- Ona Artisan Registration & Verification (Supabase / Postgres)
-- Apply when ready to replace localStorage mock in local-store.ts
-- TODO(api): wire RLS so artisans read/write own row; admins manage all.

create type artisan_profile_status as enum (
  'draft',
  'pending_review',
  'approved',
  'rejected',
  'suspended'
);

create type artisan_gov_id_type as enum (
  'nin',
  'drivers_licence',
  'voters_card',
  'international_passport'
);

create table if not exists artisan_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  phone text not null,
  email text,
  status artisan_profile_status not null default 'draft',

  -- Tier completion flags
  tier1_phone boolean not null default false,
  tier2_gov_id boolean not null default false,
  tier2_bvn boolean not null default false,
  tier3_liveness boolean not null default false,
  tier4_skill_proof boolean not null default false,

  primary_service text not null,
  specialty text,
  years_experience int not null default 1 check (years_experience >= 1),
  service_states text[] not null default '{}',
  service_cities text[] not null default '{}',
  service_lgas text[] not null default '{}',
  tools_owned text[] not null default '{}',
  guarantor_name text,
  guarantor_phone text,

  gov_id_type artisan_gov_id_type,
  gov_id_number text,
  bvn text,
  bvn_verified boolean not null default false,
  liveness_passed boolean not null default false,

  is_new_artisan boolean not null default true,
  successful_jobs_count int not null default 0,

  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid,
  reject_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists artisan_media (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references artisan_profiles (user_id) on delete cascade,
  kind text not null check (
    kind in (
      'portfolio',
      'id_front',
      'id_back',
      'selfie',
      'skill_proof',
      'intro_video'
    )
  ),
  storage_path text not null,
  mime text,
  created_at timestamptz not null default now()
);

create index if not exists artisan_profiles_status_idx
  on artisan_profiles (status);

create index if not exists artisan_media_user_idx
  on artisan_media (user_id);

-- Go Live gate: only approved artisans may set is_online = true
-- (enforce in API that updates repair_pro_profiles.is_online)
