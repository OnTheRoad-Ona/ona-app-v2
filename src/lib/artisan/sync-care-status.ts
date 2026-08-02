/**
 * Forever rule: Care / admin verification status is server-owned.
 *
 * - Client local draft is a cache only.
 * - Always load with authFetch (Bearer) — never plain fetch on requireUser routes.
 * - Dual-role: Care may approve Customer (motorist) OR Pro (repair_pro) — both count.
 * - When server says approved, local "submitted" is always overwritten.
 *
 * All verification UI (onboarding, sheet, dashboard) must use this module.
 */

import { authFetch } from "@/lib/api-auth-headers";
import {
  getArtisanProfile,
  saveArtisanProfile,
} from "@/lib/artisan/local-store";
import type {
  ArtisanVerificationProfile,
  IdentityReviewStatus,
} from "@/lib/artisan/types";

/** Slim pro row fields used for Care → app status */
export type CareProSnapshot = {
  status?: string | null;
  pipeline_status?: string | null;
  pipeline_notes?: string | null;
  rejection_reason?: string | null;
  gov_id_review_status?: string | null;
  docs_status?: string | null;
  visibility_tier?: number | null;
  verified?: boolean | null;
  nin_verified?: boolean | null;
  face_liveness_verified?: boolean | null;
  tier2_approved_at?: string | null;
  tier3_approved_at?: string | null;
  tier4_approved_at?: string | null;
  go_live_window_ends_at?: string | null;
};

/** Slim motorist identity (dual-role Care path) */
export type CareMotoristSnapshot = {
  identity_review_status?: string | null;
  identity_verified_at?: string | null;
  nin_verified?: boolean | null;
  bvn_verified?: boolean | null;
};

export type CareServerSnapshot = {
  pro: CareProSnapshot | null;
  motorist: CareMotoristSnapshot | null;
};

export type ApplyCareResult = {
  profile: ArtisanVerificationProfile;
  changed: boolean;
  t2Approved: boolean;
  govStatus: IdentityReviewStatus;
  userMessage: string | null;
  /** Sync failed / nothing useful from server */
  empty: boolean;
};

function asStatus(raw: string | null | undefined): string {
  return String(raw || "none").toLowerCase();
}

/** Pure: is Tier 2 Care-approved from either side of dual role? */
export function isServerT2Approved(
  pro: CareProSnapshot | null | undefined,
  motorist: CareMotoristSnapshot | null | undefined
): boolean {
  const gov = asStatus(pro?.gov_id_review_status);
  const motId = asStatus(motorist?.identity_review_status);
  return (
    gov === "approved" ||
    motId === "approved" ||
    Boolean(pro?.verified) ||
    Boolean(pro?.nin_verified) ||
    Boolean(motorist?.nin_verified) ||
    Boolean(motorist?.identity_verified_at)
  );
}

/** Pure: resolve gov ID review chip from server (server wins over local submitted). */
export function resolveGovIdReviewFromServer(
  pro: CareProSnapshot | null | undefined,
  motorist: CareMotoristSnapshot | null | undefined,
  local: IdentityReviewStatus | undefined
): IdentityReviewStatus {
  if (isServerT2Approved(pro, motorist)) return "approved";
  const gov = asStatus(pro?.gov_id_review_status);
  const motId = asStatus(motorist?.identity_review_status);
  if (gov === "rejected" || motId === "rejected") return "rejected";
  if (gov === "submitted" || motId === "submitted") return "submitted";
  if (gov === "none" && motId === "none" && local === "submitted") {
    // Server cleared submitted — unlock
    return "none";
  }
  // If local was submitted but server has no signal, keep local only when server empty
  if (!pro && !motorist) return local || "none";
  return (local as IdentityReviewStatus) || "none";
}

/**
 * Pure merge: server Care status onto local artisan draft.
 * Approved always overwrites local "submitted".
 */
export function applyCareServerToLocalDraft(
  local: ArtisanVerificationProfile,
  snapshot: CareServerSnapshot
): ApplyCareResult {
  const pro = snapshot.pro;
  const mot = snapshot.motorist;

  if (!pro && asStatus(mot?.identity_review_status) !== "approved") {
    return {
      profile: local,
      changed: false,
      t2Approved: false,
      govStatus: local.govIdReviewStatus || "none",
      userMessage: null,
      empty: true,
    };
  }

  let merged: ArtisanVerificationProfile = { ...local, tiers: { ...local.tiers } };
  let changed = false;

  const gov = asStatus(pro?.gov_id_review_status);
  const motId = asStatus(mot?.identity_review_status);
  const docs = asStatus(pro?.docs_status);
  const pipe = String(pro?.pipeline_status || "");
  const careReset =
    pipe === "needs_resubmit" ||
    /re-?\s*submit/i.test(String(pro?.rejection_reason || "")) ||
    /re-?\s*submit/i.test(String(pro?.pipeline_notes || ""));

  const t2Approved = isServerT2Approved(pro, mot);
  const visRaw = Number(pro?.visibility_tier);
  const vis = (
    visRaw >= 1 && visRaw <= 4 ? visRaw : local.visibilityTier || 1
  ) as 1 | 2 | 3 | 4;
  const proStatus = String(pro?.status || "");

  let userMessage: string | null = null;

  if (t2Approved) {
    const nextTiers = {
      ...merged.tiers,
      tier2_govId: true,
      tier2_nin:
        Boolean(pro?.nin_verified) ||
        Boolean(mot?.nin_verified) ||
        gov === "approved" ||
        motId === "approved" ||
        merged.tiers.tier2_nin,
      tier3_liveness:
        Boolean(pro?.face_liveness_verified) || merged.tiers.tier3_liveness,
      tier4_skillProof:
        docs === "approved" || merged.tiers.tier4_skillProof,
    };
    const fullyApproved =
      proStatus === "approved" || (t2Approved && vis >= 2);

    if (
      merged.govIdReviewStatus !== "approved" ||
      !merged.tiers.tier2_govId ||
      (fullyApproved && merged.status !== "approved") ||
      merged.visibilityTier !== vis
    ) {
      merged = {
        ...merged,
        status: fullyApproved ? "approved" : merged.status,
        rejectReason: fullyApproved ? null : merged.rejectReason,
        // FOREVER: server approved always replaces local submitted
        govIdReviewStatus: "approved",
        ninReviewStatus:
          Boolean(pro?.nin_verified) ||
          Boolean(mot?.nin_verified) ||
          gov === "approved" ||
          motId === "approved"
            ? "approved"
            : merged.ninReviewStatus,
        tiers: nextTiers,
        visibilityTier: vis,
        tier2ApprovedAt:
          pro?.tier2_approved_at ||
          merged.tier2ApprovedAt ||
          new Date().toISOString(),
        tier3ApprovedAt: pro?.tier3_approved_at || merged.tier3ApprovedAt,
        tier4ApprovedAt: pro?.tier4_approved_at || merged.tier4ApprovedAt,
        goLiveWindowEndsAt:
          pro?.go_live_window_ends_at || merged.goLiveWindowEndsAt,
        isNewArtisan: vis <= 2,
      };
      changed = true;
      userMessage = "Government ID approved. Tier 2 privileges unlocked.";
    }
  } else if (careReset || gov === "rejected" || motId === "rejected") {
    if (
      merged.status === "pending_review" ||
      merged.status === "approved" ||
      merged.govIdReviewStatus === "submitted" ||
      merged.govIdReviewStatus === "approved" ||
      merged.tiers.tier2_govId
    ) {
      merged = {
        ...merged,
        status: "rejected",
        rejectReason:
          pro?.rejection_reason ||
          pro?.pipeline_notes ||
          "Care asked you to re-submit verification.",
        govIdReviewStatus:
          gov === "rejected" || motId === "rejected" ? "rejected" : "none",
        ninReviewStatus: "none",
        tiers: {
          ...merged.tiers,
          tier2_govId: false,
          tier2_nin: false,
          tier3_liveness: Boolean(pro?.face_liveness_verified),
          tier4_skillProof: docs === "approved",
        },
        visibilityTier: vis,
      };
      changed = true;
      userMessage =
        pro?.rejection_reason ||
        pro?.pipeline_notes ||
        "Care reset your verification. Re-submit ID / skill docs below.";
    }
  } else if (gov === "submitted" || motId === "submitted") {
    if (merged.govIdReviewStatus !== "submitted") {
      merged = {
        ...merged,
        govIdReviewStatus: "submitted",
        status:
          merged.status === "draft" ? "pending_review" : merged.status,
      };
      changed = true;
    }
  } else if (
    gov === "none" &&
    motId === "none" &&
    merged.govIdReviewStatus === "submitted"
  ) {
    merged = {
      ...merged,
      govIdReviewStatus: "none",
      status: merged.status === "pending_review" ? "draft" : merged.status,
    };
    changed = true;
  }

  if (vis !== merged.visibilityTier) {
    merged = {
      ...merged,
      visibilityTier: vis,
      tier2ApprovedAt: pro?.tier2_approved_at || merged.tier2ApprovedAt,
      tier3ApprovedAt: pro?.tier3_approved_at || merged.tier3ApprovedAt,
      tier4ApprovedAt: pro?.tier4_approved_at || merged.tier4ApprovedAt,
      goLiveWindowEndsAt:
        pro?.go_live_window_ends_at || merged.goLiveWindowEndsAt,
      isNewArtisan: vis <= 2,
    };
    changed = true;
  }

  if (docs === "under_review" && merged.skillProofStatus !== "under_review") {
    merged = {
      ...merged,
      skillProofStatus: "under_review",
      tiers: { ...merged.tiers, tier4_skillProof: true },
    };
    changed = true;
  }
  if (docs === "approved" && !merged.tiers.tier4_skillProof) {
    merged = {
      ...merged,
      skillProofStatus: "approved",
      tiers: { ...merged.tiers, tier4_skillProof: true },
    };
    changed = true;
  }

  const govStatus = resolveGovIdReviewFromServer(
    pro,
    mot,
    merged.govIdReviewStatus
  );
  // Hard guarantee: never leave submitted when server says approved
  if (t2Approved && merged.govIdReviewStatus !== "approved") {
    merged = {
      ...merged,
      govIdReviewStatus: "approved",
      tiers: { ...merged.tiers, tier2_govId: true },
    };
    changed = true;
    userMessage =
      userMessage || "Government ID approved. Tier 2 privileges unlocked.";
  }

  return {
    profile: merged,
    changed,
    t2Approved,
    govStatus: t2Approved ? "approved" : govStatus,
    userMessage,
    empty: false,
  };
}

/**
 * Authenticated load of Care-facing profile status.
 * MUST use authFetch — plain fetch returns 401 and freezes UI on "in review".
 */
export async function loadArtisanServerProfile(
  userId: string
): Promise<
  | { ok: true; snapshot: CareServerSnapshot }
  | { ok: false; status: number; error: string }
> {
  const res = await authFetch(
    `/api/artisan/profile?userId=${encodeURIComponent(userId)}`,
    { cache: "no-store" }
  );
  const json = (await res.json().catch(() => null)) as {
    ok?: boolean;
    data?: {
      pro?: CareProSnapshot | null;
      motorist?: CareMotoristSnapshot | null;
    };
    error?: { message?: string };
  } | null;

  if (!res.ok || !json?.ok) {
    return {
      ok: false,
      status: res.status,
      error:
        json?.error?.message ||
        (res.status === 401
          ? "Not authenticated — cannot refresh verification status"
          : `Could not load verification status (${res.status})`),
    };
  }

  return {
    ok: true,
    snapshot: {
      pro: json.data?.pro ?? null,
      motorist: json.data?.motorist ?? null,
    },
  };
}

export type SyncCareStatusResult =
  | (ApplyCareResult & {
      ok: true;
      authFailed: false;
      networkError: false;
      errorMessage: null;
    })
  | {
      ok: false;
      profile: ArtisanVerificationProfile | null;
      changed: false;
      t2Approved: false;
      govStatus: IdentityReviewStatus;
      userMessage: null;
      empty: true;
      authFailed: boolean;
      networkError: boolean;
      errorMessage: string;
    };

/**
 * Full pipeline: authFetch server → merge onto local draft → save if changed.
 * Call on mount + poll from verification UI and pro dashboard.
 */
export async function syncArtisanCareStatus(
  userId: string,
  opts?: { local?: ArtisanVerificationProfile | null }
): Promise<SyncCareStatusResult> {
  const local = opts?.local || getArtisanProfile(userId) || null;

  if (!local) {
    return {
      ok: false,
      profile: null,
      changed: false,
      t2Approved: false,
      govStatus: "none",
      userMessage: null,
      empty: true,
      authFailed: false,
      networkError: false,
      errorMessage: "No local artisan draft",
    };
  }

  try {
    const loaded = await loadArtisanServerProfile(userId);
    if (!loaded.ok) {
      return {
        ok: false,
        profile: local,
        changed: false,
        t2Approved: false,
        govStatus: local.govIdReviewStatus || "none",
        userMessage: null,
        empty: true,
        authFailed: loaded.status === 401,
        networkError: false,
        errorMessage: loaded.error,
      };
    }

    const applied = applyCareServerToLocalDraft(local, loaded.snapshot);
    if (applied.changed) {
      saveArtisanProfile(applied.profile);
    }
    return {
      ...applied,
      ok: true,
      authFailed: false,
      networkError: false,
      errorMessage: null,
    };
  } catch (e) {
    return {
      ok: false,
      profile: local,
      changed: false,
      t2Approved: false,
      govStatus: local.govIdReviewStatus || "none",
      userMessage: null,
      empty: true,
      authFailed: false,
      networkError: true,
      errorMessage:
        e instanceof Error ? e.message : "Network error refreshing status",
    };
  }
}

/** Default poll interval for Care approval (ms). */
export const CARE_STATUS_POLL_MS = 4000;
