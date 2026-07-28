import { z } from "zod";
import {
  AdminAuthError,
  logAdminAction,
  requirePermission,
  requireSensitiveAction,
} from "@/lib/server/admin-auth";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { createServiceSupabase } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import {
  roleHasPermission,
  type AdminRole,
} from "@/lib/server/modules/admin-roles";
import {
  getEscrowByRequest,
  updateEscrow,
} from "@/lib/server/payments/escrow-store";
import { getJob, listDisputedJobs, transitionJob } from "@/lib/server/jobs/job-store";
import {
  attemptProPayout,
  finalizeJobReleasedAfterPayout,
  getPaymentOpsSnapshot,
  processDuePayoutRetries,
} from "@/lib/server/payments/payout-settlement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Canonical lifecycle for admin list/filters.
 * Customer collection → held → (paid / pending_settlement) → released (pro paid)
 * or refunded / failed.
 */
function effectiveEscrowStatus(row: Record<string, unknown>): string {
  const esc = String(row.escrow_status || "").toLowerCase().trim();
  const st = String(row.status || "").toLowerCase().trim();
  const meta = (row.meta as Record<string, unknown>) || {};
  const payout = String(meta.payoutStatus || "").toLowerCase();

  if (esc === "released" || st === "released" || row.released_at) {
    return "released";
  }
  if (esc === "refunded" || st === "refunded") return "refunded";
  if (
    payout === "suspended_admin" ||
    meta.payoutSuspended === true
  ) {
    return "suspended";
  }
  if (
    esc === "failed" ||
    st === "failed" ||
    payout === "failed" ||
    Boolean(meta.payoutFailedAt)
  ) {
    return "failed";
  }
  if (
    esc === "pending_settlement" ||
    esc === "release_pending" ||
    payout === "pending_settlement"
  ) {
    return "pending_settlement";
  }
  if (esc === "held" || esc === "pending_payment") return esc || "held";
  // status "paid" means customer paid (in escrow / mid payout), not "pro paid"
  if (st === "paid" && (esc === "held" || !esc)) return "held";
  if (st === "paid") return esc || "held";
  return esc || st || "unknown";
}

function displayEscrowLabel(effective: string): string {
  switch (effective) {
    case "released":
      return "Released (Paid)";
    case "pending_settlement":
      return "Pending settlement";
    case "suspended":
      return "Suspended (admin pay)";
    case "release_pending":
      return "Release pending";
    case "held":
      return "Escrow held";
    case "refunded":
      return "Refunded";
    case "failed":
      return "Failed";
    case "pending_payment":
      return "Awaiting payment";
    default:
      return effective || "—";
  }
}

function shapePayment(
  row: Record<string, unknown>,
  role: AdminRole
): Record<string, unknown> | null {
  const canFull = roleHasPermission(role, "view_payment_full");
  const canStatus = roleHasPermission(role, "view_payment_status");
  if (!canStatus && !canFull) return null;

  const amount =
    Number(row.amount_kobo ?? row.amount_minor ?? row.amount ?? 0) || 0;
  const meta = (row.meta as Record<string, unknown>) || {};
  const effective = effectiveEscrowStatus(row);
  const base: Record<string, unknown> = {
    id: row.id,
    request_id: row.request_id ?? row.job_id ?? null,
    amount_kobo: amount,
    currency: row.currency || "NGN",
    status: row.status || row.escrow_status || "unknown",
    escrow_status: row.escrow_status ?? row.status ?? null,
    /** Canonical filter/display status (released = pro paid) */
    effective_status: effective,
    display_status: displayEscrowLabel(effective),
    provider: canFull ? row.provider ?? null : undefined,
    created_at: row.created_at,
    paid_at: row.paid_at ?? null,
    released_at: row.released_at ?? null,
    refunded_at: row.refunded_at ?? null,
    payout_status: meta.payoutStatus ?? null,
    payout_suspended: meta.payoutSuspended === true,
    next_retry_at: meta.nextRetryAt ?? null,
    retry_count: meta.payoutRetryCount ?? null,
  };

  if (canFull) {
    base.provider_ref = row.provider_ref ?? row.flw_ref ?? null;
    base.meta = row.meta ?? null;
    base.platform_fee_kobo = row.platform_fee_kobo ?? null;
    base.pro_payout_kobo = row.pro_payout_kobo ?? null;
    base.last_release_error = meta.lastReleaseError ?? null;
    base.last_available_ngn = meta.lastAvailableNgn ?? null;
    base.last_ledger_ngn = meta.lastLedgerNgn ?? null;
  }

  return base;
}

function buildFilterCounts(
  rows: Record<string, unknown>[]
): Record<string, number> {
  const counts: Record<string, number> = {
    all: rows.length,
    held: 0,
    pending_settlement: 0,
    released: 0,
    failed: 0,
    refunded: 0,
    disputed: 0,
  };
  for (const row of rows) {
    const e = effectiveEscrowStatus(row);
    if (e === "held" || e === "pending_payment") counts.held += 1;
    else if (e === "pending_settlement" || e === "release_pending")
      counts.pending_settlement += 1;
    else if (e === "released") counts.released += 1;
    else if (e === "failed") counts.failed += 1;
    else if (e === "refunded") counts.refunded += 1;
    else if (row._disputed) counts.disputed += 1;
  }
  return counts;
}

export async function GET() {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Supabase is not configured", 503, "supabase_not_configured");
  }
  try {
    const { adminRole } = await requirePermission("view_payment_status");
    const canFull = roleHasPermission(adminRole, "view_payment_full");
    const canRetry = roleHasPermission(adminRole, "escrow_release");
    const canCancel = roleHasPermission(adminRole, "escrow_refund");
    const supabase = createServiceSupabase();

    // Prefer active money first, then recency — so Released / Held are not buried
    // under a wall of cancelled drafts when ops review the board.
    const { data, error } = await supabase
      .from("payments")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(300);
    if (error) return apiFail(error.message, 500);

    const raw = (data ?? []) as Record<string, unknown>[];
    const priority = (row: Record<string, unknown>) => {
      const e = effectiveEscrowStatus(row);
      if (e === "pending_settlement" || e === "release_pending") return 0;
      if (e === "held" || e === "pending_payment") return 1;
      if (e === "failed") return 2;
      if (e === "released") return 3;
      if (e === "refunded") return 4;
      return 5;
    };
    raw.sort((a, b) => {
      const d = priority(a) - priority(b);
      if (d !== 0) return d;
      const ta = Date.parse(String(a.updated_at || a.created_at || 0)) || 0;
      const tb = Date.parse(String(b.updated_at || b.created_at || 0)) || 0;
      return tb - ta;
    });

    const payments = raw
      .map((p) => shapePayment(p, adminRole))
      .filter((p): p is Record<string, unknown> => p != null && Boolean(p.id));

    const disputedJobs = await listDisputedJobs();
    const disputedRequestIds = new Set(disputedJobs.map((j) => j.id));
    for (const p of payments) {
      const rid = String(p.request_id || "");
      if (rid && disputedRequestIds.has(rid)) {
        p._disputed = true;
      }
    }
    for (const r of raw) {
      const rid = String(r.request_id || r.job_id || "");
      if (rid && disputedRequestIds.has(rid)) {
        r._disputed = true;
      }
    }

    const filterCounts = buildFilterCounts(raw);

    // Always load FLW + Ona ops for payment viewers (L2+). Control actions
    // (retry/cancel) stay permission-gated; balances are read-only ops data.
    let ops: Awaited<ReturnType<typeof getPaymentOpsSnapshot>> | null = null;
    let opsError: string | null = null;
    try {
      ops = await getPaymentOpsSnapshot();
    } catch (e) {
      console.error("payment ops snapshot", e);
      opsError = e instanceof Error ? e.message : "ops_snapshot_failed";
    }

    return apiOk({
      payments,
      filterCounts,
      ops: ops
        ? {
            flw: ops.flw,
            ona: ops.ona,
          }
        : null,
      opsError,
      access: {
        canCancelEscrow: canCancel,
        canRetryPayout: canRetry,
        canViewFull: canFull,
        canControl: canRetry || canCancel,
        levelNote: canFull
          ? "Full payment + FLW balances + transfer refs (L3+). Retry/cancel when permitted."
          : canRetry || canCancel
            ? "Balances + list visible. Control actions available for your role."
            : "Read-only: status, amounts, and balances. L3+ for retry/cancel.",
      },
    });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return apiFail(e.message, e.status, e.code || "auth");
    }
    return apiFail("Failed to list payments", 500);
  }
}

const patchSchema = z.object({
  id: z.string().min(1).optional(),
  status: z.enum(["pending", "paid", "failed", "refunded"]).optional(),
  provider_ref: z.string().optional(),
  action: z
    .enum([
      "cancel_escrow",
      "cancel_processing",
      "set_status",
      "retry_payout",
      "retry_all_due",
      "force_release",
      "manual_standalone",
    ])
    .optional(),
  reason: z.string().min(8).max(500).optional(),
  jobId: z.string().optional(),
  /** Standalone manual payout (L4+) — not job-tied */
  amountMajor: z.number().positive().optional(),
  bankCode: z.string().optional(),
  accountNumber: z.string().optional(),
  accountName: z.string().optional(),
  narration: z.string().max(100).optional(),
});

export async function PATCH(req: Request) {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Supabase is not configured", 503, "supabase_not_configured");
  }
  try {
    const parsed = patchSchema.safeParse(await req.json());
    if (!parsed.success) return apiFail("Invalid body", 400);

    const action = parsed.data.action || "set_status";

    // Process full retry queue
    if (action === "retry_all_due") {
      await requirePermission("escrow_release");
      const result = await processDuePayoutRetries(40);
      return apiOk({ message: "Retry queue processed", ...result });
    }

    // Stop auto-retry only (funds stay held — not a refund). L3+ escrow_release.
    if (action === "cancel_processing") {
      const { session } = await requireSensitiveAction("escrow_release", req);
      const reason = (parsed.data.reason || "").trim();
      if (reason.length < 8) {
        return apiFail(
          "Reason required (min 8 characters) to stop processing.",
          400,
          "reason_required"
        );
      }
      const paymentId = parsed.data.id;
      if (!paymentId) return apiFail("id required", 400);
      const supabase = createServiceSupabase();
      const { data: payment, error: pErr } = await supabase
        .from("payments")
        .select("*")
        .eq("id", paymentId)
        .maybeSingle();
      if (pErr || !payment) return apiFail("Payment not found", 404);
      const escStatus = String(
        (payment as { escrow_status?: string }).escrow_status || ""
      );
      if (escStatus === "released" || escStatus === "refunded") {
        return apiFail(
          `Cannot stop processing — already ${escStatus}.`,
          400
        );
      }
      const meta = {
        ...(((payment as { meta?: Record<string, unknown> }).meta ||
          {}) as Record<string, unknown>),
        payoutStatus: "cancelled_processing",
        payoutSuspended: true,
        autoRetryCancelled: true,
        needsAdmin: true,
        pendingSettlement: false,
        proPayoutPending: false,
        payoutInFlight: false,
        payoutClaimId: null,
        nextRetryAt: null,
        cancelProcessingReason: reason,
        cancelledProcessingAt: new Date().toISOString(),
        autoRetryCancelledAt: new Date().toISOString(),
        cancelledByAdmin: session.userId,
        lastReleaseError: `Processing stopped by admin: ${reason}`,
      };
      const now = new Date().toISOString();
      const { data: updated, error } = await supabase
        .from("payments")
        .update({
          escrow_status: "held",
          status: "paid",
          meta,
          updated_at: now,
        })
        .eq("id", paymentId)
        .select("*")
        .maybeSingle();
      if (error) return apiFail(error.message, 500);
      const jobId = String(
        (payment as { request_id?: string }).request_id || ""
      );
      if (jobId) {
        await supabase
          .from("service_requests")
          .update({ escrow_status: "held", updated_at: now })
          .eq("id", jobId);
      }
      await logAdminAction(
        session.userId,
        "payments.cancel_processing",
        paymentId,
        { reason, jobId }
      );
      return apiOk({
        payment: updated,
        message:
          "Auto-processing stopped. Funds remain in escrow. Use Force payout or Refund when ready.",
      });
    }

    // Single job force/retry payout (idempotent — same ona_rel_ ref, never double pay)
    if (action === "retry_payout" || action === "force_release") {
      const { session } = await requireSensitiveAction("escrow_release", req);
      // Force release: L4+ only
      if (action === "force_release") {
        const { roleAtLeast, normalizeAdminRole } = await import(
          "@/lib/server/modules/admin-roles"
        );
        const role = normalizeAdminRole(session.adminRole);
        if (!roleAtLeast(role, 4)) {
          return apiFail(
            "Force payout requires Manager (L4) or Super Admin (L5).",
            403,
            "level"
          );
        }
      }
      const jobId = parsed.data.jobId || parsed.data.id;
      if (!jobId) return apiFail("jobId required", 400);

      const job = await getJob(jobId);
      if (!job) {
        const esc = await getEscrowByRequest(jobId);
        const rid = esc?.requestId;
        if (!rid) {
          // payment uuid
          const sb = createServiceSupabase();
          const { data: pay } = await sb
            .from("payments")
            .select("request_id")
            .eq("id", jobId)
            .maybeSingle();
          const rid2 = pay?.request_id ? String(pay.request_id) : "";
          if (!rid2) return apiFail("Job not found", 404);
          const esc2 = await getEscrowByRequest(rid2);
          const result = await attemptProPayout({
            jobId: rid2,
            repairProId: esc2?.repairProId || null,
            amountMinor: esc2?.amountMinor,
            currency: esc2?.currency,
            force: action === "force_release",
          });
          if (result.ok) {
            await finalizeJobReleasedAfterPayout(rid2, result);
          }
          await logAdminAction(session.userId, "payments.retry_payout", rid2, {
            result,
            force: action === "force_release",
          });
          return apiOk({ result, jobId: rid2 });
        }
        const result = await attemptProPayout({
          jobId: rid,
          repairProId: esc.repairProId,
          amountMinor: esc.amountMinor,
          currency: esc.currency,
          force: action === "force_release",
        });
        if (result.ok) {
          await finalizeJobReleasedAfterPayout(rid, result);
        }
        await logAdminAction(session.userId, "payments.retry_payout", rid, {
          result,
          force: action === "force_release",
        });
        return apiOk({ result, jobId: rid });
      }

      const result = await attemptProPayout({
        jobId: job.id,
        repairProId: job.repairProId,
        repairProName: job.repairProName,
        amountMinor: job.amountMinor,
        agreedMajor: job.agreedMajor,
        currency: job.currency,
        force: action === "force_release",
      });
      if (result.ok) {
        await finalizeJobReleasedAfterPayout(job.id, result);
      }
      await logAdminAction(session.userId, "payments.retry_payout", job.id, {
        result,
        force: action === "force_release",
      });
      return apiOk({ result, jobId: job.id });
    }

    // Standalone manual bank payout (not job-tied) — L4+ only, unique ref, ledgered
    if (action === "manual_standalone") {
      const { session } = await requireSensitiveAction("escrow_release", req);
      const { roleAtLeast, normalizeAdminRole } = await import(
        "@/lib/server/modules/admin-roles"
      );
      const role = normalizeAdminRole(session.adminRole);
      if (!roleAtLeast(role, 4)) {
        return apiFail(
          "Standalone manual payout requires Manager (L4) or Super Admin (L5).",
          403,
          "level"
        );
      }
      const reason = (parsed.data.reason || "").trim();
      if (reason.length < 8) {
        return apiFail("Reason required (min 8 characters).", 400);
      }
      const amountMajor = Number(parsed.data.amountMajor);
      const bankCode = String(parsed.data.bankCode || "").trim();
      const accountNumber = String(parsed.data.accountNumber || "")
        .replace(/\D/g, "")
        .trim();
      const accountName = String(parsed.data.accountName || "").trim();
      if (!Number.isFinite(amountMajor) || amountMajor < 100) {
        return apiFail("Amount must be at least ₦100 (FLW bank minimum).", 400);
      }
      if (!bankCode || accountNumber.length < 10 || !accountName) {
        return apiFail(
          "bankCode, 10-digit accountNumber, and accountName are required.",
          400
        );
      }
      const amountMinor = Math.round(amountMajor * 100);
      const ref = `ona_manual_${session.userId.replace(/-/g, "").slice(0, 8)}_${Date.now().toString(36)}`.slice(
        0,
        50
      );
      const { claimTransferRef, markLedgerSuccess, markLedgerFailed } =
        await import("@/lib/server/payments/payout-ledger");
      const claim = await claimTransferRef({
        transferRef: ref,
        paymentId: `manual_${ref}`,
        requestId: `manual_${ref}`,
        amountMinor,
        currency: "NGN",
        accountBank: bankCode,
        accountNumber,
        beneficiaryName: accountName,
      });
      if (!claim.ok && claim.reason === "already_exists") {
        return apiFail(
          "Transfer reference already used — refusing double pay.",
          409
        );
      }
      const { releaseToPro } = await import(
        "@/lib/server/payments/providers"
      );
      const xfer = await releaseToPro({
        amountMinor,
        currency: "NGN",
        reference: ref,
        transferReference: ref,
        reason: (
          parsed.data.narration || `Ona manual admin payout · ${reason}`
        ).slice(0, 100),
        bankCode,
        accountNumber,
        accountName,
      });
      if (!xfer.ok) {
        await markLedgerFailed(ref, xfer.message || "manual_failed").catch(
          () => undefined
        );
        return apiFail(xfer.message || "Manual transfer failed", 400);
      }
      await markLedgerSuccess(ref, xfer.transferRef || null).catch(
        () => undefined
      );
      await logAdminAction(session.userId, "payments.manual_standalone", ref, {
        amountMajor,
        bankCode,
        accountNumberLast4: accountNumber.slice(-4),
        accountName,
        reason,
        transferRef: xfer.transferRef || ref,
      });
      return apiOk({
        message: "Standalone manual payout submitted (unique ref — no double pay).",
        transferRef: xfer.transferRef || ref,
        amountMajor,
      });
    }

    if (action === "cancel_escrow" || parsed.data.status === "refunded") {
      const { session } = await requireSensitiveAction("escrow_refund", req);
      const reason = (parsed.data.reason || "").trim();
      if (reason.length < 8) {
        return apiFail(
          "A cancellation reason is required (min 8 characters).",
          400,
          "reason_required"
        );
      }

      const supabase = createServiceSupabase();
      const paymentId = parsed.data.id;
      if (!paymentId) return apiFail("id required", 400);
      const { data: payment, error: pErr } = await supabase
        .from("payments")
        .select("*")
        .eq("id", paymentId)
        .maybeSingle();
      if (pErr || !payment) return apiFail("Payment not found", 404);

      const jobId =
        parsed.data.jobId ||
        String(
          (payment as { request_id?: string }).request_id ||
            (payment as { job_id?: string }).job_id ||
            ""
        );

      if (jobId) {
        const esc = await getEscrowByRequest(jobId);
        const escStatus = String(esc?.escrowStatus || esc?.status || "");
        if (escStatus === "released" || escStatus === "refunded") {
          return apiFail(`Cannot cancel — escrow is already ${escStatus}.`, 400);
        }
        if (
          esc &&
          [
            "held",
            "release_pending",
            "pending_settlement",
            "pending",
            "pending_payment",
          ].includes(escStatus)
        ) {
          await updateEscrow(esc.id, {
            status: "refunded",
            escrowStatus: "refunded",
            refundedAt: new Date().toISOString(),
            meta: {
              ...(esc.meta || {}),
              cancelReason: reason,
              cancelledByAdmin: session.userId,
            },
          });
        }

        const job = await getJob(jobId);
        if (
          job &&
          [
            "paid_booked",
            "en_route",
            "arrived",
            "in_progress",
            "completed",
            "satisfied",
            "agreed",
          ].includes(job.status)
        ) {
          try {
            await transitionJob({
              jobId,
              event: { type: "CANCEL", by: "admin" },
              actor: "admin",
              actorId: session.userId,
            });
          } catch {
            /* */
          }
        }
      }

      const { data: updated, error } = await supabase
        .from("payments")
        .update({
          status: "refunded",
          escrow_status: "refunded",
          refunded_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", paymentId)
        .select("*")
        .maybeSingle();
      if (error) return apiFail(error.message, 500);

      await logAdminAction(session.userId, "payments.cancel_escrow", paymentId, {
        reason,
        jobId,
      });

      return apiOk({
        payment: updated,
        message: "Escrow cancelled / marked refunded.",
      });
    }

    return apiFail("Unknown action", 400);
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return apiFail(e.message, e.status, e.code || "auth");
    }
    return apiFail(e instanceof Error ? e.message : "Payment update failed", 500);
  }
}
