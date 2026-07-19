-- Ensure notifications table + columns exist (repair partial applies)

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  category text not null default 'system',
  priority text not null default 'normal',
  title text not null default '',
  body text not null default '',
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

alter table public.notifications add column if not exists category text;
alter table public.notifications add column if not exists priority text;
alter table public.notifications add column if not exists title text;
alter table public.notifications add column if not exists body text;
alter table public.notifications add column if not exists href text;
alter table public.notifications add column if not exists action_type text;
alter table public.notifications add column if not exists action_payload jsonb default '{}'::jsonb;
alter table public.notifications add column if not exists group_key text;
alter table public.notifications add column if not exists job_id uuid;
alter table public.notifications add column if not exists job_status text;
alter table public.notifications add column if not exists message_text text;
alter table public.notifications add column if not exists read_at timestamptz;
alter table public.notifications add column if not exists created_at timestamptz default now();

create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

create index if not exists notifications_user_unread_idx
  on public.notifications (user_id)
  where read_at is null;

create index if not exists notifications_group_idx
  on public.notifications (user_id, group_key, created_at desc);

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

do $$
begin
  alter publication supabase_realtime add table public.notifications;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
