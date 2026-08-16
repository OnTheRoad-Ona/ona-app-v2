create table if not exists public.callout_gps_samples (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.service_requests (id) on delete cascade,
  pro_id uuid,
  lat double precision not null,
  lng double precision not null,
  accuracy_m numeric(10, 2),
  captured_at timestamptz not null default now(),
  mock_location boolean not null default false,
  anomalies text[] not null default '{}',
  integrity_status text not null default 'NORMAL',
  created_at timestamptz not null default now()
);

create index if not exists callout_gps_samples_request_idx
  on public.callout_gps_samples (request_id, captured_at desc);

alter table public.callout_gps_samples enable row level security;
alter table public.callout_gps_samples force row level security;
revoke all on table public.callout_gps_samples from anon, authenticated;
grant all on table public.callout_gps_samples to service_role, postgres;
