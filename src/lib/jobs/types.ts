/**
 * Ona premium job / escrow domain types.
 */

import type { AppCurrency } from "@/lib/pricing";
import type { Coordinates, ProService } from "@/lib/types";

/** Full escrow job lifecycle */
export type JobFlowStatus =
  | "negotiating"
  | "agreed"
  | "paid_booked"
  | "en_route"
  | "arrived"
  | "in_progress"
  | "completed"
  | "satisfied"
  | "released"
  | "cancelled"
  | "expired"
  | "disputed"
  | "under_appeal"
  | "refunded";

export type OfferSide = "repair_pro" | "motorist";

export type NegotiationUiStatus =
  | "waiting"
  | "countered"
  | "agreed"
  | "expired";

export type DisputeReason =
  | "work_incomplete"
  | "poor_quality"
  | "wrong_service"
  | "no_show"
  | "price_disagreement"
  | "other";

export type DisputeOutcome =
  | "full_release_pro"
  | "full_refund_motorist"
  | "partial_split";

export type MediaKind = "photo" | "voice" | "other";

export type JobMedia = {
  id: string;
  kind: MediaKind;
  url: string;
  name?: string;
  mime?: string;
  durationSec?: number;
  createdAt: string;
  uploadedBy: string;
};

export type JobOffer = {
  id: string;
  side: OfferSide;
  /** Major currency units (labour only) */
  amountMajor: number;
  amountMinor: number;
  currency: AppCurrency;
  createdAt: string;
  /** 1-based index in negotiation (max 6) */
  offerIndex: number;
};

export type JobDispute = {
  id: string;
  openedBy: "motorist" | "repair_pro";
  reason: DisputeReason;
  description: string;
  media: JobMedia[];
  openedAt: string;
  /** Admin first decision */
  decision?: {
    outcome: DisputeOutcome;
    proPercent: number;
    motoristPercent: number;
    note?: string;
    decidedAt: string;
    decidedBy?: string;
  };
  appeal?: {
    openedBy: "motorist" | "repair_pro";
    reason: string;
    media: JobMedia[];
    openedAt: string;
    decision?: {
      outcome: DisputeOutcome;
      proPercent: number;
      motoristPercent: number;
      note?: string;
      decidedAt: string;
      decidedBy?: string;
      final: true;
    };
  };
  status: "open" | "resolved" | "under_appeal" | "final";
};

export type EvidenceScores = {
  photoScore: number;
  voiceScore: number;
  locationScore: number;
  timestampScore: number;
  composite: number;
  flags: string[];
  priority: "auto_priority" | "normal" | "request_more";
  computedAt: string;
};

export type JobRecord = {
  id: string;
  motoristId: string;
  motoristName: string;
  /** Motorist profile avatar URL when set */
  motoristPhoto?: string | null;
  /** From profiles.phone — for in-app Call */
  motoristPhone?: string | null;
  /** Motorist vehicle (from profile) e.g. "Toyota Camry" */
  motoristVehicle?: string | null;
  repairProId: string;
  repairProName: string;
  repairProPhoto?: string;
  /** From profiles.phone — for in-app Call */
  repairProPhone?: string | null;
  serviceType: ProService;
  problem: string;
  voiceNote?: JobMedia | null;
  photos: JobMedia[];
  status: JobFlowStatus;
  currency: AppCurrency;
  /** Pro's opening / reference labour price (major) */
  proBaseMajor: number | null;
  /** Final agreed labour (major) */
  agreedMajor: number | null;
  offers: JobOffer[];
  /** Negotiation window end (ISO) — 20 min from create */
  negotiateEndsAt: string;
  /** Max offers total (pro + motorist), up to 6 */
  maxOffers: number;
  locationLabel: string;
  motoristLocation: Coordinates;
  proLocation?: Coordinates | null;
  distanceKm?: number;
  etaMinutes?: number;
  /** Google Distance Matrix human text e.g. "12 mins" */
  etaText?: string | null;
  distanceText?: string | null;
  /** google_distance_matrix | haversine_fallback */
  etaSource?: string | null;
  /** Last pro GPS ping ISO */
  proLocationAt?: string | null;
  /** Last motorist GPS ping ISO */
  motoristLocationAt?: string | null;
  paymentId?: string | null;
  paymentReference?: string | null;
  escrowStatus?: string | null;
  amountMinor?: number | null;
  platformFeeMinor?: number | null;
  proPayoutMinor?: number | null;
  dispute?: JobDispute | null;
  evidence?: EvidenceScores | null;
  rating?: number | null;
  ratingNote?: string | null;
  statusHistory: { status: JobFlowStatus; at: string; by?: string }[];
  createdAt: string;
  updatedAt: string;
  paidAt?: string | null;
  releasedAt?: string | null;
  cancelledAt?: string | null;
  satisfiedAt?: string | null;
};

export type CreateJobInput = {
  motoristId: string;
  motoristName: string;
  motoristPhoto?: string | null;
  repairProId: string;
  repairProName: string;
  repairProPhoto?: string;
  serviceType: ProService;
  problem: string;
  voiceNote?: JobMedia | null;
  photos?: JobMedia[];
  currency: AppCurrency;
  proBaseMajor?: number | null;
  locationLabel: string;
  motoristLocation: Coordinates;
};
