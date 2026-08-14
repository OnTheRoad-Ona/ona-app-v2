-- ============================================================
-- Payout retry scheduler (pg_cron + pg_net, every 10 minutes)
--
-- The payout settlement loop is designed to re-attempt a release
-- every 10 minutes (`PAYOUT_RETRY_INTERVAL_MS`), but the only
-- unattended trigger was a once-daily Vercel cron. On Vercel's
-- hobby plan crons can't run sub-daily, so we drive the retry
-- from the database instead, mirroring the `ona-pairing-sweep`
-- job: a pg_cron schedule that POSTs to the payout-retry HTTP
-- endpoint via pg_net every 10 minutes.
--
-- No secrets are committed here. The bearer token is read at
-- each execution from `public.ona_cron_config`, seeded at runtime
-- (e.g. `select public.set_cron_secret('payout_retry_secret',
-- '<CRON_SECRET>');`). The job only schedules once a secret is
-- present, and only when pg_cron + pg_net are available.
-- ============================================================

-- Config store for the cron bearer token (never in migrations).
create table if not exists public.ona_cron_config (
  name text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table public.ona_cron_config enable row level security;

drop policy if exists "service_role_ona_cron_config" on public.ona_cron_config;
create policy "service_role_ona_cron_config"
  on public.ona_cron_config
  for all
  to service_role
  using (true)
  with check (true);

-- Seed/rotate the cron secret (callable via REST RPC or SQL editor).
create or replace function public.set_cron_secret(p_name text, p_value text)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  insert into public.ona_cron_config(name, value, updated_at)
  values (p_name, p_value, now())
  on conflict (name) do update
    set value = excluded.value, updated_at = now();
end;
$fn$;

-- (Re)install the 10-minute payout-retry cron job. Safe to call
-- again at any time (drops + recreates). Returns a status payload.
create or replace function public.install_payout_retry_cron()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_secret text;
  v_status jsonb;
  v_has_cron boolean;
  v_has_net boolean;
begin
  select value into v_secret
  from public.ona_cron_config where name = 'payout_retry_secret';

  select exists(select 1 from pg_extension where extname = 'pg_cron') into v_has_cron;
  select exists(
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'net' and p.proname = 'http_post'
  ) into v_has_net;

  if v_secret is null or v_secret = '' then
    return jsonb_build_object('ok', false, 'reason', 'needs_secret',
      'msg', 'Seed public.ona_cron_config payout_retry_secret first '
            '(select public.set_cron_secret(''payout_retry_secret'', ''...''))');
  end if;
  if not v_has_cron then
    return jsonb_build_object('ok', false, 'reason', 'needs_pg_cron',
      'msg', 'pg_cron extension is not enabled');
  end if;
  if not v_has_net then
    return jsonb_build_object('ok', false, 'reason', 'needs_pg_net',
      'msg', 'pg_net extension is not enabled (Supabase dashboard '
            '> Database > Extensions)');
  end if;

  -- Drop any prior job (idempotent reinstall).
  if exists (select 1 from pg_catalog.pg_extension where extname = 'pg_cron')
     and exists (select 1 from cron.job where jobname = 'ona-payout-retry') then
    perform cron.unschedule('ona-payout-retry');
  end if;

  perform cron.schedule(
    'ona-payout-retry',
    '*/10 * * * *',
    $job$select net.http_post(
      'https://ona-mi.vercel.app/api/payments/payout-retry',
      '{}',
      jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization',
        'Bearer ' || coalesce(
          (select value from public.ona_cron_config
            where name = 'payout_retry_secret'),
          '')
      )
    )$job$
  );

  select jsonb_build_object('ok', true,
    'job', 'ona-payout-retry', 'schedule', '*/10 * * * *',
    'endpoint', 'https://ona-mi.vercel.app/api/payments/payout-retry',
    'secret_configured', true,
    'installed_at', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
  into v_status;
  return v_status;
end;
$fn$;

-- Inspect the current job (verification / ops).
create or replace function public.payout_retry_cron_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $fn$
  select coalesce(
    jsonb_object_agg(
      j.jobname,
      jsonb_build_object('schedule', j.schedule, 'active', j.active)
    ),
    '[]'::jsonb
  )
  from cron.job j
  where j.jobname in ('ona-payout-retry', 'ona-pairing-sweep');
$fn$;

-- If a secret was already seeded, install immediately on migrate.
do $do$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron')
     and exists (
       select 1 from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'net' and p.proname = 'http_post'
     )
     and exists (select 1 from public.ona_cron_config
                 where name = 'payout_retry_secret') then
    perform public.install_payout_retry_cron();
  end if;
end
$do$;