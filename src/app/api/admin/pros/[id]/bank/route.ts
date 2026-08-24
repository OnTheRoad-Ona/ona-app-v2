/**
 * Full Repair Pro bank details L3+ Operations/Finance only.
 * Lower levels receive masked account numbers only.
 */

import {
  AdminAuthError,
  logAdminAction,
  requireAdmin,
  requireSensitiveAction,
} from "@/lib/server/admin-auth";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { createServiceSupabase } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import {
  maskBankAccount,
  roleHasPermission,
} from "@/lib/server/modules/admin-roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Supabase is not configured", 503);
  }
  try {
    const { id } = await ctx.params;
    const { adminRole, session } = await requireAdmin();
    const canFull = roleHasPermission(adminRole, "view_bank_full");

    // Full bank requires sensitive unlock for non-super-admin
    if (canFull) {
      await requireSensitiveAction("view_bank_full", req);
    }

    const supabase = createServiceSupabase();
    const { data, error } = await supabase
      .from("repair_pro_profiles")
      .select(
        "user_id, business_name, bank_name, bank_code, bank_account_number, bank_account_name",
      )
      .eq("user_id", id)
      .maybeSingle();
    if (error) return apiFail(error.message, 500);
    if (!data) return apiFail("Repair Pro not found", 404);

    const account = String(data.bank_account_number || "");
    if (canFull) {
      await logAdminAction(session.userId, "view_pro_bank_full", id, {
        sensitive: true,
      });
      return apiOk({
        userId: data.user_id,
        businessName: data.business_name,
        bankName: data.bank_name,
        bankCode: data.bank_code,
        accountNumber: account,
        accountName: data.bank_account_name,
        masked: false,
      });
    }

    return apiOk({
      userId: data.user_id,
      businessName: data.business_name,
      bankName: data.bank_name,
      bankCode: data.bank_code ? "•••" : null,
      accountNumber: maskBankAccount(account),
      accountName: data.bank_account_name
        ? String(data.bank_account_name).slice(0, 2) + "•••"
        : null,
      masked: true,
      note: "Full bank details require Operations / Finance (L3) or higher.",
    });
  } catch (e) {
    if (e instanceof AdminAuthError)
      return apiFail(e.message, e.status, e.code || "auth");
    return apiFail("Failed to load bank details", 500);
  }
}
