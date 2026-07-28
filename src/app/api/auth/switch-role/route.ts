import { z } from "zod";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { createServiceSupabase } from "@/lib/supabase/server";
import {
  getSupabaseAnonKey,
  getSupabaseUrl,
  isSupabaseAdminConfigured,
} from "@/lib/supabase/env";
import { createClient } from "@supabase/supabase-js";
import {
  profileToUserProfile,
  resolvePrimaryAccountType,
} from "@/lib/supabase/mappers";
import type { ProfileRow, RepairProRow } from "@/lib/supabase/types";
import type { AccountType, ProService } from "@/lib/types";
import { isProService } from "@/lib/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  access_token: z.string().min(10),
  target: z.enum(["motorist", "professional"]),
});

/**
 * POST /api/auth/switch-role
 * Smooth Motorist ↔ Repair Pro switch for the same logged-in user.
 * Ensures the side-table exists, updates profiles.role, returns full profile.
 */
export async function POST(req: Request) {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Server is not configured", 503);
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return apiFail("Invalid JSON", 400);
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return apiFail("Invalid switch request", 400);
  }

  const url = getSupabaseUrl();
  const anon = getSupabaseAnonKey();
  const userClient = createClient(url, anon, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: userData, error: userErr } = await userClient.auth.getUser(
    parsed.data.access_token
  );
  if (userErr || !userData.user) {
    return apiFail(
      "Your login session needs a refresh. Try again, or sign in once more.",
      401,
      "session_expired"
    );
  }

  const userId = userData.user.id;
  const target = parsed.data.target;
  const role = target === "professional" ? "repair_pro" : "motorist";
  const admin = createServiceSupabase();

  // Load current profile
  const { data: existing, error: findErr } = await admin
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (findErr || !existing) {
    return apiFail("Profile not found", 404);
  }

  // Self-heal: accidental deactivation must not block Motorist ↔ Repair Pro switch.
  // Admin freeze can re-apply is_active=false later; dual-role users need to switch.
  if (!existing.is_active) {
    const { data: revived, error: reviveErr } = await admin
      .from("profiles")
      .update({ is_active: true, updated_at: new Date().toISOString() })
      .eq("id", userId)
      .select("*")
      .maybeSingle();
    if (reviveErr || !revived) {
      return apiFail("This account is deactivated", 403);
    }
    Object.assign(existing, revived);
  }

  // Require a real side-profile (completed signup). Do not invent empty rows.
  if (role === "motorist") {
    const { data: motRow } = await admin
      .from("motorist_profiles")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!motRow) {
      return apiFail(
        "You don't have a Customer account yet.",
        409,
        "needs_signup"
      );
    }
  } else {
    const { data: proRow } = await admin
      .from("repair_pro_profiles")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!proRow) {
      return apiFail(
        "You don't have a Repair Pro account yet. Finish signup to go Live and receive jobs.",
        409,
        "needs_signup"
      );
    }
  }

  const { data: updated, error: updErr } = await admin
    .from("profiles")
    .update({ role })
    .eq("id", userId)
    .select("*")
    .single();

  if (updErr || !updated) {
    return apiFail(updErr?.message || "Could not switch role", 500);
  }

  // Switching away from Repair Pro → go Away so motorists cannot find them.
  // Switching into Repair Pro → stay Away until they tap Live on the dashboard.
  if (role === "motorist") {
    await admin
      .from("repair_pro_profiles")
      .update({ is_online: false })
      .eq("user_id", userId);
  } else {
    await admin
      .from("repair_pro_profiles")
      .update({ is_online: false })
      .eq("user_id", userId);
  }

  const profileRow = updated as ProfileRow;
  const accountType: AccountType =
    role === "repair_pro" ? "professional" : "motorist";

  let extras: {
    services?: ProService[];
    businessName?: string;
    vehicleMake?: string;
    vehicleModel?: string;
    vehicleYear?: string;
    bio?: string;
    yearsExperience?: string;
    serviceRadiusKm?: number;
    ninVerified?: boolean;
    bvnVerified?: boolean;
  } = {};

  if (accountType === "professional") {
    const { data: pro } = await admin
      .from("repair_pro_profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    const pr = pro as RepairProRow | null;
    extras = {
      services:
        (pr?.services as ProService[])?.filter(isProService) ||
        (pr?.primary_service && isProService(pr.primary_service)
          ? [pr.primary_service]
          : ["mechanic"]),
      businessName: pr?.business_name || undefined,
      bio: pr?.bio || undefined,
      yearsExperience: pr?.years_experience || undefined,
      serviceRadiusKm: pr?.service_radius_km,
      ninVerified: pr?.nin_verified,
      bvnVerified: pr?.bvn_verified,
    };
  } else {
    const { data: mot } = await admin
      .from("motorist_profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    extras = {
      vehicleMake: mot?.vehicle_make || undefined,
      vehicleModel: mot?.vehicle_model || undefined,
      vehicleYear: mot?.vehicle_year || undefined,
      ninVerified: mot?.nin_verified,
      bvnVerified: mot?.bvn_verified,
    };
  }

  // Dual flags + primary = original signup (earlier side-table)
  const [{ data: motExists }, { data: proExists }] = await Promise.all([
    admin
      .from("motorist_profiles")
      .select("user_id, created_at")
      .eq("user_id", userId)
      .maybeSingle(),
    admin
      .from("repair_pro_profiles")
      .select("user_id, created_at")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  const hasMotorist = Boolean(motExists);
  const hasPro = Boolean(proExists);
  const primaryAccountType = resolvePrimaryAccountType({
    hasMotorist,
    hasPro,
    motoristCreatedAt: (motExists as { created_at?: string } | null)?.created_at,
    proCreatedAt: (proExists as { created_at?: string } | null)?.created_at,
    activeAccountType: accountType,
  });

  const userProfile = profileToUserProfile(profileRow, {
    accountType,
    primaryAccountType,
    ...extras,
  });

  return apiOk({
    userId,
    accountType,
    role,
    hasMotorist,
    hasPro,
    primaryAccountType,
    userProfile,
    profile: {
      id: profileRow.id,
      role: profileRow.role,
      full_name: profileRow.full_name,
      phone: profileRow.phone,
      email: profileRow.email,
      city: profileRow.city,
      area: profileRow.area,
      is_active: profileRow.is_active,
      created_at: profileRow.created_at,
      updated_at: profileRow.updated_at,
      avatar_url: profileRow.avatar_url,
    },
  });
}
