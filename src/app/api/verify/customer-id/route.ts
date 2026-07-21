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

/**
 * Customer submits government ID for Tier 2 admin review.
 * Writes explicit identity_review_status = submitted so Verification / Customer review can list it.
 */
const bodySchema = z.object({
  access_token: z.string().min(10),
  primaryId: z.string().min(4).max(64),
  bankId: z.string().max(64).optional(),
  countryIso: z.string().max(4).optional(),
  govIdKind: z.string().max(40).optional(),
  govIdFrontUrl: z.string().min(8).max(6_000_000).optional(),
  govIdBackUrl: z.string().max(6_000_000).optional(),
});

function last4Digits(raw: string): string | null {
  const d = raw.replace(/\D/g, "");
  if (d.length >= 4) return d.slice(-4);
  const alnum = raw.replace(/\W/g, "");
  if (alnum.length >= 4) return alnum.slice(-4);
  return null;
}

export async function POST(req: Request) {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Server is not configured", 503);
  }
  try {
    const body = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return apiFail("Invalid ID submission", 400);
    }

    const url = getSupabaseUrl();
    const anon = getSupabaseAnonKey();
    if (!url || !anon) return apiFail("Server is not configured", 503);

    const userClient = createClient(url, anon, {
      global: {
        headers: { Authorization: `Bearer ${parsed.data.access_token}` },
      },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser(
      parsed.data.access_token
    );
    if (userErr || !userData.user) {
      return apiFail("Sign in again to submit ID", 401, "auth");
    }
    const userId = userData.user.id;

    const primary = parsed.data.primaryId.trim();
    const bank = (parsed.data.bankId || "").trim();
    const iso = (parsed.data.countryIso || "NG").toUpperCase();
    const now = new Date().toISOString();
    const ninLast4 = last4Digits(primary);
    const bvnLast4 = bank ? last4Digits(bank) : null;

    // Cap photo size in DB — keep meta flag if too large
    const front = parsed.data.govIdFrontUrl || null;
    const frontStored =
      front && front.length <= 1_500_000 ? front : front ? null : null;
    const hasPhoto = Boolean(front);

    const payload = {
      nin_last4: ninLast4,
      bvn_last4: bvnLast4,
      nin_verified: false,
      bvn_verified: false,
      identity_verified_at: null as string | null,
      identity_review_status: "submitted",
      identity_submitted_at: now,
      identity_reviewed_at: null as string | null,
      identity_reviewed_by: null as string | null,
      identity_rejection_reason: null as string | null,
      gov_id_kind: parsed.data.govIdKind || null,
      gov_id_front_url: frontStored,
      gov_id_back_url: parsed.data.govIdBackUrl || null,
      gov_id_meta: {
        countryIso: iso,
        primaryLast4: ninLast4,
        hasPhoto,
        photoStored: Boolean(frontStored),
        submittedAt: now,
      },
      updated_at: now,
    };

    const admin = createServiceSupabase();
    const { data: existing } = await admin
      .from("motorist_profiles")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (existing?.user_id) {
      const { error } = await admin
        .from("motorist_profiles")
        .update(payload)
        .eq("user_id", userId);
      if (error) return apiFail(error.message, 500);
    } else {
      const { error } = await admin.from("motorist_profiles").insert({
        user_id: userId,
        ...payload,
      });
      if (error) return apiFail(error.message, 500);
    }

    return apiOk({
      status: "submitted",
      message: "ID submitted for admin / customer care review.",
      submittedAt: now,
    });
  } catch {
    return apiFail("Could not submit ID for review", 500);
  }
}
