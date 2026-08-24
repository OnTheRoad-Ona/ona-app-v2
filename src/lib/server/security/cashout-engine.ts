/**
 * Wallet cashout engine, auto Flutterwave transfers for credit cashouts.
 *
 * Flow: request → validations → atomic hold → (auto)approve → transfer via the
 * proven job-payout rails (payout_transfer_ledger + releaseToPro) → verify →
 * paid. Soft failures retry every 10 min (max 144 = 24 h) then auto-reverse.
 * Hard failures reverse immediately, funds never stay stuck.
 *
 * Pure helpers are exported for unit tests.
 */

import { createServiceSupabase } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import {
  createCashoutRequest,
  getCashoutRequest,
  getOrCreateWallet,
  patchCashoutRequest,
  findCashoutByIdempotencyKey,
  settleCashoutHold,
  reverseCashoutHold,
} from "@/lib/server/security/security-store";
import {
  markLedgerSuccess,
  markLedgerFailed,
  hasSuccessfulPayout,
} from "@/lib/server/payments/payout-ledger";
import {
  releaseToPro,
  findExistingFlutterwaveTransfer,
} from "@/lib/server/payments/providers";
import { isFeatureEnabled } from "@/lib/server/modules/settings/platform-settings";
import { getSystemSetting } from "@/lib/server/security/security-store";
import type { CashoutRequest } from "@/lib/security/types";

export const CASHOUT_RETRY_MAX = 144; // 10 min × 144 = 24 h (same as job payouts)
export const CASHOUT_RETRY_DELAY_MS = 10 * 60 * 1000;

/** Stable, forever-reusable transfer reference for one cashout. */
export function cashoutTransferRef(cashoutId: string): string {
  return `ona_cash_${cashoutId}`.slice(0, 80);
}

/** Fee/net computation. Net rounds DOWN to whole ₦ (user never over-paid). */
export function computeCashoutNet(
  requested: number,
  feePercent: number,
): { fee: number; net: number } {
  const req = Math.max(0, Math.floor(Number(requested) || 0));
  const pct = Math.min(100, Math.max(0, Number(feePercent) || 0));
  const rawFee = (req * pct) / 100;
  const net = Math.floor(req - rawFee);
  return { fee: Math.round((req - net) * 100) / 100, net };
}

export type CashoutLimits = {
  minimum: number;
  feePercent: number;
  dailyLimit: number;
  monthlyLimit: number;
  maxPerDay: number;
  autoApproveUnder: number;
};

/** Read all cashout knobs from system_settings (admin-tunable). */
export async function getCashoutLimits(): Promise<CashoutLimits> {
  const get = async (k: string, d: number) => {
    const row = await getSystemSetting(k);
    const n = Number(row?.value);
    return Number.isFinite(n) ? n : d;
  };
  return {
    minimum: await get("credit_cashout_minimum", 2000),
    feePercent: await get("credit_cashout_fee_percent", 5),
    dailyLimit: await get("credit_cashout_daily_limit", 50000),
    monthlyLimit: await get("credit_cashout_monthly_limit", 200000),
    maxPerDay: await get("credit_cashout_max_per_day", 2),
    autoApproveUnder: await get("credit_cashout_auto_approve_under", 0),
  };
}

/** Pure validation of a request against limits + recent history. */
export function validateAgainstLimits(
  input: {
    requestedAmount: number;
    availableCredits: number;
    blockedCredits: number;
    todayCount: number;
    todaySum: number;
    monthSum: number;
  },
  limits: CashoutLimits,
): { ok: true } | { ok: false; error: string } {
  if (input.requestedAmount < limits.minimum) {
    return { ok: false, error: `Minimum cashout is ₦${limits.minimum}` };
  }
  if (input.requestedAmount > input.availableCredits) {
    return { ok: false, error: "Insufficient available credits" };
  }
  if (input.blockedCredits > 0) {
    return {
      ok: false,
      error: "You already have a cashout being processed. Try again later.",
    };
  }
  if (input.todayCount >= limits.maxPerDay) {
    return {
      ok: false,
      error: `Maximum ${limits.maxPerDay} cashout(s) per day`,
    };
  }
  if (input.todaySum + input.requestedAmount > limits.dailyLimit) {
    return { ok: false, error: `Daily cashout limit is ₦${limits.dailyLimit}` };
  }
  if (input.monthSum + input.requestedAmount > limits.monthlyLimit) {
    return {
      ok: false,
      error: `Monthly cashout limit is ₦${limits.monthlyLimit}`,
    };
  }
  return { ok: true };
}

type BankOnFile = {
  bankCode?: string;
  bankName?: string;
  accountNumber?: string;
  accountName?: string;
};

/** Best-effort bank lookup from role profiles (never throws). */
export async function getBankOnFile(userId: string): Promise<BankOnFile> {
  if (!isSupabaseAdminConfigured()) return {};
  try {
    const sb = createServiceSupabase();
    for (const table of ["repair_pro_profiles", "profiles"]) {
      const { data } = await sb
        .from(table)
        .select(
          "bank_code, bank_name, bank_account_number, bank_account_name",
        )
        .eq(
          table === "repair_pro_profiles" ? "user_id" : "id",
          userId,
        )
        .maybeSingle();
      if (data && (data.bank_code || data.bank_account_number)) {
        return {
          bankCode: data.bank_code || undefined,
          bankName: data.bank_name || undefined,
          accountNumber: data.bank_account_number || undefined,
          accountName: data.bank_account_name || undefined,
        };
      }
    }
  } catch {
    /* */
  }
  return {};
}

/**
 * Create a cashout request: idempotent, flag-gated, limit-checked.
 * The atomic hold is performed by the existing createCashoutRequest
 * (credit_wallet_debit RPC / app-layer fallback).
 */
export async function requestCashout(input: {
  userId: string;
  requestedAmount: number;
  destinationAccount?: string;
  idempotencyKey?: string;
}): Promise<
  | { ok: true; cashout: CashoutRequest }
  | { ok: false; error: string }
> {
  // Idempotency first: a retried click never creates a second hold
  if (input.idempotencyKey) {
    const existing = await findCashoutByIdempotencyKey(input.idempotencyKey);
    if (existing) return { ok: true, cashout: existing };
  }

  // Feature switch (admin-controlled; ops always keep admin-side access)
  if (!(await isFeatureEnabled("wallet"))) {
    return { ok: false, error: "Wallet cashout is currently unavailable" };
  }

  const limits = await getCashoutLimits();

  // Velocity: count today's + this month's non-failed requests
  let todayCount = 0;
  let todaySum = 0;
  let monthSum = 0;
  if (isSupabaseAdminConfigured()) {
    try {
      const sb = createServiceSupabase();
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      const { data } = await sb
        .from("cashout_requests")
        .select("requested_amount, created_at, status")
        .eq("user_id", input.userId)
        .gte("created_at", monthStart.toISOString())
        .in("status", ["pending", "approved", "processing", "paid"]);
      for (const row of data || []) {
        const amt = Number(row.requested_amount) || 0;
        monthSum += amt;
        const created = new Date(row.created_at);
        const dayStart = new Date();
        dayStart.setHours(0, 0, 0, 0);
        if (created >= dayStart) {
          todayCount += 1;
          todaySum += amt;
        }
      }
    } catch {
      /* limits degrade gracefully to hold-level checks */
    }
  }

  const wallet = await getOrCreateWallet(input.userId);
  const check = validateAgainstLimits(
    {
      requestedAmount: input.requestedAmount,
      availableCredits: wallet.availableCredits,
      blockedCredits: wallet.blockedCredits,
      todayCount,
      todaySum,
      monthSum,
    },
    limits,
  );
  if (!check.ok) return { ok: false, error: check.error };

  const bank = await getBankOnFile(input.userId);
  const destination =
    input.destinationAccount ||
    (bank.accountNumber && bank.bankName
      ? `${bank.bankName} ••••${bank.accountNumber.slice(-4)} (${bank.accountName ?? ""})`.trim()
      : undefined);

  const result = await createCashoutRequest({
    userId: input.userId,
    requestedAmount: input.requestedAmount,
    destinationAccount: destination,
  });
  if ("error" in result) return { ok: false, error: result.error };
  const cashout = result.cashout;

  // Persist engine metadata (idempotency + bank snapshot)
  await patchCashoutRequest(cashout.id, {
    ...(input.idempotencyKey ? { idempotency_key: input.idempotencyKey } : {}),
    ...(bank.bankCode ? { bank_code: bank.bankCode } : {}),
    ...(bank.bankName ? { bank_name: bank.bankName } : {}),
    ...(bank.accountNumber ? { account_number: bank.accountNumber } : {}),
    ...(bank.accountName ? { account_name: bank.accountName } : {}),
  });

  // Auto-approve under threshold (default 0 = admin approves everything)
  const { fee, net } = computeCashoutNet(
    cashout.requestedAmount,
    limits.feePercent,
  );
  void fee;
  if (limits.autoApproveUnder > 0 && net <= limits.autoApproveUnder) {
    await patchCashoutRequest(cashout.id, { status: "approved" });
    cashout.status = "approved";
    // Fire-and-forget transfer attempt
    void attemptCashoutTransfer(cashout.id).catch(() => undefined);
  }

  return { ok: true, cashout };
}


type CashoutMeta = CashoutRequest & {
  bankCode?: string;
  accountNumber?: string;
  accountName?: string;
  retryCount?: number;
};

/**
 * Cashout-specific ledger claim: identical guarantee to claimTransferRef
 * (UNIQUE transfer_ref, insert-before-transfer) but linked via
 * cashout_request_id instead of payment_id.
 */
async function claimCashoutLedgerRef(input: {
  transferRef: string;
  cashoutRequestId: string;
  amountMinor: number;
  accountNumber?: string;
  accountBank?: string;
  beneficiaryName?: string;
}): Promise<
  | { ok: true }
  | { ok: false; reason: "already_exists"; existing: { status: string } }
  | { ok: false; reason: "db_unavailable" | "error"; message: string }
> {
  if (!isSupabaseAdminConfigured()) {
    return { ok: false, reason: "db_unavailable", message: "Supabase not configured" };
  }
  const sb = createServiceSupabase();
  const ref = input.transferRef.slice(0, 80);
  const { data: existing } = await sb
    .from("payout_transfer_ledger")
    .select("status")
    .eq("transfer_ref", ref)
    .maybeSingle();
  if (existing) return { ok: false, reason: "already_exists", existing };
  const { error } = await sb.from("payout_transfer_ledger").insert({
    cashout_request_id: input.cashoutRequestId,
    transfer_ref: ref,
    amount_minor: input.amountMinor,
    currency: "NGN",
    status: "initiated",
    account_bank: input.accountBank || null,
    account_number_last4: (input.accountNumber || "").replace(/\D/g, "").slice(-4) || null,
    beneficiary_name: input.beneficiaryName || null,
    meta: { claimedAt: new Date().toISOString() },
    updated_at: new Date().toISOString(),
  });
  if (error) {
    if (error.code === "23505" || /duplicate|unique/i.test(error.message || "")) {
      const { data: again } = await sb
        .from("payout_transfer_ledger")
        .select("status")
        .eq("transfer_ref", ref)
        .maybeSingle();
      if (again) return { ok: false, reason: "already_exists", existing: again };
    }
    return { ok: false, reason: "error", message: error.message };
  }
  return { ok: true };
}

/**
 * Attempt the Flutterwave transfer for an approved cashout.
 * Uses the same hard-ledger + stable-ref pattern as pro job payouts.
 */
export async function attemptCashoutTransfer(
  cashoutId: string,
): Promise<{ ok: boolean; status: string; message?: string }> {
  const cashout = await getCashoutRequest(cashoutId);
  if (!cashout) return { ok: false, status: "missing", message: "not_found" };
  if (cashout.status === "paid") return { ok: true, status: "paid" };
  if (!["approved", "processing"].includes(cashout.status)) {
    return {
      ok: false,
      status: cashout.status,
      message: `cashout is ${cashout.status}, not transferable`,
    };
  }

  const transferRef = cashoutTransferRef(cashout.id);

  // Absolute gate: already paid?
  if (await hasSuccessfulPayout({ transferRef })) {
    await settleCashoutHold(cashout.userId, cashout.requestedAmount, cashoutId);
    await patchCashoutRequest(cashoutId, {
      status: "paid",
      transfer_ref: transferRef,
      paid_at: new Date().toISOString(),
      transfer_status: "success",
    });
    return { ok: true, status: "paid" };
  }

  // Claim the ledger ref (UNIQUE) before touching Flutterwave.
  // Cashout-specific: linked via cashout_request_id (payment_id/request_id null).
  const meta = cashout as CashoutMeta;
  const amountMinor = Math.round(cashout.netAmount * 100);
  const claim = await claimCashoutLedgerRef({
    transferRef,
    cashoutRequestId: cashoutId,
    amountMinor,
    accountNumber: meta.accountNumber,
    accountBank: meta.bankCode,
    beneficiaryName: meta.accountName,
  });
  if (!claim.ok) {
    if (claim.reason === "already_exists") {
      if (claim.existing.status === "success") {
        await settleCashoutHold(cashout.userId, cashout.requestedAmount, cashoutId);
        await patchCashoutRequest(cashoutId, {
          status: "paid",
          transfer_ref: transferRef,
          transfer_status: "success",
        });
        return { ok: true, status: "paid" };
      }
      // failed claim → re-acquire for retry below
    } else {
      return {
        ok: false,
        status: cashout.status,
        message: `ledger: ${claim.message || claim.reason}`,
      };
    }
  }

  const result = await releaseToPro({
    amountMinor,
    currency: "NGN",
    reference: `cashout_${cashoutId}`,
    transferReference: transferRef,
    reason: `Ona wallet cashout ${cashoutId.slice(0, 8)}`,
    bankCode: meta.bankCode,
    accountNumber: meta.accountNumber,
    accountName: meta.accountName,
  });

  if (result.ok && result.code === "ok") {
    await markLedgerSuccess(transferRef, result.transferRef ?? null);
    const settle = await settleCashoutHold(
      cashout.userId,
      cashout.requestedAmount,
      cashoutId,
    );
    await patchCashoutRequest(cashoutId, {
      status: "paid",
      transfer_ref: transferRef,
      transfer_status: "success",
      flw_transfer_id: result.transferRef ?? null,
      paid_at: new Date().toISOString(),
      next_retry_at: null,
      last_error: null,
    });
    if (!("ok" in settle) || !settle.ok) {
      console.error("[cashout] transfer paid but hold settle failed", {
        cashoutId,
        settle,
      });
    }
    return { ok: true, status: "paid" };
  }

  if (result.code === "pending_settlement") {
    // Soft fail: Flutterwave balance low → retry in 10 min
    await markLedgerFailed(transferRef, result.message || "pending_settlement");
    await patchCashoutRequest(cashoutId, {
      status: "processing",
      transfer_ref: transferRef,
      transfer_status: "pending_settlement",
      retry_count: ((cashout as CashoutMeta).retryCount ?? 0) + 1,
      next_retry_at: new Date(
        Date.now() + CASHOUT_RETRY_DELAY_MS,
      ).toISOString(),
      last_error: result.message?.slice(0, 500) ?? null,
    });
    return { ok: false, status: "processing", message: result.message };
  }

  // Hard fail: bad account etc. → reverse funds immediately
  await markLedgerFailed(transferRef, result.message || "hard_fail");
  await reverseCashoutHold(
    cashout.userId,
    cashout.requestedAmount,
    cashoutId,
    result.message,
  );
  await patchCashoutRequest(cashoutId, {
    status: "failed",
    transfer_ref: transferRef,
    transfer_status: "hard_fail",
    last_error: result.message?.slice(0, 500) ?? null,
    next_retry_at: null,
  });
  return { ok: false, status: "failed", message: result.message };
}

/**
 * Retry scheduler: processes every processing cashout whose next_retry_at is
 * due. Past max retries → auto-reverse (transfer was never created).
 */
export async function processDueCashoutRetries(): Promise<{
  attempted: number;
  paid: number;
  reversed: number;
}> {
  let attempted = 0;
  let paid = 0;
  let reversed = 0;
  if (!isSupabaseAdminConfigured()) return { attempted, paid, reversed };
  try {
    const sb = createServiceSupabase();
    const { data } = await sb
      .from("cashout_requests")
      .select("id")
      .eq("status", "processing")
      .lte("next_retry_at", new Date().toISOString())
      .limit(25);
    for (const row of data || []) {
      const id = String(row.id);
      const cashout = await getCashoutRequest(id);
      if (!cashout) continue;
      const retries = (cashout as CashoutMeta).retryCount ?? 0;
      if (retries >= CASHOUT_RETRY_MAX) {
        // Never transferred (pending_settlement only) → give money back
        await reverseCashoutHold(
          cashout.userId,
          cashout.requestedAmount,
          id,
          "Cashout could not be completed after 24h of retries, funds returned",
        );
        await patchCashoutRequest(id, {
          status: "failed",
          last_error: "Escalated: retry limit reached, funds returned to wallet",
          next_retry_at: null,
        });
        reversed += 1;
        continue;
      }
      attempted += 1;
      const res = await attemptCashoutTransfer(id);
      if (res.status === "paid") paid += 1;
      if (res.status === "failed") reversed += 1;
    }
  } catch {
    /* next cron run picks up */
  }
  return { attempted, paid, reversed };
}


/**
 * Verify stuck `processing` cashouts against Flutterwave (transfer created
 * but final status unknown). SUCCESSFUL → paid; failed → reverse + failed.
 */
export async function verifyPendingCashouts(): Promise<{
  checked: number;
  paid: number;
  failed: number;
}> {
  let checked = 0;
  let paid = 0;
  let failed = 0;
  if (!isSupabaseAdminConfigured()) return { checked, paid, failed };
  try {
    const sb = createServiceSupabase();
    const { data } = await sb
      .from("cashout_requests")
      .select("id, transfer_ref, user_id, requested_amount")
      .eq("status", "processing")
      .not("transfer_ref", "is", null)
      .limit(25);
    for (const row of data || []) {
      const id = String(row.id);
      const ref = String(row.transfer_ref || "");
      if (!ref) continue;
      checked += 1;
      const existing = await findExistingFlutterwaveTransfer(ref);
      if (!existing.found) continue;
      const status = String(existing.status || "").toUpperCase();
      const cashout = await getCashoutRequest(id);
      if (!cashout) continue;
      if (["SUCCESSFUL", "SUCCESS"].includes(status)) {
        await markLedgerSuccess(ref, existing.id ?? null);
        await settleCashoutHold(cashout.userId, cashout.requestedAmount, id);
        await patchCashoutRequest(id, {
          status: "paid",
          transfer_status: "success",
          paid_at: new Date().toISOString(),
          next_retry_at: null,
        });
        paid += 1;
      } else if (["FAILED", "REVERSED", "CANCELLED"].includes(status)) {
        await markLedgerFailed(ref, `FLW status ${status}`);
        await reverseCashoutHold(
          cashout.userId,
          cashout.requestedAmount,
          id,
          `Transfer ${status} at Flutterwave`,
        );
        await patchCashoutRequest(id, {
          status: "failed",
          transfer_status: status.toLowerCase(),
          last_error: `Flutterwave reported ${status}`,
          next_retry_at: null,
        });
        failed += 1;
      }
    }
  } catch {
    /* next run picks up */
  }
  return { checked, paid, failed };
}

/** Admin: force-fail a stuck cashout and return the funds. */
export async function forceFailCashout(
  cashoutId: string,
  adminId: string,
  reason?: string,
): Promise<{ ok: boolean; message?: string }> {
  const cashout = await getCashoutRequest(cashoutId);
  if (!cashout) return { ok: false, message: "not_found" };
  if (cashout.status === "paid") {
    return { ok: false, message: "Already paid, cannot force-fail" };
  }
  if (cashout.status === "rejected" || cashout.status === "failed") {
    return { ok: false, message: "Already failed/rejected" };
  }
  const reverse = await reverseCashoutHold(
    cashout.userId,
    cashout.requestedAmount,
    cashoutId,
    reason || `Force-failed by admin ${adminId}`,
  );
  await patchCashoutRequest(cashoutId, {
    status: "failed",
    last_error: reason || `Force-failed by admin ${adminId}`,
    next_retry_at: null,
  });
  return {
    ok: !("error" in reverse),
    message: "error" in reverse ? reverse.error : undefined,
  };
}
