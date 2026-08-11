-- ============================================================
-- Job idempotency keys (bad-network safety)
--
-- The client stamps each composed request with a sticker
-- (client_request_id) and reuses it across retries. The server
-- dedupes on it so a lost response can never create the same
-- request twice. Scoped to the motorist so stickers are
-- per-user and can never collide across accounts.
-- ============================================================

alter table public.service_requests
  add column if not exists client_request_id text;

create unique index if not exists service_requests_motorist_client_req_uniq
  on public.service_requests (motorist_id, client_request_id)
  where client_request_id is not null;
