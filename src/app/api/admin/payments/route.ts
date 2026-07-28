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
import { getJob, transitionJob } from "@/lib/server/jobs/job-store";
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
  };
  for (const row of rows) {
    const e = effectiveEscrowStatus(row);
    if (e === "held" || e === "pending_payment") counts.held += 1;
    else if (e === "pending_settlement" || e === "release_pending")
      counts.pending_settlement += 1;
    else if (e === "released") counts.released += 1;
    else if (e === "failed") counts.failed += 1;
    else if (e === "refunded") counts.refunded += 1;
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
      "set_status",
      "retry_payout",
      "retry_all_due",
      "force_release",
    ])
    .optional(),
  reason: z.string().min(8).max(500).optional(),
  jobId: z.string().optional(),
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

    // Single job force/retry payout
    if (action === "retry_payout" || action === "force_release") {
      const { session } = await requireSensitiveAction("escrow_release", req);
      const jobId = parsed.data.jobId || parsed.data.id;
      if (!jobId) return apiFail("jobId required", 400);

      const job = await getJob(jobId);
      if (!job) {
        // payment id → request_id
        const esc = await getEscrowByRequest(jobId);
        const rid = esc?.requestId;
        if (!rid) return apiFail("Job not found", 404);
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
        // Admin force_release always; retry_payout respects 10‑min unless force_release
        force: action === "force_release" || action === "retry_payout",
      });
      if (result.ok) {
        await finalizeJobReleasedAfterPayout(job.id, result);
      }
      await logAdminAction(session.userId, "payments.retry_payout", job.id, {
        result,
      });
      return apiOk({ result, jobId: job.id });
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
