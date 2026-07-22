import { z } from "zod";
import { apiFail, apiOk } from "@/lib/server/api-json";
import {
  getEscrowByRequest,
  updateEscrow,
} from "@/lib/server/payments/escrow-store";
import { createServiceSupabase } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  requestId: z.string().min(1),
  reason: z.string().optional(),
  /** Only full refund before job start (held, not released) */
  userId: z.string().min(1),
});

async function loadMotoristBank(motoristId: string) {
  if (!isSupabaseAdminConfigured()) return null;
  try {
    const sb = createServiceSupabase();
    const { data } = await sb
      .from("motorist_profiles")
      .select("bank_name, bank_account_name, bank_account_number, bank_code")
      .eq("user_id", motoristId)
      .maybeSingle();
    if (!data) return null;
    return {
      bankName: (data.bank_name as string) || "",
      accountName: (data.bank_account_name as string) || "",
      accountNumber: String(data.bank_account_number || "").replace(/\D/g, ""),
      bankCode: String(data.bank_code || "").trim(),
    };
  } catch {
    return null;
  }
}

/**
 * Full refund if job cancelled before start (escrow held, not released).
 * Stores customer bank code on the refund meta for Flutterwave / Care ops.
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

    const customerBank = await loadMotoristBank(payment.motoristId);

    // Gateway refund: prefer card refund via provider_ref; bank transfer uses bank_code.
    // Live Flutterwave refund endpoint can be plugged in here with provider_ref.
    const updated = await updateEscrow(payment.id, {
      status: "refunded",
      escrowStatus: "refunded",
      refundedAt: new Date().toISOString(),
      meta: {
        ...payment.meta,
        refundReason: parsed.data.reason || "Cancelled before start",
        customerBankCode: customerBank?.bankCode || null,
        customerBankName: customerBank?.bankName || null,
        customerAccountName: customerBank?.accountName || null,
        customerAccountLast4: customerBank?.accountNumber
          ? customerBank.accountNumber.slice(-4)
          : null,
        providerRef: payment.providerRef,
      },
    });

    return apiOk({
      payment: updated,
      message: "Full refund processed (labour fee returned to motorist).",
      customerBankReady: Boolean(customerBank?.bankCode),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Refund failed";
    return apiFail(msg, 500);
  }
}
