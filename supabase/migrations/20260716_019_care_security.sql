-- OgaMecho Customer Care + multi-layer security
-- Idempotent — safe to re-run

-- Admin panel role (profiles.role stays staff gate; admin_role narrows perms)
alter table public.profiles
  add column if not exists admin_role text not null default 'super_admin';

comment on column public.profiles.admin_role is
  'super_admin | customer_care | support — used inside /admin Care desk';

-- Encrypted PII columns (full NIN/BVN/bank when collected; last4 remains for display)
alter table public.motorist_profiles
  add column if not exists nin_encrypted text,
  add column if not exists bvn_encrypted text;

alter table public.repair_pro_profiles
  add column if not exists nin_encrypted text,
  add column if not exists bvn_encrypted text,
  add column if not exists bank_account_encrypted text,
  add column if not exists bank_name text,
  add column if not exists bank_code text;

-- Enrich audit trail (meta jsonb already exists on admin_actions)
create index if not exists admin_actions_created_at_idx
  on public.admin_actions (created_at desc);

create index if not exists admin_actions_action_idx
  on public.admin_actions (action);

create index if not exists admin_actions_target_user_idx
  on public.admin_actions (target_user_id);

-- Job lookup helpers for Care search
create index if not exists service_requests_motorist_name_idx
  on public.service_requests (motorist_name);

create index if not exists service_requests_repair_pro_name_idx
  on public.service_requests (repair_pro_name);

create index if not exists motorist_profiles_plate_idx
  on public.motorist_profiles (plate_number);

-- Default existing admins to super_admin
update public.profiles
set admin_role = 'super_admin'
where role = 'admin'
  and (admin_role is null or admin_role = '');
