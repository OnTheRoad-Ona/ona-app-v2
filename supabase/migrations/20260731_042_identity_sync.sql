-- Ona unified identity + role-sync foundation.
--
-- One real person = one `profiles` row (shared identity) with any number of
-- attached roles (Customer + Repair Pro). This migration adds:
--   user_roles        – which roles an identity has attached (role membership)
--   payout_methods    – canonical bank/payout record, ONE per user, reused across roles
--   identity_sync_log – audit of every role/bank/verification sync event
--   identity_merges   – admin-approved queue for merging pre-existing duplicate accounts
--
-- Existing side tables (motorist_profiles / repair_pro_profiles) stay the
-- source of role-specific data; profiles.role stays the *active* role pointer.
-- Idempotent — safe to re-run.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) user_roles — role membership registry
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  role_type text not null check (role_type in ('motorist', 'repair_pro')),
  role_status text not null default 'active'
    check (role_status in ('active', 'pending', 'suspended', 'removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, role_type)
);

create index if not exists user_roles_user_idx on public.user_roles (user_id);
create index if not exists user_roles_type_idx on public.user_roles (role_type);

drop trigger if exists user_roles_updated_at on public.user_roles;
create trigger user_roles_updated_at
  before update on public.user_roles
  for each row execute function public.set_updated_at();

-- Idempotent role registration (used by triggers + app code).
create or replace function public.ensure_user_role(uid uuid, rtype text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_roles (user_id, role_type)
  values (uid, rtype)
  on conflict (user_id, role_type) do nothing;
end;
$$;

-- Auto-register the role whenever a side table row is inserted
-- (signup via handle_new_user, dual-role signup, admin, or backfill).
create or replace function public.on_side_table_inserted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.ensure_user_role(new.user_id, TG_ARGV[0]);
  return new;
end;
$$;

drop trigger if exists motorist_roles_auto on public.motorist_profiles;
create trigger motorist_roles_auto
  after insert on public.motorist_profiles
  for each row execute function public.on_side_table_inserted('motorist');

drop trigger if exists pro_roles_auto on public.repair_pro_profiles;
create trigger pro_roles_auto
  after insert on public.repair_pro_profiles
  for each row execute function public.on_side_table_inserted('repair_pro');

-- Backfill from existing side tables (kept separate so triggers stay lean).
insert into public.user_roles (user_id, role_type)
  select user_id, 'motorist' from public.motorist_profiles
  on conflict (user_id, role_type) do nothing;

insert into public.user_roles (user_id, role_type)
  select user_id, 'repair_pro' from public.repair_pro_profiles
  on conflict (user_id, role_type) do nothing;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) payout_methods — canonical bank/payout record (ONE per user)
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.payout_methods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  bank_name text,
  bank_code text,
  account_name text,
  account_number_last4 text,
  account_number_encrypted text,
  verified boolean not null default false,
  provider text not null default 'flutterwave',
  linked_role text check (linked_role in ('motorist', 'repair_pro', 'both')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create index if not exists payout_methods_user_idx on public.payout_methods (user_id);
create index if not exists payout_methods_bank_idx on public.payout_methods (bank_code, account_number_last4);

drop trigger if exists payout_methods_updated_at on public.payout_methods;
create trigger payout_methods_updated_at
  before update on public.payout_methods
  for each row execute function public.set_updated_at();

-- Backfill: fold both side tables into one canonical record per user.
-- The customer side drives refunds, the pro side drives payouts — when the
-- same number is present on both, linked_role = 'both'.
insert into public.payout_methods (
  user_id, bank_name, bank_code, account_name, account_number_last4, verified, linked_role
)
select
  coalesce(m.user_id, p.user_id),
  coalesce(nullif(m.bank_name, ''), nullif(p.bank_name, '')),
  coalesce(nullif(m.bank_code, ''), nullif(p.bank_code, '')),
  coalesce(nullif(m.bank_account_name, ''), nullif(p.bank_account_name, '')),
  right(coalesce(nullif(m.bank_account_number, ''), nullif(p.bank_account_number, '')), 4),
  false,
  case
    when m.user_id is not null and p.user_id is not null then 'both'
    when m.user_id is not null then 'motorist'
    else 'repair_pro'
  end
from public.motorist_profiles m
full outer join public.repair_pro_profiles p on p.user_id = m.user_id
where coalesce(nullif(m.bank_account_number, ''), nullif(p.bank_account_number, '')) is not null
on conflict (user_id) do update set
  bank_name = coalesce(excluded.bank_name, public.payout_methods.bank_name),
  bank_code = coalesce(excluded.bank_code, public.payout_methods.bank_code),
  account_name = coalesce(excluded.account_name, public.payout_methods.account_name),
  account_number_last4 = coalesce(excluded.account_number_last4, public.payout_methods.account_number_last4),
  linked_role = case
    when public.payout_methods.linked_role = 'both' or excluded.linked_role = 'both' then 'both'
    else excluded.linked_role
  end,
  updated_at = now();

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) identity_sync_log — audit of every sync event
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.identity_sync_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete cascade,
  action text not null,
  old_state jsonb not null default '{}'::jsonb,
  new_state jsonb not null default '{}'::jsonb,
  fields_synced jsonb not null default '{}'::jsonb,
  bank_synced jsonb not null default '{}'::jsonb,
  verification_synced jsonb not null default '{}'::jsonb,
  initiated_by uuid references public.profiles (id) on delete set null,
  initiated_by_role text,
  result text not null default 'ok' check (result in ('ok', 'error')),
  error text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists identity_sync_log_user_idx
  on public.identity_sync_log (user_id, created_at desc);
create index if not exists identity_sync_log_action_idx
  on public.identity_sync_log (action);
create index if not exists identity_sync_log_created_idx
  on public.identity_sync_log (created_at desc);

-- ═══════════════════════════════════════════════════════════════════════════
-- 4) identity_merges — admin-approved duplicate-account merge queue
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.identity_merges (
  id uuid primary key default gen_random_uuid(),
  primary_user_id uuid not null references public.profiles (id) on delete cascade,
  duplicate_user_id uuid not null references public.profiles (id) on delete cascade,
  match_reason text not null default 'phone',
  match_detail jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'merged', 'rejected')),
  created_by uuid references public.profiles (id) on delete set null,
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  merge_plan jsonb not null default '{}'::jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (primary_user_id, duplicate_user_id)
);

create index if not exists identity_merges_status_idx on public.identity_merges (status);
create index if not exists identity_merges_primary_idx on public.identity_merges (primary_user_id);
create index if not exists identity_merges_dup_idx on public.identity_merges (duplicate_user_id);

drop trigger if exists identity_merges_updated_at on public.identity_merges;
create trigger identity_merges_updated_at
  before update on public.identity_merges
  for each row execute function public.set_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- 5) RLS + grants
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.user_roles enable row level security;
alter table public.payout_methods enable row level security;
alter table public.identity_sync_log enable row level security;
alter table public.identity_merges enable row level security;

-- Authenticated users may read their own role membership + payout identity
-- (the app client reads motorist/pro side tables through service-role APIs).
drop policy if exists user_roles_own on public.user_roles;
create policy user_roles_own on public.user_roles
  for select using (auth.uid() = user_id);

drop policy if exists payout_methods_own on public.payout_methods;
create policy payout_methods_own on public.payout_methods
  for select using (auth.uid() = user_id);

grant all on table public.user_roles to postgres, service_role, authenticated;
grant all on table public.payout_methods to postgres, service_role, authenticated;
grant all on table public.identity_sync_log to postgres, service_role;
grant all on table public.identity_merges to postgres, service_role;
