import type { UserProfile } from "@/lib/types";

/**
 * Customer progressive verification
 *
 * Tier 1 — Phone OTP verified
 * Tier 2 — Country ID uploaded + admin/care approved
 *
 * With only Tier 1: up to 6 free requests, then blocked until Tier 2 approved.
 */

/** First action that shows a verification warning (1-based index). */
export const VERIFY_WARN_FROM = 3;

/** Free requests allowed with phone-only (Tier 1). */
export const VERIFY_FREE_ACTIONS = 6;

/** First action blocked without Tier 2 (1-based): 7th request. */
export const VERIFY_BLOCK_AT = VERIFY_FREE_ACTIONS + 1;

/** Demo / local OTP for customer phone verify (Africa's Talking later). */
export const CUSTOMER_PHONE_OTP = "336699";

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

/** Tier 2 complete — admin/care approved government ID */
export function isIdentityVerified(
  profile: UserProfile | null | undefined
): boolean {
  if (!profile) return false;
  if (profile.identityReviewStatus === "approved") return true;
  if (profile.identityVerifiedAt && profile.govIdVerified) return true;
  return false;
}

export function isIdentityPending(
  profile: UserProfile | null | undefined
): boolean {
  return profile?.identityReviewStatus === "submitted";
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

export type VerificationThresholds = {
  warnFrom?: number;
  blockAt?: number;
};

function thresholds(opts?: VerificationThresholds) {
  const warnFrom = opts?.warnFrom ?? VERIFY_WARN_FROM;
  const blockAt = opts?.blockAt ?? VERIFY_BLOCK_AT;
  const freeActions = Math.max(0, blockAt - 1);
  return { warnFrom, blockAt, freeActions };
}

export function remainingFreeActions(
  profile: UserProfile | null | undefined,
  opts?: VerificationThresholds
): number {
  if (isIdentityVerified(profile)) return Infinity;
  const { freeActions } = thresholds(opts);
  return Math.max(0, freeActions - getServiceActionCount(profile));
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
 */
export function evaluateServiceGate(
  profile: UserProfile | null | undefined,
  accountType?: UserProfile["accountType"] | null,
  opts?: VerificationThresholds
): GateDecision {
  const type = accountType ?? profile?.accountType ?? "motorist";
  const next = nextActionIndex(profile);
  const { warnFrom, blockAt, freeActions } = thresholds(opts);

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

  // After 6 free requests without Tier 2 approval → suspended for booking
  if (next >= blockAt) {
    const pending = isIdentityPending(profile);
    return {
      allowed: false,
      nextIndex: next,
      remaining: 0,
      reason: pending ? "id" : "suspended",
      message: pending
        ? "Your ID is under review by admin / customer care. You cannot create new requests until it is approved."
        : `You have used your ${freeActions} free requests. Upload your government ID for review so admin / customer care can approve Tier 2 and restore booking.`,
    };
  }

  let warning: string | null = null;
  if (next >= warnFrom) {
    const left = freeActions - next + 1;
    const after = freeActions - next;
    if (next === warnFrom) {
      warning = `After ${freeActions} free requests you must upload your ID for admin approval. After this one, you have ${after} free request${after === 1 ? "" : "s"} left.`;
    } else if (next === freeActions) {
      warning =
        "This is your last free request. Next time you must upload ID and wait for admin / customer care approval.";
    } else {
      warning = `You can still book ${left} free request${left === 1 ? "" : "s"} (including this one) before ID upload is required.`;
    }
  }

  return {
    allowed: true,
    warning,
    nextIndex: next,
    remaining: freeActions - next + 1,
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
