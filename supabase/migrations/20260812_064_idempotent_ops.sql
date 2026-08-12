-- ============================================================
-- Idempotent-operations ledger (lost-response safety net)
--
-- Any "fire-once" action can stamp an op_key (client-minted sticker).
-- The ledger records the outcome, so a retry after a lost response
-- replays the original result instead of re-running the side effect
-- (no second SMS, no double charge, no duplicate request). The
-- "runIdempotent" server helper claims the op, settles it, and
-- GET /api/ops/status lets the client verify-then-report.
-- ============================================================

create table if not exists public.idempotent_ops (
  id uuid primary key default gen_random_uuid(),
  op_key text not null,
  actor_kind text not null default 'anon',
  actor_id text not null default '',
  op_type text not null,
  status text not null default 'running', -- running | done | error
  result jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The op_key is the client-minted randomness, so it is globally unique.
create unique index if not exists idempotent_ops_op_key_uniq
  on public.idempotent_ops (op_key);

create index if not exists idempotent_ops_created_at_idx
  on public.idempotent_ops (created_at desc);

-- Security parity with migration 065: ledger must never be readable or
-- writable by anon / authenticated via PostgREST — only service_role.
alter table public.idempotent_ops enable row level security;
alter table public.idempotent_ops force row level security;
revoke all on table public.idempotent_ops from anon, authenticated;
grant all on table public.idempotent_ops to service_role, postgres;