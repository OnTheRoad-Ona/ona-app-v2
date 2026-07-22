-- =============================================================================
-- SECURITY HARDENING — Ona / Supabase
-- Fixes common Security Advisor findings:
--   1) job_events exposed (RLS off) — CRITICAL
--   2) Over-broad GRANTs to anon (ALL privileges)
--   3) Sensitive tables without policies or with public PII exposure
--   4) Force RLS on critical tables
-- Idempotent — safe to re-run.
-- =============================================================================

-- ── 1) CRITICAL: job_events was readable by anyone ───────────────────────────
alter table if exists public.job_events enable row level security;
alter table if exists public.job_events force row level security;

drop policy if exists job_events_select_parties on public.job_events;
drop policy if exists job_events_insert_parties on public.job_events;
drop policy if exists job_events_service on public.job_events;

-- Parties on the related job (or admin) may read events
create policy job_events_select_parties on public.job_events
  for select
  using (
    public.is_admin()
    or exists (
      select 1
      from public.service_requests r
      where r.id = job_events.request_id
        and (r.motorist_id = auth.uid() or r.repair_pro_id = auth.uid())
    )
  );

-- Authenticated parties may insert events for their jobs
create policy job_events_insert_parties on public.job_events
  for insert
  with check (
    public.is_admin()
    or (
      auth.uid() is not null
      and exists (
        select 1
        from public.service_requests r
        where r.id = job_events.request_id
          and (r.motorist_id = auth.uid() or r.repair_pro_id = auth.uid())
      )
    )
  );

-- ── 2) Enable + force RLS on tables that still lacked it ─────────────────────
do $$
declare
  t text;
  tables text[] := array[
    'job_events',
    'phone_otps',
    'signup_events',
    'feature_flags',
    'platform_audit_logs',
    'rbac_permissions',
    'rbac_roles',
    'rbac_role_permissions',
    'staff_role_assignments',
    'support_tickets',
    'support_ticket_events',
    'wallet_accounts',
    'wallet_transactions',
    'payout_accounts',
    'payouts',
    'app_settings',
    'app_health_logs',
    'admin_actions',
    'profiles',
    'motorist_profiles',
    'repair_pro_profiles',
    'service_requests',
    'payments',
    'conversations',
    'messages',
    'notifications',
    'reviews',
    'bookings',
    'call_signals',
    'user_addresses',
    'user_sessions'
  ];
begin
  foreach t in array tables loop
    if exists (
      select 1 from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = t and c.relkind = 'r'
    ) then
      execute format('alter table public.%I enable row level security', t);
      -- Force so table owners / bypass is not accidental for app roles
      execute format('alter table public.%I force row level security', t);
    end if;
  end loop;
end $$;

-- ── 3) Service-role-only tables (no client/anon access) ──────────────────────
-- phone_otps holds OTP secrets; signup_events may contain emails; RBAC/wallets internal
do $$
declare
  t text;
  locked text[] := array[
    'phone_otps',
    'signup_events',
    'feature_flags',
    'platform_audit_logs',
    'rbac_permissions',
    'rbac_roles',
    'rbac_role_permissions',
    'staff_role_assignments',
    'support_tickets',
    'support_ticket_events',
    'wallet_accounts',
    'wallet_transactions',
    'payout_accounts',
    'payouts',
    'app_health_logs',
    'admin_actions'
  ];
begin
  foreach t in array locked loop
    if exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = t
    ) then
      execute format('revoke all on table public.%I from anon, authenticated', t);
      execute format('grant all on table public.%I to service_role, postgres', t);
    end if;
  end loop;
end $$;

-- Explicit deny policies not required when grants revoked + RLS on with no user policies.
-- Add admin-only policies where staff might use authenticated JWT later:
drop policy if exists phone_otps_deny_all on public.phone_otps;
-- keep no policies → default deny for non-bypass roles

-- ── 4) Tighten repair_pro public read (no encrypted ID / bank / cert dumps) ──
-- Replace open "any approved pro full row" with own-row OR marketplace-safe fields via
-- restricting SELECT grants on sensitive columns for anon.
do $$
begin
  -- Revoke blanket ALL from anon on all public tables first (re-grant carefully below)
  execute (
    select string_agg(
      format('revoke all on table public.%I from anon', tablename),
      '; '
    )
    from pg_tables
    where schemaname = 'public'
  );
exception when others then
  null;
end $$;

-- Authenticated: keep table access (RLS still applies)
do $$
declare r record;
begin
  for r in (select tablename from pg_tables where schemaname = 'public') loop
    execute format(
      'grant select, insert, update, delete on table public.%I to authenticated',
      r.tablename
    );
  end loop;
end $$;

-- Re-lock service-only tables after authenticated re-grant
do $$
declare
  t text;
  locked text[] := array[
    'phone_otps', 'signup_events', 'feature_flags', 'platform_audit_logs',
    'rbac_permissions', 'rbac_roles', 'rbac_role_permissions', 'staff_role_assignments',
    'support_tickets', 'support_ticket_events',
    'wallet_accounts', 'wallet_transactions', 'payout_accounts', 'payouts',
    'app_health_logs', 'admin_actions'
  ];
begin
  foreach t in array locked loop
    if exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = t
    ) then
      execute format('revoke all on table public.%I from authenticated, anon', t);
      execute format('grant all on table public.%I to service_role, postgres', t);
    end if;
  end loop;
end $$;

-- Anon: only what marketplace/guest truly needs (RLS still filters rows)
-- profiles: public fields for approved pros (policy already exists)
grant select on table public.profiles to anon;
-- repair_pro_profiles: allow select but strip sensitive columns from anon via column grants
grant select (
  user_id,
  business_name,
  primary_service,
  services,
  status,
  is_online,
  rating_avg,
  rating_count,
  lat,
  lng,
  service_radius_km,
  years_experience,
  bio,
  verified,
  labour_prices,
  pricing_currency,
  vehicle_focus,
  jobs_completed,
  avg_response_minutes,
  completion_rate,
  docs_status,
  face_liveness_verified,
  visibility_tier,
  is_new_artisan,
  go_live_window_ends_at,
  location_updated_at,
  created_at,
  updated_at
) on table public.repair_pro_profiles to anon;

-- reviews: public read of ratings (no private notes expected)
grant select on table public.reviews to anon;

-- service_role full access everywhere
grant all on all tables in schema public to service_role, postgres;
grant all on all sequences in schema public to service_role, postgres, authenticated;
grant usage on schema public to anon, authenticated, service_role, postgres;

-- ── 5) pro_select: OWN ROW or admin only (never other pros' NIN/BVN/ID media) ─
-- Marketplace listing uses service-role API and/or marketplace_pros view.
drop policy if exists pro_select on public.repair_pro_profiles;
create policy pro_select on public.repair_pro_profiles
  for select
  using (user_id = auth.uid() or public.is_admin());

-- Safe public/marketplace projection (no encrypted IDs, bank, cert URLs)
create or replace view public.marketplace_pros
with (security_invoker = false)
as
select
  r.user_id,
  r.business_name,
  r.primary_service,
  r.services,
  r.status,
  r.is_online,
  r.rating_avg,
  r.rating_count,
  r.lat,
  r.lng,
  r.service_radius_km,
  r.years_experience,
  r.bio,
  r.verified,
  r.labour_prices,
  r.pricing_currency,
  r.vehicle_focus,
  r.jobs_completed,
  r.avg_response_minutes,
  r.completion_rate,
  r.docs_status,
  r.face_liveness_verified,
  r.visibility_tier,
  r.is_new_artisan,
  r.go_live_window_ends_at,
  r.location_updated_at,
  p.full_name,
  p.avatar_url,
  p.city,
  p.area
from public.repair_pro_profiles r
join public.profiles p on p.id = r.user_id
where r.status = 'approved'
  and coalesce(r.visibility_tier, 1) >= 2
  and p.is_active is distinct from false
  and p.role = 'repair_pro';

revoke all on public.marketplace_pros from public;
grant select on public.marketplace_pros to anon, authenticated, service_role;

-- Owner/admin write only (unchanged intent)
drop policy if exists pro_upsert on public.repair_pro_profiles;
create policy pro_upsert on public.repair_pro_profiles
  for all
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

-- ── 6) motorist_profiles: never public ───────────────────────────────────────
-- Already own-only; ensure no anon grant
revoke all on table public.motorist_profiles from anon;

-- ── 7) payments / conversations / messages — no anon ─────────────────────────
revoke all on table public.payments from anon;
revoke all on table public.conversations from anon;
revoke all on table public.messages from anon;
revoke all on table public.notifications from anon;
revoke all on table public.bookings from anon;
revoke all on table public.call_signals from anon;
revoke all on table public.user_addresses from anon;
revoke all on table public.user_sessions from anon;
revoke all on table public.service_requests from anon;
revoke all on table public.job_events from anon;
revoke all on table public.job_status_events from anon;

-- Authenticated keep access (RLS filters)
grant select, insert, update, delete on table public.payments to authenticated;
grant select, insert, update, delete on table public.conversations to authenticated;
grant select, insert, update, delete on table public.messages to authenticated;
grant select, insert, update, delete on table public.notifications to authenticated;
grant select, insert, update, delete on table public.bookings to authenticated;
grant select, insert, update, delete on table public.call_signals to authenticated;
grant select, insert, update, delete on table public.user_addresses to authenticated;
grant select on table public.user_sessions to authenticated;
grant select, insert, update, delete on table public.service_requests to authenticated;
grant select, insert on table public.job_events to authenticated;
grant select, insert on table public.job_status_events to authenticated;
grant select, insert, update on table public.motorist_profiles to authenticated;
grant select, insert, update on table public.repair_pro_profiles to authenticated;
grant select, insert, update on table public.profiles to authenticated;

-- ── 8) app_settings: admin only (no anon) ────────────────────────────────────
revoke all on table public.app_settings from anon, authenticated;
grant all on table public.app_settings to service_role, postgres;
drop policy if exists app_settings_admin_all on public.app_settings;
create policy app_settings_admin_all on public.app_settings
  for all using (public.is_admin()) with check (public.is_admin());

-- ── 9) Default privileges: stop future tables granting ALL to anon ───────────
alter default privileges in schema public
  revoke all on tables from anon;
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant all on tables to service_role;

-- ── 10) Realtime publication: do not expose job_events publicly if present ───
-- (best-effort; ignore if not in publication)
do $$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'job_events'
  ) then
    alter publication supabase_realtime drop table public.job_events;
  end if;
exception when others then
  null;
end $$;

-- Done
notify pgrst, 'reload schema';
