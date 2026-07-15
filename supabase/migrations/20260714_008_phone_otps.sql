-- Phone OTP login codes (Africa's Talking SMS)
create table if not exists public.phone_otps (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists phone_otps_phone_idx on public.phone_otps (phone);
create index if not exists phone_otps_expires_idx on public.phone_otps (expires_at);

alter table public.phone_otps enable row level security;
-- No public policies: service role only
