-- Proactive health / ops event log for OgaMecho Control Centre
create table if not exists public.app_health_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  type text not null,
  severity text not null default 'warning',
  message text not null,
  source text not null default 'system',
  resolved boolean not null default false,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists app_health_logs_created_idx
  on public.app_health_logs (created_at desc);
create index if not exists app_health_logs_resolved_idx
  on public.app_health_logs (resolved);
create index if not exists app_health_logs_type_idx
  on public.app_health_logs (type);
create index if not exists app_health_logs_severity_idx
  on public.app_health_logs (severity);

alter table public.app_health_logs enable row level security;

drop policy if exists app_health_logs_admin on public.app_health_logs;
create policy app_health_logs_admin on public.app_health_logs
  for all using (public.is_admin()) with check (public.is_admin());

-- Service role inserts from API (bypasses RLS). No public write policy on purpose.
