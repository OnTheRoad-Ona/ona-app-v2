import { z } from "zod";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { requireUser } from "@/lib/server/auth-utils";
import {
  getEscrowByRequest,
  updateEscrow,
} from "@/lib/server/payments/escrow-store";
import { attemptFlutterwaveRefund } from "@/lib/server/payments/providers";
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
    const auth = await requireUser(req);
    if (!auth.ok) return auth.response;

    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) return apiFail("Invalid body", 400);

    const payment = await getEscrowByRequest(parsed.data.requestId);
    if (!payment) return apiFail("Payment not found", 404);

    // Session identity only
    if (
      payment.motoristId !== auth.userId &&
      payment.repairProId !== auth.userId
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

    // Try Flutterwave refund when we have a provider ref; always update ledger.
    let gatewayStatus: string = "pending_ops";
    let gatewayMessage: string | undefined;
    let gatewayRaw: unknown;
    if (payment.providerRef && payment.provider !== "mock") {
      const amountMajor =
        payment.amountMinor != null
          ? Math.round(Number(payment.amountMinor) / 100)
          : undefined;
      const gw = await attemptFlutterwaveRefund({
        providerRef: String(payment.providerRef),
        amountMajor,
        reason: parsed.data.reason || "Cancelled before start",
      });
      if (gw.ok) {
        gatewayStatus = "submitted";
        gatewayMessage = `Flutterwave refund ${gw.status}`;
        gatewayRaw = gw.raw;
      } else {
        gatewayStatus =
          gw.code === "no_key" ? "pending_ops" : `failed_${gw.code}`;
        gatewayMessage = gw.message;
        gatewayRaw = gw.raw;
      }
    } else if (payment.provider === "mock") {
      gatewayStatus = "mock_ok";
      gatewayMessage = "Mock payment — ledger only";
    }

    const updated = await updateEscrow(payment.id, {
      status: "refunded",
      escrowStatus: "refunded",
      refundedAt: new Date().toISOString(),
      meta: {
        ...payment.meta,
        refundReason: parsed.data.reason || "Cancelled before start",
        refundGatewayStatus: gatewayStatus,
        refundGatewayMessage: gatewayMessage || null,
        refundLedgerAt: new Date().toISOString(),
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
      message:
        gatewayStatus === "submitted"
          ? "Refund submitted to Flutterwave and recorded in Ona ledger."
          : "Refund recorded in Ona ledger. Gateway return pending ops if auto-refund unavailable.",
      customerBankReady: Boolean(customerBank?.bankCode),
      gatewayStatus,
      gatewayMessage,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Refund failed";
    return apiFail(msg, 500);
  }
}
