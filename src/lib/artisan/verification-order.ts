/**
 * Sequential verification gates for Repair Pros:
 * Gov ID → BVN → (BVN + liveness) → Proof of skill
 * “Complete” for ID/BVN = submitted OR approved (admin).
 * Liveness = device pass.
 */

import type { ArtisanVerificationProfile } from "@/lib/artisan/types";

type Reviewish = string | null | undefined;

function reviewDone(status: Reviewish, approvedFlag?: boolean): boolean {
  if (approvedFlag) return true;
  return status === "submitted" || status === "approved";
}

/** Government ID submitted or approved */
export function isGovIdComplete(
  p: Partial<ArtisanVerificationProfile> | null | undefined
): boolean {
  if (!p) return false;
  return reviewDone(p.govIdReviewStatus, p.tiers?.tier2_govId);
}

/** BVN submitted or approved */
export function isBvnComplete(
  p: Partial<ArtisanVerificationProfile> | null | undefined
): boolean {
  if (!p) return false;
  return reviewDone(p.ninReviewStatus, p.tiers?.tier2_nin);
}

/** Face liveness passed on device */
export function isLivenessComplete(
  p: Partial<ArtisanVerificationProfile> | null | undefined
): boolean {
  if (!p) return false;
  return Boolean(p.tiers?.tier3_liveness || p.livenessPassed);
}

/** Skill proof uploaded / under review */
export function isSkillComplete(
  p: Partial<ArtisanVerificationProfile> | null | undefined
): boolean {
  if (!p) return false;
  return Boolean(p.tiers?.tier4_skillProof || p.skillProof);
}

export function canAccessBvn(
  p: Partial<ArtisanVerificationProfile> | null | undefined
): boolean {
  return isGovIdComplete(p);
}

/** Liveness unlocks after Government ID (same stage as BVN) */
export function canAccessLiveness(
  p: Partial<ArtisanVerificationProfile> | null | undefined
): boolean {
  return isGovIdComplete(p);
}

/** Skill only after BVN complete AND face liveness passed */
export function canAccessSkillProof(
  p: Partial<ArtisanVerificationProfile> | null | undefined
): boolean {
  return isBvnComplete(p) && isLivenessComplete(p);
}

/** Full verification ladder for Submit / Go Live readiness */
export function verificationOrderComplete(
  p: Partial<ArtisanVerificationProfile> | null | undefined
): { ok: true } | { ok: false; reason: string } {
  if (!isGovIdComplete(p)) {
    return {
      ok: false,
      reason: "Complete Government ID (submit for review) first",
    };
  }
  if (!isBvnComplete(p)) {
    return {
      ok: false,
      reason: "Complete BVN (submit for review) before continuing",
    };
  }
  if (!isLivenessComplete(p)) {
    return {
      ok: false,
      reason: "Pass face liveness before proof of skill",
    };
  }
  if (!isSkillComplete(p)) {
    return {
      ok: false,
      reason: "Upload proof of skill for final tier review",
    };
  }
  return { ok: true };
}

export function lockMessageForSection(
  section: "bvn" | "liveness" | "skill"
): string {
  if (section === "bvn") {
    return "Complete Government ID first before BVN";
  }
  if (section === "liveness") {
    return "Complete Government ID first before face liveness";
  }
  return "Complete BVN and face liveness before proof of skill";
}
