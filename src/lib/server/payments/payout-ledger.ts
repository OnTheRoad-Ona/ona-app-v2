/**
 * Hard ledger for Flutterwave transfer references.
 * UNIQUE(transfer_ref) in DB — second insert fails → never double-pay.
 */

import { createServiceSupabase } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";

export type LedgerRow = {
  id: string;
  paymentId: string | null;
  requestId: string | null;
  transferRef: string;
  flwTransferId: string | null;
  amountMinor: number;
  currency: string;
  status: string;
  accountBank: string | null;
  accountNumberLast4: string | null;
  beneficiaryName: string | null;
  meta: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

function rowToLedger(row: Record<string, unknown>): LedgerRow {
  return {
    id: String(row.id),
    paymentId: row.payment_id ? String(row.payment_id) : null,
    requestId: row.request_id ? String(row.request_id) : null,
    transferRef: String(row.transfer_ref || ""),
    flwTransferId: row.flw_transfer_id ? String(row.flw_transfer_id) : null,
    amountMinor: Number(row.amount_minor) || 0,
    currency: String(row.currency || "NGN"),
    status: String(row.status || "initiated"),
    accountBank: row.account_bank ? String(row.account_bank) : null,
    accountNumberLast4: row.account_number_last4
      ? String(row.account_number_last4)
      : null,
    beneficiaryName: row.beneficiary_name
      ? String(row.beneficiary_name)
      : null,
    meta: (row.meta as Record<string, unknown>) || {},
    createdAt: String(row.created_at || ""),
    updatedAt: String(row.updated_at || ""),
  };
}

/**
 * Claim a transfer reference before calling Flutterwave.
 * Returns { ok: true } if we own the ref; { ok: false, existing } if already used.
 */
export async function claimTransferRef(input: {
  transferRef: string;
  paymentId: string;
  requestId: string;
  amountMinor: number;
  currency?: string;
  accountBank?: string;
  accountNumber?: string;
  beneficiaryName?: string;
}): Promise<
  | { ok: true; created: true }
  | { ok: false; reason: "already_exists"; existing: LedgerRow }
  | { ok: false; reason: "db_unavailable" | "error"; message: string }
> {
  if (!isSupabaseAdminConfigured()) {
    return { ok: false, reason: "db_unavailable", message: "Supabase not configured" };
  }
  const sb = createServiceSupabase();
  const ref = input.transferRef.slice(0, 80);
  const last4 = (input.accountNumber || "").replace(/\D/g, "").slice(-4) || null;

  // Fast path: already in ledger
  const { data: existing } = await sb
    .from("payout_transfer_ledger")
    .select("*")
    .eq("transfer_ref", ref)
    .maybeSingle();
  if (existing) {
    return {
      ok: false,
      reason: "already_exists",
      existing: rowToLedger(existing as Record<string, unknown>),
    };
  }

  const { data, error } = await sb
    .from("payout_transfer_ledger")
    .insert({
      payment_id: input.paymentId,
      request_id: input.requestId,
      transfer_ref: ref,
      amount_minor: input.amountMinor,
      currency: input.currency || "NGN",
      status: "initiated",
      account_bank: input.accountBank || null,
      account_number_last4: last4,
      beneficiary_name: input.beneficiaryName || null,
      meta: { claimedAt: new Date().toISOString() },
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error) {
    // Unique violation → someone else claimed first
    if (
      error.code === "23505" ||
      /duplicate|unique/i.test(error.message || "")
    ) {
      const { data: again } = await sb
        .from("payout_transfer_ledger")
        .select("*")
        .eq("transfer_ref", ref)
        .maybeSingle();
      if (again) {
        return {
          ok: false,
          reason: "already_exists",
          existing: rowToLedger(again as Record<string, unknown>),
        };
      }
    }
    // Table missing → fail open is dangerous; fail closed for payouts
    return { ok: false, reason: "error", message: error.message };
  }

  void data;
  return { ok: true, created: true };
}

export async function markLedgerSuccess(
  transferRef: string,
  flwTransferId?: string | null
): Promise<void> {
  if (!isSupabaseAdminConfigured()) return;
  const sb = createServiceSupabase();
  // Terminal success for this transfer_ref — retries must not create a new ref.
  await sb
    .from("payout_transfer_ledger")
    .update({
      status: "success",
      flw_transfer_id: flwTransferId || null,
      updated_at: new Date().toISOString(),
    })
    .eq("transfer_ref", transferRef);
}

/**
 * Mark claim failed so the SAME transfer_ref can be retried later.
 * NEVER touches status=success (double-pay guard).
 */
export async function markLedgerFailed(
  transferRef: string,
  message: string
): Promise<void> {
  if (!isSupabaseAdminConfigured()) return;
  const sb = createServiceSupabase();
  await sb
    .from("payout_transfer_ledger")
    .update({
      status: "failed",
      meta: { lastError: message, failedAt: new Date().toISOString() },
      updated_at: new Date().toISOString(),
    })
    .eq("transfer_ref", transferRef)
    .eq("status", "initiated"); // only abandon in-flight claims, never success
}

/**
 * Re-open a failed claim for retry with the same transfer_ref.
 * Atomic: only if still failed (not success / not another worker initiated).
 */
export async function reacquireFailedClaim(
  transferRef: string
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!isSupabaseAdminConfigured()) {
    return { ok: false, reason: "db_unavailable" };
  }
  const sb = createServiceSupabase();
  const { data, error } = await sb
    .from("payout_transfer_ledger")
    .update({
      status: "initiated",
      meta: { reacquiredAt: new Date().toISOString() },
      updated_at: new Date().toISOString(),
    })
    .eq("transfer_ref", transferRef)
    .eq("status", "failed")
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, reason: error.message };
  if (!data) return { ok: false, reason: "not_failed_or_missing" };
  return { ok: true };
}

/** Absolute gate: has this payment/request already been paid out successfully? */
export async function hasSuccessfulPayout(input: {
  paymentId?: string | null;
  requestId?: string | null;
  transferRef?: string | null;
}): Promise<boolean> {
  if (!isSupabaseAdminConfigured()) return false;
  const sb = createServiceSupabase();
  if (input.transferRef) {
    const { data } = await sb
      .from("payout_transfer_ledger")
      .select("id")
      .eq("transfer_ref", input.transferRef.slice(0, 80))
      .eq("status", "success")
      .maybeSingle();
    if (data) return true;
  }
  if (input.paymentId) {
    const { data } = await sb
      .from("payout_transfer_ledger")
      .select("id")
      .eq("payment_id", input.paymentId)
      .eq("status", "success")
      .limit(1)
      .maybeSingle();
    if (data) return true;
  }
  if (input.requestId) {
    const { data } = await sb
      .from("payout_transfer_ledger")
      .select("id")
      .eq("request_id", input.requestId)
      .eq("status", "success")
      .limit(1)
      .maybeSingle();
    if (data) return true;
  }
  return false;
}

/**
 * Beneficiary duplicate guard: another SUCCESSFUL payout to the SAME account
 * for the SAME amount within `windowMs` (default 24h) means someone already got
 * this money — block a second push even when the transfer reference differs.
 * This is the last line of defence against operator/retry double-pay that the
 * per-reference UNIQUE index cannot catch (different ref = same person+amount).
 */
export async function recentDuplicatePayout(input: {
  accountNumber?: string | null;
  accountBank?: string | null;
  amountMinor: number;
  currency?: string;
  windowMs?: number;
}): Promise<{
  duplicate: boolean;
  existing?: LedgerRow;
}> {
  if (!isSupabaseAdminConfigured()) {
    return { duplicate: false };
  }
  const last4 = (input.accountNumber || "")
    .replace(/\D/g, "")
    .slice(-4)
    .toLowerCase();
  if (!last4) return { duplicate: false };
  const amount = Number(input.amountMinor) || 0;
  if (amount <= 0) return { duplicate: false };
  const windowMs = input.windowMs || 24 * 60 * 60 * 1000;
  const since = new Date(Date.now() - windowMs).toISOString();
  const sb = createServiceSupabase();
  const bank = (input.accountBank || "").trim();

  const { data, error } = await sb
    .from("payout_transfer_ledger")
    .select("*")
    .eq("status", "success")
    .eq("account_number_last4", last4)
    .eq("amount_minor", amount)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(5);
  if (error || !data || data.length === 0) {
    return { duplicate: false };
  }
  const rows = (data as Record<string, unknown>[]).map(rowToLedger);
  // Match currency + bank when we know them (be conservative; match broad when not)
  const match = rows.find((r) => {
    if (input.currency && r.currency && r.currency !== input.currency) {
      return false;
    }
    if (bank && r.accountBank && r.accountBank !== bank) {
      return false;
    }
    return true;
  });
  if (!match) return { duplicate: false };
  return { duplicate: true, existing: match };
}

export async function listLedgerByPayment(
  paymentId: string
): Promise<LedgerRow[]> {
  if (!isSupabaseAdminConfigured()) return [];
  const sb = createServiceSupabase();
  const { data } = await sb
    .from("payout_transfer_ledger")
    .select("*")
    .eq("payment_id", paymentId)
    .order("created_at", { ascending: false });
  return (data || []).map((r) => rowToLedger(r as Record<string, unknown>));
}

export async function listLedgerByRequest(
  requestId: string
): Promise<LedgerRow[]> {
  if (!isSupabaseAdminConfigured()) return [];
  const sb = createServiceSupabase();
  const { data } = await sb
    .from("payout_transfer_ledger")
    .select("*")
    .eq("request_id", requestId)
    .order("created_at", { ascending: false });
  return (data || []).map((r) => rowToLedger(r as Record<string, unknown>));
}
