import { z } from "zod";
import { apiFail, apiOk } from "@/lib/server/api-json";
import {
  getEscrowByRef,
  updateEscrow,
} from "@/lib/server/payments/escrow-store";
import { markJobPaidFromReference } from "@/lib/server/jobs/job-store";
import { verifyCharge } from "@/lib/server/payments/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  reference: z.string().min(3),
  provider: z.enum(["paystack", "flutterwave", "mock"]).optional(),
});

/** Verify gateway charge, mark escrow held, job → Booked. */
export async function POST(req: Request) {
  try {
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) return apiFail("Invalid body", 400);

    const payment = await getEscrowByRef(parsed.data.reference);
    if (!payment) return apiFail("Payment not found", 404, "not_found");

    if (payment.escrowStatus === "held" || payment.escrowStatus === "released") {
      const booked = await markJobPaidFromReference(parsed.data.reference);
      return apiOk({
        payment,
        alreadySettled: true,
        job: "job" in booked ? booked.job : null,
      });
    }

    const verified = await verifyCharge(
      parsed.data.reference,
      parsed.data.provider || payment.provider
    );

    // Allow small gateway rounding; mock may return amount 0
    const amountOk =
      verified.amountMinor === 0 ||
      payment.provider === "mock" ||
      Math.abs(verified.amountMinor - payment.amountMinor) <= 100;

    const ok = verified.success && amountOk;

    if (!ok) {
      await updateEscrow(payment.id, {
        status: "failed",
        escrowStatus: "failed",
      });
      return apiFail("Payment verification failed", 402, "verify_failed");
    }

    const updated = await updateEscrow(payment.id, {
      status: "paid",
      escrowStatus: "held",
      paidAt: verified.paidAt || new Date().toISOString(),
      providerChannel: verified.channel || null,
    });

    const booked = await markJobPaidFromReference(parsed.data.reference);

    return apiOk({
      payment: updated,
      job: "job" in booked ? booked.job : null,
      jobError: "error" in booked ? booked.error : null,
      receipt: {
        reference: payment.providerRef,
        amountMinor: payment.amountMinor,
        currency: payment.currency,
        labourOnly: true,
        discountPercent: payment.discountPercent,
        platformFeeMinor: payment.platformFeeMinor,
        proPayoutMinor: payment.proPayoutMinor,
        status: "held",
        message:
          "Funds held in escrow. Job is Booked. Released when both parties mark the job complete.",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Verify failed";
    return apiFail(msg, 500);
  }
}
