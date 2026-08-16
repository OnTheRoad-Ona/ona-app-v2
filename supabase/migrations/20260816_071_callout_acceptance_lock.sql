-- Call-Out Phase 2: lock at acceptance, integrity audit, no trip metering.

alter table public.service_request_callouts
  add column if not exists origin_accuracy_m numeric(10, 2),
  add column if not exists origin_captured_at timestamptz,
  add column if not exists origin_pro_id uuid,
  add column if not exists lock_idempotency_key text,
  add column if not exists voided_at timestamptz,
  add column if not exists void_reason text,
  add column if not exists travel_phase text not null default 'before_travel',
  add column if not exists billed_from_driven_km boolean not null default false;

comment on column public.service_request_callouts.billed_from_driven_km is
  'MUST remain false. Call-out is never metered from GPS travel.';

create unique index if not exists service_request_callouts_lock_idem_uidx
  on public.service_request_callouts (lock_idempotency_key)
  where lock_idempotency_key is not null;

create table if not exists public.callout_fee_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.service_requests (id) on delete cascade,
  pro_id uuid,
  event text not null,
  approved_route_distance_km numeric(10, 3),
  billable_distance_km numeric(10, 3),
  callout_fee numeric(12, 2),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists callout_fee_events_request_idx
  on public.callout_fee_events (request_id, created_at desc);

create table if not exists public.callout_travel_integrity (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.service_requests (id) on delete cascade,
  pro_id uuid,
  acceptance_lat double precision,
  acceptance_lng double precision,
  acceptance_at timestamptz,
  acceptance_accuracy_m numeric(10, 2),
  arrival_lat double precision,
  arrival_lng double precision,
  arrival_at timestamptz,
  arrival_accuracy_m numeric(10, 2),
  anomalies text[] not null default '{}',
  integrity_status text not null default 'NORMAL',
  review_status text not null default 'none',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists callout_travel_integrity_request_uidx
  on public.callout_travel_integrity (request_id);

create table if not exists public.callout_location_change_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.service_requests (id) on delete cascade,
  actor_id uuid,
  old_lat double precision,
  old_lng double precision,
  new_lat double precision,
  new_lng double precision,
  old_fee numeric(12, 2),
  new_fee numeric(12, 2),
  status text not null default 'detected',
  created_at timestamptz not null default now()
);

alter table public.callout_fee_events enable row level security;
alter table public.callout_fee_events force row level security;
alter table public.callout_travel_integrity enable row level security;
alter table public.callout_travel_integrity force row level security;
alter table public.callout_location_change_events enable row level security;
alter table public.callout_location_change_events force row level security;

revoke all on table public.callout_fee_events from anon, authenticated;
revoke all on table public.callout_travel_integrity from anon, authenticated;
revoke all on table public.callout_location_change_events from anon, authenticated;

grant all on table public.callout_fee_events to service_role, postgres;
grant all on table public.callout_travel_integrity to service_role, postgres;
grant all on table public.callout_location_change_events to service_role, postgres;
