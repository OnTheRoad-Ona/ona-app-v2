import type { UserProfile } from "@/lib/types";

/**
 * Progressive post-signup verification funnel.
 *
 * - Request 1: free (learn the app)
 * - Requests 2–4: allowed, with stronger warnings each time
 * - Request 5+: blocked until NIN + BVN verified in-app
 */

/** First action that shows a verification warning (1-based index). */
export const VERIFY_WARN_FROM = 2;

/** First action that is blocked without verification (1-based index). */
export const VERIFY_BLOCK_AT = 5;

/** How many free/warning actions before hard block (1..4 allowed). */
export const VERIFY_FREE_ACTIONS = VERIFY_BLOCK_AT - 1;

export function isIdentityVerified(profile: UserProfile | null | undefined): boolean {
  if (!profile) return false;
  if (profile.identityVerifiedAt && profile.ninVerified && profile.bvnVerified) {
    return true;
  }
  return Boolean(profile.ninVerified && profile.bvnVerified);
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

export function remainingFreeActions(
  profile: UserProfile | null | undefined
): number {
  if (isIdentityVerified(profile)) return Infinity;
  return Math.max(0, VERIFY_FREE_ACTIONS - getServiceActionCount(profile));
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
  accountType?: UserProfile["accountType"] | null
): GateDecision {
  const type = accountType ?? profile?.accountType ?? "motorist";
  const { action, past } = roleVerb(type);
  const next = nextActionIndex(profile);

  if (isIdentityVerified(profile)) {
    return {
      allowed: true,
      warning: null,
      nextIndex: next,
      remaining: Infinity,
    };
  }

  if (next >= VERIFY_BLOCK_AT) {
    return {
      allowed: false,
      nextIndex: next,
      remaining: 0,
      message: `Verify your NIN and BVN to ${action} more requests. You've used your ${VERIFY_FREE_ACTIONS} free ${past} jobs — complete identity verification to continue.`,
    };
  }

  let warning: string | null = null;
  if (next >= VERIFY_WARN_FROM) {
    const left = VERIFY_FREE_ACTIONS - next + 1;
    // next is the action they're about to take; remaining after this action:
    const after = VERIFY_FREE_ACTIONS - next;
    if (next === VERIFY_WARN_FROM) {
      warning = `You're getting familiar with OgaMecho. After ${VERIFY_FREE_ACTIONS} free requests, you'll need to verify your NIN and BVN to keep ${action === "accept" ? "accepting" : "booking"}. ${after} free ${after === 1 ? "request" : "requests"} left after this one.`;
    } else if (next === VERIFY_FREE_ACTIONS) {
      warning = `Last free request before verification is required. Verify NIN and BVN after this job so you can keep using OgaMecho without interruption.`;
    } else {
      warning = `Verification reminder: you can ${action} ${left} more free request${left === 1 ? "" : "s"} (including this one), then NIN + BVN verification is required.`;
    }
  }

  return {
    allowed: true,
    warning,
    nextIndex: next,
    remaining: VERIFY_FREE_ACTIONS - next + 1,
  };
}

export function verificationStatusLabel(
  profile: UserProfile | null | undefined
): "verified" | "partial" | "unverified" {
  if (isIdentityVerified(profile)) return "verified";
  if (profile?.ninVerified || profile?.bvnVerified) return "partial";
  return "unverified";
}
