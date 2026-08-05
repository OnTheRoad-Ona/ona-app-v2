/**
 * Repair Pro search-visibility ladder (automatic only — care never sets Vis manually).
 *
 * Product lock:
 *  T1 — registered; hidden from search; no Go Live
 *  T2 — after care approves government ID → limited search (~30% · 1 km · 30-day Go Live window)
 *  T3 — after face liveness + BVN verified (and T2 done) → wider search (~70% · 3 km · no 30-day cap · New badge off)
 *  T4 — after skill docs approved, and only if T3 already passed → full (~100% · 10 km)
 *
 * Motorists are not on this ladder (pros only).
 */

/** Pure auto ladder from verification flags (source of truth for tier number). */
export function resolveAutoVisibilityTier(input: {
  /** Care approved government ID (T2) */
  govIdApproved: boolean;
  /** BVN verified (required with liveness for T3) */
  bvnVerified: boolean;
  /** Face liveness passed */
  faceLiveness: boolean;
  /** Care approved skill documents (T4) */
  skillDocsApproved: boolean;
}): VisibilityTier {
  const t2 = Boolean(input.govIdApproved);
  const t3 = t2 && Boolean(input.bvnVerified) && Boolean(input.faceLiveness);
  const t4 = t3 && Boolean(input.skillDocsApproved);
  if (t4) return 4;
  if (t3) return 3;
  if (t2) return 2;
  return 1;
}

/** DB row shape → auto tier */
export function autoVisibilityFromProRow(pro: {
  gov_id_review_status?: string | null;
  verified?: boolean | null;
  nin_verified?: boolean | null;
  bvn_verified?: boolean | null;
  face_liveness_verified?: boolean | null;
  liveness_passed_at?: string | null;
  docs_status?: string | null;
}): VisibilityTier {
  const govIdApproved =
    pro.gov_id_review_status === "approved" ||
    Boolean(pro.verified) ||
    Boolean(pro.nin_verified);
  return resolveAutoVisibilityTier({
    govIdApproved,
    bvnVerified: Boolean(pro.bvn_verified),
    faceLiveness: Boolean(
      pro.face_liveness_verified || pro.liveness_passed_at
    ),
    skillDocsApproved: pro.docs_status === "approved",
  });
}

/**
 * Effective tier for the Go Live gate — a single, safe read.
 *
 * Care-approved T2 flags (or a stored tier2_approved_at) ALWAYS dominate a stale,
 * missing, or clobbered `visibility_tier` column. This prevents the "approved for
 * Tier 2 but the app still says Tier 1" desync class (e.g. a signup upsert that
 * reset visibility_tier → 1 after approval). Never used to upgrade beyond what the
 * auto ladder + stored tier agree on otherwise.
 */
export function effectiveGoLiveTier(
  pro: Record<string, unknown> | null | undefined
): VisibilityTier {
  // Legacy rows (pre-visibility_tier migration) have no stored tier — default 2
  // so existing approved pros are never locked out (same as the old ?? 2 gate).
  const rawVis = pro?.visibility_tier;
  const stored =
    rawVis == null ? 2 : clampVisibilityTier(Number(rawVis));
  const auto = autoVisibilityFromProRow({
    gov_id_review_status:
      (pro?.gov_id_review_status as string | null | undefined) || null,
    verified: pro?.verified as boolean | null | undefined,
    nin_verified: pro?.nin_verified as boolean | null | undefined,
    bvn_verified: pro?.bvn_verified as boolean | null | undefined,
    face_liveness_verified:
      pro?.face_liveness_verified as boolean | null | undefined,
    liveness_passed_at:
      (pro?.liveness_passed_at as string | null | undefined) || null,
    docs_status: (pro?.docs_status as string | null | undefined) || null,
  });
  // Approval floor: any care-approved signal (or approved account status) means
  // this pro is marketplace-ready and can never read as hidden Tier 1, even if a
  // stale write reset visibility_tier to 1.
  const approved =
    pro?.status === "approved" ||
    pro?.gov_id_review_status === "approved" ||
    pro?.verified === true ||
    pro?.nin_verified === true ||
    Boolean(pro?.tier2_approved_at);
  const base = approved ? Math.max(stored, 2) : stored;
  return Math.max(base, auto) as VisibilityTier;
}

/** Patch fields when auto-promoting visibility (timestamps, new badge, go-live window). */
export function visibilityPromotionPatch(
  nextTier: VisibilityTier,
  nowIso: string
): Record<string, unknown> {
  const patch: Record<string, unknown> = {
    visibility_tier: nextTier,
    is_new_artisan: nextTier <= 2,
    updated_at: nowIso,
  };
  if (nextTier >= 2) {
    patch.tier2_approved_at = nowIso; // caller may overwrite if already set
  }
  if (nextTier >= 3) {
    patch.tier3_approved_at = nowIso;
    patch.go_live_window_ends_at = null; // unlimited Go Live from T3
  }
  if (nextTier >= 4) {
    patch.tier4_approved_at = nowIso;
    patch.go_live_window_ends_at = null;
  }
  return patch;
}

import type { ArtisanVerificationProfile } from "@/lib/artisan/types";

export type VisibilityTier = 1 | 2 | 3 | 4;

export const TIER2_GO_LIVE_DAYS = 30;
export const TIER2_WARN_DAYS_BEFORE = 5;
/** Tier 2 discovery radius — wide enough that Live pros are findable (was 1 km, too strict) */
export const TIER2_MAX_RADIUS_KM = 5;
export const TIER3_MAX_RADIUS_KM = 8;
export const TIER4_MAX_RADIUS_KM = 10;

export type VisibilityTierRules = {
  tier: VisibilityTier;
  /** 0–100 marketplace visibility weight */
  visibilityPercent: number;
  /** Max km motorists may discover this pro */
  maxRadiusKm: number;
  canAppearInSearch: boolean;
  canGoLive: boolean;
  /** Soft days of Go Live after Tier 2 approval (null = unlimited) */
  goLiveWindowDays: number | null;
  warnDaysBeforeExpiry: number | null;
  showNewBadge: boolean;
  /** Tier 4: add one 1★ review only if they already have ≥1 rating */
  seedOneStarIfHasRatings: boolean;
};

export const VISIBILITY_TIER_RULES: Record<VisibilityTier, VisibilityTierRules> =
  {
    1: {
      tier: 1,
      visibilityPercent: 0,
      maxRadiusKm: 0,
      canAppearInSearch: false,
      canGoLive: false,
      goLiveWindowDays: null,
      warnDaysBeforeExpiry: null,
      showNewBadge: true,
      seedOneStarIfHasRatings: false,
    },
    2: {
      tier: 2,
      visibilityPercent: 30,
      maxRadiusKm: TIER2_MAX_RADIUS_KM,
      canAppearInSearch: true,
      canGoLive: true,
      goLiveWindowDays: TIER2_GO_LIVE_DAYS,
      warnDaysBeforeExpiry: TIER2_WARN_DAYS_BEFORE,
      showNewBadge: true,
      seedOneStarIfHasRatings: false,
    },
    3: {
      tier: 3,
      visibilityPercent: 70,
      maxRadiusKm: TIER3_MAX_RADIUS_KM,
      canAppearInSearch: true,
      canGoLive: true,
      goLiveWindowDays: null,
      warnDaysBeforeExpiry: null,
      showNewBadge: false,
      seedOneStarIfHasRatings: false,
    },
    4: {
      tier: 4,
      visibilityPercent: 100,
      maxRadiusKm: TIER4_MAX_RADIUS_KM,
      canAppearInSearch: true,
      canGoLive: true,
      goLiveWindowDays: null,
      warnDaysBeforeExpiry: null,
      showNewBadge: false,
      seedOneStarIfHasRatings: true,
    },
  };

export function clampVisibilityTier(
  n: number | null | undefined
): VisibilityTier {
  const t = Math.floor(Number(n) || 1);
  if (t <= 1) return 1;
  if (t === 2) return 2;
  if (t === 3) return 3;
  return 4;
}

export function rulesForTier(tier: VisibilityTier): VisibilityTierRules {
  return VISIBILITY_TIER_RULES[clampVisibilityTier(tier)];
}

/** Effective visibility tier from artisan profile (defaults to 1). */
export function resolveVisibilityTier(
  p:
    | (Pick<ArtisanVerificationProfile, "visibilityTier" | "status"> &
        Partial<
          Pick<ArtisanVerificationProfile, "tiers" | "govIdReviewStatus">
        >)
    | null
    | undefined
): VisibilityTier {
  if (!p) return 1;
  let tier =
    p.visibilityTier != null
      ? clampVisibilityTier(p.visibilityTier)
      : p.status === "approved"
        ? 2
        : 1;
  // Care-approved T2 must never still read as Tier 1
  if (
    p.govIdReviewStatus === "approved" ||
    Boolean(p.tiers?.tier2_govId)
  ) {
    tier = Math.max(tier, 2) as VisibilityTier;
  }
  if (Boolean(p.tiers?.tier3_liveness)) {
    tier = Math.max(tier, 3) as VisibilityTier;
  }
  if (Boolean(p.tiers?.tier4_skillProof)) {
    tier = Math.max(tier, 4) as VisibilityTier;
  }
  return tier;
}

export function addDaysIso(fromIso: string, days: number): string {
  const d = new Date(fromIso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

export function daysRemainingUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const end = Date.parse(iso);
  if (!Number.isFinite(end)) return null;
  const ms = end - Date.now();
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

/**
 * Go Live gate for visibility tiers (on top of profile status).
 */
export function canGoLiveForVisibilityTier(
  p: ArtisanVerificationProfile | null | undefined
): { allowed: true } | { allowed: false; message: string } {
  if (!p) {
    return {
      allowed: false,
      message:
        "Complete your verification in settings first. Submit your profile for review.",
    };
  }
  if (p.status === "suspended") {
    return { allowed: false, message: "Account suspended. Contact Ona Care." };
  }
  if (p.status === "rejected") {
    return {
      allowed: false,
      message: p.rejectReason
        ? `Profile rejected: ${p.rejectReason}.`
        : "Profile rejected. Update and resubmit.",
    };
  }
  if (p.status === "draft" || p.status === "pending_review") {
    return {
      allowed: false,
      message:
        p.status === "pending_review"
          ? "Your profile is pending admin review. You cannot Go Live yet."
          : "Complete your verification in settings first. Submit your profile for review.",
    };
  }

  const tier = resolveVisibilityTier(p);
  const rules = rulesForTier(tier);

  if (!rules.canGoLive || tier < 2) {
    return {
      allowed: false,
      message:
        "Tier 1: you can register and set up your profile. Admin must approve Tier 2 before Go Live.",
    };
  }

  // Tier 2: 30-day window after approval
  if (tier === 2 && rules.goLiveWindowDays != null) {
    const ends =
      p.goLiveWindowEndsAt ||
      (p.tier2ApprovedAt
        ? addDaysIso(p.tier2ApprovedAt, rules.goLiveWindowDays)
        : null);
    if (ends) {
      const left = daysRemainingUntil(ends);
      if (left != null && left <= 0) {
        return {
          allowed: false,
          message:
            "Your Tier 2 Go Live window (30 days) has ended. Complete Tier 3 approval to Go Live again.",
        };
      }
    }
  }

  return { allowed: true };
}

/** Warning copy when Tier 2 window is within 5 days */
export function tier2GoLiveWarning(
  p: ArtisanVerificationProfile | null | undefined
): string | null {
  if (!p) return null;
  const tier = resolveVisibilityTier(p);
  if (tier !== 2) return null;
  const ends =
    p.goLiveWindowEndsAt ||
    (p.tier2ApprovedAt
      ? addDaysIso(p.tier2ApprovedAt, TIER2_GO_LIVE_DAYS)
      : null);
  if (!ends) return null;
  const left = daysRemainingUntil(ends);
  if (left == null || left > TIER2_WARN_DAYS_BEFORE || left <= 0) return null;
  return `Go Live ends in ${left} day${left === 1 ? "" : "s"}. Get Tier 3 approval to keep receiving jobs.`;
}

/**
 * Ranking: (A) score × visibility%, (C) extra soft penalty for lower visibility.
 * (B) appear chance applied separately when filtering the list.
 */
export function visibilityScoreMultiplier(percent: number): number {
  const p = Math.max(0, Math.min(100, percent)) / 100;
  return p;
}

/** Soft rank penalty points for incomplete visibility (C) */
export function visibilitySoftPenalty(percent: number): number {
  const missing = Math.max(0, 100 - Math.max(0, Math.min(100, percent)));
  return missing * 0.35; // up to 35 pts at 0%
}

/**
 * Stochastic filter (B): each pro appears with probability = visibility%.
 * Seeded by pro id + hour so lists stay stable within a short window.
 */
export function passesAppearChance(
  proId: string,
  visibilityPercent: number,
  nowMs: number = Date.now()
): boolean {
  if (visibilityPercent >= 100) return true;
  if (visibilityPercent <= 0) return false;
  const hourBucket = Math.floor(nowMs / (60 * 60 * 1000));
  let h = 0;
  const s = `${proId}:${hourBucket}`;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const roll = (h % 10000) / 100; // 0–99.99
  return roll < visibilityPercent;
}

/** Apply admin promotion to a target tier (2–4). */
export function applyAdminTierPromotion(
  p: ArtisanVerificationProfile,
  target: 2 | 3 | 4,
  adminName: string
): ArtisanVerificationProfile {
  const now = new Date().toISOString();
  const next: ArtisanVerificationProfile = {
    ...p,
    status: "approved",
    visibilityTier: target,
    reviewedAt: now,
    reviewedBy: adminName,
    rejectReason: null,
    updatedAt: now,
  };

  if (target >= 2) {
    next.tier2ApprovedAt = p.tier2ApprovedAt || now;
    if (target === 2 || !p.goLiveWindowEndsAt) {
      next.goLiveWindowEndsAt = addDaysIso(
        next.tier2ApprovedAt,
        TIER2_GO_LIVE_DAYS
      );
    }
    next.isNewArtisan = true;
  }
  if (target >= 3) {
    next.tier3ApprovedAt = now;
    next.isNewArtisan = false;
    // Unlimited Go Live after Tier 3
    next.goLiveWindowEndsAt = null;
  }
  if (target >= 4) {
    next.tier4ApprovedAt = now;
    next.isNewArtisan = false;
    next.goLiveWindowEndsAt = null;
  }

  // Sync boolean tier completion flags for UI
  next.tiers = {
    ...p.tiers,
    tier1_phone: p.tiers.tier1_phone || true,
    tier2_govId: target >= 2 ? true : p.tiers.tier2_govId,
    tier2_nin: target >= 2 ? true : p.tiers.tier2_nin,
    tier3_liveness: target >= 3 ? true : p.tiers.tier3_liveness,
    tier4_skillProof: target >= 4 ? true : p.tiers.tier4_skillProof,
  };

  if (target >= 2) {
    next.govIdReviewStatus = "approved";
    next.ninReviewStatus = "approved";
  }

  return next;
}

/**
 * Tier 4: if pro already has ratings, append one 1★ seed once.
 * Returns new average/count or null if not applicable.
 */
export function maybeSeedTier4OneStar(input: {
  alreadySeeded?: boolean;
  ratingCount: number;
  ratingAvg: number;
}): { ratingAvg: number; ratingCount: number; seeded: true } | null {
  if (input.alreadySeeded) return null;
  if (!Number.isFinite(input.ratingCount) || input.ratingCount < 1) return null;
  const count = input.ratingCount + 1;
  const sum = input.ratingAvg * input.ratingCount + 1;
  return {
    ratingAvg: Math.round((sum / count) * 10) / 10,
    ratingCount: count,
    seeded: true,
  };
}
