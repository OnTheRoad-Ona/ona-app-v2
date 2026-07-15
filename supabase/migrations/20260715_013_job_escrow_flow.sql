-- Premium job flow: negotiation, escrow states, disputes, evidence

-- Extend job_status enum safely (service_requests.status uses job_status)
do $$
begin
  alter type public.job_status add value if not exists 'negotiating';
  alter type public.job_status add value if not exists 'agreed';
  alter type public.job_status add value if not exists 'paid_booked';
  alter type public.job_status add value if not exists 'arrived';
  alter type public.job_status add value if not exists 'satisfied';
  alter type public.job_status add value if not exists 'released';
  alter type public.job_status add value if not exists 'expired';
  alter type public.job_status add value if not exists 'disputed';
  alter type public.job_status add value if not exists 'under_appeal';
  alter type public.job_status add value if not exists 'refunded';
exception
  when duplicate_object then null;
  when others then null;
end $$;

alter table public.service_requests
  add column if not exists flow_status text not null default 'negotiating',
  add column if not exists problem_text text,
  add column if not exists voice_note jsonb,
  add column if not exists photos jsonb not null default '[]'::jsonb,
  add column if not exists offers jsonb not null default '[]'::jsonb,
  add column if not exists negotiate_ends_at timestamptz,
  add column if not exists pro_base_major numeric(12, 2),
  add column if not exists agreed_major numeric(12, 2),
  add column if not exists max_offers integer not null default 3,
  add column if not exists motorist_name text,
  add column if not exists repair_pro_name text,
  add column if not exists repair_pro_photo text,
  add column if not exists pro_lat double precision,
  add column if not exists pro_lng double precision,
  add column if not exists eta_minutes integer,
  add column if not exists distance_km numeric(8, 2),
  add column if not exists payment_id text,
  add column if not exists payment_reference text,
  add column if not exists escrow_status text,
  add column if not exists amount_minor bigint,
  add column if not exists platform_fee_minor bigint,
  add column if not exists pro_payout_minor bigint,
  add column if not exists dispute jsonb,
  add column if not exists evidence jsonb,
  add column if not exists status_history jsonb not null default '[]'::jsonb,
  add column if not exists paid_at timestamptz,
  add column if not exists released_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists satisfied_at timestamptz,
  add column if not exists rating integer,
  add column if not exists rating_note text;

create index if not exists service_requests_flow_status_idx
  on public.service_requests (flow_status);

-- Job events / offers audit (optional granular log)
create table if not exists public.job_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.service_requests (id) on delete cascade,
  actor text,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists job_events_request_idx on public.job_events (request_id);

-- Storage bucket for job media (run in dashboard if storage API restricted)
-- insert into storage.buckets (id, name, public) values ('job-media', 'job-media', true)
-- on conflict do nothing;

comment on column public.service_requests.flow_status is
  'Premium escrow machine: negotiating→…→released / refunded / cancelled / expired / disputed';
