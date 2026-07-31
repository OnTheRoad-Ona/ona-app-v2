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
 * Customer submits full government ID package for Tier 2 admin review.
 * Stores numbers, both photos, country, kind — everything care needs to approve.
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

function capPhoto(url: string | null | undefined): string | null {
  if (!url) return null;
  // ~1.5MB text cap for Postgres row comfort
  if (url.length > 1_500_000) return null;
  return url;
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
    const front = capPhoto(parsed.data.govIdFrontUrl);
    const back = capPhoto(parsed.data.govIdBackUrl);
    const frontRaw = parsed.data.govIdFrontUrl || null;
    const backRaw = parsed.data.govIdBackUrl || null;

    const admin = createServiceSupabase();

    // Snapshot account profile for admin review (name/phone/city)
    const { data: profile } = await admin
      .from("profiles")
      .select("full_name, email, phone, city, area, created_at")
      .eq("id", userId)
      .maybeSingle();

    const { data: existingMot } = await admin
      .from("motorist_profiles")
      .select(
        "user_id, vehicle_make, vehicle_model, vehicle_year, plate_number, vehicles, phone_verified, first_service_at"
      )
      .eq("user_id", userId)
      .maybeSingle();

    const payload: Record<string, unknown> = {
      nin_last4: ninLast4,
      bvn_last4: bvnLast4,
      nin_verified: false,
      bvn_verified: false,
      identity_verified_at: null,
      identity_review_status: "submitted",
      identity_submitted_at: now,
      identity_reviewed_at: null,
      identity_reviewed_by: null,
      identity_rejection_reason: null,
      gov_id_kind: parsed.data.govIdKind || null,
      gov_id_front_url: front,
      gov_id_back_url: back,
      // Full numbers for care review (also mirrored to encrypted columns)
      gov_id_number: primary,
      bank_id_number: bank || null,
      nin_encrypted: primary,
      bvn_encrypted: bank || null,
      identity_country_iso: iso,
      gov_id_meta: {
        countryIso: iso,
        govIdKind: parsed.data.govIdKind || null,
        primaryId: primary,
        bankId: bank || null,
        primaryLast4: ninLast4,
        bankLast4: bvnLast4,
        hasPhoto: Boolean(frontRaw),
        hasBackPhoto: Boolean(backRaw),
        photoStored: Boolean(front),
        backPhotoStored: Boolean(back),
        photoTooLarge: Boolean(frontRaw && !front),
        backPhotoTooLarge: Boolean(backRaw && !back),
        submittedAt: now,
        accountSnapshot: {
          fullName: profile?.full_name ?? null,
          email: profile?.email ?? null,
          phone: profile?.phone ?? null,
          city: profile?.city ?? null,
          area: profile?.area ?? null,
          registeredAt: profile?.created_at ?? null,
          vehicleMake: existingMot?.vehicle_make ?? null,
          vehicleModel: existingMot?.vehicle_model ?? null,
          vehicleYear: existingMot?.vehicle_year ?? null,
          plate: existingMot?.plate_number ?? null,
          phoneVerified: Boolean(existingMot?.phone_verified),
          firstServiceAt: existingMot?.first_service_at ?? null,
        },
      },
      review_checklist: {},
      updated_at: now,
    };

    if (existingMot?.user_id) {
      const { error } = await admin
        .from("motorist_profiles")
        .update(payload)
        .eq("user_id", userId);
      if (error) {
        // Retry without newer columns if migration lag
        if (
          error.message.includes("gov_id_number") ||
          error.message.includes("identity_country") ||
          error.message.includes("review_checklist")
        ) {
          const slim = {
            nin_last4: ninLast4,
            bvn_last4: bvnLast4,
            nin_verified: false,
            bvn_verified: false,
            identity_verified_at: null,
            identity_review_status: "submitted",
            identity_submitted_at: now,
            gov_id_kind: parsed.data.govIdKind || null,
            gov_id_front_url: front,
            gov_id_back_url: back,
            nin_encrypted: primary,
            bvn_encrypted: bank || null,
            gov_id_meta: payload.gov_id_meta,
            updated_at: now,
          };
          const { error: e2 } = await admin
            .from("motorist_profiles")
            .update(slim)
            .eq("user_id", userId);
          if (e2) return apiFail(e2.message, 500);
        } else {
          return apiFail(error.message, 500);
        }
      }
    } else {
      const { error } = await admin.from("motorist_profiles").insert({
        user_id: userId,
        ...payload,
      });
      if (error) return apiFail(error.message, 500);
    }

    // Signup/verification-time duplicate detection: if this ID matches another
    // (non-deleted) account, queue the pair for admin review.
    try {
      const { detectMergeCandidatesForUser } = await import(
        "@/lib/server/identity/identity-sync"
      );
      await detectMergeCandidatesForUser(admin, userId, {
        userId,
        source: "customer_id_verify",
      });
    } catch (e) {
      console.error("customer-id merge detection failed", e);
    }

    return apiOk({
      status: "submitted",
      message: "ID submitted for admin / customer care review.",
      submittedAt: now,
      stored: {
        hasFront: Boolean(front),
        hasBack: Boolean(back),
        primaryLast4: ninLast4,
      },
    });
  } catch {
    return apiFail("Could not submit ID for review", 500);
  }
}
