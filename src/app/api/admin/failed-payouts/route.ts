import { z } from "zod";
import {
  AdminAuthError,
  logAdminAction,
  requirePermission,
  requireSensitiveAction,
} from "@/lib/server/admin-auth";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import {
  attemptProPayout,
  finalizeJobReleasedAfterPayout,
  getPaymentOpsSnapshot,
} from "@/lib/server/payments/payout-settlement";
import { getEscrowByRequest, updateEscrow } from "@/lib/server/payments/escrow-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Supabase is not configured", 503, "supabase_not_configured");
  }
  try {
    await requirePermission("view_payment_status");
    const snapshot = await getPaymentOpsSnapshot();

    const failed = snapshot.queues.failed.map((e) => ({
      id: e.id,
      requestId: e.requestId,
      motoristId: e.motoristId,
      repairProId: e.repairProId,
      amountMinor: e.amountMinor,
      platformFeeMinor: e.platformFeeMinor,
      proPayoutMinor: e.proPayoutMinor,
      currency: e.currency,
      escrowStatus: e.escrowStatus,
      serviceType: e.serviceType,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
      paidAt: e.paidAt,
      releasedAt: e.releasedAt,
      retryCount: Number(e.meta?.payoutRetryCount) || 0,
      lastError: e.meta?.lastReleaseError != null ? String(e.meta.lastReleaseError) : null,
      nextRetryAt: e.meta?.nextRetryAt != null ? String(e.meta.nextRetryAt) : null,
      payoutStatus: e.meta?.payoutStatus != null ? String(e.meta.payoutStatus) : null,
      autoRetryCancelled: e.meta?.autoRetryCancelled === true,
      payoutSuspended: e.meta?.payoutSuspended === true,
      exhausted: e.meta?.payoutStatus === "suspended_admin" || ((Number(e.meta?.payoutRetryCount) || 0) >= 144 && e.meta?.autoRetryCancelled === true),
    }));

    return apiOk({
      failed,
      totalCount: failed.length,
      exhaustedCount: snapshot.ona.exhaustedCount,
      suspendedCount: snapshot.ona.suspendedCount,
    });
  } catch (e) {
    if (e instanceof AdminAuthError) return apiFail(e.message, e.status, "auth");
    return apiFail("Failed to load failed payouts", 500);
  }
}

const patchSchema = z.object({
  jobId: z.string().min(1),
  action: z.enum(["retry", "resolve", "update_bank"]),
  bankCode: z.string().optional(),
  accountNumber: z.string().optional(),
  accountName: z.string().optional(),
  note: z.string().optional(),
});

export async function PATCH(req: Request) {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Supabase is not configured", 503, "supabase_not_configured");
  }
  try {
    const parsed = patchSchema.safeParse(await req.json());
    if (!parsed.success) return apiFail("Invalid body", 400);
    const b = parsed.data;

    if (b.action === "retry") {
      const { session } = await requireSensitiveAction("escrow_release", req);
      const esc = await getEscrowByRequest(b.jobId);
      if (!esc) return apiFail("Escrow not found", 404);
      const result = await attemptProPayout({
        jobId: b.jobId,
        repairProId: esc.repairProId,
        amountMinor: esc.amountMinor,
        currency: esc.currency,
        force: true,
      });
      if (result.ok) {
        await finalizeJobReleasedAfterPayout(b.jobId, result);
      }
      await logAdminAction(session.userId, "failed_payout.retry", b.jobId, { result, note: b.note });
      return apiOk({ result, message: result.ok ? "Retry succeeded" : `Retry attempted: ${result.message || "see result"}` });
    }

    if (b.action === "resolve") {
      const { session } = await requireSensitiveAction("escrow_refund", req);
      await logAdminAction(session.userId, "failed_payout.resolve", b.jobId, { note: b.note });
      const esc = await getEscrowByRequest(b.jobId);
      if (!esc) return apiFail("Escrow not found", 404);
      await updateEscrow(esc.id, {
        meta: {
          ...esc.meta,
          payoutStatus: "resolved_admin",
          payoutResolvedAt: new Date().toISOString(),
          payoutResolvedBy: session.userId,
          payoutResolveNote: b.note,
        },
      });
      return apiOk({ message: "Failed payout resolved. Funds remain in escrow." });
    }

    if (b.action === "update_bank") {
      const { session } = await requireSensitiveAction("escrow_release", req);
      if (!b.bankCode || !b.accountNumber || !b.accountName) {
        return apiFail("bankCode, accountNumber, and accountName required", 400);
      }
      await logAdminAction(session.userId, "failed_payout.update_bank", b.jobId, {
        bankCode: b.bankCode,
        accountNumberLast4: b.accountNumber.slice(-4),
        accountName: b.accountName,
        note: b.note,
      });
      return apiOk({ message: "Bank details updated. Use retry to attempt payout again." });
    }

    return apiFail("Unknown action", 400);
  } catch (e) {
    if (e instanceof AdminAuthError) return apiFail(e.message, e.status, "auth");
    return apiFail("Failed to process failed payout", 500);
  }
}
