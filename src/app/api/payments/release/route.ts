import { z } from "zod";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { requireUser } from "@/lib/server/auth-utils";
import {
  getEscrowByRequest,
  updateEscrow,
} from "@/lib/server/payments/escrow-store";
import { attemptProPayout } from "@/lib/server/payments/payout-settlement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  requestId: z.string().min(1),
  role: z.enum(["motorist", "professional"]),
  userId: z.string().min(1),
});

/**
 * Dual completion: each party marks complete.
 * When both done → single idempotent pro payout via attemptProPayout
 * (stable transfer ref + ledger + FLW lookup — never a second bank credit).
 */
export async function POST(req: Request) {
  try {
    const auth = await requireUser(req);
    if (!auth.ok) return auth.response;

    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) return apiFail("Invalid body", 400);
    const { requestId, role } = parsed.data;
    // Identity from session only — ignore spoofed body.userId
    const userId = auth.userId;

    const payment = await getEscrowByRequest(requestId);
    if (!payment) return apiFail("No escrow payment for this request", 404);
    if (
      payment.escrowStatus === "released" ||
      payment.meta?.proTransferOk === true ||
      payment.meta?.payoutStatus === "success"
    ) {
      return apiOk({ payment, alreadyReleased: true });
    }
    if (
      payment.escrowStatus !== "held" &&
      payment.escrowStatus !== "release_pending" &&
      payment.escrowStatus !== "pending_settlement"
    ) {
      return apiFail("Escrow is not held — cannot release", 400, "not_held");
    }

    const now = new Date().toISOString();
    const patch: {
      motoristCompletedAt?: string | null;
      proCompletedAt?: string | null;
    } = {};

    if (role === "motorist") {
      if (payment.motoristId !== userId) {
        return apiFail("Not your request", 403);
      }
      patch.motoristCompletedAt = payment.motoristCompletedAt || now;
    } else {
      if (payment.repairProId !== userId) {
        return apiFail("Not your job", 403);
      }
      patch.proCompletedAt = payment.proCompletedAt || now;
    }

    const motoristDone =
      role === "motorist" ? true : Boolean(payment.motoristCompletedAt);
    const proDone =
      role === "professional" ? true : Boolean(payment.proCompletedAt);

    if (!(motoristDone && proDone)) {
      const updated = await updateEscrow(payment.id, patch);
      return apiOk({
        payment: updated,
        bothCompleted: false,
        waitingFor: role === "motorist" ? "professional" : "motorist",
      });
    }

    await updateEscrow(payment.id, {
      ...patch,
      escrowStatus: "release_pending",
    });

    // ONE path only — never call releaseToPro with a different reference
    const result = await attemptProPayout({
      jobId: requestId,
      repairProId: payment.repairProId,
      amountMinor: payment.amountMinor,
      currency: payment.currency,
      paymentReference: payment.providerRef,
      // force only skips settlement backoff, never bypasses double-pay guards
      force: true,
    });

    if (result.ok) {
      const updated = await getEscrowByRequest(requestId);
      return apiOk({
        payment: updated,
        bothCompleted: true,
        alreadyReleased: result.alreadyReleased === true,
        transfer: { ok: true, transferRef: result.transferRef },
        split: {
          platformPercent: 5,
          proPercent: 87.5,
          vatPercent: 7.5,
          platformFeeMinor: result.platformFeeMinor,
          proPayoutMinor: result.proPayoutMinor,
        },
      });
    }

    if (result.pendingSettlement) {
      const updated = await getEscrowByRequest(requestId);
      return apiOk({
        payment: updated,
        bothCompleted: true,
        pendingSettlement: true,
        message: result.message,
        split: {
          platformPercent: 5,
          proPercent: 87.5,
          vatPercent: 7.5,
          platformFeeMinor: result.platformFeeMinor,
          proPayoutMinor: result.proPayoutMinor,
        },
      });
    }

    return apiFail(
      result.message || "Could not release payout. Funds remain in escrow.",
      400,
      "payout_failed"
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Release failed";
    return apiFail(msg, 500);
  }
}

