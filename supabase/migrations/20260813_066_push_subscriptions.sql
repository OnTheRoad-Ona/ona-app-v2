-- =============================================================================
-- WEB-PUSH SUBSCRIPTIONS — real-time cancel/job prompts for the Repair Pro
-- -----------------------------------------------------------------------------
-- WHY
--   Realtime on service_requests only helps while the app tab is open. A
--   customer cancellation must reach the pro even when the app is closed or
--   the tab hidden, so the server sends a web-push (VAPID) notification to
--   each registered subscription. Storage is server-only (service_role): the
--   browser registers through a protected API route, and no client code ever
--   reads this table.
-- =============================================================================

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_id_idx
  on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;
alter table public.push_subscriptions force row level security;

revoke all on table public.push_subscriptions from anon, authenticated;
grant all on table public.push_subscriptions to service_role, postgres;

-- Done
notify pgrst, 'reload schema';