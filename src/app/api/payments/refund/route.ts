import { z } from "zod";
import { apiFail, apiOk } from "@/lib/server/api-json";
import {
  getEscrowByRequest,
  updateEscrow,
} from "@/lib/server/payments/escrow-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  requestId: z.string().min(1),
  reason: z.string().optional(),
  /** Only full refund before job start (held, not released) */
  userId: z.string().min(1),
});

/**
 * Full refund if job cancelled before start (escrow held, not released).
 */
export async function POST(req: Request) {
  try {
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) return apiFail("Invalid body", 400);

    const payment = await getEscrowByRequest(parsed.data.requestId);
    if (!payment) return apiFail("Payment not found", 404);

    if (
      payment.motoristId !== parsed.data.userId &&
      payment.repairProId !== parsed.data.userId
    ) {
      return apiFail("Forbidden", 403);
    }

    if (payment.escrowStatus === "released") {
      return apiFail(
        "Job already completed and paid out — refund not available",
        400,
        "already_released"
      );
    }

    if (
      payment.escrowStatus !== "held" &&
      payment.escrowStatus !== "pending_payment"
    ) {
      return apiFail("Nothing to refund", 400);
    }

    // Gateway refund API would be called here with provider_ref.
    const updated = await updateEscrow(payment.id, {
      status: "refunded",
      escrowStatus: "refunded",
      refundedAt: new Date().toISOString(),
      meta: {
        ...payment.meta,
        refundReason: parsed.data.reason || "Cancelled before start",
      },
    });

    return apiOk({
      payment: updated,
      message: "Full refund processed (labour fee returned to motorist).",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Refund failed";
    return apiFail(msg, 500);
  }
}
