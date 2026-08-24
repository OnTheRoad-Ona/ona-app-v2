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
import {
  ensureUserRole,
  listUserRoles,
  syncPayoutAcrossRoles,
} from "@/lib/server/identity/identity-sync";
import { dbRoleToAccountType } from "@/lib/dual-role";
import type { ProfileRow, RepairProRow } from "@/lib/supabase/types";
import type { AccountType, ProService, UserProfile } from "@/lib/types";
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
    parsed.data.access_token,
  );
  if (userErr || !userData.user) {
    return apiFail(
      "Your login session needs a refresh. Try again, or sign in once more.",
      401,
      "session_expired",
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

  // Admin freeze / deactivation is hard never auto-revive on role switch
  if (!existing.is_active) {
    return apiFail("This account is deactivated. Contact support.", 403);
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
        "needs_signup",
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
        "needs_signup",
      );
    }
  }

  // Track switch for Care admin + dual-role analytics (DB-synced)
  const prevRole = existing.role as string;
  const isActualSwitch = prevRole !== role;
  const existingPrimary =
    (existing as { primary_role?: string | null }).primary_role || null;
  const prevCount = Number(
    (existing as { role_switch_count?: number | null }).role_switch_count || 0,
  );
  const profilePatch: Record<string, unknown> = { role };
  if (!existingPrimary) {
    // First time we see a switch/patch: lock original as previous (or current if same)
    profilePatch.primary_role = prevRole === "admin" ? role : prevRole;
  }
  if (isActualSwitch) {
    profilePatch.last_role_switch_at = new Date().toISOString();
    profilePatch.role_switch_count = prevCount + 1;
  }

  let profileAfter: ProfileRow | null = null;
  {
    const { data: updated, error: updErr } = await admin
      .from("profiles")
      .update(profilePatch)
      .eq("id", userId)
      .select("*")
      .single();
    if (!updErr && updated) {
      profileAfter = updated as ProfileRow;
    } else {
      // Columns may be missing before migration fall back to role-only
      const { data: fallback, error: fbErr } = await admin
        .from("profiles")
        .update({ role })
        .eq("id", userId)
        .select("*")
        .single();
      if (fbErr || !fallback) {
        return apiFail(
          updErr?.message || fbErr?.message || "Could not switch role",
          500,
        );
      }
      profileAfter = fallback as ProfileRow;
    }
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

  // Unified identity: keep the role registry + canonical bank in sync so a
  // bank entered on one role is reused by the other without re-entry.
  await ensureUserRole(admin, userId, role, {
    userId,
    source: "switch_role",
  });
  await syncPayoutAcrossRoles(admin, userId, { userId, source: "switch_role" });

  const profileRow = profileAfter;
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
    phoneVerified?: boolean;
    docsStatus?: UserProfile["docsStatus"];
    govIdVerified?: boolean;
    identityReviewStatus?: UserProfile["identityReviewStatus"];
    identityVerifiedAt?: string;
    identitySubmittedAt?: string;
    govIdKind?: string;
    govIdFrontUrl?: string;
    bankName?: string;
    bankAccountName?: string;
    bankAccountNumber?: string;
    bankCode?: string;
  } = {};

  // Load both side tables so bank can be merged either way on switch
  const [{ data: pro }, { data: mot }] = await Promise.all([
    admin
      .from("repair_pro_profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle(),
    admin
      .from("motorist_profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);
  const pr = pro as RepairProRow | null;
  const motRow = mot as {
    vehicle_make?: string | null;
    vehicle_model?: string | null;
    vehicle_year?: string | null;
    nin_verified?: boolean;
    bvn_verified?: boolean;
    phone_verified?: boolean;
    gov_id_verified?: boolean;
    identity_review_status?: string | null;
    identity_verified_at?: string | null;
    identity_submitted_at?: string | null;
    gov_id_kind?: string | null;
    gov_id_front_url?: string | null;
    bank_name?: string | null;
    bank_account_name?: string | null;
    bank_account_number?: string | null;
    bank_code?: string | null;
  } | null;
  const proBank = pr as {
    bank_name?: string | null;
    bank_account_name?: string | null;
    bank_account_number?: string | null;
    bank_code?: string | null;
    phone_verified?: boolean;
    docs_status?: string | null;
  } | null;

  // Shared identity phone flag (must survive Tap to Switch)
  const phoneVerified = Boolean(
    (profileRow as { phone_verified?: boolean }).phone_verified ||
    motRow?.phone_verified ||
    proBank?.phone_verified,
  );

  // Customer identity (T2) must survive C→Pro switch so Pro does not re-ask ID
  const motIdentityStatus = motRow?.identity_review_status;
  const identityStatus: UserProfile["identityReviewStatus"] | undefined =
    motIdentityStatus === "none" ||
    motIdentityStatus === "submitted" ||
    motIdentityStatus === "approved" ||
    motIdentityStatus === "rejected"
      ? motIdentityStatus
      : undefined;
  const identityFromCustomer: {
    govIdVerified: boolean;
    identityReviewStatus?: UserProfile["identityReviewStatus"];
    identityVerifiedAt?: string;
    identitySubmittedAt?: string;
    govIdKind?: string;
    govIdFrontUrl?: string;
  } = {
    govIdVerified: Boolean(motRow?.gov_id_verified),
    identityReviewStatus: identityStatus,
    identityVerifiedAt: motRow?.identity_verified_at || undefined,
    identitySubmittedAt: motRow?.identity_submitted_at || undefined,
    govIdKind: motRow?.gov_id_kind || undefined,
    govIdFrontUrl: motRow?.gov_id_front_url || undefined,
  };

  if (accountType === "professional") {
    const ds = proBank?.docs_status;
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
      // Prefer pro flags; fall back to customer NIN/BVN when pro not set
      ninVerified: pr?.nin_verified || motRow?.nin_verified,
      bvnVerified: pr?.bvn_verified || motRow?.bvn_verified,
      phoneVerified,
      docsStatus:
        ds === "none" ||
        ds === "under_review" ||
        ds === "approved" ||
        ds === "rejected"
          ? ds
          : undefined,
      // Carry Customer T2 identity so Pro onboarding can skip gov ID
      ...identityFromCustomer,
      // Prefer pro bank; fall back to customer bank on same login
      bankName: proBank?.bank_name || motRow?.bank_name || undefined,
      bankAccountName:
        proBank?.bank_account_name || motRow?.bank_account_name || undefined,
      bankAccountNumber:
        proBank?.bank_account_number ||
        motRow?.bank_account_number ||
        undefined,
      bankCode: proBank?.bank_code || motRow?.bank_code || undefined,
    };
  } else {
    extras = {
      vehicleMake: motRow?.vehicle_make || undefined,
      vehicleModel: motRow?.vehicle_model || undefined,
      vehicleYear: motRow?.vehicle_year || undefined,
      ninVerified: motRow?.nin_verified,
      bvnVerified: motRow?.bvn_verified,
      phoneVerified,
      ...identityFromCustomer,
      bankName: motRow?.bank_name || proBank?.bank_name || undefined,
      bankAccountName:
        motRow?.bank_account_name || proBank?.bank_account_name || undefined,
      bankAccountNumber:
        motRow?.bank_account_number ||
        proBank?.bank_account_number ||
        undefined,
      bankCode: motRow?.bank_code || proBank?.bank_code || undefined,
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
  const storedPrimary = dbRoleToAccountType(
    (profileRow as ProfileRow).primary_role,
  );
  const primaryAccountType =
    storedPrimary ||
    resolvePrimaryAccountType({
      hasMotorist,
      hasPro,
      motoristCreatedAt: (motExists as { created_at?: string } | null)
        ?.created_at,
      proCreatedAt: (proExists as { created_at?: string } | null)?.created_at,
      activeAccountType: accountType,
    });

  const lastRoleSwitchAt =
    (profileRow as ProfileRow).last_role_switch_at || undefined;
  const roleSwitchCount = Number(
    (profileRow as ProfileRow).role_switch_count || 0,
  );

  const userProfile = profileToUserProfile(profileRow, {
    accountType,
    primaryAccountType,
    dualRole: hasMotorist && hasPro,
    lastRoleSwitchAt,
    roleSwitchCount,
    ...extras,
  });

  const roles = await listUserRoles(admin, userId);

  return apiOk({
    userId,
    accountType,
    role,
    roles,
    hasMotorist,
    hasPro,
    dualRole: hasMotorist && hasPro,
    primaryAccountType,
    lastRoleSwitchAt: lastRoleSwitchAt || null,
    roleSwitchCount,
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
