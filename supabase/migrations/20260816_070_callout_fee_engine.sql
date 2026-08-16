-- Ona Call-Out Fee Engine (Phase 1)
-- Separate travel/attendance fee. Does not replace labour, parts, escrow, or SSPE.

-- ── Enums ──────────────────────────────────────────────────────────────────
do $$ begin
  create type public.service_intent as enum (
    'VEHICLE_BREAKDOWN',
    'DIAGNOSTIC',
    'SPECIFIC_REPAIR',
    'WORKSHOP',
    'REMOTE_CONSULTATION',
    'ON_SITE_SERVICE'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.callout_status as enum (
    'NOT_ELIGIBLE',
    'PENDING',
    'CALCULATING',
    'CALCULATED',
    'LOCKED',
    'IN_PROGRESS',
    'ARRIVED',
    'COMPLETED',
    'WAIVED',
    'CANCELLED',
    'DISPUTED'
  );
exception when duplicate_object then null;
end $$;

-- ── Global policy (singleton) ──────────────────────────────────────────────
create table if not exists public.call_out_policies (
  id text primary key default 'default',
  enabled boolean not null default true,
  currency text not null default 'NGN',
  rate_per_km numeric(12, 2) not null default 350,
  minimum_billable_distance_km numeric(8, 3) not null default 0.5,
  maximum_radius_km numeric(8, 3) not null default 5,
  billing_increment_km numeric(8, 3) not null default 0.1,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint call_out_policies_rate_positive check (rate_per_km > 0),
  constraint call_out_policies_min_distance_nonneg check (minimum_billable_distance_km >= 0),
  constraint call_out_policies_max_radius_positive check (maximum_radius_km > 0),
  constraint call_out_policies_increment_positive check (billing_increment_km > 0)
);

insert into public.call_out_policies (
  id, enabled, currency, rate_per_km,
  minimum_billable_distance_km, maximum_radius_km, billing_increment_km
) values (
  'default', true, 'NGN', 350, 0.5, 5, 0.1
) on conflict (id) do nothing;

-- ── Per-trade base fees ────────────────────────────────────────────────────
create table if not exists public.trade_call_out_pricing (
  trade_id text primary key,
  base_fee numeric(12, 2) not null,
  currency text not null default 'NGN',
  enabled boolean not null default true,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint trade_call_out_pricing_base_nonneg check (base_fee >= 0)
);

insert into public.trade_call_out_pricing (trade_id, base_fee, currency, enabled)
values
  ('mechanic',    3000, 'NGN', true),
  ('vulcanizer',  1500, 'NGN', true),
  ('towing',      4000, 'NGN', true),
  ('battery',     2000, 'NGN', true),
  ('ac',          2500, 'NGN', true),
  ('body',        3000, 'NGN', true),
  ('electrical',  2500, 'NGN', true),
  ('solar',       3000, 'NGN', true),
  ('generator',   2500, 'NGN', true),
  ('carpenter',   2500, 'NGN', true),
  ('plumber',     2000, 'NGN', true),
  ('fashion',     1500, 'NGN', true),
  ('painter',     2500, 'NGN', true),
  ('diagnostics', 2500, 'NGN', true)
on conflict (trade_id) do nothing;

comment on table public.trade_call_out_pricing is
  'Call-out Base Fee per existing Ona trade. fashion = former wash (spec Car Wash). diagnostics = 14th existing trade, admin-configurable.';

-- ── Per-request quote (server-authoritative, separate from labour) ─────────
create table if not exists public.service_request_callouts (
  request_id uuid primary key references public.service_requests (id) on delete cascade,
  callout_eligible boolean not null default false,
  callout_status public.callout_status not null default 'PENDING',
  trade_id text,
  trade_base_fee numeric(12, 2),
  distance_rate numeric(12, 2),
  approved_route_distance_km numeric(10, 3),
  billable_distance_km numeric(10, 3),
  distance_charge numeric(12, 2),
  callout_fee numeric(12, 2),
  currency text not null default 'NGN',
  origin_latitude double precision,
  origin_longitude double precision,
  destination_latitude double precision,
  destination_longitude double precision,
  route_source text,
  calculated_at timestamptz,
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists service_request_callouts_status_idx
  on public.service_request_callouts (callout_status);

comment on table public.service_request_callouts is
  'Travel/attendance fee for a job. Never merge into labour_base_kobo / labour_agreed_kobo.';

-- ── Request classification (extends service_requests; no duplicate job table)
alter table public.service_requests
  add column if not exists service_intent public.service_intent,
  add column if not exists diagnosis_required boolean,
  add column if not exists physical_attendance_required boolean,
  add column if not exists callout_eligible boolean,
  add column if not exists likely_trade_ids text[] not null default '{}',
  add column if not exists confirmed_trade_id text;

comment on column public.service_requests.confirmed_trade_id is
  'Official diagnosis trade. Never auto-filled from the customer assumption.';

-- ── Policy / pricing audit ─────────────────────────────────────────────────
create table if not exists public.call_out_policy_audit (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references public.profiles (id) on delete set null,
  target_type text not null,
  target_id text not null,
  field_changed text not null,
  old_value jsonb,
  new_value jsonb,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists call_out_policy_audit_created_idx
  on public.call_out_policy_audit (created_at desc);

-- ── RLS: server-only (same posture as post-031 tables) ─────────────────────
alter table public.call_out_policies enable row level security;
alter table public.call_out_policies force row level security;
alter table public.trade_call_out_pricing enable row level security;
alter table public.trade_call_out_pricing force row level security;
alter table public.service_request_callouts enable row level security;
alter table public.service_request_callouts force row level security;
alter table public.call_out_policy_audit enable row level security;
alter table public.call_out_policy_audit force row level security;

revoke all on table public.call_out_policies from anon, authenticated;
revoke all on table public.trade_call_out_pricing from anon, authenticated;
revoke all on table public.service_request_callouts from anon, authenticated;
revoke all on table public.call_out_policy_audit from anon, authenticated;

grant all on table public.call_out_policies to service_role, postgres;
grant all on table public.trade_call_out_pricing to service_role, postgres;
grant all on table public.service_request_callouts to service_role, postgres;
grant all on table public.call_out_policy_audit to service_role, postgres;
