/**
 * Ona payout settlement architecture
 * ----------------------------------
 * Customer pays service charge S only. On “I’m Satisfied”:
 * - Transfer pro 87.5% of S (S − 5% Ona − 7.5% VAT)
 * - VAT 7.5% stays on Flutterwave main balance
 * - Ona 5% stays on merchant (settles to Zenith); FLW fees come from this 5%
 * If Available is insufficient, mark PENDING_SETTLEMENT and auto-retry.
 */

import {
  getEscrowByRequest,
  listEscrowsByStatuses,
  updateEscrow,
  type EscrowPayment,
} from "@/lib/server/payments/escrow-store";
import { listDisputedJobs } from "@/lib/server/jobs/job-store";
import {
  findExistingFlutterwaveTransfer,
  getFlutterwaveNgnBalances,
  releaseToPro,
  resolveProvider,
} from "@/lib/server/payments/providers";
import type { AppCurrency } from "@/lib/pricing";
import {
  PLATFORM_COMMISSION_PERCENT,
  PRO_NET_PAYOUT_PERCENT,
  splitServiceChargeMinor,
  toMinorUnits,
  VAT_PERCENT_NG,
} from "@/lib/pricing";
import { createServiceSupabase } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";

/** Fixed cadence: retry every 10 minutes. */
export const PAYOUT_RETRY_INTERVAL_MS = 10 * 60 * 1000;

/** Auto-retry window: 24 hours, then suspend for admin manual pay. */
export const PAYOUT_AUTO_RETRY_WINDOW_MS = 24 * 60 * 60 * 1000;

/** 24h / 10 min = 144 attempts max. */
export const PAYOUT_MAX_AUTO_RETRIES = Math.floor(
  PAYOUT_AUTO_RETRY_WINDOW_MS / PAYOUT_RETRY_INTERVAL_MS
);

function nowIso() {
  return new Date().toISOString();
}

function nowMs() {
  return Date.now();
}

export function nextPayoutRetryAt(_retryCount: number, fromMs = nowMs()): string {
  return new Date(fromMs + PAYOUT_RETRY_INTERVAL_MS).toISOString();
}

function isCancelledOrSuspendedMeta(meta: Record<string, unknown>): boolean {
  return (
    meta.autoRetryCancelled === true ||
    meta.payoutSuspended === true ||
    meta.payoutStatus === "suspended_admin" ||
    meta.payoutStatus === "cancelled_processing"
  );
}

/**
 * Write pending/fail state only if operator has not cancelled processing.
 * Prevents a long-running retry from overwriting a cancel.
 */
async function updateEscrowUnlessCancelled(
  escId: string,
  requestId: string,
  patch: Parameters<typeof updateEscrow>[1]
): Promise<boolean> {
  const fresh = await getEscrowByRequest(requestId);
  if (!fresh || fresh.id !== escId) return false;
  const m = (fresh.meta || {}) as Record<string, unknown>;
  if (isCancelledOrSuspendedMeta(m)) return false;
  const incoming = (patch.meta || {}) as Record<string, unknown>;
  await updateEscrow(escId, {
    ...patch,
    meta: {
      ...m,
      ...incoming,
      // Never clear cancel flags if they appeared mid-flight
      autoRetryCancelled: m.autoRetryCancelled ?? incoming.autoRetryCancelled,
      payoutSuspended: m.payoutSuspended ?? incoming.payoutSuspended,
    },
  });
  return true;
}

/** True when auto-retry window is exhausted — admin must force-release. */
export function isPayoutAutoRetryExhausted(
  meta: Record<string, unknown>
): boolean {
  if (
    meta.payoutStatus === "suspended_admin" ||
    meta.payoutSuspended === true
  ) {
    return true;
  }
  const retries = Number(meta.payoutRetryCount) || 0;
  if (retries >= PAYOUT_MAX_AUTO_RETRIES) return true;
  const started = Date.parse(
    String(meta.payoutRetryStartedAt || meta.firstPendingAt || "")
  );
  if (Number.isFinite(started) && nowMs() - started >= PAYOUT_AUTO_RETRY_WINDOW_MS) {
    return true;
  }
  return false;
}

function ensureRetryStartedAt(
  meta: Record<string, unknown>
): Record<string, unknown> {
  if (meta.payoutRetryStartedAt) return meta;
  return { ...meta, payoutRetryStartedAt: nowIso() };
}

/** Transient / settlement — auto-retry. Not permanent bank/KYC hard fails. */
export function isSettlementInsufficientError(msg: string | null | undefined): boolean {
  const m = String(msg || "").toLowerCase();
  return (
    m.includes("available ngn") ||
    m.includes("available balance") ||
    m.includes("insufficient") ||
    m.includes("settling") ||
    m.includes("ledger") ||
    m.includes("pending_settlement") ||
    m.includes("not enough") ||
    m.includes("fetch failed") ||
    m.includes("network") ||
    m.includes("proxy") ||
    m.includes("timeout") ||
    m.includes("econnrefused") ||
    m.includes("etimedout") ||
    m.includes("payout server")
  );
}

export function isHardPayoutFailure(msg: string | null | undefined): boolean {
  const m = String(msg || "").toLowerCase();
  if (isSettlementInsufficientError(msg)) return false;
  return (
    m.includes("below minimum") ||
    m.includes("invalid account") ||
    m.includes("account could not be verified") ||
    m.includes("bank incomplete") ||
    m.includes("not enabled to make transfers") ||
    m.includes("account administrator") ||
    m.includes("secret key missing")
  );
}

/** Stable FLW transfer reference — never changes across retries for same escrow */
export function stableProTransferReference(escrowId: string, requestId: string): string {
  const base = `ona_rel_${escrowId.replace(/-/g, "").slice(0, 12)}_${requestId.replace(/-/g, "").slice(0, 10)}`;
  return base.slice(0, 50);
}

/**
 * Settlement split of held service charge S:
 * pro 87.5% · Ona platform 5% · VAT 7.5% (VAT not transferred).
 */
export function split95_5(totalMinor: number): {
  platformFeeMinor: number;
  proPayoutMinor: number;
  vatMinor: number;
} {
  const s = splitServiceChargeMinor(totalMinor);
  return {
    platformFeeMinor: s.platformFeeMinor,
    proPayoutMinor: s.proPayoutMinor,
    vatMinor: s.vatMinor,
  };
}

export type PayoutAttemptResult =
  | {
      ok: true;
      transferRef: string;
      totalMinor: number;
      proPayoutMinor: number;
      platformFeeMinor: number;
      /** True if transfer already succeeded earlier — do not re-notify */
      alreadyReleased?: boolean;
    }
  | {
      ok: false;
      pendingSettlement: true;
      message: string;
      totalMinor: number;
      proPayoutMinor: number;
      platformFeeMinor: number;
      availableNgn: number | null;
      ledgerNgn: number | null;
      nextRetryAt: string;
      retryCount: number;
    }
  | {
      ok: false;
      pendingSettlement: false;
      message: string;
      totalMinor?: number;
      proPayoutMinor?: number;
      platformFeeMinor?: number;
    };

async function loadProBank(repairProId: string | null): Promise<{
  bankCode: string;
  accountNumber: string;
  accountName: string;
} | null> {
  if (!repairProId || !isSupabaseAdminConfigured()) return null;
  try {
    const sb = createServiceSupabase();
    const { data } = await sb
      .from("repair_pro_profiles")
      .select("bank_code, bank_account_number, bank_account_name")
      .eq("user_id", repairProId)
      .maybeSingle();
    if (!data) return null;
    const bankCode = String(data.bank_code || "").trim();
    const accountNumber = String(data.bank_account_number || "").replace(/\D/g, "");
    const accountName = String(data.bank_account_name || "").trim();
    if (!bankCode || accountNumber.length < 10 || !accountName) return null;
    return { bankCode, accountNumber, accountName };
  } catch {
    return null;
  }
}

/**
 * Attempt (or re-attempt) pro payout (87.5% of service) for held / pending escrow.
 *
 * DOUBLE-PAY HARD RULES (never violated):
 * 1. One stable Flutterwave transfer reference per escrow forever
 * 2. Ledger UNIQUE(transfer_ref) + status=success is terminal
 * 3. Always look up FLW by reference before creating a transfer
 * 4. Auto retries wait a full 10 minutes (nextRetryAt) — never skip for open app/cron
 * 5. `force` = admin only: skip 10‑min wait + allow suspended; never double-pay
 * 6. Concurrent in-flight claims (<90s) always block, even with force
 */
export async function attemptProPayout(input: {
  jobId: string;
  repairProId: string | null;
  repairProName?: string | null;
  amountMinor?: number | null;
  agreedMajor?: number | null;
  currency?: string | null;
  paymentReference?: string | null;
  /**
   * Admin force-release only.
   * Skips 10‑min backoff and may retry suspended payouts.
   * Does NOT bypass double-pay locks or success.
   */
  force?: boolean;
}): Promise<PayoutAttemptResult> {
  const esc = await getEscrowByRequest(input.jobId);
  if (!esc) {
    if (resolveProvider() === "mock") {
      const total =
        Number(input.amountMinor) ||
        (input.agreedMajor != null
          ? toMinorUnits(input.agreedMajor, (input.currency || "NGN") as AppCurrency)
          : 0);
      const split = split95_5(total);
      return {
        ok: true,
        transferRef: "mock-no-escrow",
        totalMinor: total,
        proPayoutMinor: split.proPayoutMinor,
        platformFeeMinor: split.platformFeeMinor,
      };
    }
    return {
      ok: false,
      pendingSettlement: false,
      message:
        "No escrow payment found for this job. Customer may not have paid yet.",
    };
  }

  const meta = { ...(esc.meta || {}) } as Record<string, unknown>;
  const stableRefPreview =
    String(meta.idempotentTransferRef || "").trim() ||
    stableProTransferReference(esc.id, esc.requestId);

  // Absolute gates: escrow / meta / ledger success — never create a second transfer
  const { hasSuccessfulPayout } = await import(
    "@/lib/server/payments/payout-ledger"
  );
  if (await hasSuccessfulPayout({
    paymentId: esc.id,
    requestId: esc.requestId,
    transferRef: stableRefPreview,
  })) {
    const split = split95_5(esc.amountMinor || 0);
    if (esc.escrowStatus !== "released") {
      await updateEscrow(esc.id, {
        status: "released",
        escrowStatus: "released",
        releasedAt: nowIso(),
        meta: {
          ...meta,
          payoutStatus: "success",
          proTransferOk: true,
          blockedDoublePay: true,
          recoveredFromLedgerSuccess: true,
        },
      });
    }
    return {
      ok: true,
      alreadyReleased: true,
      transferRef: String(meta.proTransferRef || stableRefPreview),
      totalMinor: esc.amountMinor,
      proPayoutMinor: Number(meta.proPayoutMinor) || split.proPayoutMinor,
      platformFeeMinor: Number(meta.platformKeptMinor) || split.platformFeeMinor,
    };
  }

  // Already successfully paid — never double-pay or re-notify
  if (
    esc.escrowStatus === "released" ||
    meta.proTransferOk === true ||
    meta.payoutStatus === "success"
  ) {
    const split = split95_5(esc.amountMinor || 0);
    return {
      ok: true,
      alreadyReleased: true,
      transferRef: String(meta.proTransferRef || meta.idempotentTransferRef || ""),
      totalMinor: esc.amountMinor,
      proPayoutMinor: Number(meta.proPayoutMinor) || split.proPayoutMinor,
      platformFeeMinor: Number(meta.platformKeptMinor) || split.platformFeeMinor,
    };
  }

  // FLW already paid this ref (success after cancel race / missed finalize) — recover UI
  {
    const onFlw = await findExistingFlutterwaveTransfer(stableRefPreview);
    if (onFlw.found) {
      const split = split95_5(esc.amountMinor || 0);
      const { markLedgerSuccess } = await import(
        "@/lib/server/payments/payout-ledger"
      );
      await markLedgerSuccess(stableRefPreview, onFlw.id).catch(() => undefined);
      await updateEscrow(esc.id, {
        status: "released",
        escrowStatus: "released",
        releasedAt: nowIso(),
        platformFeeMinor: split.platformFeeMinor,
        proPayoutMinor: split.proPayoutMinor,
        meta: {
          ...meta,
          payoutStatus: "success",
          proTransferOk: true,
          proTransferRef: stableRefPreview,
          idempotentTransferRef: stableRefPreview,
          pendingSettlement: false,
          proPayoutPending: false,
          payoutInFlight: false,
          nextRetryAt: null,
          autoRetryCancelled: false,
          payoutSuspended: false,
          lastReleaseError: null,
          recoveredFromFlwSuccess: true,
          blockedDoublePay: true,
        },
      });
      return {
        ok: true,
        alreadyReleased: true,
        transferRef: stableRefPreview,
        totalMinor: esc.amountMinor,
        proPayoutMinor: split.proPayoutMinor,
        platformFeeMinor: split.platformFeeMinor,
      };
    }
  }

  // Operator cancelled processing, or suspended for admin — no auto retries
  // (only after confirming FLW has not already paid this ref)
  if (!input.force && isCancelledOrSuspendedMeta(meta)) {
    const split = split95_5(esc.amountMinor || 0);
    return {
      ok: false,
      pendingSettlement: false,
      message:
        "Payout processing was cancelled or suspended. An admin must release payment manually.",
      totalMinor: esc.amountMinor,
      proPayoutMinor: Number(meta.proPayoutMinor) || split.proPayoutMinor,
      platformFeeMinor: Number(meta.platformKeptMinor) || split.platformFeeMinor,
    };
  }

  // Auto-retry window exhausted → suspend for admin (unless admin force_release)
  if (isPayoutAutoRetryExhausted(meta) && !input.force) {
    const split = split95_5(esc.amountMinor || 0);
    if (meta.payoutStatus !== "suspended_admin") {
      await updateEscrow(esc.id, {
        status: "paid",
        escrowStatus: "held",
        meta: {
          ...meta,
          payoutStatus: "suspended_admin",
          payoutSuspended: true,
          needsAdmin: true,
          nextRetryAt: null,
          proPayoutPending: false,
          pendingSettlement: false,
          lastReleaseError:
            meta.lastReleaseError ||
            "Auto-retry window (24h) ended. Suspended for admin manual pay.",
          payoutSuspendedAt: nowIso(),
        },
      });
    }
    return {
      ok: false,
      pendingSettlement: false,
      message:
        "Payout suspended after 24 hours of auto-retries. An admin must release payment manually.",
      totalMinor: esc.amountMinor,
      proPayoutMinor: Number(meta.proPayoutMinor) || split.proPayoutMinor,
      platformFeeMinor: Number(meta.platformKeptMinor) || split.platformFeeMinor,
    };
  }

  if (
    esc.escrowStatus !== "held" &&
    esc.escrowStatus !== "release_pending" &&
    esc.escrowStatus !== "pending_settlement"
  ) {
    return {
      ok: false,
      pendingSettlement: false,
      message: `Escrow cannot pay out (status: ${esc.escrowStatus}).`,
    };
  }

  // HARD 10‑minute spacing for ALL auto retries (cron, open app, expire-stale).
  // Only admin force may skip. Available balance does NOT override the timer.
  if (!input.force) {
    const nextAt = String(meta.nextRetryAt || "");
    const nextMs = Date.parse(nextAt);
    if (nextAt && Number.isFinite(nextMs) && nextMs > nowMs() + 2000) {
      const splitEarly = split95_5(esc.amountMinor);
      return {
        ok: false,
        pendingSettlement: true,
        message:
          "Payout scheduled — next auto-retry in up to 10 minutes. Funds remain in escrow.",
        totalMinor: esc.amountMinor,
        proPayoutMinor:
          Number(meta.proPayoutMinor) || splitEarly.proPayoutMinor,
        platformFeeMinor:
          Number(meta.platformKeptMinor) || splitEarly.platformFeeMinor,
        availableNgn:
          meta.lastAvailableNgn != null ? Number(meta.lastAvailableNgn) : null,
        ledgerNgn:
          meta.lastLedgerNgn != null ? Number(meta.lastLedgerNgn) : null,
        nextRetryAt: nextAt,
        retryCount: Number(meta.payoutRetryCount) || 0,
      };
    }
  }

  const fromMajor =
    input.agreedMajor != null && input.agreedMajor > 0
      ? toMinorUnits(
          input.agreedMajor,
          (input.currency || esc.currency || "NGN") as AppCurrency
        )
      : 0;
  const total = Math.max(
    Number(input.amountMinor) || 0,
    Number(esc.amountMinor) || 0,
    fromMajor
  );
  if (!total) {
    return {
      ok: false,
      pendingSettlement: false,
      message: "Invalid job amount for release.",
    };
  }

  // Prefer stored split (pro 87.5% · Ona 5% · VAT 7.5% of service charge)
  const labourMinor = Number(meta.labourMinor) || fromMajor || total || 0;
  let proPayoutMinor =
    Number(esc.proPayoutMinor) ||
    Number(meta.proPayoutMinor) ||
    0;
  let platformFeeMinor =
    Number(esc.platformFeeMinor) ||
    Number(meta.platformKeptMinor) ||
    Number(meta.platformFeeMinor) ||
    0;
  let vatMinor =
    Number(meta.vatMinor) ||
    0;
  if (!proPayoutMinor || proPayoutMinor <= 0) {
    const base = labourMinor > 0 ? labourMinor : total;
    const s = split95_5(base);
    proPayoutMinor = s.proPayoutMinor;
    platformFeeMinor = s.platformFeeMinor;
    vatMinor = s.vatMinor;
  } else if (!platformFeeMinor || platformFeeMinor <= 0) {
    const s = split95_5(labourMinor > 0 ? labourMinor : total);
    platformFeeMinor = s.platformFeeMinor;
    if (!vatMinor) vatMinor = s.vatMinor;
  }
  // Never pay pro more than held total; do NOT fold VAT into platformFeeMinor
  proPayoutMinor = Math.min(proPayoutMinor, total);
  if (!vatMinor) {
    vatMinor = Math.max(0, total - proPayoutMinor - platformFeeMinor);
  }

  /**
   * Flutterwave NGN bank transfer minimum is ₦100.
   * On small service charges (e.g. ₦105 → pro 87.5% = ₦91.87) the transfer is
   * rejected forever even when Available is funded — which looked like
   * “stuck in payout processing”.
   * Top up pro payout to ₦100 from Ona/VAT remainder when held total allows it.
   */
  const FLW_NGN_MIN_MINOR = 10_000;
  let flwMinTopUpMinor = 0;
  if (
    proPayoutMinor > 0 &&
    proPayoutMinor < FLW_NGN_MIN_MINOR &&
    total >= FLW_NGN_MIN_MINOR
  ) {
    flwMinTopUpMinor = FLW_NGN_MIN_MINOR - proPayoutMinor;
    proPayoutMinor = FLW_NGN_MIN_MINOR;
    // Shrink platform bookkeeping so amounts still sum sensibly
    const rest = Math.max(0, total - proPayoutMinor);
    if (platformFeeMinor + vatMinor > rest) {
      platformFeeMinor = Math.min(platformFeeMinor, rest);
      vatMinor = Math.max(0, rest - platformFeeMinor);
    }
  } else if (proPayoutMinor > 0 && proPayoutMinor < FLW_NGN_MIN_MINOR && total < FLW_NGN_MIN_MINOR) {
    return {
      ok: false,
      pendingSettlement: false,
      message:
        "This job is below Flutterwave’s bank-transfer minimum. Use a service charge of at least ₦120 so pro payout can complete, or refund the customer.",
      totalMinor: total,
      proPayoutMinor,
      platformFeeMinor,
    };
  }

  const bank = await loadProBank(input.repairProId || esc.repairProId);
  if (!bank) {
    return {
      ok: false,
      pendingSettlement: false,
      message:
        "Repair Pro bank incomplete (bank code + 10-digit account + name). Funds stay in escrow.",
    };
  }

  const idempotentRef =
    String(meta.idempotentTransferRef || "").trim() ||
    stableProTransferReference(esc.id, esc.requestId);

  // --- Concurrency lock: only one worker may call Flutterwave Transfer ---
  // force NEVER bypasses this (prevents double Transfer API calls).
  const claimId = `claim_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const lockHeldByOther = (() => {
    const existing = String(meta.payoutClaimId || "");
    const at = Date.parse(String(meta.payoutClaimAt || ""));
    if (!existing || !Number.isFinite(at)) return false;
    // Lock expires after 90s so a crashed worker cannot block forever
    if (Date.now() - at > 90_000) return false;
    return existing !== claimId;
  })();
  if (lockHeldByOther) {
    return {
      ok: false,
      pendingSettlement: true,
      message:
        "Payout already in progress (another worker). Auto-retry shortly — no double pay.",
      totalMinor: total,
      proPayoutMinor,
      platformFeeMinor,
      availableNgn: null,
      ledgerNgn: null,
      nextRetryAt: nextPayoutRetryAt(0),
      retryCount: Number(meta.payoutRetryCount) || 0,
    };
  }

  // Persist claim + stable ref BEFORE any FLW call (so concurrent workers see lock).
  // Refuse if operator cancelled mid-flight — do not revive pending_settlement.
  const claimed = await updateEscrowUnlessCancelled(esc.id, esc.requestId, {
    status: "paid",
    escrowStatus:
      esc.escrowStatus === "held" ? "pending_settlement" : esc.escrowStatus,
    platformFeeMinor,
    proPayoutMinor,
    meta: {
      ...meta,
      idempotentTransferRef: idempotentRef,
      payoutClaimId: claimId,
      payoutClaimAt: nowIso(),
      payoutInFlight: true,
      customerSatisfied: true,
    },
  });
  if (!claimed) {
    return {
      ok: false,
      pendingSettlement: false,
      message:
        "Payout processing was cancelled. An admin must release payment manually.",
      totalMinor: total,
      proPayoutMinor,
      platformFeeMinor,
    };
  }

  // Hard ledger claim — UNIQUE(transfer_ref). Second worker cannot claim.
  const {
    claimTransferRef,
    markLedgerSuccess,
    markLedgerFailed,
    reacquireFailedClaim,
  } = await import("@/lib/server/payments/payout-ledger");
  const claim = await claimTransferRef({
    transferRef: idempotentRef,
    paymentId: esc.id,
    requestId: esc.requestId,
    amountMinor: proPayoutMinor,
    currency: String(input.currency || esc.currency || "NGN"),
    accountBank: bank.bankCode,
    accountNumber: bank.accountNumber,
    beneficiaryName: bank.accountName,
  });
  if (!claim.ok && claim.reason === "already_exists") {
    const existing = claim.existing;
    const onFlw = await findExistingFlutterwaveTransfer(idempotentRef);
    // Ledger or FLW already has a live/success transfer → NEVER create another
    if (existing.status === "success" || onFlw.found) {
      if (onFlw.found) await markLedgerSuccess(idempotentRef, onFlw.id);
      await updateEscrow(esc.id, {
        status: "released",
        escrowStatus: "released",
        releasedAt: nowIso(),
        platformFeeMinor,
        proPayoutMinor,
        meta: {
          ...meta,
          payoutStatus: "success",
          pendingSettlement: false,
          proTransferOk: true,
          proTransferRef: idempotentRef,
          idempotentTransferRef: idempotentRef,
          proPayoutMinor,
          platformKeptMinor: platformFeeMinor,
          vatMinor,
          vatHeldOnFlutterwave: true,
          payoutInFlight: false,
          payoutClaimId: null,
          lastReleaseError: null,
          blockedDoublePay: true,
          ledgerStatus: existing.status,
        },
      });
      return {
        ok: true,
        alreadyReleased: true,
        transferRef: idempotentRef,
        totalMinor: total,
        proPayoutMinor,
        platformFeeMinor,
      };
    }
    // Fresh in-flight claim — always wait (force cannot steal this)
    if (existing.status === "initiated") {
      const claimAgeMs =
        Date.now() -
        (Date.parse(existing.updatedAt || existing.createdAt || "") || 0);
      const stale = !Number.isFinite(claimAgeMs) || claimAgeMs > 90_000;
      if (!stale) {
        return {
          ok: false,
          pendingSettlement: true,
          message:
            "Payout claim already held (prevents double pay). Retry in a moment.",
          totalMinor: total,
          proPayoutMinor,
          platformFeeMinor,
          availableNgn: null,
          ledgerNgn: null,
          nextRetryAt: nextPayoutRetryAt(0),
          retryCount: Number(meta.payoutRetryCount) || 0,
        };
      }
      // Stale initiated only: re-check FLW, then free for same-ref retry
      const onFlwStale = await findExistingFlutterwaveTransfer(idempotentRef);
      if (onFlwStale.found) {
        await markLedgerSuccess(idempotentRef, onFlwStale.id);
        await updateEscrow(esc.id, {
          status: "released",
          escrowStatus: "released",
          releasedAt: nowIso(),
          platformFeeMinor,
          proPayoutMinor,
          meta: {
            ...meta,
            payoutStatus: "success",
            proTransferOk: true,
            proTransferRef: idempotentRef,
            blockedDoublePay: true,
            recoveredFromStaleClaim: true,
            payoutInFlight: false,
            payoutClaimId: null,
          },
        });
        return {
          ok: true,
          alreadyReleased: true,
          transferRef: idempotentRef,
          totalMinor: total,
          proPayoutMinor,
          platformFeeMinor,
        };
      }
      await markLedgerFailed(idempotentRef, "stale_initiated_claim_retry");
      const re = await reacquireFailedClaim(idempotentRef);
      if (!re.ok) {
        return {
          ok: false,
          pendingSettlement: true,
          message:
            "Could not re-acquire payout claim safely. Retry shortly — no double pay.",
          totalMinor: total,
          proPayoutMinor,
          platformFeeMinor,
          availableNgn: null,
          ledgerNgn: null,
          nextRetryAt: nextPayoutRetryAt(0),
          retryCount: Number(meta.payoutRetryCount) || 0,
        };
      }
    } else if (existing.status === "failed") {
      // Same ref, previous attempt failed before bank credit — re-open safely
      const re = await reacquireFailedClaim(idempotentRef);
      if (!re.ok) {
        // Another worker may have taken it, or already success
        const again = await findExistingFlutterwaveTransfer(idempotentRef);
        if (again.found) {
          await markLedgerSuccess(idempotentRef, again.id);
          return {
            ok: true,
            alreadyReleased: true,
            transferRef: idempotentRef,
            totalMinor: total,
            proPayoutMinor,
            platformFeeMinor,
          };
        }
        return {
          ok: false,
          pendingSettlement: true,
          message:
            "Payout claim busy (prevents double pay). Retry in a moment.",
          totalMinor: total,
          proPayoutMinor,
          platformFeeMinor,
          availableNgn: null,
          ledgerNgn: null,
          nextRetryAt: nextPayoutRetryAt(0),
          retryCount: Number(meta.payoutRetryCount) || 0,
        };
      }
    }
  }
  if (!claim.ok && claim.reason === "error") {
    // Fail closed when ledger is broken — do not risk a second untracked transfer
    console.error("[attemptProPayout] ledger claim error", claim.message);
    return {
      ok: false,
      pendingSettlement: false,
      message:
        "Payout ledger unavailable — refusing transfer to prevent double pay. Retry later.",
      totalMinor: total,
      proPayoutMinor,
      platformFeeMinor,
    };
  }
  if (!claim.ok && claim.reason === "db_unavailable") {
    return {
      ok: false,
      pendingSettlement: false,
      message:
        "Database unavailable — refusing transfer to prevent double pay. Retry later.",
      totalMinor: total,
      proPayoutMinor,
      platformFeeMinor,
    };
  }

  // Final FLW check immediately before create — same reference only
  const alreadyOnFlw = await findExistingFlutterwaveTransfer(idempotentRef);
  if (alreadyOnFlw.found) {
    await markLedgerSuccess(idempotentRef, alreadyOnFlw.id).catch(() => undefined);
    await updateEscrow(esc.id, {
      status: "released",
      escrowStatus: "released",
      releasedAt: nowIso(),
      platformFeeMinor,
      proPayoutMinor,
      meta: {
        ...meta,
        payoutStatus: "success",
        pendingSettlement: false,
        proTransferOk: true,
        proTransferRef: alreadyOnFlw.reference,
        idempotentTransferRef: idempotentRef,
        proPayoutMinor,
        platformKeptMinor: platformFeeMinor,
        payoutInFlight: false,
        payoutClaimId: null,
        lastReleaseError: null,
        recoveredFromExistingTransfer: true,
        blockedDoublePay: true,
      },
    });
    return {
      ok: true,
      alreadyReleased: true,
      transferRef: alreadyOnFlw.reference,
      totalMinor: total,
      proPayoutMinor,
      platformFeeMinor,
    };
  }

  // Re-read escrow once more — another worker may have released while we prepared
  const escFresh = await getEscrowByRequest(input.jobId);
  if (
    escFresh?.escrowStatus === "released" ||
    escFresh?.meta?.proTransferOk === true ||
    escFresh?.meta?.payoutStatus === "success"
  ) {
    return {
      ok: true,
      alreadyReleased: true,
      transferRef: String(
        escFresh.meta?.proTransferRef ||
          escFresh.meta?.idempotentTransferRef ||
          idempotentRef
      ),
      totalMinor: total,
      proPayoutMinor,
      platformFeeMinor,
    };
  }

  const balances = await getFlutterwaveNgnBalances();
  const amountMajor = proPayoutMinor / 100;

  // Settlement gate: Available must cover pro net (87.5%) before Transfer API
  if (
    balances &&
    balances.available + 1e-9 < amountMajor &&
    resolveProvider() === "flutterwave"
  ) {
    const metaStarted = ensureRetryStartedAt(meta);
    const retryCount = (Number(metaStarted.payoutRetryCount) || 0) + 1;
    const errMsg = `PENDING_SETTLEMENT: Available ₦${balances.available.toFixed(2)} < payout ₦${amountMajor.toFixed(2)} (Ledger ₦${balances.ledger.toFixed(2)})`;
    // CRITICAL: free ledger claim so a later retry can re-attempt transfer.
    await markLedgerFailed(
      idempotentRef,
      `insufficient_available avail=${balances.available} need=${amountMajor}`
    ).catch(() => undefined);

    const wouldExhaust = isPayoutAutoRetryExhausted({
      ...metaStarted,
      payoutRetryCount: retryCount,
    });
    if (wouldExhaust && !input.force) {
      await updateEscrowUnlessCancelled(esc.id, esc.requestId, {
        status: "paid",
        escrowStatus: "held",
        platformFeeMinor,
        proPayoutMinor,
        meta: {
          ...metaStarted,
          payoutStatus: "suspended_admin",
          payoutSuspended: true,
          needsAdmin: true,
          pendingSettlement: false,
          idempotentTransferRef: idempotentRef,
          proPayoutMinor,
          platformKeptMinor: platformFeeMinor,
          vatMinor,
          lastReleaseError: errMsg,
          lastReleaseAt: nowIso(),
          lastAvailableNgn: balances.available,
          lastLedgerNgn: balances.ledger,
          payoutRetryCount: retryCount,
          nextRetryAt: null,
          proPayoutPending: false,
          customerSatisfied: true,
          payoutInFlight: false,
          payoutClaimId: null,
          payoutSuspendedAt: nowIso(),
        },
      });
      return {
        ok: false,
        pendingSettlement: false,
        message:
          "Payout suspended after 24 hours of auto-retries. An admin must release payment manually.",
        totalMinor: total,
        proPayoutMinor,
        platformFeeMinor,
      };
    }

    const nextRetryAt = nextPayoutRetryAt(retryCount - 1);
    await updateEscrowUnlessCancelled(esc.id, esc.requestId, {
      status: "paid",
      escrowStatus: "pending_settlement",
      platformFeeMinor,
      proPayoutMinor,
      meta: {
        ...metaStarted,
        payoutStatus: "pending_settlement",
        pendingSettlement: true,
        idempotentTransferRef: idempotentRef,
        proPayoutMinor,
        platformKeptMinor: platformFeeMinor,
        vatMinor,
        lastReleaseError: errMsg,
        lastReleaseAt: nowIso(),
        lastAvailableNgn: balances.available,
        lastLedgerNgn: balances.ledger,
        payoutRetryCount: retryCount,
        nextRetryAt,
        proPayoutPending: true,
        customerSatisfied: true,
        payoutInFlight: false,
        payoutClaimId: null,
      },
    });
    return {
      ok: false,
      pendingSettlement: true,
      message:
        "Payout processing — auto-retry every 10 minutes for up to 24 hours. You’ll be notified when released.",
      totalMinor: total,
      proPayoutMinor,
      platformFeeMinor,
      availableNgn: balances.available,
      ledgerNgn: balances.ledger,
      nextRetryAt,
      retryCount,
    };
  }

  const currency = (input.currency || esc.currency || "NGN") as AppCurrency;
  const transfer = await releaseToPro({
    amountMinor: proPayoutMinor,
    currency,
    reference: idempotentRef,
    /** Pass stable ref so Flutterwave dedupes */
    transferReference: idempotentRef,
    reason: `Ona pro payout · ${input.repairProName || "Repair Pro"} · ${input.jobId.slice(0, 8)}`,
    bankCode: bank.bankCode,
    accountNumber: bank.accountNumber,
    accountName: bank.accountName,
  });

  if (transfer.ok) {
    await markLedgerSuccess(
      idempotentRef,
      transfer.transferRef || null
    ).catch(() => undefined);
    await updateEscrow(esc.id, {
      status: "released",
      escrowStatus: "released",
      releasedAt: nowIso(),
      motoristCompletedAt: nowIso(),
      proCompletedAt: nowIso(),
      platformFeeMinor,
      proPayoutMinor,
      meta: {
        ...meta,
        payoutStatus: "success",
        pendingSettlement: false,
        proTransferOk: true,
        proTransferRef: transfer.transferRef || idempotentRef,
        idempotentTransferRef: idempotentRef,
        proPayoutMinor,
        platformKeptMinor: platformFeeMinor,
        vatMinor,
        vatHeldOnFlutterwave: true,
        flwMinTopUpMinor: flwMinTopUpMinor || undefined,
        payoutInFlight: false,
        payoutClaimId: null,
        platformFeePercent: PLATFORM_COMMISSION_PERCENT,
        proPayoutPercent: PRO_NET_PAYOUT_PERCENT,
        vatPercent: VAT_PERCENT_NG,
        lastReleaseError: null,
        lastReleaseAt: nowIso(),
        proPayoutPending: false,
        nextRetryAt: null,
        customerSatisfied: true,
      },
    });
    return {
      ok: true,
      transferRef: transfer.transferRef || idempotentRef,
      totalMinor: total,
      proPayoutMinor,
      platformFeeMinor,
    };
  }

  await markLedgerFailed(
    idempotentRef,
    transfer.message || "transfer_failed"
  ).catch(() => undefined);

  // Insufficient / settlement-related FLW errors → pending settlement, not hard fail
  if (isSettlementInsufficientError(transfer.message) || transfer.code === "pending_settlement") {
    const retryCount = (Number(meta.payoutRetryCount) || 0) + 1;
    const nextRetryAt = nextPayoutRetryAt(retryCount - 1);
    const bal = balances || (await getFlutterwaveNgnBalances());
    await updateEscrow(esc.id, {
      status: "paid",
      escrowStatus: "pending_settlement",
      platformFeeMinor,
      proPayoutMinor,
      meta: {
        ...meta,
        payoutStatus: "pending_settlement",
        pendingSettlement: true,
        idempotentTransferRef: idempotentRef,
        proPayoutMinor,
        platformKeptMinor: platformFeeMinor,
        lastReleaseError: transfer.message || "pending_settlement",
        lastReleaseAt: nowIso(),
        lastAvailableNgn: bal?.available ?? null,
        lastLedgerNgn: bal?.ledger ?? null,
        payoutRetryCount: retryCount,
        nextRetryAt,
        proPayoutPending: true,
        customerSatisfied: true,
        payoutInFlight: false,
        payoutClaimId: null,
      },
    });
    return {
      ok: false,
      pendingSettlement: true,
      message:
        "Payout processing — waiting for Flutterwave settlement. You will be notified when payment is released. No action needed.",
      totalMinor: total,
      proPayoutMinor,
      platformFeeMinor,
      availableNgn: bal?.available ?? null,
      ledgerNgn: bal?.ledger ?? null,
      nextRetryAt,
      retryCount,
    };
  }

  // Hard failure (bank invalid) or soft retry — never double-pay
  const metaStarted = ensureRetryStartedAt(meta);
  const retryCount = (Number(metaStarted.payoutRetryCount) || 0) + 1;
  const hard = isHardPayoutFailure(transfer.message);
  const softExhausted =
    !hard &&
    isPayoutAutoRetryExhausted({
      ...metaStarted,
      payoutRetryCount: retryCount,
    });

  if (hard || softExhausted) {
    await updateEscrowUnlessCancelled(esc.id, esc.requestId, {
      status: "paid",
      escrowStatus: "held",
      platformFeeMinor,
      proPayoutMinor,
      meta: {
        ...metaStarted,
        payoutStatus: hard ? "failed" : "suspended_admin",
        payoutSuspended: !hard,
        pendingSettlement: false,
        idempotentTransferRef: idempotentRef,
        lastReleaseError: transfer.message || "transfer_failed",
        lastReleaseAt: nowIso(),
        payoutRetryCount: retryCount,
        nextRetryAt: null,
        proPayoutPending: false,
        customerSatisfied: true,
        payoutFailedAt: hard ? nowIso() : null,
        payoutSuspendedAt: softExhausted ? nowIso() : null,
        needsAdmin: true,
        payoutInFlight: false,
        payoutClaimId: null,
      },
    });
    return {
      ok: false,
      pendingSettlement: false,
      message: hard
        ? transfer.message ||
          "Could not transfer pro share. Funds remain in escrow. Admin must review."
        : "Payout suspended after 24 hours of auto-retries. An admin must release payment manually.",
      totalMinor: total,
      proPayoutMinor,
      platformFeeMinor,
    };
  }

  await updateEscrowUnlessCancelled(esc.id, esc.requestId, {
    status: "paid",
    escrowStatus: "pending_settlement",
    platformFeeMinor,
    proPayoutMinor,
    meta: {
      ...metaStarted,
      payoutStatus: "pending_settlement",
      pendingSettlement: true,
      idempotentTransferRef: idempotentRef,
      lastReleaseError: transfer.message || "transfer_failed",
      lastReleaseAt: nowIso(),
      payoutRetryCount: retryCount,
      nextRetryAt: nextPayoutRetryAt(retryCount - 1),
      proPayoutPending: true,
      customerSatisfied: true,
      payoutInFlight: false,
      payoutClaimId: null,
    },
  });

  return {
    ok: false,
    pendingSettlement: true,
    message:
      transfer.message ||
      "Payout processing. Auto-retry every 10 minutes for up to 24 hours. Funds remain in escrow.",
    totalMinor: total,
    proPayoutMinor,
    platformFeeMinor,
    availableNgn: null,
    ledgerNgn: null,
    nextRetryAt: nextPayoutRetryAt(retryCount - 1),
    retryCount,
  };
}

/** Process all due pending_settlement payouts (cron). */
export async function processDuePayoutRetries(limit = 25): Promise<{
  checked: number;
  succeeded: number;
  stillPending: number;
  failed: number;
  ids: string[];
}> {
  const due = await listPendingSettlementDue(limit);
  let succeeded = 0;
  let stillPending = 0;
  let failed = 0;
  const ids: string[] = [];

  for (const esc of due) {
    ids.push(esc.requestId);
    // force: false — enforce full 10‑min spacing; admin uses force_release separately
    const result = await attemptProPayout({
      jobId: esc.requestId,
      repairProId: esc.repairProId,
      amountMinor: esc.amountMinor,
      currency: esc.currency,
      paymentReference: esc.providerRef,
      force: false,
    });
    if (result.ok) {
      succeeded++;
      // Only notify on the first successful release — never on re-runs
      if (!result.alreadyReleased) {
        await finalizeJobReleasedAfterPayout(esc.requestId, result);
      }
    } else if ("pendingSettlement" in result && result.pendingSettlement) {
      stillPending++;
    } else {
      failed++;
    }
  }

  return {
    checked: due.length,
    succeeded,
    stillPending,
    failed,
    ids,
  };
}

async function listPendingSettlementDue(limit: number): Promise<EscrowPayment[]> {
  const rows = await listEscrowsByStatuses(
    ["pending_settlement", "release_pending"],
    100
  );
  const now = nowMs();
  // Only jobs whose 10‑min nextRetryAt is due (or never set).
  return rows
    .filter((e) => {
      const meta = e.meta || {};
      if (meta.proTransferOk === true || e.escrowStatus === "released") return false;
      if (meta.payoutStatus === "success") return false;
      if (
        meta.payoutStatus === "suspended_admin" ||
        meta.payoutStatus === "cancelled_processing" ||
        meta.payoutSuspended === true ||
        meta.autoRetryCancelled === true
      ) {
        return false;
      }
      if (isPayoutAutoRetryExhausted(meta)) return false;
      const next = String(meta.nextRetryAt || "");
      if (!next) return true;
      const t = Date.parse(next);
      return !Number.isFinite(t) || t <= now;
    })
    .slice(0, limit);
}

/** Mark job released + notify both parties after successful payout (once). */
export async function finalizeJobReleasedAfterPayout(
  jobId: string,
  payout: {
    transferRef: string;
    totalMinor: number;
    proPayoutMinor: number;
    platformFeeMinor: number;
  }
): Promise<void> {
  if (!isSupabaseAdminConfigured()) return;
  const ts = nowIso();
  try {
    const sb = createServiceSupabase();
    const { data: job } = await sb
      .from("service_requests")
      .select(
        "id, motorist_id, repair_pro_id, status, status_history, flow_status, released_at, escrow_status"
      )
      .eq("id", jobId)
      .maybeSingle();
    if (!job) return;

    const alreadyReleased =
      String(job.status) === "released" ||
      String(job.escrow_status || "") === "released" ||
      Boolean(job.released_at);

    const history = Array.isArray(job.status_history)
      ? [...(job.status_history as object[])]
      : [];
    if (!alreadyReleased) {
      history.push({ status: "released", at: ts, by: "system" });
    }

    await sb
      .from("service_requests")
      .update({
        status: "released",
        flow_status: "released",
        escrow_status: "released",
        released_at: job.released_at || ts,
        satisfied_at: (job as { satisfied_at?: string }).satisfied_at || ts,
        pro_payout_minor: payout.proPayoutMinor,
        platform_fee_minor: payout.platformFeeMinor,
        amount_minor: payout.totalMinor,
        status_history: history,
        updated_at: ts,
      })
      .eq("id", jobId);

    // Notifications are deduped by group_key in insertNotification
    const { insertNotification } = await import("@/lib/server/notifications");
    const motoristId = String(job.motorist_id || "");
    const proId = String(job.repair_pro_id || "");
    if (motoristId) {
      await insertNotification({
        userId: motoristId,
        category: "payments",
        priority: "critical",
        title: "Payment released",
        body: "Your payment has been released to your Repair Pro.",
        href: `/jobs/${jobId}`,
        actionType: "view_payment",
        actionPayload: { jobId },
        jobId,
        jobStatus: "released",
        groupKey: `payout-released-${jobId}`,
      });
    }
    if (proId) {
      await insertNotification({
        userId: proId,
        category: "payments",
        priority: "critical",
        title: "Payout released",
        body: "Payment released — your labour payout is on its way to your bank account.",
        href: `/jobs/${jobId}`,
        actionType: "view_payment",
        actionPayload: { jobId },
        jobId,
        jobStatus: "released",
        groupKey: `payout-released-pro-${jobId}`,
      });
    }
  } catch (e) {
    console.error("finalizeJobReleasedAfterPayout", jobId, e);
  }
}

export async function getPaymentOpsSnapshot(): Promise<{
  flw: { available: number | null; ledger: number | null; refreshedAt: string };
  ona: {
    escrowHeldMinor: number;
    pendingSettlementMinor: number;
    pendingSettlementCount: number;
    releasedCount: number;
    failedCount: number;
    disputedCount: number;
    refundedCount: number;
    totalCommissionEarnedMinor: number;
    commissionEarnedCount: number;
    exhaustedCount: number;
    suspendedCount: number;
  };
  queues: {
    pending: EscrowPayment[];
    failed: EscrowPayment[];
    recentReleased: EscrowPayment[];
  };
}> {
  const bal = await getFlutterwaveNgnBalances();
  const held = await listEscrowsByStatuses(["held", "pending_payment"], 200);
  const pending = await listEscrowsByStatuses(
    ["pending_settlement", "release_pending"],
    200
  );
  // Pull enough released/refunded for accurate board counts (not just last 50)
  const released = await listEscrowsByStatuses(["released"], 200);
  const refunded = await listEscrowsByStatuses(["refunded"], 200);
  const failedRows = await listEscrowsByStatuses(["failed"], 100);
  const allOpen = [...held, ...pending, ...failedRows];

  const failed = [
    ...failedRows,
    ...allOpen.filter(
      (e) =>
        e.meta?.payoutStatus === "failed" ||
        (e.escrowStatus === "held" && e.meta?.payoutFailedAt)
    ),
  ].filter(
    (e, i, arr) => arr.findIndex((x) => x.id === e.id) === i
  );

  const sum = (rows: EscrowPayment[]) =>
    rows.reduce((a, r) => a + (Number(r.amountMinor) || 0), 0);
  const sumFee = (rows: EscrowPayment[]) =>
    rows.reduce((a, r) => a + (Number(r.platformFeeMinor) || 0), 0);
  const exhausted = failed.filter(
    (e) => e.meta?.payoutStatus === "suspended_admin" || (e.meta?.autoRetryCancelled && (Number(e.meta?.payoutRetryCount) || 0) >= 144)
  );
  const suspended = failed.filter(
    (e) => e.meta?.payoutStatus === "cancelled_processing" || e.meta?.payoutSuspended === true
  );

  return {
    flw: {
      available: bal?.available ?? null,
      ledger: bal?.ledger ?? null,
      refreshedAt: nowIso(),
    },
    ona: {
      escrowHeldMinor: sum(held),
      pendingSettlementMinor: sum(pending),
      pendingSettlementCount: pending.length,
      releasedCount: released.length,
      failedCount: failed.length,
      disputedCount: (await listDisputedJobs()).length,
      refundedCount: refunded.length,
      totalCommissionEarnedMinor: sumFee(released),
      commissionEarnedCount: released.filter((e) => Number(e.platformFeeMinor) > 0).length,
      exhaustedCount: exhausted.length,
      suspendedCount: suspended.length,
    },
    queues: {
      pending,
      failed,
      recentReleased: released.slice(0, 30),
    },
  };
}
