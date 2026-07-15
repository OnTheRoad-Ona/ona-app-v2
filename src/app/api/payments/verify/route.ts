import { z } from "zod";
import { apiFail, apiOk } from "@/lib/server/api-json";
import {
  getEscrowByRef,
  updateEscrow,
} from "@/lib/server/payments/escrow-store";
import { verifyCharge } from "@/lib/server/payments/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  reference: z.string().min(3),
  provider: z.enum(["paystack", "flutterwave", "mock"]).optional(),
});

/** Verify gateway charge and mark escrow as held. */
export async function POST(req: Request) {
  try {
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) return apiFail("Invalid body", 400);

    const payment = await getEscrowByRef(parsed.data.reference);
    if (!payment) return apiFail("Payment not found", 404, "not_found");

    if (payment.escrowStatus === "held" || payment.escrowStatus === "released") {
      return apiOk({ payment, alreadySettled: true });
    }

    const verified = await verifyCharge(
      parsed.data.reference,
      parsed.data.provider || payment.provider
    );

    // Mock may return amount 0 — trust stored amount
    const ok =
      verified.success &&
      (verified.amountMinor === 0 ||
        verified.amountMinor === payment.amountMinor ||
        payment.provider === "mock");

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

    return apiOk({
      payment: updated,
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
          "Funds held in escrow. Released when both parties mark the job complete.",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Verify failed";
    return apiFail(msg, 500);
  }
}
