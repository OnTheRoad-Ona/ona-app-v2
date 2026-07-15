-- Dual-role profile extras + labour pricing columns (frontend parity)

-- Motorist extras
alter table public.motorist_profiles
  add column if not exists vehicle_photo text,
  add column if not exists vehicle_common_issues jsonb not null default '[]'::jsonb,
  add column if not exists emergency_contact jsonb,
  add column if not exists saved_locations jsonb not null default '[]'::jsonb,
  add column if not exists jobs_requested integer not null default 0,
  add column if not exists jobs_completed integer not null default 0,
  add column if not exists average_rating_given numeric(3, 2);

-- Repair pro extras (labour_prices / pricing_currency may already exist from 010)
alter table public.repair_pro_profiles
  add column if not exists labour_prices jsonb not null default '{}'::jsonb,
  add column if not exists pricing_currency text not null default 'NGN',
  add column if not exists bank_name text,
  add column if not exists bank_account_name text,
  add column if not exists bank_account_number text,
  add column if not exists cac_document_name text,
  add column if not exists cac_document_url text,
  add column if not exists face_liveness_verified boolean not null default false,
  add column if not exists face_liveness_at timestamptz,
  add column if not exists in_person_verified boolean not null default false,
  add column if not exists in_person_verified_at timestamptz,
  add column if not exists jobs_completed integer not null default 0,
  add column if not exists avg_response_minutes integer,
  add column if not exists completion_rate numeric(4, 3);

-- Profiles avatar already exists; ensure phone/email indexes remain
alter table public.profiles
  add column if not exists phone_verified boolean not null default false,
  add column if not exists email_verified boolean not null default false;

comment on column public.repair_pro_profiles.labour_prices is
  'Map of pro_service → major-unit labour fee. Spare parts never included.';
