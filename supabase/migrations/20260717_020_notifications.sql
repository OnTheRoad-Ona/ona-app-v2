-- OgaMecho in-app notifications (Realtime-ready)
-- Idempotent

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  category text not null
    check (category in ('requests', 'messages', 'payments', 'system')),
  priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high', 'critical')),
  title text not null,
  body text not null,
  href text,
  action_type text,
  action_payload jsonb not null default '{}'::jsonb,
  group_key text,
  job_id uuid,
  job_status text,
  message_text text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

create index if not exists notifications_user_unread_idx
  on public.notifications (user_id)
  where read_at is null;

create index if not exists notifications_group_idx
  on public.notifications (user_id, group_key, created_at desc)
  where group_key is not null;

alter table public.notifications enable row level security;

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own"
  on public.notifications for select
  using (auth.uid() = user_id);

drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own"
  on public.notifications for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Inserts via service role only (API / server jobs)
drop policy if exists "notifications_insert_service" on public.notifications;
-- No client insert policy — use service role from Next API

-- Realtime
do $$
begin
  alter publication supabase_realtime add table public.notifications;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
