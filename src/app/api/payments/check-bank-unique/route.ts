import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { apiFail, apiOk } from "@/lib/server/api-json";
import {
  getSupabaseAnonKey,
  getSupabaseUrl,
  isSupabaseAdminConfigured,
} from "@/lib/supabase/env";
import { createServiceSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  accountNumber: z.string().min(10).max(12),
  bankCode: z.string().min(1).max(20),
  /** Optional — when omitted, try session cookie / not required for pre-check */
  access_token: z.string().optional(),
});

/**
 * Check whether bank code + NUBAN is free for this user.
 * POST { accountNumber, bankCode, access_token? }
 */
export async function POST(req: Request) {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Server not configured", 503);
  }

  try {
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) return apiFail("Invalid body", 400);

    const accountNumber = parsed.data.accountNumber.replace(/\D/g, "");
    const bankCode = parsed.data.bankCode.trim();
    if (accountNumber.length !== 10 || !bankCode) {
      return apiFail("Need bank code and 10-digit account number.", 400);
    }

    let userId: string | null = null;
    const token = parsed.data.access_token?.trim();
    if (token) {
      const url = getSupabaseUrl();
      const anon = getSupabaseAnonKey();
      const userClient = createClient(url, anon, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data } = await userClient.auth.getUser(token);
      userId = data.user?.id ?? null;
    } else {
      // Prefer browser session via anon client cookies is not available here —
      // client should pass access_token when possible. Without userId we still
      // detect any existing link (stricter pre-check).
    }

    const admin = createServiceSupabase();
    const match = (row: {
      user_id?: string;
      bank_code?: string | null;
      bank_account_number?: string | null;
    }) => {
      if (userId && row.user_id === userId) return false;
      const rCode = String(row.bank_code || "").trim();
      const rNum = String(row.bank_account_number || "").replace(/\D/g, "");
      return rCode === bankCode && rNum === accountNumber;
    };

    const [motRes, proRes, pmRes] = await Promise.all([
      admin
        .from("motorist_profiles")
        .select("user_id, bank_code, bank_account_number")
        .eq("bank_account_number", accountNumber)
        .limit(20),
      admin
        .from("repair_pro_profiles")
        .select("user_id, bank_code, bank_account_number")
        .eq("bank_account_number", accountNumber)
        .limit(20),
      admin
        .from("payout_methods")
        .select("user_id, bank_code, account_number_last4")
        .eq("account_number_last4", accountNumber.slice(-4))
        .limit(20),
    ]);

    // Canonical payout_methods stores last-4 only — combine bank_code + last4.
    const pmMatch = (pmRes.data || []).some((row) => {
      const r = row as { user_id?: string; bank_code?: string | null; account_number_last4?: string | null };
      if (userId && r.user_id === userId) return false;
      return (
        String(r.bank_code || "").trim() === bankCode &&
        String(r.account_number_last4 || "").trim() === accountNumber.slice(-4)
      );
    });

    const taken =
      (motRes.data || []).some(match) ||
      (proRes.data || []).some(match) ||
      pmMatch;

    if (taken) {
      return apiOk({
        available: false,
        message:
          "This bank account is already linked to another Ona account.",
      });
    }

    return apiOk({ available: true });
  } catch (e) {
    return apiFail(
      e instanceof Error ? e.message : "Check failed",
      500
    );
  }
}
