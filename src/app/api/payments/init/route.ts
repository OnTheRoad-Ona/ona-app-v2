import { z } from "zod";
import { apiFail, apiOk } from "@/lib/server/api-json";
import {
  buildPricingSnapshot,
  detectCurrency,
  type AppCurrency,
} from "@/lib/pricing";
import { createEscrowPayment } from "@/lib/server/payments/escrow-store";
import { initCharge } from "@/lib/server/payments/providers";
import type { ProService } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  requestId: z.string().min(1),
  motoristId: z.string().min(1),
  repairProId: z.string().min(1),
  serviceType: z.string().min(1),
  email: z.string().email(),
  baseAmountMajor: z.number().positive(),
  discountPercent: z.number().min(0).max(50).optional().default(0),
  currency: z.enum(["NGN", "USD"]).optional(),
  countryCode: z.string().optional(),
  countryName: z.string().optional(),
  provider: z.enum(["paystack", "flutterwave", "mock"]).optional(),
});

/**
 * Initialize escrow charge for labour/service fee only.
 * Blocks when base price missing (caller must check before invoke).
 */
export async function POST(req: Request) {
  try {
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return apiFail("Invalid payment payload", 400, "invalid_body");
    }
    const b = parsed.data;
    const currency: AppCurrency =
      b.currency ||
      detectCurrency({
        countryCode: b.countryCode,
        countryName: b.countryName,
      });

    const snap = buildPricingSnapshot({
      serviceType: b.serviceType as ProService,
      currency,
      baseAmountMajor: b.baseAmountMajor,
      discountPercent: b.discountPercent,
    });
    if (!snap) {
      return apiFail(
        "This Repair Pro has no labour price set. Quote on request — they must set a price first.",
        400,
        "price_required"
      );
    }

    const reference = `om_${b.requestId.slice(0, 12)}_${Date.now().toString(36)}`;
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
      "http://localhost:3000";
    const callbackUrl = `${appUrl}/payments/callback?ref=${encodeURIComponent(
      reference
    )}`;

    const charge = await initCharge(
      {
        amountMinor: snap.agreedAmountMinor,
        currency: snap.currency,
        email: b.email,
        reference,
        callbackUrl,
        metadata: {
          requestId: b.requestId,
          motoristId: b.motoristId,
          repairProId: b.repairProId,
          serviceType: b.serviceType,
          labourOnly: true,
          discountPercent: snap.discountPercent,
        },
        channels: ["card", "bank", "ussd", "bank_transfer"],
      },
      b.provider
    );

    const payment = await createEscrowPayment({
      requestId: b.requestId,
      motoristId: b.motoristId,
      repairProId: b.repairProId,
      amountMinor: snap.agreedAmountMinor,
      baseAmountMinor: snap.baseAmountMinor,
      discountPercent: snap.discountPercent,
      platformFeeMinor: snap.platformFeeMinor,
      proPayoutMinor: snap.proPayoutMinor,
      currency: snap.currency,
      provider: charge.provider,
      providerRef: charge.reference,
      serviceType: b.serviceType,
      meta: {
        labourOnly: true,
        disclaimer:
          "Labour / service fee only. Does not include spare parts or motor parts.",
      },
    });

    return apiOk({
      paymentId: payment.id,
      reference: charge.reference,
      authorizationUrl: charge.authorizationUrl,
      provider: charge.provider,
      pricing: snap,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Payment init failed";
    return apiFail(msg, 500, "payment_init_failed");
  }
}
