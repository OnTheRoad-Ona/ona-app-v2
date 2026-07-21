-- Ona platform foundation: enterprise RBAC, tickets, wallet stubs, sessions,
-- payouts, pro pipeline, feature flags, audit enrichment.
-- Idempotent — safe to re-run. Does not drop existing tables or data.
-- Payment default: Flutterwave (Nigeria-first). Wallet tables exist but disabled via settings.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) RBAC (database-backed permissions — code keeps fallback map)
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.rbac_permissions (
  id text primary key,
  module text not null,
  description text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.rbac_roles (
  id text primary key,
  label text not null,
  description text not null default '',
  is_system boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.rbac_role_permissions (
  role_id text not null references public.rbac_roles (id) on delete cascade,
  permission_id text not null references public.rbac_permissions (id) on delete cascade,
  primary key (role_id, permission_id)
);

create table if not exists public.staff_role_assignments (
  user_id uuid not null references public.profiles (id) on delete cascade,
  role_id text not null references public.rbac_roles (id) on delete cascade,
  assigned_by uuid references public.profiles (id) on delete set null,
  assigned_at timestamptz not null default now(),
  primary key (user_id, role_id)
);

create index if not exists staff_role_assignments_role_idx
  on public.staff_role_assignments (role_id);

-- Seed roles (marketplace staff + ops)
insert into public.rbac_roles (id, label, description) values
  ('super_admin', 'Super Administrator', 'Full platform control'),
  ('administrator', 'Administrator', 'Operations without ownership transfer'),
  ('operations_manager', 'Operations Manager', 'Bookings, matching, live ops'),
  ('verification_officer', 'Verification Officer', 'Pro/customer document review'),
  ('finance_officer', 'Finance Officer', 'Payments, refunds, payouts'),
  ('moderator', 'Moderator', 'Content, reviews, reports'),
  ('customer_support', 'Customer Support', 'Care desk, tickets, lookups'),
  ('customer_care', 'Customer Care', 'Legacy care role alias'),
  ('support', 'Support', 'Read-mostly care access')
on conflict (id) do update set label = excluded.label;

-- Seed permissions (granular)
insert into public.rbac_permissions (id, module, description) values
  ('users.view', 'users', 'View customer and pro accounts'),
  ('users.suspend', 'users', 'Suspend or freeze accounts'),
  ('users.restore', 'users', 'Restore suspended accounts'),
  ('users.export', 'users', 'Export user data'),
  ('users.delete', 'users', 'Hard/soft delete accounts'),
  ('pros.view', 'pros', 'View repair professionals'),
  ('pros.approve', 'pros', 'Approve professionals'),
  ('pros.reject', 'pros', 'Reject professionals / documents'),
  ('pros.suspend', 'pros', 'Suspend professionals'),
  ('pros.edit_categories', 'pros', 'Edit pro categories and skills'),
  ('verification.review', 'verification', 'Review identity and skill documents'),
  ('verification.approve', 'verification', 'Approve verification tiers'),
  ('verification.reject', 'verification', 'Reject verification submissions'),
  ('bookings.view', 'bookings', 'View bookings and jobs'),
  ('bookings.edit', 'bookings', 'Edit booking status (care)'),
  ('bookings.cancel', 'bookings', 'Force-cancel bookings'),
  ('payments.view', 'payments', 'View payments and escrow'),
  ('payments.refund', 'payments', 'Issue refunds'),
  ('payments.release', 'payments', 'Release escrow to pros'),
  ('payouts.view', 'payouts', 'View pro payouts'),
  ('payouts.process', 'payouts', 'Process payout queue'),
  ('messages.view', 'messages', 'Read conversations (care)'),
  ('messages.moderate', 'messages', 'Moderate or delete messages'),
  ('reviews.view', 'reviews', 'View reviews'),
  ('reviews.moderate', 'reviews', 'Hide or remove reviews'),
  ('support.tickets', 'support', 'Manage support tickets'),
  ('support.internal_notes', 'support', 'Write internal care notes'),
  ('reports.view', 'analytics', 'View reports and analytics'),
  ('moderation.queue', 'moderation', 'Access moderation queue'),
  ('moderation.action', 'moderation', 'Apply warnings, bans, shadow bans'),
  ('content.edit', 'content', 'Edit categories, CMS, templates'),
  ('notifications.send', 'notifications', 'Send system notifications'),
  ('settings.view', 'settings', 'View platform settings'),
  ('settings.edit', 'settings', 'Edit platform settings'),
  ('staff.manage', 'admin', 'Manage staff roles and assignments'),
  ('audit.view', 'audit', 'View audit logs'),
  ('system.health', 'system', 'View system health'),
  ('system.feature_flags', 'system', 'Toggle feature flags'),
  ('system.api_keys', 'system', 'Manage API keys'),
  ('pii.view', 'security', 'View full PII'),
  ('roles.change', 'admin', 'Change user roles')
on conflict (id) do update set description = excluded.description, module = excluded.module;

-- Super admin: all permissions
insert into public.rbac_role_permissions (role_id, permission_id)
select 'super_admin', id from public.rbac_permissions
on conflict do nothing;

-- Administrator: most except ownership-style
insert into public.rbac_role_permissions (role_id, permission_id)
select 'administrator', id from public.rbac_permissions
where id not in ('system.api_keys')
on conflict do nothing;

-- Operations
insert into public.rbac_role_permissions (role_id, permission_id)
select 'operations_manager', id from public.rbac_permissions
where id in (
  'users.view','pros.view','bookings.view','bookings.edit','bookings.cancel',
  'payments.view','reports.view','audit.view','system.health','messages.view'
)
on conflict do nothing;

-- Verification
insert into public.rbac_role_permissions (role_id, permission_id)
select 'verification_officer', id from public.rbac_permissions
where id in (
  'users.view','pros.view','pros.approve','pros.reject',
  'verification.review','verification.approve','verification.reject',
  'pii.view','audit.view'
)
on conflict do nothing;

-- Finance
insert into public.rbac_role_permissions (role_id, permission_id)
select 'finance_officer', id from public.rbac_permissions
where id in (
  'users.view','pros.view','bookings.view','payments.view','payments.refund',
  'payments.release','payouts.view','payouts.process','reports.view','audit.view','pii.view'
)
on conflict do nothing;

-- Moderator
insert into public.rbac_role_permissions (role_id, permission_id)
select 'moderator', id from public.rbac_permissions
where id in (
  'users.view','pros.view','messages.view','messages.moderate',
  'reviews.view','reviews.moderate','moderation.queue','moderation.action','audit.view'
)
on conflict do nothing;

-- Customer support / care / support (legacy aliases)
insert into public.rbac_role_permissions (role_id, permission_id)
select 'customer_support', id from public.rbac_permissions
where id in (
  'users.view','pros.view','bookings.view','bookings.edit','messages.view',
  'support.tickets','support.internal_notes','payments.view','audit.view','system.health'
)
on conflict do nothing;

insert into public.rbac_role_permissions (role_id, permission_id)
select 'customer_care', id from public.rbac_permissions
where id in (
  'users.view','pros.view','bookings.view','bookings.edit','bookings.cancel',
  'messages.view','support.tickets','support.internal_notes','payments.view',
  'payments.refund','payments.release','users.suspend','pii.view','audit.view','system.health'
)
on conflict do nothing;

insert into public.rbac_role_permissions (role_id, permission_id)
select 'support', id from public.rbac_permissions
where id in (
  'users.view','pros.view','bookings.view','messages.view',
  'support.tickets','audit.view','system.health'
)
on conflict do nothing;

-- Map existing admins into staff_role_assignments from profiles.admin_role
insert into public.staff_role_assignments (user_id, role_id)
select p.id,
  case
    when p.admin_role = 'customer_care' then 'customer_care'
    when p.admin_role = 'support' then 'support'
    else 'super_admin'
  end
from public.profiles p
where p.role = 'admin'
on conflict do nothing;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) Platform config seeds (Flutterwave default, wallet off)
-- ═══════════════════════════════════════════════════════════════════════════

insert into public.app_settings (key, value) values
(
  'payments',
  '{
    "defaultProvider": "flutterwave",
    "currency": "NGN",
    "country": "NG",
    "platformFeePercent": 5,
    "escrowEnabled": true,
    "walletEnabled": false,
    "cardsEnabled": false
  }'::jsonb
),
(
  'security',
  '{
    "otpExpiryMinutes": 10,
    "sessionIdleMinutes": 30,
    "passwordMinLength": 8,
    "require2faForPros": false,
    "maxLoginAttempts": 8,
    "accountDeletionGraceDays": 30
  }'::jsonb
),
(
  'verification',
  '{
    "customerFreeActions": 6,
    "requirePhoneOtp": true,
    "proPipelineEnabled": true,
    "documentExpiryReminders": true
  }'::jsonb
),
(
  'notifications',
  '{
    "channels": ["push","sms","email","in_app"],
    "promotionalDefaultOff": true
  }'::jsonb
)
on conflict (key) do nothing;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) Feature flags
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.feature_flags (
  key text primary key,
  enabled boolean not null default false,
  description text not null default '',
  meta jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);

insert into public.feature_flags (key, enabled, description) values
  ('wallet', false, 'Customer/pro wallet balances'),
  ('cards', false, 'Card payments beyond bank transfer'),
  ('multi_country', false, 'Multi-country marketplace'),
  ('voice_notes', true, 'Chat voice notes'),
  ('live_tracking', true, 'Pro/customer live location'),
  ('liveness_server_recheck', false, 'Server-side liveness re-verify')
on conflict (key) do nothing;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4) Support tickets (CRM foundation)
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_number bigserial,
  requester_id uuid references public.profiles (id) on delete set null,
  subject text not null default '',
  category text not null default 'general',
  priority text not null default 'normal',
  status text not null default 'open',
  assigned_to uuid references public.profiles (id) on delete set null,
  related_job_id uuid references public.service_requests (id) on delete set null,
  related_payment_id uuid,
  sla_due_at timestamptz,
  resolved_at timestamptz,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists support_tickets_status_idx on public.support_tickets (status);
create index if not exists support_tickets_assignee_idx on public.support_tickets (assigned_to);
create index if not exists support_tickets_requester_idx on public.support_tickets (requester_id);

create table if not exists public.support_ticket_events (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  event_type text not null,
  body text not null default '',
  is_internal boolean not null default false,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists support_ticket_events_ticket_idx
  on public.support_ticket_events (ticket_id, created_at);

-- ═══════════════════════════════════════════════════════════════════════════
-- 5) Wallet stubs (disabled until feature flag on)
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.wallet_accounts (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  currency text not null default 'NGN',
  balance_minor bigint not null default 0,
  held_minor bigint not null default 0,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null,
  amount_minor bigint not null,
  balance_after_minor bigint,
  reference text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists wallet_transactions_user_idx
  on public.wallet_transactions (user_id, created_at desc);

-- ═══════════════════════════════════════════════════════════════════════════
-- 6) Payouts (pro bank settlements)
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.payout_accounts (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  bank_name text,
  bank_code text,
  account_name text,
  account_number_last4 text,
  account_encrypted text,
  verified boolean not null default false,
  provider text not null default 'flutterwave',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payouts (
  id uuid primary key default gen_random_uuid(),
  pro_id uuid not null references public.profiles (id) on delete restrict,
  job_id uuid references public.service_requests (id) on delete set null,
  amount_minor bigint not null default 0,
  currency text not null default 'NGN',
  status text not null default 'pending',
  provider text not null default 'flutterwave',
  provider_ref text,
  failure_reason text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists payouts_pro_status_idx on public.payouts (pro_id, status);

-- ═══════════════════════════════════════════════════════════════════════════
-- 7) Pro onboarding pipeline (DB source of truth beyond local draft)
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.repair_pro_profiles
  add column if not exists pipeline_status text not null default 'draft',
  add column if not exists pipeline_notes text,
  add column if not exists submitted_at timestamptz,
  add column if not exists approved_at timestamptz,
  add column if not exists rejected_at timestamptz,
  add column if not exists rejection_reason text,
  add column if not exists guarantor jsonb not null default '{}'::jsonb,
  add column if not exists tools jsonb not null default '[]'::jsonb,
  add column if not exists portfolio jsonb not null default '[]'::jsonb,
  add column if not exists liveness_passed_at timestamptz,
  add column if not exists skill_proof jsonb,
  add column if not exists gov_id_meta jsonb not null default '{}'::jsonb;

comment on column public.repair_pro_profiles.pipeline_status is
  'draft|submitted|pending_verification|pending_document_review|pending_approval|approved|rejected|suspended|blocked|archived';

create index if not exists repair_pro_pipeline_idx
  on public.repair_pro_profiles (pipeline_status);

-- ═══════════════════════════════════════════════════════════════════════════
-- 8) Customer saved addresses (encrypted payload optional later)
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.user_addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  label text not null default 'Home',
  address_text text not null default '',
  lat double precision,
  lng double precision,
  is_default boolean not null default false,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_addresses_user_idx on public.user_addresses (user_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- 9) Auth sessions / devices (app JWT session tracking)
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.user_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  device_label text,
  user_agent text,
  ip text,
  refresh_jti text,
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists user_sessions_user_idx on public.user_sessions (user_id, last_seen_at desc);

-- ═══════════════════════════════════════════════════════════════════════════
-- 10) Platform audit log (broader than admin_actions; keeps admin_actions)
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.platform_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles (id) on delete set null,
  actor_role text,
  action text not null,
  target_type text,
  target_id text,
  old_value jsonb,
  new_value jsonb,
  ip text,
  user_agent text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists platform_audit_logs_created_idx
  on public.platform_audit_logs (created_at desc);
create index if not exists platform_audit_logs_actor_idx
  on public.platform_audit_logs (actor_id);
create index if not exists platform_audit_logs_action_idx
  on public.platform_audit_logs (action);

-- ═══════════════════════════════════════════════════════════════════════════
-- 11) Soft-delete columns on core profiles
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.profiles
  add column if not exists deleted_at timestamptz,
  add column if not exists deletion_scheduled_at timestamptz,
  add column if not exists preferred_locale text;

create index if not exists profiles_deleted_at_idx on public.profiles (deleted_at)
  where deleted_at is not null;

-- ═══════════════════════════════════════════════════════════════════════════
-- 12) RLS — service role used by API; staff tables locked down
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.rbac_permissions enable row level security;
alter table public.rbac_roles enable row level security;
alter table public.rbac_role_permissions enable row level security;
alter table public.staff_role_assignments enable row level security;
alter table public.feature_flags enable row level security;
alter table public.support_tickets enable row level security;
alter table public.support_ticket_events enable row level security;
alter table public.wallet_accounts enable row level security;
alter table public.wallet_transactions enable row level security;
alter table public.payout_accounts enable row level security;
alter table public.payouts enable row level security;
alter table public.user_addresses enable row level security;
alter table public.user_sessions enable row level security;
alter table public.platform_audit_logs enable row level security;

-- Service role bypasses RLS; authenticated users manage own addresses/sessions
drop policy if exists user_addresses_own on public.user_addresses;
create policy user_addresses_own on public.user_addresses
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists user_sessions_own on public.user_sessions;
create policy user_sessions_own on public.user_sessions
  for select using (auth.uid() = user_id);

grant all on table public.rbac_permissions to postgres, service_role;
grant all on table public.rbac_roles to postgres, service_role;
grant all on table public.rbac_role_permissions to postgres, service_role;
grant all on table public.staff_role_assignments to postgres, service_role;
grant all on table public.feature_flags to postgres, service_role;
grant all on table public.support_tickets to postgres, service_role;
grant all on table public.support_ticket_events to postgres, service_role;
grant all on table public.wallet_accounts to postgres, service_role;
grant all on table public.wallet_transactions to postgres, service_role;
grant all on table public.payout_accounts to postgres, service_role;
grant all on table public.payouts to postgres, service_role;
grant all on table public.user_addresses to postgres, service_role, authenticated;
grant all on table public.user_sessions to postgres, service_role, authenticated;
grant all on table public.platform_audit_logs to postgres, service_role;
