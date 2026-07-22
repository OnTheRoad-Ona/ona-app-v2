-- Ona latest app parity (jobs, dual live tracking, reviews)
-- Idempotent — safe to re-run

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

do $$
begin
  alter type public.payment_status add value if not exists 'held';
  alter type public.payment_status add value if not exists 'released';
  alter type public.payment_status add value if not exists 'partial_refund';
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
  add column if not exists motorist_photo text,
  add column if not exists motorist_location_at timestamptz,
  add column if not exists repair_pro_name text,
  add column if not exists repair_pro_photo text,
  add column if not exists pro_lat double precision,
  add column if not exists pro_lng double precision,
  add column if not exists eta_minutes integer,
  add column if not exists distance_km numeric(8, 2),
  add column if not exists eta_text text,
  add column if not exists distance_text text,
  add column if not exists eta_source text,
  add column if not exists pro_location_at timestamptz,
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
  add column if not exists rating_note text,
  add column if not exists labour_base_kobo bigint,
  add column if not exists labour_agreed_kobo bigint,
  add column if not exists discount_percent integer not null default 0,
  add column if not exists pricing_currency text default 'NGN',
  add column if not exists negotiation_status text default 'none';

create index if not exists service_requests_flow_status_idx
  on public.service_requests (flow_status);

create table if not exists public.job_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.service_requests (id) on delete cascade,
  actor text,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists job_events_request_idx on public.job_events (request_id);

comment on column public.service_requests.flow_status is
  'Premium escrow machine: negotiating→…→released / refunded / cancelled / expired / disputed';
comment on column public.service_requests.motorist_photo is
  'Motorist avatar URL for pro-facing trip UI';
comment on column public.service_requests.motorist_location_at is
  'Last live GPS ping from motorist during active trip';
comment on column public.service_requests.rating_note is
  'Motorist text review (app max 144 characters)';
comment on column public.service_requests.eta_source is
  'google_distance_matrix | haversine_fallback';
