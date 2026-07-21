import type { UserProfile } from "@/lib/types";

/**
 * Progressive post-signup verification funnel (Motorist).
 *
 * - Request 1: free (learn the app)
 * - Requests 2–4: allowed, with stronger warnings each time
 * - Request 5+: blocked until country ID checks pass in-app
 */

/** First action that shows a verification warning (1-based index). */
export const VERIFY_WARN_FROM = 2;

/** First action that is blocked without verification (1-based index). */
export const VERIFY_BLOCK_AT = 5;

/** How many free/warning actions before hard block (1..4 allowed). */
export const VERIFY_FREE_ACTIONS = VERIFY_BLOCK_AT - 1;

export function isIdentityVerified(profile: UserProfile | null | undefined): boolean {
  if (!profile) return false;
  if (profile.identityVerifiedAt) return true;
  // Nigeria-style: NIN + BVN
  if (profile.ninVerified && profile.bvnVerified) return true;
  // Other countries: primary gov ID verified
  if (profile.govIdVerified) return true;
  return false;
}

export function getServiceActionCount(
  profile: UserProfile | null | undefined
): number {
  return Math.max(0, profile?.serviceActionCount ?? 0);
}

/** Next action index (1-based) if the user proceeds now. */
export function nextActionIndex(profile: UserProfile | null | undefined): number {
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
      /** null on first free action when verified or still under warn threshold */
      warning: string | null;
      nextIndex: number;
      remaining: number;
    }
  | {
      allowed: false;
      message: string;
      nextIndex: number;
      remaining: 0;
    };

function roleVerb(accountType: UserProfile["accountType"] | null | undefined): {
  action: string;
  past: string;
} {
  if (accountType === "professional") {
    return { action: "accept", past: "accepted" };
  }
  return { action: "book", past: "booked" };
}

/**
 * Evaluate whether the user may book (motorist) or accept (pro) one more request.
 */
export function evaluateServiceGate(
  profile: UserProfile | null | undefined,
  accountType?: UserProfile["accountType"] | null,
  opts?: VerificationThresholds
): GateDecision {
  const type = accountType ?? profile?.accountType ?? "motorist";
  const { action, past } = roleVerb(type);
  const next = nextActionIndex(profile);
  const { warnFrom, blockAt, freeActions } = thresholds(opts);

  if (isIdentityVerified(profile)) {
    return {
      allowed: true,
      warning: null,
      nextIndex: next,
      remaining: Infinity,
    };
  }

  if (next >= blockAt) {
    return {
      allowed: false,
      nextIndex: next,
      remaining: 0,
      message: `Please verify your ID to ${action} more jobs. You have used your ${freeActions} free ${past} jobs. Finish verification to continue.`,
    };
  }

  let warning: string | null = null;
  if (next >= warnFrom) {
    const left = freeActions - next + 1;
    const after = freeActions - next;
    if (next === warnFrom) {
      warning = `Welcome. After ${freeActions} free jobs, you will need to verify your ID to keep ${action === "accept" ? "taking jobs" : "booking help"}. After this one, you have ${after} free ${after === 1 ? "job" : "jobs"} left.`;
    } else if (next === freeActions) {
      warning = `This is your last free job before you must verify. After this, please verify your ID so you can keep using Ona.`;
    } else {
      warning = `Reminder: you can still ${action} ${left} free job${left === 1 ? "" : "s"} (including this one). After that, you must verify your ID.`;
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
): "verified" | "partial" | "unverified" {
  if (isIdentityVerified(profile)) return "verified";
  if (profile?.ninVerified || profile?.bvnVerified) return "partial";
  return "unverified";
}
