/**
 * Artisan profile status machine + Go Live / New Artisan rules.
 */

import {
  NEW_ARTISAN_JOBS_THRESHOLD,
  PORTFOLIO_MIN,
  type ArtisanProfileStatus,
  type ArtisanVerificationProfile,
  type TierCompletion,
} from "@/lib/artisan/types";
import { canGoLiveForVisibilityTier } from "@/lib/artisan/visibility-tiers";

export function emptyTiers(): TierCompletion {
  return {
    tier1_phone: false,
    tier2_govId: false,
    tier2_bvn: false,
    tier3_liveness: false,
    tier4_skillProof: false,
  };
}

export function canTransition(
  from: ArtisanProfileStatus,
  to: ArtisanProfileStatus
): boolean {
  const allowed: Record<ArtisanProfileStatus, ArtisanProfileStatus[]> = {
    draft: ["pending_review"],
    pending_review: ["approved", "rejected", "draft"],
    approved: ["suspended", "pending_review"],
    rejected: ["draft", "pending_review"],
    suspended: ["approved", "pending_review"],
  };
  return allowed[from]?.includes(to) ?? false;
}

/** Compulsory fields + portfolio + Tier 1 phone before submit */
export function canSubmitForReview(
  p: Partial<ArtisanVerificationProfile>
): { ok: true } | { ok: false; reason: string } {
  if (!p.tiers?.tier1_phone) {
    return { ok: false, reason: "Verify your phone number (OTP) to continue." };
  }
  if (!p.trade?.service) {
    return { ok: false, reason: "Select your primary trade." };
  }
  if (!p.trade?.specialty?.trim()) {
    return {
      ok: false,
      reason: "Select your specialty for this trade (required).",
    };
  }
  const years = Number(p.yearsExperience);
  if (!Number.isFinite(years) || years < 1) {
    return { ok: false, reason: "Years of experience must be at least 1." };
  }
  const area = p.serviceArea;
  if (!area?.states?.length && !area?.cities?.length && !area?.lgas?.length) {
    return {
      ok: false,
      reason: "Add at least one service area (state, city or LGA).",
    };
  }
  if (!p.toolsOwned?.length) {
    return { ok: false, reason: "List the major tools you own." };
  }
  const g = p.guarantor;
  if (!g?.fullName?.trim() || !g?.phone?.trim()) {
    return { ok: false, reason: "Guarantor full name and phone are required." };
  }
  const port = p.portfolio?.length ?? 0;
  if (port < PORTFOLIO_MIN) {
    return {
      ok: false,
      reason: `Upload at least ${PORTFOLIO_MIN} clear photos of previous jobs.`,
    };
  }
  return { ok: true };
}

/** Go Live — profile status + visibility tier (Tier 2 = 30-day window) */
export function canGoLive(
  p: ArtisanVerificationProfile | null | undefined
): { allowed: true } | { allowed: false; message: string } {
  return canGoLiveForVisibilityTier(p);
}

export function recomputeNewArtisanFlag(
  successfulJobsCount: number
): boolean {
  return successfulJobsCount < NEW_ARTISAN_JOBS_THRESHOLD;
}

/** Ranking penalty while New Artisan (lower = appears lower in results) */
export function newArtisanScorePenalty(
  isNewArtisan: boolean
): number {
  return isNewArtisan ? 35 : 0;
}

export {
  resolveVisibilityTier,
  rulesForTier,
  tier2GoLiveWarning,
  applyAdminTierPromotion,
  TIER2_GO_LIVE_DAYS,
  TIER2_WARN_DAYS_BEFORE,
} from "@/lib/artisan/visibility-tiers";
export type { VisibilityTier } from "@/lib/artisan/visibility-tiers";

export function tierProgressPercent(tiers: TierCompletion): number {
  const keys: (keyof TierCompletion)[] = [
    "tier1_phone",
    "tier2_govId",
    "tier2_bvn",
    "tier3_liveness",
    "tier4_skillProof",
  ];
  const done = keys.filter((k) => tiers[k]).length;
  return Math.round((done / keys.length) * 100);
}

export function statusLabel(s: ArtisanProfileStatus): string {
  const map: Record<ArtisanProfileStatus, string> = {
    draft: "Draft",
    pending_review: "Pending Review",
    approved: "Approved",
    rejected: "Rejected",
    suspended: "Suspended",
  };
  return map[s] || s;
}
