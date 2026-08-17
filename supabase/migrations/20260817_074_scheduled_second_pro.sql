-- "Add another repair pro" (Tow): a scheduled second request linked to the
-- primary tow request. Dispatched (notified) 60 min after the first pro
-- accepts — the motorist then enters their current address to book it.
alter table if exists public.service_requests
  add column if not exists linked_request_id text,
  add column if not exists scheduled_dispatch_at timestamptz,
  add column if not exists dispatch_notified_at timestamptz;

create index if not exists service_requests_scheduled_dispatch_idx
  on public.service_requests (scheduled_dispatch_at)
  where flow_status = 'scheduled';

comment on column public.service_requests.linked_request_id is
  'For "add another repair pro": id of the primary (tow) request that arms this one';
comment on column public.service_requests.scheduled_dispatch_at is
  'Armed 60 min after the primary request is accepted; the sweep notifies/dispatches after this';
comment on column public.service_requests.dispatch_notified_at is
  'Set when the motorist is pinged to enter their current address (notify once)';