/**
 * Artisan Registration & Verification domain (Ona / OgaMecho).
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
  tier2_govId: boolean;
  tier2_bvn: boolean;
  tier3_liveness: boolean;
  tier4_skillProof: boolean;
};

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
  kind: "portfolio" | "id_front" | "id_back" | "selfie" | "skill_proof" | "intro_video";
  name?: string;
  mime?: string;
  createdAt: string;
};

export type ArtisanGuarantor = {
  fullName: string;
  phone: string;
};

export type ArtisanServiceArea = {
  /** e.g. Lagos */
  states: string[];
  /** e.g. Ikeja, Lekki */
  cities: string[];
  /** e.g. Eti-Osa */
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

  /** Tier 2 */
  govIdType?: GovIdType | null;
  govIdNumber?: string | null;
  govIdFront?: ArtisanMedia | null;
  govIdBack?: ArtisanMedia | null;
  bvn?: string | null;
  bvnVerified?: boolean;
  /** Last successful ID verify meta */
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
   * 1 = register only · 2 = 30% + 30-day Go Live · 3 = 70% + 3 km · 4 = 100% + 10 km
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

/** Intro video length guidance (seconds) */
export const INTRO_VIDEO_MIN_SEC = 30;
export const INTRO_VIDEO_MAX_SEC = 60;

export type ArtisanOnboardingStep =
  | "trade"
  | "profession"
  | "phone"
  | "essentials"
  | "portfolio"
  | "video"
  | "optional_tiers"
  | "review";
