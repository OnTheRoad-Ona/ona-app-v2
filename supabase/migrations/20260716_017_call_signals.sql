-- Durable call signaling (WebRTC offer/answer/ICE). Survives Realtime blips.
create table if not exists public.call_signals (
  id uuid primary key default gen_random_uuid(),
  call_id text not null,
  to_user_id uuid not null references auth.users (id) on delete cascade,
  from_user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  consumed boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists call_signals_to_user_idx
  on public.call_signals (to_user_id, consumed, created_at desc);

create index if not exists call_signals_call_id_idx
  on public.call_signals (call_id, created_at);

alter table public.call_signals enable row level security;

-- Users can insert signals they send
drop policy if exists call_signals_insert_own on public.call_signals;
create policy call_signals_insert_own on public.call_signals
  for insert to authenticated
  with check (auth.uid() = from_user_id);

-- Users can read signals addressed to them
drop policy if exists call_signals_select_inbox on public.call_signals;
create policy call_signals_select_inbox on public.call_signals
  for select to authenticated
  using (auth.uid() = to_user_id or auth.uid() = from_user_id);

-- Recipients can mark consumed
drop policy if exists call_signals_update_inbox on public.call_signals;
create policy call_signals_update_inbox on public.call_signals
  for update to authenticated
  using (auth.uid() = to_user_id)
  with check (auth.uid() = to_user_id);
