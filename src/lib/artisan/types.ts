/**
 * Artisan Registration & Verification domain (Ona / Ona).
 * Status machine: draft → pending_review → approved | rejected → suspended
 */

import type { ProService } from "@/lib/types";

/** Backend/profile lifecycle for artisans (Repair Pros) */
export type ArtisanProfileStatus =
  | "draft"
  | "pending_review"
  | "approved"
  | "rejected"
  | "suspended";

/** Verification tier progress */
export type VerificationTierId = 1 | 2 | 3 | 4;

export type TierCompletion = {
  tier1_phone: boolean;
  /** Admin/care approved government ID upload */
  tier2_govId: boolean;
  /** Admin/care approved NIN number + document (replaces live BVN verify) */
  tier2_nin: boolean;
  tier3_liveness: boolean;
  tier4_skillProof: boolean;
};

/** Manual review queue for identity docs */
export type IdentityReviewStatus =
  | "none"
  | "submitted"
  | "approved"
  | "rejected";

export type GovIdType =
  | "nin"
  | "drivers_licence"
  | "voters_card"
  | "international_passport";

export type SkillProofType =
  | "trade_test"
  | "nabteb"
  | "itf"
  | "apprenticeship_letter"
  | "other_evidence";

export type ArtisanMedia = {
  id: string;
  /** data URL or remote URL after upload */
  url: string;
  kind:
    | "portfolio"
    | "id_front"
    | "id_back"
    | "nin_doc"
    | "selfie"
    | "skill_proof"
    | "intro_video";
  name?: string;
  mime?: string;
  createdAt: string;
};

export type ArtisanGuarantor = {
  fullName: string;
  phone: string;
};

export type ArtisanServiceArea = {
  /** ISO 3166-1 alpha-2 from signup — locked in onboarding */
  countryCode?: string;
  countryName?: string;
  /** Single selected state (array kept for storage compatibility, max 1 in UI) */
  states: string[];
  /** Multiple cities within the selected state */
  cities: string[];
  /** Multiple LGAs (Nigeria); empty for countries without LGA data */
  lgas: string[];
};

/**
 * Primary trade + optional specialty (sub-category).
 * Matches motorist trade bar + industrial/commercial splits.
 */
export type ArtisanTradeSelection = {
  service: ProService;
  /** e.g. "Vehicle AC" | "House Electrician" */
  specialty?: string | null;
};

export type ArtisanVerificationProfile = {
  userId: string;
  fullName: string;
  phone: string;
  email?: string;

  status: ArtisanProfileStatus;
  tiers: TierCompletion;

  trade: ArtisanTradeSelection;
  /** Category-specific answers (never car brands for Painter, etc.) */
  professionAnswers?: Record<string, string | string[]>;
  yearsExperience: number;
  serviceArea: ArtisanServiceArea;
  toolsOwned: string[];
  guarantor: ArtisanGuarantor;

  portfolio: ArtisanMedia[];
  introVideo?: ArtisanMedia | null;

  /** Tier 2 — government ID (manual admin/care review) */
  govIdType?: GovIdType | null;
  govIdNumber?: string | null;
  govIdFront?: ArtisanMedia | null;
  govIdBack?: ArtisanMedia | null;
  govIdReviewStatus?: IdentityReviewStatus;
  govIdSubmittedAt?: string | null;

  /** Tier 2 — NIN number + document (manual admin/care review; no live BVN verify) */
  nin?: string | null;
  ninDoc?: ArtisanMedia | null;
  ninReviewStatus?: IdentityReviewStatus;
  ninSubmittedAt?: string | null;

  /** @deprecated kept for older local drafts */
  bvn?: string | null;
  bvnVerified?: boolean;
  idVerifyProvider?: string | null;
  idVerifyMode?: string | null;
  idVerifyReference?: string | null;
  idVerifiedAt?: string | null;
  bvnVerifiedAt?: string | null;

  /** Tier 3 */
  selfie?: ArtisanMedia | null;
  livenessPassed?: boolean;
  livenessPassedAt?: string | null;

  /** Tier 4 */
  skillProofType?: SkillProofType | null;
  skillProof?: ArtisanMedia | null;
  skillProofStatus?: "none" | "uploaded" | "under_review" | "approved" | "rejected";

  /** Admin review */
  submittedAt?: string | null;
  reviewedAt?: string | null;
  reviewedBy?: string | null;
  rejectReason?: string | null;

  /** New Artisan badge — Tier 1–2 on; Tier 3–4 off */
  isNewArtisan: boolean;
  successfulJobsCount: number;

  /**
   * Marketplace visibility ladder (admin-approved).
   * 1 = register only · 2 = 30% + 30-day Go Live · 3 = 70% + 5 km · 4 = 100% + 5 km
   */
  visibilityTier?: 1 | 2 | 3 | 4;
  tier2ApprovedAt?: string | null;
  tier3ApprovedAt?: string | null;
  tier4ApprovedAt?: string | null;
  /** Tier 2 Go Live deadline (ISO); null after Tier 3+ */
  goLiveWindowEndsAt?: string | null;
  /** Tier 4 one-star seed applied once when they already had ratings */
  tier4OneStarSeeded?: boolean;

  createdAt: string;
  updatedAt: string;
};

/** Drop “New Artisan” after this many completed+released jobs */
export const NEW_ARTISAN_JOBS_THRESHOLD = 5;

/** Portfolio photos required before submit */
export const PORTFOLIO_MIN = 4;
export const PORTFOLIO_MAX = 6;

/** Max size per portfolio / ID image (bytes) */
export const IMAGE_MAX_BYTES = 2 * 1024 * 1024; // 2 MB

/** Intro video limits */
export const INTRO_VIDEO_MIN_SEC = 1;
export const INTRO_VIDEO_MAX_SEC = 30;
export const INTRO_VIDEO_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export type ArtisanOnboardingStep =
  | "trade"
  | "profession"
  | "phone"
  | "essentials"
  | "portfolio"
  | "video"
  | "optional_tiers"
  | "review";
