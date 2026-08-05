/**
 * Sequential verification gates for Repair Pros:
 * T2 Gov ID → T3 (face liveness + BVN) → T4 Proof of skill
 * “Complete” for ID/BVN = submitted OR approved (admin).
 * Liveness = device pass + backend report.
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
  if (reviewDone(p.govIdReviewStatus, p.tiers?.tier2_govId)) return true;
  // Match resolveVisibilityTier: admin-approved status / elevated tier /
  // recorded approval imply T2 even when the review flag was not stamped.
  return (
    p.status === "approved" ||
    (p.visibilityTier ?? 0) >= 2 ||
    Boolean(p.tier2ApprovedAt)
  );
}

/** BVN submitted or approved */
export function isBvnComplete(
  p: Partial<ArtisanVerificationProfile> | null | undefined
): boolean {
  if (!p) return false;
  if (reviewDone(p.ninReviewStatus, p.tiers?.tier2_nin)) return true;
  return (
    p.status === "approved" ||
    (p.visibilityTier ?? 0) >= 2 ||
    Boolean(p.tier2ApprovedAt)
  );
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

/** Liveness unlocks after Government ID (Tier 3 start) */
export function canAccessLiveness(
  p: Partial<ArtisanVerificationProfile> | null | undefined
): boolean {
  return isGovIdComplete(p);
}

/** BVN is Tier 3 — after Government ID (with liveness) */
export function canAccessBvn(
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

/**
 * Next incomplete step for Pro lower panel (one tier at a time).
 * After Care T2, advances to liveness → BVN → skill.
 */
export type ProEmbedTierStep =
  | "phone"
  | "gov_id"
  | "liveness"
  | "bvn"
  | "skill"
  | "done";

export function nextProEmbedTierStep(
  p: Partial<ArtisanVerificationProfile> | null | undefined,
  opts?: { hidePhone?: boolean; hideGovId?: boolean }
): ProEmbedTierStep {
  if (!opts?.hidePhone && !p?.tiers?.tier1_phone) return "phone";
  // Care-approved or submitted T2 counts as past phone; still on gov if not complete
  if (!opts?.hideGovId && !isGovIdComplete(p)) return "gov_id";
  if (!isLivenessComplete(p)) return "liveness";
  if (!isBvnComplete(p)) return "bvn";
  if (!isSkillComplete(p)) return "skill";
  return "done";
}

/** Short label for dashboard CTA under the tier bar. */
export function nextProEmbedTierLabel(step: ProEmbedTierStep): string {
  switch (step) {
    case "phone":
      return "Tier 1 · Phone";
    case "gov_id":
      return "Tier 2 · Government ID";
    case "liveness":
      return "Tier 3 · Face liveness";
    case "bvn":
      return "Tier 3 · BVN";
    case "skill":
      return "Tier 4 · Proof of skill";
    default:
      return "";
  }
}

/** All of T1–T4 done (phone + ID + BVN + liveness + skill). */
export function isProVerificationLadderComplete(
  p: Partial<ArtisanVerificationProfile> | null | undefined,
  opts?: { phoneOk?: boolean }
): boolean {
  if (!(opts?.phoneOk || p?.tiers?.tier1_phone)) return false;
  return verificationOrderComplete(p).ok === true;
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
  if (section === "liveness") {
    return "Complete Government ID first before face liveness";
  }
  if (section === "bvn") {
    return "Complete Government ID first before BVN (Tier 3)";
  }
  return "Complete BVN and face liveness before proof of skill";
}
