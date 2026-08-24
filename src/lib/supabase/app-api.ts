"use client";

/**
 * Main-app Supabase data layer (auth, pros, jobs, chat).
 * Falls back gracefully when keys/session missing.
 */

import { hasRecentLiveHeartbeat, MAX_RADIUS_KM } from "@/lib/matching";
import { DOCS_PENDING_MAX_RADIUS_KM } from "@/lib/skill-questions";
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
import type {
  ProfileRow,
  RepairProRow,
  ServiceRequestRow,
} from "@/lib/supabase/types";
import type {
  AccountType,
  ProService,
  ServiceRequest,
  Technician,
  UserProfile,
  MessageThread,
  RequestStatus,
} from "@/lib/types";
import { isProService } from "@/lib/pro-service-id";
import { isSyntheticAccount } from "@/lib/server/synthetic-accounts";
import {
  apiVerifyIdemOp,
  clearIdemKey,
  getOrCreateIdemKey,
} from "@/lib/jobs/idempotency";

export { isAppBackendOnline };
export type { MessageRow };

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
  gender: "male" | "female" | "prefer_not_to_say";
  dateOfBirth: string;
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
  /** Unlimited motorist vehicles (JSON) */
  vehicles?: import("@/lib/types").MotoristVehicle[];
  avatarUrl?: string;
  /** Identity (optional at signup) */
  nin?: string;
  bvn?: string;
  labourPrices?: Partial<Record<ProService, number | string>>;
  pricingCurrency?: import("@/lib/pricing").AppCurrency;
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
  bankCode?: string;
  keepOtherRole?: boolean;
  guarantor?: UserProfile["guarantor"];
  docsStatus?: UserProfile["docsStatus"];
  certificationFileName?: string;
  certificationFileDataUrl?: string;
  refCode?: string;
  /** Dual-role: bind new role to this session identity */
  access_token?: string;
}): Promise<{ error: string | null; userId?: string; profile?: UserProfile }> {
  /**
   * Server-side signup (service role, email auto-confirmed).
   * Avoids Supabase browser signUp confirmation emails that hit:
   * "For security purposes, you can only request this after X seconds"
   */
  // Prefer live session token so dual-role always attaches to the signed-in user
  let accessToken = input.access_token;
  if (!accessToken) {
    try {
      const { ensureAppSession } = await import("@/lib/supabase/session");
      const s = await ensureAppSession();
      accessToken = s?.accessToken;
    } catch {
      /* guest signup */
    }
  }

  let res: Response;
  try {
    res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(accessToken
          ? {
              Authorization: `Bearer ${accessToken}`,
              "x-access-token": accessToken,
            }
          : {}),
      },
      body: JSON.stringify({
        email: input.email,
        password: input.password,
        fullName: input.fullName,
        phone: input.phone,
        accountType: input.accountType,
        gender: input.gender,
        dateOfBirth: input.dateOfBirth,
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
        vehicles: input.vehicles,
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
        bankCode: input.bankCode,
        guarantor: input.guarantor,
        keepOtherRole: input.keepOtherRole !== false,
        refCode: input.refCode,
        docsStatus: input.docsStatus,
        certificationFileName: input.certificationFileName,
        certificationFileDataUrl: input.certificationFileDataUrl,
        access_token: accessToken,
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
        vehicles?: import("@/lib/types").MotoristVehicle[];
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
  if (
    sb &&
    json.data.session?.access_token &&
    json.data.session?.refresh_token
  ) {
    const { error: sessionErr } = await sb.auth.setSession({
      access_token: json.data.session.access_token,
      refresh_token: json.data.session.refresh_token,
    });
    if (sessionErr) {
      // Fallback: password sign-in so signup never leaves user "not signed in"
      const { error: loginErr } = await sb.auth.signInWithPassword({
        email: input.email.trim().toLowerCase(),
        password: input.password,
      });
      if (loginErr) {
        console.warn(
          "session after signup:",
          sessionErr.message,
          loginErr.message,
        );
      }
    }
  } else if (sb && json.data.userId) {
    // Account saved but no session tokens try password login once
    const { error: loginErr } = await sb.auth.signInWithPassword({
      email: input.email.trim().toLowerCase(),
      password: input.password,
    });
    if (loginErr) {
      console.warn("login after signup:", loginErr.message);
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
      gender: p.gender ?? input.gender,
      date_of_birth: p.date_of_birth ?? input.dateOfBirth,
      is_active: p.is_active ?? true,
      created_at: p.created_at || new Date().toISOString(),
      updated_at: p.updated_at || new Date().toISOString(),
    },
    {
      accountType: input.accountType,
      password: input.password,
      services: primary
        ? [primary]
        : input.primaryService
          ? [input.primaryService]
          : undefined,
      businessName: ex.businessName || input.businessName,
      bio: ex.bio || input.bio,
      yearsExperience: ex.yearsExperience || input.yearsExperience,
      serviceRadiusKm: ex.serviceRadiusKm ?? input.serviceRadiusKm,
      vehicleMake: ex.vehicleMake || input.vehicleMake,
      vehicleModel: ex.vehicleModel || input.vehicleModel,
      vehicleYear: ex.vehicleYear || input.vehicleYear,
      vehicles:
        (Array.isArray(ex.vehicles) && ex.vehicles.length
          ? ex.vehicles
          : input.vehicles) || undefined,
      idNumber: ex.nin || (hasNin ? input.nin : undefined),
      bvn: ex.bvn || (hasBvn ? input.bvn : undefined),
      ninVerified: hasNin,
      bvnVerified: hasBvn,
      identityVerifiedAt:
        hasNin && hasBvn ? new Date().toISOString() : undefined,
      docsStatus: input.docsStatus,
      certificationFileName: input.certificationFileName,
      certificationFileDataUrl: input.certificationFileDataUrl,
      skillAnswers: input.skillAnswers as UserProfile["skillAnswers"],
    },
  );

  return { error: null, userId: json.data.userId, profile };
}

/** Persist NIN/BVN verification to Supabase role tables. */
/** Persist profile fields (labour prices, vehicle, bank, etc.) to Supabase. */
export async function backendUpdateProfile(
  accessToken: string,
  patch: Record<string, unknown>,
): Promise<string | null> {
  const { ensureAppSession, SESSION_RELOGIN_MESSAGE } =
    await import("@/lib/supabase/session");
  try {
    // Prefer a freshly refreshed token over a possibly stale caller token
    const session = await ensureAppSession();
    const token = session?.accessToken || accessToken;
    const res = await fetch("/api/profile/update", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "x-access-token": token,
      },
      body: JSON.stringify({ access_token: token, ...patch }),
    });
    const json = (await res.json().catch(() => null)) as {
      ok?: boolean;
      error?: { message?: string; code?: string };
    } | null;
    if (!json?.ok) {
      if (json?.error?.code === "session_expired") {
        // One more refresh + retry
        const again = await ensureAppSession({
          refreshIfExpiresWithinMs: 3_600_000,
        });
        if (again?.accessToken) {
          const retry = await fetch("/api/profile/update", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${again.accessToken}`,
              "x-access-token": again.accessToken,
            },
            body: JSON.stringify({
              access_token: again.accessToken,
              ...patch,
            }),
          });
          const retryJson = (await retry.json().catch(() => null)) as {
            ok?: boolean;
            error?: { message?: string; code?: string };
          } | null;
          if (retryJson?.ok) return null;
        }
        return SESSION_RELOGIN_MESSAGE;
      }
      if (json?.error?.code === "bank_account_in_use") {
        return (
          json.error.message ||
          "This bank is already used on another Ona account."
        );
      }
      return json?.error?.message || "Could not save profile";
    }
    return null;
  } catch {
    return "Network error saving profile";
  }
}

export async function backendSaveIdentityVerification(input: {
  userId: string;
  accountType: AccountType;
  nin?: string;
  bvn?: string;
  /** Non-NG primary ID (any charset) last4 stored if no digits */
  primaryId?: string;
  bankId?: string;
  identityVerified?: boolean;
  countryIso?: string;
  govIdKind?: string;
  govIdFrontUrl?: string;
  govIdBackUrl?: string;
  accessToken?: string | null;
}): Promise<string | null> {
  // Customer submit → dedicated API so admin Customer review always sees a row
  if (
    input.accountType === "motorist" &&
    !input.identityVerified &&
    input.accessToken
  ) {
    try {
      const res = await fetch("/api/verify/customer-id", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          access_token: input.accessToken,
          primaryId: input.primaryId || input.nin || "",
          bankId: input.bankId || input.bvn || undefined,
          countryIso: input.countryIso,
          govIdKind: input.govIdKind,
          govIdFrontUrl: input.govIdFrontUrl,
          govIdBackUrl: input.govIdBackUrl,
        }),
      });
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: { message?: string };
      } | null;
      if (!json?.ok) {
        return json?.error?.message || "Could not submit ID for review.";
      }
      return null;
    } catch {
      return "Network error submitting ID.";
    }
  }

  const sb = getAppSupabase();
  if (!sb) return "Server is not configured.";
  const nin = (input.nin || input.primaryId || "").replace(/\D/g, "");
  const bvn = (input.bvn || input.bankId || "").replace(/\D/g, "");
  const primaryRaw = (input.primaryId || input.nin || "").trim();
  const verified =
    input.identityVerified ??
    (nin.length === 11 && (bvn.length === 11 || !input.bvn));
  const last4Any = (raw: string) => {
    const d = last4(raw);
    if (d) return d;
    const alnum = raw.replace(/\W/g, "");
    return alnum.length >= 4 ? alnum.slice(-4) : null;
  };
  const payload = {
    nin_last4: last4(nin) || last4Any(primaryRaw),
    bvn_last4: last4(bvn) || (input.bankId ? last4Any(input.bankId) : null),
    nin_verified: Boolean(
      verified && (nin.length >= 4 || primaryRaw.length >= 4),
    ),
    bvn_verified:
      bvn.length === 11
        ? true
        : Boolean(verified && !input.bvn && !input.bankId),
  };
  if (input.accountType === "professional") {
    const { error } = await sb
      .from("repair_pro_profiles")
      .update({
        ...payload,
        verified: payload.nin_verified,
      })
      .eq("user_id", input.userId);
    return error?.message ?? null;
  }
  const now = new Date().toISOString();
  const motoristPayload = {
    ...payload,
    identity_verified_at: verified ? now : null,
    // Best-effort on columns that exist after migration 027
    identity_review_status: verified ? "approved" : "submitted",
    identity_submitted_at: now,
    gov_id_kind: input.govIdKind || null,
    gov_id_front_url: input.govIdFrontUrl || null,
  };
  const { data: updated, error } = await sb
    .from("motorist_profiles")
    .update(motoristPayload)
    .eq("user_id", input.userId)
    .select("user_id");
  if (error) {
    // Retry without new columns if migration not applied yet
    if (
      error.message.includes("identity_review_status") ||
      error.message.includes("gov_id")
    ) {
      const { error: e2 } = await sb
        .from("motorist_profiles")
        .update({
          ...payload,
          identity_verified_at: verified ? now : null,
        })
        .eq("user_id", input.userId);
      return e2?.message ?? null;
    }
    return error.message;
  }
  if (!updated?.length) {
    const { error: insErr } = await sb.from("motorist_profiles").insert({
      user_id: input.userId,
      ...motoristPayload,
    });
    if (insErr) {
      const { error: e2 } = await sb.from("motorist_profiles").insert({
        user_id: input.userId,
        ...payload,
        identity_verified_at: verified ? now : null,
      });
      return e2?.message ?? null;
    }
  }
  return null;
}

/** Phone/email OTP login session after code verified (demo 336699 always ok). */
export async function backendSignInWithOtp(input: {
  channel: "phone" | "email";
  target: string;
  code: string;
  preferType?: AccountType;
}): Promise<{ error: string | null; profile?: UserProfile; userId?: string }> {
  try {
    const res = await fetch("/api/auth/otp/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channel: input.channel,
        target: input.target,
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
          json?.error?.message || "Login failed. Check the code and try again.",
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
    return { error: "Network error during code login." };
  }
}

/** @deprecated use backendSignInWithOtp */
export async function backendSignInWithPhoneOtp(input: {
  phone: string;
  code: string;
  preferType?: AccountType;
}): Promise<{ error: string | null; profile?: UserProfile; userId?: string }> {
  return backendSignInWithOtp({
    channel: "phone",
    target: input.phone,
    code: input.code,
    preferType: input.preferType,
  });
}

export type BackendSendOtpResult = {
  error: string | null;
  message?: string;
  demoCode?: string;
  /**
   * True when the outcome was genuinely unproven (response lost, nothing
   * conclusive from the ledger). UI must show a neutral outcome and offer
   * a resend never a hard failure.
   */
  maybeSent?: boolean;
};

type OtpSendResponse = {
  ok?: boolean;
  error?: { message?: string };
  data?: { message?: string; demoCode?: string; pending?: boolean };
};

export async function backendSendOtp(
  input: { channel: "phone" | "email"; target: string },
  opts?: { forceResend?: boolean },
): Promise<BackendSendOtpResult> {
  // One sticker per (channel, target). A lost-response retry reuses it so
  // the server replays "already sent" (no second SMS, no code rotation).
  // A deliberate resend (forceResend) clears it so a fresh code goes out.
  const actorId = input.target.trim().toLowerCase();
  const intentKey = `otp|${input.channel}|${actorId}`;
  if (opts?.forceResend) clearIdemKey(intentKey);
  const opKey = getOrCreateIdemKey(intentKey);

  let res: Response | null = null;
  let parsed: OtpSendResponse | null = null;
  try {
    res = await fetch("/api/auth/otp/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channel: input.channel,
        target: input.target,
        opKey,
        opActorId: actorId,
      }),
    });
    parsed = (await res.json().catch(() => null)) as OtpSendResponse | null;
  } catch {
    /* response lost verify below */
  }

  // Clean server answer (non-ambiguous) trust it.
  const settled = res && parsed ? parsed : null;
  if (settled) {
    if (!settled.ok) {
      return { error: settled.error?.message || "Could not send code." };
    }
    if (settled.data?.pending) {
      // A twin is still settling verify before reporting anything.
      return settleSend(opKey, input.channel, actorId, intentKey);
    }
    clearIdemKey(intentKey);
    return {
      error: null,
      message: settled.data?.message,
      demoCode: settled.data?.demoCode,
    };
  }

  // Lost response find out what actually happened.
  return settleSend(opKey, input.channel, actorId, intentKey);
}

async function settleSend(
  opKey: string | null,
  channel: "phone" | "email",
  actorId: string,
  intentKey: string,
): Promise<BackendSendOtpResult> {
  if (!opKey) {
    // Storage unavailable no sticker means no dedupe; stay neutral.
    return { error: null, maybeSent: true };
  }
  const v = await apiVerifyIdemOp({ opKey, actorKind: channel, actorId });
  if (v.status === "done") {
    // It really went through report success, never "send code again".
    clearIdemKey(intentKey);
    const result = (v.result as { message?: string } | null) || null;
    return { error: null, message: result?.message || "Code sent." };
  }
  if (v.status === "error") {
    return { error: v.error || "Could not send code." };
  }
  // Unproven neutral outcome, offer a resend.
  return { error: null, maybeSent: true };
}

export async function backendSendPhoneOtp(
  phone: string,
): Promise<{ error: string | null; message?: string }> {
  return backendSendOtp({ channel: "phone", target: phone });
}

/** Verify OTP for profile changes (no session created). */
export async function backendProfileVerifyOtp(input: {
  channel: "phone" | "email";
  target: string;
  code: string;
}): Promise<{ error: string | null; verified?: boolean }> {
  try {
    const res = await fetch("/api/auth/otp/profile-verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channel: input.channel,
        target: input.target,
        code: input.code,
      }),
    });
    const json = (await res.json().catch(() => null)) as {
      ok?: boolean;
      error?: { message?: string };
      data?: { verified?: boolean };
    } | null;
    if (!json?.ok || !json.data?.verified) {
      return { error: json?.error?.message || "Verification failed." };
    }
    return { error: null, verified: true };
  } catch {
    return { error: "Network error during verification." };
  }
}

export async function backendSignIn(
  email: string,
  password: string,
): Promise<{
  error: string | null;
  profile?: UserProfile;
  userId?: string;
  hasMotorist?: boolean;
  hasPro?: boolean;
  primaryAccountType?: AccountType;
}> {
  const cleanEmail = email.trim().toLowerCase();

  // Prefer server login (service-role profile + repair) fixes Vercel/RLS login failures
  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: cleanEmail, password }),
    });
    const json = (await res.json().catch(() => null)) as {
      ok?: boolean;
      error?: { message?: string };
      data?: {
        userId?: string;
        profile?: UserProfile;
        hasMotorist?: boolean;
        hasPro?: boolean;
        primaryAccountType?: AccountType;
        access_token?: string;
        refresh_token?: string;
      };
    } | null;

    if (json?.ok && json.data?.userId && json.data.profile) {
      const sb = getAppSupabase();
      if (sb && json.data.access_token && json.data.refresh_token) {
        const { error: sessErr } = await sb.auth.setSession({
          access_token: json.data.access_token,
          refresh_token: json.data.refresh_token,
        });
        if (sessErr) {
          console.warn("setSession after login", sessErr.message);
        }
      }
      return {
        error: null,
        profile: json.data.profile,
        userId: json.data.userId,
        hasMotorist: json.data.hasMotorist,
        hasPro: json.data.hasPro,
        primaryAccountType: json.data.primaryAccountType,
      };
    }

    if (json?.error?.message) {
      return { error: json.error.message };
    }
  } catch {
    /* fall through to browser auth */
  }

  // Fallback: pure browser sign-in (local / offline edge cases)
  const sb = getAppSupabase();
  if (!sb) return { error: "Supabase is not configured." };

  const { data, error } = await sb.auth.signInWithPassword({
    email: cleanEmail,
    password,
  });
  if (error) {
    const m = error.message.toLowerCase();
    if (m.includes("invalid login") || m.includes("invalid credentials")) {
      return { error: "Email or password is incorrect." };
    }
    return { error: error.message };
  }
  const userId = data.user?.id;
  if (!userId) return { error: "Login failed." };

  const loaded = await backendLoadUserProfile(userId);
  if (!loaded) {
    return {
      error: "Profile not found after login. Try again or contact support.",
    };
  }
  return { error: null, profile: loaded, userId };
}

/** Smooth Motorist ↔ Repair Pro switch (same user, updates role on server). */
export async function backendSwitchRole(target: AccountType): Promise<{
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

  const { ensureAppSession, SESSION_RELOGIN_MESSAGE } =
    await import("@/lib/supabase/session");
  // Wait for storage rehydrate: after navigation / cold start getSession can
  // be empty for a moment, which made the FIRST "Use as" tap fail and only a
  // manual re-tap succeed. The retry worked because the session had rehydrated.
  const session = await ensureAppSession({
    waitForSessionMs: 3000,
    forceRefresh: true,
  });
  const token = session?.accessToken;
  if (!token) return { error: SESSION_RELOGIN_MESSAGE };

  try {
    const res = await fetch("/api/auth/switch-role", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "x-access-token": token,
      },
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
      motoristCreatedAt: (mot.data as { created_at?: string } | null)
        ?.created_at,
      proCreatedAt: (pro.data as { created_at?: string } | null)?.created_at,
    }),
  };
}

/** Server logout: force is_online=false then clear browser session */
export async function backendLogout(): Promise<void> {
  try {
    const sb = getAppSupabase();
    let access_token: string | undefined;
    let userId: string | undefined;
    if (sb) {
      const { data } = await sb.auth.getSession();
      access_token = data.session?.access_token;
      userId = data.session?.user?.id;
    }
    await fetch("/api/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ access_token, userId }),
    }).catch(() => null);
  } catch {
    /* ignore */
  }
  await backendSignOut();
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
  userId: string,
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
  const [motRes, proRes, guarantorRes] = await Promise.all([
    sb
      .from("motorist_profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle(),
    sb
      .from("repair_pro_profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle(),
    sb
      .from("repair_pro_guarantors")
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
    vehicles?: UserProfile["vehicles"];
    nin_last4?: string | null;
    bvn_last4?: string | null;
    nin_verified?: boolean;
    bvn_verified?: boolean;
    identity_verified_at?: string | null;
    identity_review_status?: string | null;
    identity_submitted_at?: string | null;
    gov_id_kind?: string | null;
    gov_id_front_url?: string | null;
    phone_verified?: boolean;
    first_service_at?: string | null;
    created_at?: string;
    bank_name?: string | null;
    bank_account_name?: string | null;
    bank_account_number?: string | null;
    bank_code?: string | null;
  } | null;
  const pr = proRes.data as
    | (RepairProRow & {
        bank_name?: string | null;
        bank_account_name?: string | null;
        bank_account_number?: string | null;
        bank_code?: string | null;
      })
    | null;
  const storedPrimary = (() => {
    const prRole = (p as { primary_role?: string | null }).primary_role;
    if (prRole === "repair_pro") return "professional" as const;
    if (prRole === "motorist") return "motorist" as const;
    return null;
  })();
  const primaryAccountType =
    storedPrimary ||
    resolvePrimaryAccountType({
      hasMotorist: Boolean(mot),
      hasPro: Boolean(pr),
      motoristCreatedAt: mot?.created_at,
      proCreatedAt: pr?.created_at,
      activeAccountType: accountType,
    });
  const dualRole = Boolean(mot) && Boolean(pr);
  const lastRoleSwitchAt =
    (p as { last_role_switch_at?: string | null }).last_role_switch_at ||
    undefined;
  const roleSwitchCount = Number(
    (p as { role_switch_count?: number | null }).role_switch_count || 0,
  );

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
      dualRole,
      lastRoleSwitchAt,
      roleSwitchCount,
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
      // One bank per login: prefer pro side, fall back to customer bank
      bankName: pr?.bank_name || mot?.bank_name || undefined,
      bankAccountName:
        pr?.bank_account_name || mot?.bank_account_name || undefined,
      bankAccountNumber:
        pr?.bank_account_number || mot?.bank_account_number || undefined,
      bankCode: pr?.bank_code || mot?.bank_code || undefined,
      guarantor: guarantorRes.data
        ? (() => {
            const g = guarantorRes.data as {
              full_name?: string | null;
              phone?: string | null;
              address?: string | null;
              occupation?: string | null;
              relationship?: string | null;
              linked_user_id?: string | null;
            };
            return {
              fullName: g.full_name || "",
              phone: g.phone || "",
              address: g.address || undefined,
              occupation: g.occupation || undefined,
              relationship: g.relationship || "",
              linkedUserId: g.linked_user_id || undefined,
            };
          })()
        : undefined,
      phoneVerified:
        Boolean((p as { phone_verified?: boolean }).phone_verified) ||
        Boolean(mot?.phone_verified),
    });
  }

  const reviewStatus = (mot?.identity_review_status ||
    (mot?.identity_verified_at
      ? "approved"
      : mot?.nin_last4 || mot?.bvn_last4
        ? "submitted"
        : "none")) as UserProfile["identityReviewStatus"];

  return profileToUserProfile(p, {
    accountType,
    primaryAccountType,
    dualRole,
    lastRoleSwitchAt,
    roleSwitchCount,
    vehicleMake: mot?.vehicle_make || undefined,
    vehicleModel: mot?.vehicle_model || undefined,
    vehicleYear: mot?.vehicle_year || undefined,
    vehiclePlate: mot?.plate_number || undefined,
    vehiclePhoto: mot?.vehicle_photo || undefined,
    vehicleCommonIssues: mot?.vehicle_common_issues || undefined,
    vehicles: Array.isArray(mot?.vehicles) ? mot.vehicles : undefined,
    ninVerified: Boolean(mot?.nin_verified),
    bvnVerified: Boolean(mot?.bvn_verified),
    govIdVerified:
      reviewStatus === "approved" || Boolean(mot?.identity_verified_at),
    identityVerifiedAt: mot?.identity_verified_at || undefined,
    identityReviewStatus: reviewStatus,
    identitySubmittedAt: mot?.identity_submitted_at || undefined,
    govIdKind: mot?.gov_id_kind || undefined,
    govIdFrontUrl: mot?.gov_id_front_url || undefined,
    phoneVerified:
      Boolean((p as { phone_verified?: boolean }).phone_verified) ||
      Boolean(mot?.phone_verified),
    firstServiceAt: mot?.first_service_at || undefined,
    // One bank per login: prefer customer side, fall back to pro bank
    bankName: mot?.bank_name || pr?.bank_name || undefined,
    bankAccountName:
      mot?.bank_account_name || pr?.bank_account_name || undefined,
    bankAccountNumber:
      mot?.bank_account_number || pr?.bank_account_number || undefined,
    bankCode: mot?.bank_code || pr?.bank_code || undefined,
  });
}

export async function backendFetchPros(
  userCoords: {
    lat: number;
    lng: number;
  },
  opts?: { trade?: ProService | null },
): Promise<Technician[]> {
  const trade = opts?.trade && isProService(opts.trade) ? opts.trade : null;
  // Prefer server route (service role) so every approved pro + name reaches the app
  try {
    const qs = new URLSearchParams({
      lat: String(userCoords.lat),
      lng: String(userCoords.lng),
    });
    // authFetch so server can exclude the signed-in dual-role user from results
    // NOTE: no trade param /api/pros derives the pro's trade from the session.
    const { authFetch } = await import("@/lib/api-auth-headers");
    const res = await authFetch(`/api/pros?${qs.toString()}`, {
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

  // Client fallback: slim columns only (never pull cert base64 / skills blobs)
  let prosQuery = sb
    .from("repair_pro_profiles")
    .select(
      "user_id, business_name, primary_service, services, status, is_online, rating_avg, rating_count, lat, lng, location_updated_at, service_radius_km, years_experience, bio, verified, labour_prices, pricing_currency, vehicle_focus, skills, jobs_completed, docs_status, face_liveness_verified, in_person_verified, visibility_tier, is_new_artisan, go_live_window_ends_at",
    );
  // Client fallback for pros must respect the same trade scope as the server
  // route otherwise a Repair Pro could widen their market via this fallback.
  if (trade) prosQuery = prosQuery.eq("primary_service", trade);
  prosQuery = prosQuery.eq("is_online", true).limit(60);
  const { data: pros, error } = await prosQuery;

  if (error || !pros?.length) return [];

  const slimPros = pros as unknown as RepairProRow[];
  let selfId: string | null = null;
  try {
    const { data: sess } = await sb.auth.getSession();
    selfId = sess.session?.user?.id ? String(sess.session.user.id) : null;
  } catch {
    selfId = null;
  }
  const ids = slimPros.map((p) => p.user_id);
  const { data: profiles } = await sb
    .from("profiles")
    .select("id, full_name, avatar_url, phone, role, is_active")
    .in("id", ids)
    .eq("is_active", true);

  const byId = new Map(
    (profiles as unknown as ProfileRow[] | null)?.map((p) => [p.id, p]) ?? [],
  );

  const nowMs = Date.now();
  return slimPros
    .filter((pro) => {
      // Dual-role: never see own Live pro profile when searching as customer
      if (selfId && String(pro.user_id) === selfId) return false;
      if (pro.status === "suspended" || pro.status === "rejected") return false;
      if (
        !pro.is_online ||
        !hasRecentLiveHeartbeat(pro.location_updated_at, nowMs)
      ) {
        return false;
      }
      const profile = byId.get(pro.user_id);
      if (!profile || profile.role === "motorist") return false;
      // Never surface demo/audit pros to real customers (client fallback feed)
      if (
        isSyntheticAccount({
          businessName: pro.business_name,
          fullName: profile.full_name,
        })
      ) {
        return false;
      }
      return true;
    })
    .map((pro) =>
      mapProToTechnician(pro, byId.get(pro.user_id) ?? null, userCoords),
    )
    .filter((t) => {
      if (
        !t.hasLiveLocation ||
        typeof t.distanceKm !== "number" ||
        !Number.isFinite(t.distanceKm)
      ) {
        return false;
      }
      const docsPending =
        t.docsStatus === "under_review" || t.docsStatus === "rejected";
      const cap = docsPending
        ? Math.min(MAX_RADIUS_KM, DOCS_PENDING_MAX_RADIUS_KM)
        : MAX_RADIUS_KM;
      return t.distanceKm <= cap;
    });
}

/**
 * Go Live / Away with GPS. Uses server route so role + pin always stick
 * (service role), then motorists can discover within 5 km / 2 km docs.
 */
export async function backendSetProOnline(
  userId: string,
  online: boolean,
  coords?: { lat: number; lng: number },
): Promise<string | null> {
  const { ensureAppSession, SESSION_RELOGIN_MESSAGE } =
    await import("@/lib/supabase/session");

  type LiveJson = {
    ok?: boolean;
    error?: { message?: string; code?: string };
    data?: { online?: boolean; pro?: { is_online?: boolean } };
  } | null;

  const callLive = async (
    uid: string,
    access_token?: string,
  ): Promise<LiveJson> => {
    const res = await fetch("/api/pros/live", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(access_token
          ? {
              Authorization: `Bearer ${access_token}`,
              "x-access-token": access_token,
            }
          : {}),
      },
      body: JSON.stringify({
        userId: uid,
        access_token,
        online,
        lat: coords?.lat,
        lng: coords?.lng,
      }),
    });
    return (await res.json().catch(() => null)) as LiveJson;
  };

  try {
    // Refresh near-expiry tokens before Go Live / Away
    let session = await ensureAppSession();
    const uid = session?.userId || userId;

    let json = await callLive(uid, session?.accessToken);

    // Retry once after forced refresh + userId-only fallback (no hard “session expired”)
    if (
      !json?.ok &&
      (json?.error?.code === "session_expired" ||
        json?.error?.code === "auth_required" ||
        /session|sign in|log in again/i.test(json?.error?.message || ""))
    ) {
      session = await ensureAppSession({ refreshIfExpiresWithinMs: 3_600_000 });
      json = await callLive(session?.userId || uid, session?.accessToken);
      if (!json?.ok) {
        // Service-role path with userId only Go Live must not die on stale JWT
        json = await callLive(uid, undefined);
      }
    }

    if (!json?.ok) {
      const msg = json?.error?.message || "Could not update Live status";
      if (/session expired/i.test(msg)) return SESSION_RELOGIN_MESSAGE;
      return msg;
    }
    if (online === false && json.data?.pro?.is_online === true) {
      return "Could not go Away on server. Try again.";
    }
    return null;
  } catch {
    const sb = getAppSupabase();
    if (!sb) return "Backend offline";
    // Ensure session for RLS fallback
    await ensureAppSession().catch(() => null);
    const patch: Record<string, unknown> = {
      is_online: online,
      updated_at: new Date().toISOString(),
    };
    if (online) {
      // Heartbeat stamp even without new GPS so Live stays marketplace-visible
      patch.location_updated_at = new Date().toISOString();
      if (coords) {
        patch.lat = coords.lat;
        patch.lng = coords.lng;
      }
    }
    const { error } = await sb
      .from("repair_pro_profiles")
      .update(patch)
      .eq("user_id", userId);
    if (error) {
      if (/JWT|session|auth/i.test(error.message)) {
        return SESSION_RELOGIN_MESSAGE;
      }
      return error.message;
    }
    return null;
  }
}

/** Read Live flag from server (sync dashboard UI). */
export async function backendGetProOnline(
  userId: string,
): Promise<boolean | null> {
  const sb = getAppSupabase();
  if (!sb) return null;
  const { data, error } = await sb
    .from("repair_pro_profiles")
    .select("is_online")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return Boolean(data.is_online);
}

/**
 * Create a job via the premium API (flow_status + pro notification).
 * Direct Supabase insert was missing negotiating state and never notified pros.
 */
export async function backendCreateJob(input: {
  motoristId: string;
  repairProId: string;
  serviceType: ProService;
  description: string;
  lat: number;
  lng: number;
  address: string;
  radiusKm: number;
  motoristName?: string;
  motoristPhoto?: string | null;
  repairProName?: string;
  repairProPhoto?: string;
  proBaseMajor?: number | null;
  currency?: string;
}): Promise<{ error: string | null; request?: ServiceRequest }> {
  try {
    const { apiCreateJob } = await import("@/lib/jobs/client");
    const res = await apiCreateJob({
      motoristId: input.motoristId,
      motoristName: input.motoristName || "Customer",
      motoristPhoto: input.motoristPhoto ?? null,
      repairProId: input.repairProId,
      repairProName: input.repairProName || "Repair Pro",
      repairProPhoto: input.repairProPhoto,
      serviceType: input.serviceType,
      problem: input.description,
      currency: input.currency || "NGN",
      proBaseMajor: input.proBaseMajor ?? null,
      locationLabel: input.address || "Near you",
      lat: input.lat,
      lng: input.lng,
    });
    if (!res.ok) {
      return { error: res.message || "Could not create job" };
    }
    const job = res.data.job;
    // Map JobRecord → ServiceRequest shape used by store
    const request: ServiceRequest = {
      id: job.id,
      technicianId: job.repairProId,
      technicianName: job.repairProName,
      serviceType: job.serviceType as ProService,
      problem: job.problem,
      status: "pending",
      createdAt: job.createdAt,
      locationLabel: job.locationLabel || "Near you",
      labourBaseMajor: job.proBaseMajor ?? undefined,
      labourAgreedMajor: job.agreedMajor ?? undefined,
      pricingCurrency: job.currency,
      negotiationStatus: "none",
      motoristId: job.motoristId,
      etaMinutes: job.etaMinutes ?? 0,
      distanceKm: job.distanceKm ?? 0,
    };
    return { error: null, request };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Could not create job",
    };
  }
}

export async function backendUpdateJobStatus(
  requestId: string,
  status: RequestStatus,
  actorId: string,
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
  role: AccountType,
): Promise<ServiceRequest[]> {
  const sb = getAppSupabase();
  if (!sb) return [];

  let q = sb
    .from("service_requests")
    .select(
      "id, motorist_id, repair_pro_id, service_type, status, description, pickup_lat, pickup_lng, pickup_address, radius_km, created_at, updated_at",
    )
    .order("created_at", {
      ascending: false,
    });
  if (role === "motorist") q = q.eq("motorist_id", userId);
  // Pros only ever see jobs assigned to them. The old `status.in.(requested,matched)`
  // broad clause made EVERY open job visible to every pro leaking another
  // pro's accepted jobs into the store / Orders desk (account isolation bug).
  else q = q.eq("repair_pro_id", userId);

  const { data, error } = await q.limit(30);
  if (error || !data) return [];

  const proIds = [
    ...new Set(
      (data as ServiceRequestRow[])
        .map((r) => r.repair_pro_id)
        .filter(Boolean) as string[],
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
        (p as { id: string; full_name: string }).full_name,
      );
    }
  }

  return (data as ServiceRequestRow[]).map((r) =>
    mapRequestRow(r, r.repair_pro_id ? names.get(r.repair_pro_id) : undefined),
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
  if (existing?.id)
    return { error: null, conversationId: existing.id as string };

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

  // Empty thread only never insert system "Chat opened…" spam.
  // First real message appears when a user actually sends one.

  return { error: null, conversationId: data.id as string };
}

export async function backendFetchConversations(
  userId: string,
  role: AccountType,
): Promise<MessageThread[]> {
  const sb = getAppSupabase();
  if (!sb) return [];

  const col = role === "professional" ? "repair_pro_id" : "motorist_id";
  const { data: convs, error } = await sb
    .from("conversations")
    .select("*")
    .eq(col, userId)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(20);
  if (error || !convs?.length) return [];

  const convList = convs as ConversationRow[];
  const convIds = convList.map((c) => c.id);
  const peopleIds = [
    ...new Set(convList.flatMap((c) => [c.motorist_id, c.repair_pro_id])),
  ];
  const requestIds = convList
    .map((c) => c.request_id)
    .filter(Boolean) as string[];

  // Batch-fetch related rows (avoids N+1 lag).
  // Slim columns + low message cap list only needs recent preview, not full history.
  const [{ data: allMsgs }, { data: names }, { data: jobs }] =
    await Promise.all([
      sb
        .from("messages")
        .select("id, conversation_id, sender_id, body, created_at, read_at")
        .in("conversation_id", convIds)
        .order("created_at", { ascending: false })
        .limit(200),
      sb
        .from("profiles")
        .select("id, full_name, avatar_url")
        .in("id", peopleIds),
      requestIds.length
        ? sb
            .from("service_requests")
            .select("id, service_type")
            .in("id", requestIds)
        : Promise.resolve({
            data: [] as { id: string; service_type: string }[],
          }),
    ]);

  const byId = new Map(
    (
      names as
        { id: string; full_name: string; avatar_url: string | null }[] | null
    )?.map((n) => [n.id, n]) ?? [],
  );
  const jobById = new Map(
    (jobs as { id: string; service_type: string }[] | null)?.map((j) => [
      j.id,
      j.service_type,
    ]) ?? [],
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
        motoristName: byId.get(c.motorist_id)?.full_name || "Customer",
        technicianName: byId.get(c.repair_pro_id)?.full_name || "Repair Pro",
        serviceType:
          (c.request_id
            ? (jobById.get(c.request_id) as ProService | undefined)
            : undefined) || "mechanic",
        photo: byId.get(c.repair_pro_id)?.avatar_url || "",
      },
      userId,
    ),
  );
}

export async function backendSendMessage(input: {
  conversationId: string;
  senderId: string;
  body: string;
  /** Display name for the other party's toast */
  senderName?: string | null;
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

  // Popup for the other party (notification → toast + open chat on tap)
  try {
    let preview = input.body;
    try {
      const j = JSON.parse(input.body) as { text?: string; voiceUrl?: string };
      if (j && typeof j === "object") {
        preview = j.voiceUrl
          ? j.text
            ? `🎤 ${j.text}`
            : "🎤 Voice note"
          : String(j.text || input.body);
      }
    } catch {
      /* plain text */
    }
    void import("@/lib/api-auth-headers")
      .then(({ authFetch }) =>
        authFetch("/api/messages/notify", {
          method: "POST",
          body: JSON.stringify({
            conversationId: input.conversationId,
            senderId: input.senderId,
            preview: String(preview || "New message").slice(0, 200),
            senderName: input.senderName || undefined,
          }),
        }),
      )
      .catch(() => null);
  } catch {
    /* non-fatal */
  }
  return null;
}

/**
 * Realtime: any new message in conversations this user belongs to.
 * Used to refresh chats + drive inbound banner when not on the thread page.
 */
export function backendSubscribeUserMessageInserts(
  userId: string,
  onInsert: (row: MessageRow & { conversation_id?: string }) => void,
): (() => void) | null {
  const sb = getAppSupabase();
  if (!sb || !userId) return null;
  const channel = sb
    .channel(
      `user-messages:${userId}:${Math.random().toString(36).slice(2, 8)}`,
    )
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages",
      },
      (payload) => {
        const row = payload.new as MessageRow & {
          conversation_id?: string;
          sender_id?: string;
        };
        // Ignore own sends (sender already has optimistic UI)
        if (row.sender_id === userId) return;
        onInsert(row);
      },
    )
    .subscribe();
  return () => {
    void sb.removeChannel(channel);
  };
}

/** Mark other party's messages as read in this conversation. */
export async function backendMarkMessagesRead(
  conversationId: string,
  userId: string,
): Promise<void> {
  if (!conversationId || conversationId.startsWith("chat-") || !userId) return;
  try {
    const { authFetch } = await import("@/lib/api-auth-headers");
    await authFetch("/api/messages/read", {
      method: "POST",
      body: JSON.stringify({ conversationId, userId }),
    });
  } catch {
    /* ignore */
  }
}

/** Subscribe to new messages in a conversation (Realtime). */
export function backendSubscribeMessages(
  conversationId: string,
  onInsert: (row: MessageRow) => void,
): (() => void) | null {
  const sb = getAppSupabase();
  if (!sb) return null;
  const channel = sb
    .channel(
      `messages:${conversationId}:${Math.random().toString(36).slice(2, 8)}`,
    )
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
      },
    )
    .subscribe();
  return () => {
    void sb.removeChannel(channel);
  };
}

/**
 * Job Realtime filtered to this user’s rows only.
 * OLD BUG: subscribed to *all* service_requests → every pro GPS/status in the
 * whole app triggered a full jobs refetch for every client (huge data waste).
 */
export function backendSubscribeJobs(
  userId: string,
  onChange: (payload?: {
    new?: Record<string, unknown>;
    old?: Record<string, unknown>;
  }) => void,
): (() => void) | null {
  const sb = getAppSupabase();
  if (!sb) return null;
  const channel = sb
    .channel(`jobs:${userId}:${Math.random().toString(36).slice(2, 8)}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "service_requests",
        filter: `motorist_id=eq.${userId}`,
      },
      (
        payload: {
          new?: Record<string, unknown>;
          old?: Record<string, unknown>;
        } | null,
      ) => onChange(payload || undefined),
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "service_requests",
        filter: `repair_pro_id=eq.${userId}`,
      },
      (
        payload: {
          new?: Record<string, unknown>;
          old?: Record<string, unknown>;
        } | null,
      ) => onChange(payload || undefined),
    )
    .subscribe();
  return () => {
    void sb.removeChannel(channel);
  };
}

export type ProPresenceChangeReason = "presence" | "heartbeat";

/**
 * Pros Live presence Realtime for the customer marketplace.
 *
 * Subscribes to `pro_presence` (public, non-sensitive). The old
 * `repair_pro_profiles` channel never delivered other pros' rows to motorists
 * because RLS is own-row-only so Live never appeared without a full refresh.
 *
 * - Live/Away flips → immediate `presence` callback (no 60s throttle)
 * - GPS heartbeats → `heartbeat` at most ~every 25s
 */
export function backendSubscribePros(
  onChange: (reason?: ProPresenceChangeReason) => void,
): (() => void) | null {
  if (typeof window === "undefined") return null;
  const sb = getAppSupabase();
  if (!sb) return null;

  let lastPresenceFire = 0;
  let lastHeartbeatFire = 0;

  type PresenceRow = {
    user_id?: string;
    is_online?: boolean;
    lat?: number | null;
    lng?: number | null;
    location_updated_at?: string | null;
  };

  const handle = (payload: {
    eventType?: string;
    new?: PresenceRow;
    old?: PresenceRow;
  }) => {
    const neu = payload.new;
    const old = payload.old;
    if (!neu && payload.eventType !== "DELETE") return;

    const onlineNow = Boolean(neu?.is_online);
    const onlineWas =
      old && typeof old.is_online === "boolean" ? old.is_online : null;
    const flipped =
      payload.eventType === "INSERT" ||
      payload.eventType === "DELETE" ||
      onlineWas === null ||
      onlineWas !== onlineNow;

    const now = Date.now();
    if (flipped) {
      // Coalesce double Live events within 400ms, never block for 60s
      if (now - lastPresenceFire < 400) return;
      lastPresenceFire = now;
      onChange("presence");
      return;
    }

    // Location/heartbeat only keep map pins fresh without hammering /api/pros
    if (now - lastHeartbeatFire < 25_000) return;
    lastHeartbeatFire = now;
    onChange("heartbeat");
  };

  const channelName = `pros-presence:${Math.random().toString(36).slice(2, 8)}`;
  const sub = sb
    .channel(channelName)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "pro_presence",
      },
      (payload) => {
        handle({
          eventType: payload.eventType,
          new: (payload.new || undefined) as PresenceRow | undefined,
          old: (payload.old || undefined) as PresenceRow | undefined,
        });
      },
    )
    .subscribe((status) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        console.warn("[ona] pro_presence Realtime:", status);
      }
    });

  return () => {
    void sb.removeChannel(sub);
  };
}
