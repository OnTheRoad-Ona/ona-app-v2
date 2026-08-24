-- Backend expansions: notification retry queue, courier providers,
-- message moderation, analytics rollups. Additive only.

-- ── 1. Notification retry queue ────────────────────────────────────────────
create table if not exists public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  channel text not null check (channel in ('push', 'sms', 'email')),
  title text not null default '',
  body text not null default '',
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'failed', 'dead')),
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists notification_deliveries_due_idx
  on public.notification_deliveries (next_attempt_at)
  where status = 'pending';
create index if not exists notification_deliveries_user_idx
  on public.notification_deliveries (user_id);

alter table public.notification_deliveries enable row level security;

-- ── 2. Courier providers (managed registry — no more free-text only) ──────
create table if not exists public.shop_courier_providers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  phone text,
  active boolean not null default true,
  is_default boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.shop_courier_providers enable row level security;

-- ── 3. Message reports / moderation ────────────────────────────────────────
create table if not exists public.message_reports (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null,
  conversation_id uuid,
  reporter_id uuid not null,
  reason text not null,
  details text,
  status text not null default 'open'
    check (status in ('open', 'reviewed', 'actioned', 'dismissed')),
  admin_id uuid,
  admin_note text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists message_reports_status_idx
  on public.message_reports (status, created_at desc);

alter table public.message_reports enable row level security;

drop policy if exists "message_reports_insert_own" on public.message_reports;
create policy "message_reports_insert_own"
  on public.message_reports for insert
  to authenticated
  with check (reporter_id = auth.uid());

-- ── 4. Analytics daily rollups ─────────────────────────────────────────────
create table if not exists public.analytics_daily_rollups (
  day date not null,
  metric text not null,
  value numeric not null default 0,
  computed_at timestamptz not null default now(),
  primary key (day, metric)
);

alter table public.analytics_daily_rollups enable row level security;
