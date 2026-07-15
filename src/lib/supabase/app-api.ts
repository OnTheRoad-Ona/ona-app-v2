"use client";

/**
 * Main-app Supabase data layer (auth, pros, jobs, chat).
 * Falls back gracefully when keys/session missing.
 */

import { MAX_RADIUS_KM } from "@/lib/matching";
import { getAppSupabase, isAppBackendOnline } from "@/lib/supabase/app-client";
import {
  appStatusToJob,
  mapConversationToThread,
  mapProToTechnician,
  mapRequestRow,
  profileToUserProfile,
  resolvePrimaryAccountType,
  type ConversationRow,
  type MessageRow,
} from "@/lib/supabase/mappers";
import type { ProfileRow, RepairProRow, ServiceRequestRow } from "@/lib/supabase/types";
import type {
  AccountType,
  ProService,
  ServiceRequest,
  Technician,
  UserProfile,
  MessageThread,
  RequestStatus,
} from "@/lib/types";
import { isProService } from "@/lib/services";

export { isAppBackendOnline };

function last4(digits: string | undefined): string | null {
  const d = (digits || "").replace(/\D/g, "");
  if (d.length < 4) return null;
  return d.slice(-4);
}

export async function backendSignUp(input: {
  email: string;
  password: string;
  fullName: string;
  phone: string;
  accountType: AccountType;
  city?: string;
  area?: string;
  /** Repair pro */
  businessName?: string;
  primaryService?: ProService;
  services?: ProService[];
  bio?: string;
  yearsExperience?: string;
  serviceRadiusKm?: number;
  lat?: number;
  lng?: number;
  /** Motorist */
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleYear?: string;
  plateNumber?: string;
  vehiclePhoto?: string;
  vehicleCommonIssues?: string[];
  avatarUrl?: string;
  /** Identity (optional at signup) */
  nin?: string;
  bvn?: string;
  labourPrices?: Partial<Record<ProService, number | string>>;
  pricingCurrency?: "NGN" | "USD";
  vehicleFocus?: Record<string, unknown>;
  skillAnswers?: Record<string, unknown>;
  servedVehicleType?: string;
  servedBrand?: string;
  servedModel?: string;
  servedCountry?: string;
  servedLocation?: string;
  emergencyContact?: { name: string; phone: string };
  bankName?: string;
  bankAccountName?: string;
  bankAccountNumber?: string;
  keepOtherRole?: boolean;
}): Promise<{ error: string | null; userId?: string; profile?: UserProfile }> {
  /**
   * Server-side signup (service role, email auto-confirmed).
   * Avoids Supabase browser signUp confirmation emails that hit:
   * "For security purposes, you can only request this after X seconds"
   */
  let res: Response;
  try {
    res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: input.email,
        password: input.password,
        fullName: input.fullName,
        phone: input.phone,
        accountType: input.accountType,
        city: input.city,
        area: input.area,
        businessName: input.businessName,
        primaryService: input.primaryService,
        services: input.services,
        bio: input.bio,
        yearsExperience: input.yearsExperience,
        serviceRadiusKm: input.serviceRadiusKm,
        lat: input.lat,
        lng: input.lng,
        vehicleMake: input.vehicleMake,
        vehicleModel: input.vehicleModel,
        vehicleYear: input.vehicleYear,
        plateNumber: input.plateNumber,
        vehiclePhoto: input.vehiclePhoto,
        vehicleCommonIssues: input.vehicleCommonIssues,
        avatarUrl: input.avatarUrl,
        nin: input.nin,
        bvn: input.bvn,
        labourPrices: input.labourPrices,
        pricingCurrency: input.pricingCurrency,
        vehicleFocus: input.vehicleFocus,
        skillAnswers: input.skillAnswers,
        servedVehicleType: input.servedVehicleType,
        servedBrand: input.servedBrand,
        servedModel: input.servedModel,
        servedCountry: input.servedCountry,
        servedLocation: input.servedLocation,
        emergencyContact: input.emergencyContact,
        bankName: input.bankName,
        bankAccountName: input.bankAccountName,
        bankAccountNumber: input.bankAccountNumber,
        keepOtherRole: input.keepOtherRole !== false,
      }),
    });
  } catch {
    return {
      error:
        "Network error during sign-up. Check your connection and try once more.",
    };
  }

  const json = (await res.json().catch(() => null)) as {
    ok?: boolean;
    error?: { message?: string; code?: string };
    data?: {
      userId?: string;
      session?: {
        access_token: string;
        refresh_token: string;
      } | null;
      profile?: ProfileRow;
      extras?: {
        vehicleMake?: string;
        vehicleModel?: string;
        vehicleYear?: string;
        businessName?: string;
        primaryService?: string;
        bio?: string;
        yearsExperience?: string;
        serviceRadiusKm?: number;
        nin?: string;
        bvn?: string;
        ninVerified?: boolean;
        bvnVerified?: boolean;
      };
      warning?: string;
    };
  } | null;

  if (!json?.ok || !json.data?.userId || !json.data.profile) {
    const msg =
      json?.error?.message ||
      (res.status === 429
        ? "Too many sign-up attempts. Wait about a minute, then try once."
        : "Sign-up failed. Please try again.");
    return { error: msg };
  }

  // Establish browser session so the app is logged in immediately
  const sb = getAppSupabase();
  if (sb && json.data.session?.access_token && json.data.session?.refresh_token) {
    const { error: sessionErr } = await sb.auth.setSession({
      access_token: json.data.session.access_token,
      refresh_token: json.data.session.refresh_token,
    });
    if (sessionErr) {
      // Profile exists; session optional — user can log in
      console.warn("setSession after signup:", sessionErr.message);
    }
  }

  const p = json.data.profile;
  const ex = json.data.extras || {};
  const role = p.role === "repair_pro" ? "repair_pro" : "motorist";
  const hasNin = Boolean(ex.ninVerified);
  const hasBvn = Boolean(ex.bvnVerified);
  const primary =
    ex.primaryService && isProService(ex.primaryService)
      ? (ex.primaryService as ProService)
      : undefined;

  const profile = profileToUserProfile(
    {
      id: p.id,
      role,
      full_name: p.full_name,
      phone: p.phone,
      email: p.email,
      avatar_url: p.avatar_url ?? null,
      city: p.city,
      area: p.area,
      is_active: p.is_active ?? true,
      created_at: p.created_at || new Date().toISOString(),
      updated_at: p.updated_at || new Date().toISOString(),
    },
    {
      accountType: input.accountType,
      password: input.password,
      services: primary ? [primary] : input.primaryService ? [input.primaryService] : undefined,
      businessName: ex.businessName || input.businessName,
      bio: ex.bio || input.bio,
      yearsExperience: ex.yearsExperience || input.yearsExperience,
      serviceRadiusKm: ex.serviceRadiusKm ?? input.serviceRadiusKm,
      vehicleMake: ex.vehicleMake || input.vehicleMake,
      vehicleModel: ex.vehicleModel || input.vehicleModel,
      vehicleYear: ex.vehicleYear || input.vehicleYear,
      idNumber: ex.nin || (hasNin ? input.nin : undefined),
      bvn: ex.bvn || (hasBvn ? input.bvn : undefined),
      ninVerified: hasNin,
      bvnVerified: hasBvn,
      identityVerifiedAt:
        hasNin && hasBvn ? new Date().toISOString() : undefined,
    }
  );

  return { error: null, userId: json.data.userId, profile };
}

/** Persist NIN/BVN verification to Supabase role tables. */
/** Persist profile fields (labour prices, vehicle, bank, etc.) to Supabase. */
export async function backendUpdateProfile(
  accessToken: string,
  patch: Record<string, unknown>
): Promise<string | null> {
  try {
    const res = await fetch("/api/profile/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ access_token: accessToken, ...patch }),
    });
    const json = (await res.json().catch(() => null)) as {
      ok?: boolean;
      error?: { message?: string };
    } | null;
    if (!json?.ok) return json?.error?.message || "Could not save profile";
    return null;
  } catch {
    return "Network error saving profile";
  }
}

export async function backendSaveIdentityVerification(input: {
  userId: string;
  accountType: AccountType;
  nin: string;
  bvn: string;
}): Promise<string | null> {
  const sb = getAppSupabase();
  if (!sb) return "Server is not configured.";
  const nin = input.nin.replace(/\D/g, "");
  const bvn = input.bvn.replace(/\D/g, "");
  const payload = {
    nin_last4: last4(nin),
    bvn_last4: last4(bvn),
    nin_verified: nin.length === 11,
    bvn_verified: bvn.length === 11,
  };
  if (input.accountType === "professional") {
    const { error } = await sb
      .from("repair_pro_profiles")
      .update({
        ...payload,
        verified: payload.nin_verified && payload.bvn_verified,
      })
      .eq("user_id", input.userId);
    return error?.message ?? null;
  }
  const { error } = await sb
    .from("motorist_profiles")
    .update({
      ...payload,
      identity_verified_at:
        payload.nin_verified && payload.bvn_verified
          ? new Date().toISOString()
          : null,
    })
    .eq("user_id", input.userId);
  return error?.message ?? null;
}

/** Phone OTP login — session from server after Africa's Talking code verified */
export async function backendSignInWithPhoneOtp(input: {
  phone: string;
  code: string;
  preferType?: AccountType;
}): Promise<{ error: string | null; profile?: UserProfile; userId?: string }> {
  try {
    const res = await fetch("/api/auth/phone/verify-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: input.phone,
        code: input.code,
        preferType: input.preferType,
      }),
    });
    const json = (await res.json().catch(() => null)) as {
      ok?: boolean;
      error?: { message?: string };
      data?: {
        userId?: string;
        session?: { access_token: string; refresh_token: string };
        userProfile?: UserProfile;
      };
    } | null;

    if (!json?.ok || !json.data?.userId || !json.data.userProfile) {
      return {
        error:
          json?.error?.message ||
          "Phone login failed. Check the code and try again.",
      };
    }

    const sb = getAppSupabase();
    if (
      sb &&
      json.data.session?.access_token &&
      json.data.session?.refresh_token
    ) {
      await sb.auth.setSession({
        access_token: json.data.session.access_token,
        refresh_token: json.data.session.refresh_token,
      });
    }

    return {
      error: null,
      userId: json.data.userId,
      profile: json.data.userProfile,
    };
  } catch {
    return { error: "Network error during phone login." };
  }
}

export async function backendSendPhoneOtp(
  phone: string
): Promise<{ error: string | null }> {
  try {
    const res = await fetch("/api/auth/phone/send-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone }),
    });
    const json = (await res.json().catch(() => null)) as {
      ok?: boolean;
      error?: { message?: string };
    } | null;
    if (!json?.ok) {
      return { error: json?.error?.message || "Could not send code." };
    }
    return { error: null };
  } catch {
    return { error: "Network error sending SMS code." };
  }
}

export async function backendSignIn(
  email: string,
  password: string
): Promise<{ error: string | null; profile?: UserProfile; userId?: string }> {
  const sb = getAppSupabase();
  if (!sb) return { error: "Supabase is not configured." };

  const { data, error } = await sb.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
  if (error) return { error: error.message };
  const userId = data.user?.id;
  if (!userId) return { error: "Login failed." };

  const loaded = await backendLoadUserProfile(userId);
  if (!loaded) return { error: "Profile not found. Complete signup first." };
  return { error: null, profile: loaded, userId };
}

/** Smooth Motorist ↔ Repair Pro switch (same user, updates role on server). */
export async function backendSwitchRole(
  target: AccountType
): Promise<{
  error: string | null;
  /** Present when error is needs_signup */
  message?: string;
  profile?: UserProfile;
  userId?: string;
  hasMotorist?: boolean;
  hasPro?: boolean;
  primaryAccountType?: AccountType;
}> {
  const sb = getAppSupabase();
  if (!sb) return { error: "Supabase is not configured." };

  const { data: sess } = await sb.auth.getSession();
  const token = sess.session?.access_token;
  if (!token) return { error: "Session expired. Please log in again." };

  try {
    const res = await fetch("/api/auth/switch-role", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        access_token: token,
        target,
      }),
    });
    const json = (await res.json().catch(() => null)) as {
      ok?: boolean;
      error?: { message?: string; code?: string };
      data?: {
        userId?: string;
        userProfile?: UserProfile;
        hasMotorist?: boolean;
        hasPro?: boolean;
        primaryAccountType?: AccountType;
      };
    } | null;

    if (!json?.ok || !json.data?.userProfile || !json.data.userId) {
      if (json?.error?.code === "needs_signup") {
        return {
          error: "needs_signup",
          message:
            json.error.message ||
            "Sign up for that role first so it saves to the database.",
        };
      }
      return {
        error: json?.error?.message || "Could not switch account type.",
      };
    }

    return {
      error: null,
      profile: json.data.userProfile,
      userId: json.data.userId,
      hasMotorist: json.data.hasMotorist,
      hasPro: json.data.hasPro,
      primaryAccountType: json.data.primaryAccountType,
    };
  } catch {
    return { error: "Network error while switching account." };
  }
}

/** Whether this user has motorist + pro side profiles (for dual switch UI). */
export async function backendDualRoleFlags(userId: string): Promise<{
  hasMotorist: boolean;
  hasPro: boolean;
  /** Original signup role (earlier side-table), independent of active role */
  primaryAccountType: AccountType;
}> {
  const sb = getAppSupabase();
  if (!sb) {
    return {
      hasMotorist: false,
      hasPro: false,
      primaryAccountType: "motorist",
    };
  }
  const [mot, pro] = await Promise.all([
    sb
      .from("motorist_profiles")
      .select("user_id, created_at")
      .eq("user_id", userId)
      .maybeSingle(),
    sb
      .from("repair_pro_profiles")
      .select("user_id, created_at")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);
  const hasMotorist = Boolean(mot.data);
  const hasPro = Boolean(pro.data);
  return {
    hasMotorist,
    hasPro,
    primaryAccountType: resolvePrimaryAccountType({
      hasMotorist,
      hasPro,
      motoristCreatedAt: (mot.data as { created_at?: string } | null)?.created_at,
      proCreatedAt: (pro.data as { created_at?: string } | null)?.created_at,
    }),
  };
}

export async function backendSignOut(): Promise<void> {
  const sb = getAppSupabase();
  if (!sb) return;
  await sb.auth.signOut();
}

export async function backendGetSessionUserId(): Promise<string | null> {
  const sb = getAppSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session?.user?.id ?? null;
}

export async function backendLoadUserProfile(
  userId: string
): Promise<UserProfile | null> {
  const sb = getAppSupabase();
  if (!sb) return null;
  const { data: profile } = await sb
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (!profile) return null;
  const p = profile as ProfileRow;
  const accountType: AccountType =
    p.role === "repair_pro" ? "professional" : "motorist";

  // Load both side tables so primary = original signup (earlier created_at)
  const [motRes, proRes] = await Promise.all([
    sb.from("motorist_profiles").select("*").eq("user_id", userId).maybeSingle(),
    sb
      .from("repair_pro_profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);
  const mot = motRes.data as {
    vehicle_make?: string | null;
    vehicle_model?: string | null;
    vehicle_year?: string | null;
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
    return profileToUserProfile(p, {
      accountType,
      primaryAccountType,
      services: (pr?.services as ProService[]) ||
        (pr?.primary_service ? [pr.primary_service as ProService] : []),
      businessName: pr?.business_name || undefined,
      bio: pr?.bio || undefined,
      yearsExperience: pr?.years_experience || undefined,
      serviceRadiusKm: pr?.service_radius_km,
      ninVerified: pr?.nin_verified,
      bvnVerified: pr?.bvn_verified,
    });
  }

  return profileToUserProfile(p, {
    accountType,
    primaryAccountType,
    vehicleMake: mot?.vehicle_make || undefined,
    vehicleModel: mot?.vehicle_model || undefined,
    vehicleYear: mot?.vehicle_year || undefined,
    ninVerified: Boolean(mot?.nin_verified),
    bvnVerified: Boolean(mot?.bvn_verified),
    identityVerifiedAt: mot?.identity_verified_at || undefined,
  });
}

export async function backendFetchPros(userCoords: {
  lat: number;
  lng: number;
}): Promise<Technician[]> {
  // Prefer server route (service role) so every approved pro + name reaches the app
  try {
    const qs = new URLSearchParams({
      lat: String(userCoords.lat),
      lng: String(userCoords.lng),
    });
    const res = await fetch(`/api/pros?${qs.toString()}`, {
      method: "GET",
      cache: "no-store",
    });
    const json = (await res.json().catch(() => null)) as {
      ok?: boolean;
      data?: { technicians?: Technician[] };
    } | null;
    if (json?.ok && Array.isArray(json.data?.technicians)) {
      return json.data.technicians;
    }
  } catch {
    /* fall through to client Supabase */
  }

  const sb = getAppSupabase();
  if (!sb) return [];

  // Client fallback: same rules as /api/pros (Live + repair_pro role only)
  const { data: pros, error } = await sb
    .from("repair_pro_profiles")
    .select("*")
    .eq("status", "approved")
    .eq("is_online", true)
    .limit(200);

  if (error || !pros?.length) return [];

  const ids = pros.map((p) => (p as RepairProRow).user_id);
  const { data: profiles } = await sb
    .from("profiles")
    .select("*")
    .in("id", ids)
    .eq("is_active", true)
    .eq("role", "repair_pro");

  const byId = new Map(
    (profiles as ProfileRow[] | null)?.map((p) => [p.id, p]) ?? []
  );

  return (pros as RepairProRow[])
    .filter((pro) => byId.has(pro.user_id))
    .map((pro) =>
      mapProToTechnician(pro, byId.get(pro.user_id) ?? null, userCoords)
    )
    .filter(
      (t) =>
        typeof t.distanceKm === "number" &&
        Number.isFinite(t.distanceKm) &&
        t.distanceKm <= MAX_RADIUS_KM
    );
}

export async function backendSetProOnline(
  userId: string,
  online: boolean,
  coords?: { lat: number; lng: number }
): Promise<string | null> {
  const sb = getAppSupabase();
  if (!sb) return "Backend offline";
  const patch: Record<string, unknown> = { is_online: online };
  if (coords) {
    patch.lat = coords.lat;
    patch.lng = coords.lng;
  }
  const { error } = await sb
    .from("repair_pro_profiles")
    .update(patch)
    .eq("user_id", userId);
  return error?.message ?? null;
}

export async function backendCreateJob(input: {
  motoristId: string;
  repairProId: string;
  serviceType: ProService;
  description: string;
  lat: number;
  lng: number;
  address: string;
  radiusKm: number;
}): Promise<{ error: string | null; request?: ServiceRequest }> {
  const sb = getAppSupabase();
  if (!sb) return { error: "Backend offline" };

  const { data, error } = await sb
    .from("service_requests")
    .insert({
      motorist_id: input.motoristId,
      repair_pro_id: input.repairProId,
      service_type: input.serviceType,
      status: "requested",
      description: input.description,
      pickup_lat: input.lat,
      pickup_lng: input.lng,
      pickup_address: input.address,
      radius_km: input.radiusKm,
    })
    .select("*")
    .single();

  if (error || !data) return { error: error?.message || "Could not create job" };

  const { data: proProfile } = await sb
    .from("profiles")
    .select("full_name")
    .eq("id", input.repairProId)
    .maybeSingle();

  return {
    error: null,
    request: mapRequestRow(
      data as ServiceRequestRow,
      (proProfile as { full_name?: string } | null)?.full_name
    ),
  };
}

export async function backendUpdateJobStatus(
  requestId: string,
  status: RequestStatus,
  actorId: string
): Promise<string | null> {
  const sb = getAppSupabase();
  if (!sb) return "Backend offline";
  const jobStatus = appStatusToJob(status);
  const patch: Record<string, unknown> = { status: jobStatus };
  if (jobStatus === "accepted") {
    patch.accepted_at = new Date().toISOString();
    patch.repair_pro_id = actorId;
  }
  if (jobStatus === "completed") patch.completed_at = new Date().toISOString();
  if (jobStatus === "cancelled") patch.cancelled_at = new Date().toISOString();

  const { error } = await sb
    .from("service_requests")
    .update(patch)
    .eq("id", requestId);
  if (error) return error.message;

  await sb.from("job_status_events").insert({
    request_id: requestId,
    status: jobStatus,
    actor_id: actorId,
  });
  return null;
}

export async function backendFetchJobsForUser(
  userId: string,
  role: AccountType
): Promise<ServiceRequest[]> {
  const sb = getAppSupabase();
  if (!sb) return [];

  let q = sb.from("service_requests").select("*").order("created_at", {
    ascending: false,
  });
  if (role === "motorist") q = q.eq("motorist_id", userId);
  else q = q.or(`repair_pro_id.eq.${userId},status.in.(requested,matched)`);

  const { data, error } = await q.limit(50);
  if (error || !data) return [];

  const proIds = [
    ...new Set(
      (data as ServiceRequestRow[])
        .map((r) => r.repair_pro_id)
        .filter(Boolean) as string[]
    ),
  ];
  const names = new Map<string, string>();
  if (proIds.length) {
    const { data: profiles } = await sb
      .from("profiles")
      .select("id, full_name")
      .in("id", proIds);
    for (const p of profiles || []) {
      names.set(
        (p as { id: string; full_name: string }).id,
        (p as { id: string; full_name: string }).full_name
      );
    }
  }

  return (data as ServiceRequestRow[]).map((r) =>
    mapRequestRow(r, r.repair_pro_id ? names.get(r.repair_pro_id) : undefined)
  );
}

export async function backendEnsureConversation(input: {
  requestId: string;
  motoristId: string;
  repairProId: string;
}): Promise<{ error: string | null; conversationId?: string }> {
  const sb = getAppSupabase();
  if (!sb) return { error: "Backend offline" };

  const { data: existing } = await sb
    .from("conversations")
    .select("id")
    .eq("request_id", input.requestId)
    .maybeSingle();
  if (existing?.id) return { error: null, conversationId: existing.id as string };

  const { data, error } = await sb
    .from("conversations")
    .insert({
      request_id: input.requestId,
      motorist_id: input.motoristId,
      repair_pro_id: input.repairProId,
      last_message_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message || "Chat create failed" };

  await sb.from("messages").insert({
    conversation_id: data.id,
    sender_id: input.motoristId,
    body: "Chat opened for this job.",
  });

  return { error: null, conversationId: data.id as string };
}

export async function backendFetchConversations(
  userId: string,
  role: AccountType
): Promise<MessageThread[]> {
  const sb = getAppSupabase();
  if (!sb) return [];

  const col = role === "professional" ? "repair_pro_id" : "motorist_id";
  const { data: convs, error } = await sb
    .from("conversations")
    .select("*")
    .eq(col, userId)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(40);
  if (error || !convs?.length) return [];

  const convList = convs as ConversationRow[];
  const convIds = convList.map((c) => c.id);
  const peopleIds = [
    ...new Set(convList.flatMap((c) => [c.motorist_id, c.repair_pro_id])),
  ];
  const requestIds = convList
    .map((c) => c.request_id)
    .filter(Boolean) as string[];

  // Batch-fetch related rows (avoids N+1 lag)
  const [{ data: allMsgs }, { data: names }, { data: jobs }] =
    await Promise.all([
      sb
        .from("messages")
        .select("*")
        .in("conversation_id", convIds)
        .order("created_at", { ascending: true })
        .limit(500),
      sb
        .from("profiles")
        .select("id, full_name, avatar_url")
        .in("id", peopleIds),
      requestIds.length
        ? sb
            .from("service_requests")
            .select("id, service_type")
            .in("id", requestIds)
        : Promise.resolve({ data: [] as { id: string; service_type: string }[] }),
    ]);

  const byId = new Map(
    (
      names as
        | { id: string; full_name: string; avatar_url: string | null }[]
        | null
    )?.map((n) => [n.id, n]) ?? []
  );
  const jobById = new Map(
    (
      jobs as { id: string; service_type: string }[] | null
    )?.map((j) => [j.id, j.service_type]) ?? []
  );
  const msgsByConv = new Map<string, MessageRow[]>();
  for (const m of (allMsgs as MessageRow[]) || []) {
    const arr = msgsByConv.get(m.conversation_id) || [];
    arr.push(m);
    msgsByConv.set(m.conversation_id, arr);
  }

  return convList.map((c) =>
    mapConversationToThread(
      c,
      msgsByConv.get(c.id) || [],
      {
        motoristName: byId.get(c.motorist_id)?.full_name || "Motorist",
        technicianName: byId.get(c.repair_pro_id)?.full_name || "Repair Pro",
        serviceType: (c.request_id
          ? (jobById.get(c.request_id) as ProService | undefined)
          : undefined) || "mechanic",
        photo: byId.get(c.repair_pro_id)?.avatar_url || "",
      },
      userId
    )
  );
}

export async function backendSendMessage(input: {
  conversationId: string;
  senderId: string;
  body: string;
}): Promise<string | null> {
  const sb = getAppSupabase();
  if (!sb) return "Backend offline";
  const { error } = await sb.from("messages").insert({
    conversation_id: input.conversationId,
    sender_id: input.senderId,
    body: input.body,
  });
  if (error) return error.message;
  await sb
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", input.conversationId);
  return null;
}

/** Subscribe to new messages in a conversation (Realtime). */
export function backendSubscribeMessages(
  conversationId: string,
  onInsert: (row: MessageRow) => void
): (() => void) | null {
  const sb = getAppSupabase();
  if (!sb) return null;
  const channel = sb
    .channel(`messages:${conversationId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) => {
        onInsert(payload.new as MessageRow);
      }
    )
    .subscribe();
  return () => {
    void sb.removeChannel(channel);
  };
}

/** Subscribe to service request updates for multi-device job status. */
export function backendSubscribeJobs(
  userId: string,
  onChange: () => void
): (() => void) | null {
  const sb = getAppSupabase();
  if (!sb) return null;
  const channel = sb
    .channel(`jobs:${userId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "service_requests" },
      () => onChange()
    )
    .subscribe();
  return () => {
    void sb.removeChannel(channel);
  };
}

/** Subscribe to pro location/online changes for map. */
export function backendSubscribePros(onChange: () => void): (() => void) | null {
  const sb = getAppSupabase();
  if (!sb) return null;
  const channel = sb
    .channel("pros:live")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "repair_pro_profiles" },
      () => onChange()
    )
    .subscribe();
  return () => {
    void sb.removeChannel(channel);
  };
}
