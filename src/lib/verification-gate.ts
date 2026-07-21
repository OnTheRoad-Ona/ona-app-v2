import type { UserProfile } from "@/lib/types";

/**
 * Customer progressive verification
 *
 * Tier 1 — Phone OTP verified
 *   Free booking/help for 30 days starting at the first request.
 * Tier 2 — Government ID submitted AND admin/care approved
 *   Full unlimited access.
 *
 * Home shows a verify prompt every open until Tier 2.
 */

/** Days of free requests after the customer's first request (Tier 1 only). */
export const TIER1_TRIAL_DAYS = 30;

/** @deprecated Prefer TIER1_TRIAL_DAYS — kept for older call sites */
export const VERIFY_WARN_FROM = 1;

/** @deprecated Prefer TIER1_TRIAL_DAYS */
export const VERIFY_FREE_ACTIONS = TIER1_TRIAL_DAYS;

/** @deprecated Prefer time-based trial */
export const VERIFY_BLOCK_AT = TIER1_TRIAL_DAYS + 1;

/** Demo / local OTP for customer phone verify (Africa's Talking later). */
export const CUSTOMER_PHONE_OTP = "336699";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type IdentityReviewStatus =
  | "none"
  | "submitted"
  | "approved"
  | "rejected";

export function isPhoneVerified(
  profile: UserProfile | null | undefined
): boolean {
  return Boolean(profile?.phoneVerified);
}

/**
 * Tier 2 complete — ID must be submitted and admin/care approved.
 * Submitted-only (pending) is NOT full access.
 */
export function isIdentityVerified(
  profile: UserProfile | null | undefined
): boolean {
  if (!profile) return false;
  // Explicit dual condition: admin approved (implies submitted) + verified flags
  if (profile.identityReviewStatus === "approved") {
    return true;
  }
  // Legacy mirror: care-approved stamp on profile
  if (
    profile.govIdVerified &&
    profile.identityVerifiedAt &&
    profile.identityReviewStatus !== "rejected" &&
    profile.identityReviewStatus !== "submitted"
  ) {
    return true;
  }
  return false;
}

export function isIdentityPending(
  profile: UserProfile | null | undefined
): boolean {
  return profile?.identityReviewStatus === "submitted";
}

/** ISO timestamp of the customer's first gated request (starts the 30-day clock). */
export function getFirstServiceAt(
  profile: UserProfile | null | undefined
): string | null {
  return profile?.firstServiceAt || null;
}

export function getServiceActionCount(
  profile: UserProfile | null | undefined
): number {
  return Math.max(0, profile?.serviceActionCount ?? 0);
}

/** Next action index (1-based) if the user proceeds now. */
export function nextActionIndex(
  profile: UserProfile | null | undefined
): number {
  return getServiceActionCount(profile) + 1;
}

/**
 * Milliseconds remaining in the Tier 1 free window.
 * Infinity when T2; full window when no first request yet.
 */
export function trialMsRemaining(
  profile: UserProfile | null | undefined,
  trialDays = TIER1_TRIAL_DAYS
): number {
  if (isIdentityVerified(profile)) return Infinity;
  const first = getFirstServiceAt(profile);
  if (!first) return trialDays * MS_PER_DAY;
  const end = new Date(first).getTime() + trialDays * MS_PER_DAY;
  return Math.max(0, end - Date.now());
}

/** Whole days left in trial (ceil). Infinity when T2. */
export function trialDaysRemaining(
  profile: UserProfile | null | undefined,
  trialDays = TIER1_TRIAL_DAYS
): number {
  const ms = trialMsRemaining(profile, trialDays);
  if (!Number.isFinite(ms)) return Infinity;
  return Math.ceil(ms / MS_PER_DAY);
}

export function isTrialExpired(
  profile: UserProfile | null | undefined,
  trialDays = TIER1_TRIAL_DAYS
): boolean {
  if (isIdentityVerified(profile)) return false;
  const first = getFirstServiceAt(profile);
  if (!first) return false;
  return trialMsRemaining(profile, trialDays) <= 0;
}

/**
 * Whether home should show the verify lower panel every open.
 * True for customers who have not reached Tier 2.
 */
export function shouldShowHomeVerifyPanel(
  profile: UserProfile | null | undefined,
  accountType?: UserProfile["accountType"] | null
): boolean {
  const type = accountType ?? profile?.accountType ?? "motorist";
  if (type === "professional") return false;
  return !isIdentityVerified(profile);
}

export type VerificationThresholds = {
  /** @deprecated count-based; ignored when trialDays is set */
  warnFrom?: number;
  /** @deprecated count-based; ignored when trialDays is set */
  blockAt?: number;
  trialDays?: number;
};

function resolveTrialDays(opts?: VerificationThresholds) {
  return opts?.trialDays ?? TIER1_TRIAL_DAYS;
}

/** Days left in free window (for UI). Infinity when T2. */
export function remainingFreeActions(
  profile: UserProfile | null | undefined,
  opts?: VerificationThresholds
): number {
  if (isIdentityVerified(profile)) return Infinity;
  return trialDaysRemaining(profile, resolveTrialDays(opts));
}

export type GateDecision =
  | {
      allowed: true;
      warning: string | null;
      nextIndex: number;
      remaining: number;
    }
  | {
      allowed: false;
      message: string;
      nextIndex: number;
      remaining: 0;
      reason: "phone" | "id" | "suspended";
    };

/**
 * Evaluate whether the customer may create one more request.
 * Free window: 30 days from first request (Tier 1). Full access only after T2.
 */
export function evaluateServiceGate(
  profile: UserProfile | null | undefined,
  accountType?: UserProfile["accountType"] | null,
  opts?: VerificationThresholds
): GateDecision {
  const type = accountType ?? profile?.accountType ?? "motorist";
  const next = nextActionIndex(profile);
  const trialDays = resolveTrialDays(opts);
  const daysLeft = trialDaysRemaining(profile, trialDays);

  // Pros use separate artisan flow — only gate motorists here for request create
  if (type === "professional") {
    return {
      allowed: true,
      warning: null,
      nextIndex: next,
      remaining: Infinity,
    };
  }

  if (!isPhoneVerified(profile)) {
    return {
      allowed: false,
      nextIndex: next,
      remaining: 0,
      reason: "phone",
      message:
        "Verify your phone number first (Tier 1). Open Verify and enter the SMS code.",
    };
  }

  if (isIdentityVerified(profile)) {
    return {
      allowed: true,
      warning: null,
      nextIndex: next,
      remaining: Infinity,
    };
  }

  // Trial clock started and expired without Tier 2
  if (isTrialExpired(profile, trialDays)) {
    const pending = isIdentityPending(profile);
    return {
      allowed: false,
      nextIndex: next,
      remaining: 0,
      reason: pending ? "id" : "suspended",
      message: pending
        ? "Your ID is under review by admin / customer care. You cannot create new requests until it is approved."
        : `Your ${trialDays}-day free period has ended. Submit your government ID and wait for admin / customer care approval (Tier 2) to keep booking.`,
    };
  }

  // Within trial — always soft-warn until T2 (home also shows panel every open)
  let warning: string | null = null;
  if (!getFirstServiceAt(profile)) {
    warning = `You get ${trialDays} free days of requests from your first booking. Verify your ID (Tier 2) for full access.`;
  } else if (daysLeft <= 7) {
    warning =
      daysLeft <= 1
        ? "Last day of free access. Submit your ID for admin approval to keep booking."
        : `${daysLeft} free days left. Upload your government ID for admin / customer care approval.`;
  } else {
    warning = `${daysLeft} free days left before ID verification is required. Verify anytime for unlimited booking.`;
  }

  return {
    allowed: true,
    warning,
    nextIndex: next,
    remaining: Number.isFinite(daysLeft) ? daysLeft : Infinity,
  };
}

export function verificationStatusLabel(
  profile: UserProfile | null | undefined
): "verified" | "pending" | "phone_only" | "unverified" {
  if (isIdentityVerified(profile)) return "verified";
  if (isIdentityPending(profile)) return "pending";
  if (isPhoneVerified(profile)) return "phone_only";
  return "unverified";
}

export function customerTierLabel(
  profile: UserProfile | null | undefined
): "Tier 0" | "Tier 1" | "Tier 2" {
  if (isIdentityVerified(profile)) return "Tier 2";
  if (isPhoneVerified(profile)) return "Tier 1";
  return "Tier 0";
}
