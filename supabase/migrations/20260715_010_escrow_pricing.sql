-- Escrow + labour pricing fields for Ona payments / requests

-- Extend payment_status for escrow lifecycle (idempotent)
do $$
begin
  alter type public.payment_status add value if not exists 'held';
  alter type public.payment_status add value if not exists 'released';
  alter type public.payment_status add value if not exists 'partial_refund';
exception
  when duplicate_object then null;
  when others then null;
end $$;

alter table public.payments
  add column if not exists base_amount_kobo bigint,
  add column if not exists discount_percent integer not null default 0,
  add column if not exists platform_fee_kobo bigint not null default 0,
  add column if not exists pro_payout_kobo bigint not null default 0,
  add column if not exists labour_only boolean not null default true,
  add column if not exists service_type text,
  add column if not exists escrow_status text not null default 'none',
  add column if not exists motorist_completed_at timestamptz,
  add column if not exists pro_completed_at timestamptz,
  add column if not exists released_at timestamptz,
  add column if not exists refunded_at timestamptz,
  add column if not exists receipt_url text,
  add column if not exists provider_channel text,
  add column if not exists meta jsonb not null default '{}'::jsonb;

create index if not exists payments_escrow_status_idx
  on public.payments (escrow_status);

create index if not exists payments_request_id_idx
  on public.payments (request_id);

-- Repair pro labour price book (per skill)
alter table public.repair_pro_profiles
  add column if not exists labour_prices jsonb not null default '{}'::jsonb,
  add column if not exists pricing_currency text not null default 'NGN';

comment on column public.repair_pro_profiles.labour_prices is
  'Map of pro_service → major-unit labour fee. Spare parts never included.';

-- Optional pricing columns on service requests
alter table public.service_requests
  add column if not exists labour_base_kobo bigint,
  add column if not exists labour_agreed_kobo bigint,
  add column if not exists discount_percent integer not null default 0,
  add column if not exists pricing_currency text default 'NGN',
  add column if not exists negotiation_status text default 'none';
