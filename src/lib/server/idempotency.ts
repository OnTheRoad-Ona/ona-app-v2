/**
 * Server-side idempotent-operation ledger.
 *
 * Wraps any "fire-once" side effect (send OTP, charge, create, dispatch)
 * so that a retry after a lost response never repeats the side effect.
 *
 * Flow:
 * 1. no opKey -> run fn directly (legacy, no dedupe).
 * 2. opKey already done/error -> replay the recorded result. Nothing re-runs.
 * 3. opKey running -> poll briefly; concurrent duplicate in-flight.
 * 4. claim (insert running) -> run fn, settle to done/error.
 * Unique-violation on claim -> a concurrent twin won; poll it instead.
 *
 * Verify-then-report: GET /api/ops/status reads the same ledger.
 */

import { createServiceSupabase } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";

export type IdemRunResult<K> =
  | { status: "ok"; replay: boolean; result: K }
  | { status: "error"; replay: boolean; error: string }
  /** Still running elsewhere client should verify, not assume failure. */
  | { status: "processing" };

type LedgerRow = {
  status: "running" | "done" | "error";
  result: unknown;
  error: string | null;
};

const POLL_INTERVAL_MS = 150;
const MAX_WAIT_MS = 2000;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function readOp(opKey: string): Promise<LedgerRow | null> {
  const sb = createServiceSupabase();
  const { data } = await sb
    .from("idempotent_ops")
    .select("status, result, error")
    .eq("op_key", opKey)
    .maybeSingle();
  if (!data) return null;
  const status = String(data.status);
  return {
    status:
      status === "done" ? "done" : status === "error" ? "error" : "running",
    result: data.result ?? null,
    error: data.error ? String(data.error) : null,
  };
}

type WaitOutcome =
  | { kind: "done"; result: unknown }
  | { kind: "error"; error: string }
  | { kind: "processing" }
  | { kind: "missing" };

async function waitForCompletion(
  opKey: string,
  deadline: number,
): Promise<WaitOutcome> {
  while (Date.now() < deadline) {
    const op = await readOp(opKey);
    if (!op) return { kind: "missing" };
    if (op.status === "done") return { kind: "done", result: op.result };
    if (op.status === "error")
      return { kind: "error", error: op.error || "Operation failed." };
    await sleep(POLL_INTERVAL_MS);
  }
  return { kind: "processing" };
}

function outcomeResult<K>(out: WaitOutcome): IdemRunResult<K> {
  if (out.kind === "done")
    return { status: "ok", replay: true, result: out.result as K };
  if (out.kind === "error")
    return { status: "error", replay: true, error: out.error };
  return { status: "processing" };
}

async function safeRun<K>(
  run: () => Promise<{ ok: true; result: K } | { ok: false; error: string }>,
) {
  try {
    return await run();
  } catch (e) {
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : "Operation failed.",
    };
  }
}

export async function runIdempotent<K>(input: {
  opKey?: string | null;
  opType: string;
  actorKind?: string;
  actorId?: string;
  run: () => Promise<{ ok: true; result: K } | { ok: false; error: string }>;
  maxWaitMs?: number;
}): Promise<IdemRunResult<K>> {
  // Legacy callers (no opKey) keep running straight through.
  if (!input.opKey) {
    const out = await safeRun(input.run);
    return out.ok
      ? { status: "ok", replay: false, result: out.result }
      : { status: "error", replay: false, error: out.error };
  }
  if (!isSupabaseAdminConfigured()) {
    const out = await safeRun(input.run);
    return out.ok
      ? { status: "ok", replay: false, result: out.result }
      : { status: "error", replay: false, error: out.error };
  }

  const deadline = Date.now() + (input.maxWaitMs ?? MAX_WAIT_MS);

  const existing = await readOp(input.opKey);
  if (existing?.status === "done") {
    return { status: "ok", replay: true, result: existing.result as K };
  }
  if (existing?.status === "error") {
    return {
      status: "error",
      replay: true,
      error: existing.error || "Operation failed.",
    };
  }
  if (existing) {
    return outcomeResult(await waitForCompletion(input.opKey, deadline));
  }

  // Claim the op. insert ALSO detects the concurrent-twin race via its
  // unique op_key index, so we never need a separate lock/transaction.
  const sb = createServiceSupabase();
  const now = new Date().toISOString();
  const { error: insErr } = await sb.from("idempotent_ops").insert({
    op_key: input.opKey,
    actor_kind: input.actorKind || "anon",
    actor_id: input.actorId || "",
    op_type: input.opType,
    status: "running",
    created_at: now,
    updated_at: now,
  });

  if (insErr) {
    if (String((insErr as { code?: string }).code) === "23505") {
      // A twin claimed first wait for its outcome.
      return outcomeResult(await waitForCompletion(input.opKey, deadline));
    }
    // Ledger unavailable for non-conflict reasons best-effort run.
    const out = await safeRun(input.run);
    return out.ok
      ? { status: "ok", replay: false, result: out.result }
      : { status: "error", replay: false, error: out.error };
  }

  // We own the op run and settle it.
  const out = await safeRun(input.run);
  await sb
    .from("idempotent_ops")
    .update({
      status: out.ok ? "done" : "error",
      result: out.ok ? out.result : null,
      error: out.ok ? null : out.error,
      updated_at: new Date().toISOString(),
    })
    .eq("op_key", input.opKey);
  return out.ok
    ? { status: "ok", replay: false, result: out.result }
    : { status: "error", replay: false, error: out.error };
}
