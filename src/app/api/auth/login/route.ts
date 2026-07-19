import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { createServiceSupabase } from "@/lib/supabase/server";
import {
  getSupabaseAnonKey,
  getSupabaseUrl,
  isSupabaseAdminConfigured,
  isSupabaseConfigured,
} from "@/lib/supabase/env";
import {
  profileToUserProfile,
  resolvePrimaryAccountType,
} from "@/lib/supabase/mappers";
import type { ProfileRow, RepairProRow } from "@/lib/supabase/types";
import type { AccountType, ProService, UserProfile } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Server-side email/password login — reliable on Vercel.
 * Browser sets session from returned tokens; profile loaded via service role.
 */
const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function friendlyLoginError(message: string): string {
  const m = (message || "").toLowerCase();
  if (
    m.includes("invalid login") ||
    m.includes("invalid credentials") ||
    m.includes("wrong password") ||
    m.includes("user not found")
  ) {
    return "Email or password is incorrect.";
  }
  if (m.includes("email not confirmed")) {
    return "Confirm your email first, or try phone OTP log in.";
  }
  if (m.includes("too many") || m.includes("rate")) {
    return "Too many login attempts. Wait a minute and try again.";
  }
  return message || "Could not log in. Try again.";
}

async function loadOrRepairProfile(
  userId: string,
  email: string,
  meta: Record<string, unknown> | undefined
): Promise<UserProfile | null> {
  if (!isSupabaseAdminConfigured()) return null;
  const admin = createServiceSupabase();

  let { data: profile } = await admin
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (!profile) {
    const roleRaw = String(meta?.role || meta?.account_type || "motorist");
    const role =
      roleRaw === "repair_pro" || roleRaw === "professional"
        ? "repair_pro"
        : "motorist";
    const fullName =
      String(meta?.full_name || meta?.fullName || "").trim() ||
      email.split("@")[0] ||
      "User";
    const phone = String(meta?.phone || "").trim() || null;

    const { data: inserted, error: insErr } = await admin
      .from("profiles")
      .upsert(
        {
          id: userId,
          role,
          full_name: fullName,
          phone,
          email: email.toLowerCase(),
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" }
      )
      .select("*")
      .maybeSingle();

    if (insErr) {
      console.error("login profile repair failed", insErr.message);
    }
    profile = inserted;
  }

  if (!profile) return null;

  // Revive accidentally deactivated accounts so Motorist ↔ Pro switch works after login
  if ((profile as ProfileRow).is_active === false) {
    const { data: revived } = await admin
      .from("profiles")
      .update({ is_active: true, updated_at: new Date().toISOString() })
      .eq("id", userId)
      .select("*")
      .maybeSingle();
    if (revived) profile = revived;
  }

  const p = profile as ProfileRow;
  const accountType: AccountType =
    p.role === "repair_pro" ? "professional" : "motorist";

  const [motRes, proRes] = await Promise.all([
    admin.from("motorist_profiles").select("*").eq("user_id", userId).maybeSingle(),
    admin
      .from("repair_pro_profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  const mot = motRes.data as {
    vehicle_make?: string | null;
    vehicle_model?: string | null;
    vehicle_year?: string | null;
    plate_number?: string | null;
    vehicle_photo?: string | null;
    vehicle_common_issues?: string[] | null;
    vehicles?: import("@/lib/types").MotoristVehicle[] | null;
    nin_verified?: boolean;
    bvn_verified?: boolean;
    identity_verified_at?: string | null;
    created_at?: string;
  } | null;
  const pr = proRes.data as RepairProRow | null;

  const primaryAccountType = resolvePrimaryAccountType({
    hasMotorist: Boolean(mot),
    hasPro: Boolean(pr),
    motoristCreatedAt: mot?.created_at,
    proCreatedAt: pr?.created_at,
    activeAccountType: accountType,
  });

  if (accountType === "professional") {
    const proExtra = pr as
      | (RepairProRow & {
          labour_prices?: UserProfile["servicePrices"];
          pricing_currency?: import("@/lib/pricing").AppCurrency;
          jobs_completed?: number;
          vehicle_focus?: Record<string, string | undefined>;
        })
      | null;
    const vf = (proExtra?.vehicle_focus || {}) as Record<
      string,
      string | undefined
    >;
    return profileToUserProfile(p, {
      accountType,
      primaryAccountType,
      services:
        (pr?.services as ProService[]) ||
        (pr?.primary_service ? [pr.primary_service as ProService] : []),
      businessName: pr?.business_name || undefined,
      bio: pr?.bio || undefined,
      yearsExperience: pr?.years_experience || undefined,
      serviceRadiusKm: pr?.service_radius_km,
      ninVerified: pr?.nin_verified,
      bvnVerified: pr?.bvn_verified,
      docsStatus: (pr?.docs_status as UserProfile["docsStatus"]) || "approved",
      docsRatingBoostApplied: Boolean(pr?.docs_rating_boost_applied),
      certificationFileName: pr?.certification_file_name || undefined,
      certificationFileDataUrl: pr?.certification_file_url || undefined,
      skillAnswers: (pr?.skills as UserProfile["skillAnswers"]) || undefined,
      averageRating: pr ? Number(pr.rating_avg) || undefined : undefined,
      jobsCompleted: proExtra?.jobs_completed,
      servicePrices: proExtra?.labour_prices,
      pricingCurrency: proExtra?.pricing_currency,
      servedVehicleType: vf.servedVehicleType,
      servedBrand: vf.servedBrand,
      servedModel: vf.servedModel,
      servedCountry: vf.servedCountry,
      servedLocation: vf.servedLocation,
    });
  }

  return profileToUserProfile(p, {
    accountType,
    primaryAccountType,
    vehicleMake: mot?.vehicle_make || undefined,
    vehicleModel: mot?.vehicle_model || undefined,
    vehicleYear: mot?.vehicle_year || undefined,
    vehiclePlate: mot?.plate_number || undefined,
    vehiclePhoto: mot?.vehicle_photo || undefined,
    vehicleCommonIssues: mot?.vehicle_common_issues || undefined,
    vehicles: Array.isArray(mot?.vehicles) ? mot.vehicles : undefined,
    ninVerified: Boolean(mot?.nin_verified),
    bvnVerified: Boolean(mot?.bvn_verified),
    identityVerifiedAt: mot?.identity_verified_at || undefined,
  });
}

export async function POST(req: Request) {
  try {
    if (!isSupabaseConfigured()) {
      return apiFail("Supabase is not configured", 503);
    }

    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return apiFail("Enter a valid email and password.", 400);
    }

    const email = parsed.data.email.trim().toLowerCase();
    const password = parsed.data.password;
    const url = getSupabaseUrl();
    const anon = getSupabaseAnonKey();

    const authClient = createClient(url, anon, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data, error } = await authClient.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.session || !data.user) {
      return apiFail(friendlyLoginError(error?.message || "Login failed"), 401);
    }

    const userId = data.user.id;
    const profile = await loadOrRepairProfile(
      userId,
      email,
      (data.user.user_metadata || {}) as Record<string, unknown>
    );

    if (!profile) {
      return apiFail(
        "Account exists but profile could not be loaded. Contact support.",
        500
      );
    }

    return apiOk({
      userId,
      profile,
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at,
    });
  } catch (e) {
    console.error("login route", e);
    return apiFail(e instanceof Error ? e.message : "Login failed", 500);
  }
}
