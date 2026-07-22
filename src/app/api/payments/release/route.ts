import { z } from "zod";
import { apiFail, apiOk } from "@/lib/server/api-json";
import {
  getEscrowByRequest,
  updateEscrow,
} from "@/lib/server/payments/escrow-store";
import { releaseToPro } from "@/lib/server/payments/providers";
import type { AppCurrency } from "@/lib/pricing";
import { createServiceSupabase } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  requestId: z.string().min(1),
  role: z.enum(["motorist", "professional"]),
  userId: z.string().min(1),
});

async function loadProBank(repairProId: string | null) {
  if (!repairProId || !isSupabaseAdminConfigured()) return null;
  try {
    const sb = createServiceSupabase();
    const { data } = await sb
      .from("repair_pro_profiles")
      .select("bank_name, bank_account_name, bank_account_number, bank_code")
      .eq("user_id", repairProId)
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
 * Dual completion: each party marks complete.
 * When both done → release 95% to pro (Flutterwave transfer + bank code).
 */
export async function POST(req: Request) {
  try {
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) return apiFail("Invalid body", 400);
    const { requestId, role, userId } = parsed.data;

    const payment = await getEscrowByRequest(requestId);
    if (!payment) return apiFail("No escrow payment for this request", 404);
    if (payment.escrowStatus === "released") {
      return apiOk({ payment, alreadyReleased: true });
    }
    if (payment.escrowStatus !== "held" && payment.escrowStatus !== "release_pending") {
      return apiFail("Escrow is not held — cannot release", 400, "not_held");
    }

    const now = new Date().toISOString();
    const patch: {
      motoristCompletedAt?: string | null;
      proCompletedAt?: string | null;
      escrowStatus?: "release_pending" | "released" | "held";
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

    if (motoristDone && proDone) {
      patch.escrowStatus = "release_pending";
      let updated = await updateEscrow(payment.id, {
        ...patch,
        escrowStatus: "release_pending",
      });

      const proBank = await loadProBank(payment.repairProId);
      if (
        !proBank?.bankCode ||
        !proBank.accountNumber ||
        !proBank.accountName
      ) {
        return apiFail(
          "Repair Pro must save bank details (with bank code) before payout.",
          400,
          "pro_bank_required"
        );
      }

      const xfer = await releaseToPro({
        amountMinor: payment.proPayoutMinor,
        currency: payment.currency as AppCurrency,
        reference: `rel_${payment.providerRef || payment.id}`,
        reason: "Ona job completion payout (95% labour fee)",
        bankCode: proBank.bankCode,
        accountNumber: proBank.accountNumber,
        accountName: proBank.accountName,
      });

      updated = await updateEscrow(payment.id, {
        status: "paid",
        escrowStatus: xfer.ok ? "released" : "release_pending",
        releasedAt: xfer.ok ? now : null,
        meta: {
          ...payment.meta,
          releaseAttempt: xfer,
          platformFeeMinor: payment.platformFeeMinor,
          proPayoutMinor: payment.proPayoutMinor,
          proBankCode: proBank.bankCode,
          proBankName: proBank.bankName,
        },
      });

      return apiOk({
        payment: updated,
        bothCompleted: true,
        transfer: xfer,
        split: {
          platformPercent: 5,
          proPercent: 95,
          platformFeeMinor: payment.platformFeeMinor,
          proPayoutMinor: payment.proPayoutMinor,
        },
      });
    }

    const updated = await updateEscrow(payment.id, patch);
    return apiOk({
      payment: updated,
      bothCompleted: false,
      waitingFor:
        role === "motorist" ? "professional" : "motorist",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Release failed";
    return apiFail(msg, 500);
  }
}
