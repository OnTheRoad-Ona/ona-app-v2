-- ============================================================
-- ONA EXPRESS — premium direct booking system
-- Ona books directly from its own pro pool. No SSPE matching.
-- Assignment is final: the assigned pro cannot accept/reject.
-- ============================================================

-- Mark express jobs so marketplace sweeps never touch them
alter table public.service_requests
  add column if not exists source text not null default 'marketplace';

create index if not exists service_requests_source_idx
  on public.service_requests (source);

-- ------------------------------------------------------------
-- Express pro pool (Ona's own pool of directly-assignable pros)
-- ------------------------------------------------------------
create table if not exists public.ona_express_pool (
  id uuid primary key default gen_random_uuid(),
  pro_id uuid not null unique references public.profiles (id) on delete cascade,
  active boolean not null default true,
  note text,
  last_assigned_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists ona_express_pool_pro_idx
  on public.ona_express_pool (pro_id);
create index if not exists ona_express_pool_active_idx
  on public.ona_express_pool (active);

-- ------------------------------------------------------------
-- Express payments — SEPARATE upfront ledger (base + call-out).
-- Never touches job escrow (public.payments) or shop_payments.
-- ------------------------------------------------------------
create table if not exists public.ona_express_payments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.service_requests (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete restrict,
  provider text not null default 'flutterwave',
  provider_ref text not null unique,
  amount_minor bigint not null default 0,
  base_minor bigint not null default 0,
  callout_minor bigint not null default 0,
  currency text not null default 'NGN',
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'failed', 'cancelled')),
  raw_init jsonb,
  idempotency_key text,
  assigned_pro_id uuid references public.profiles (id) on delete set null,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ona_express_payments_status_idx
  on public.ona_express_payments (status);
create index if not exists ona_express_payments_user_idx
  on public.ona_express_payments (user_id);
