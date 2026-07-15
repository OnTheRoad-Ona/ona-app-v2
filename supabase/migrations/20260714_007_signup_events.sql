-- Track signup attempts (success + failure) for admin Control Centre
create table if not exists public.signup_events (
  id uuid primary key default gen_random_uuid(),
  email text,
  full_name text,
  phone text,
  account_type text,
  success boolean not null default false,
  error_message text,
  user_id uuid,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists signup_events_created_idx
  on public.signup_events (created_at desc);
create index if not exists signup_events_success_idx
  on public.signup_events (success);

alter table public.signup_events enable row level security;

drop policy if exists signup_events_admin on public.signup_events;
create policy signup_events_admin on public.signup_events
  for all using (public.is_admin()) with check (public.is_admin());
