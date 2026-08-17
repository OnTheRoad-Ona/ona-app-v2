/**
 * Ona premium job / escrow domain types.
 */

import type { AppCurrency } from "@/lib/pricing";
import type { Coordinates, ProService } from "@/lib/types";

/** Full escrow job lifecycle */
export type JobFlowStatus =
  | "scheduled"
  | "waiting_for_selected"
  | "selected_review"
  | "sequential_pairing"
  | "waiting_for_pro"
  | "reserved"
  | "negotiating"
  | "searching"
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
  /** Client idempotency sticker — dedupes bad-network retries */
  clientOfferId?: string | null;
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
  /** Client idempotency sticker from the creating request (dedupe) */
  clientRequestId?: string | null;
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
  statusHistory: { status: JobFlowStatus; at: string; by?: string; note?: string }[];
  createdAt: string;
  updatedAt: string;
  paidAt?: string | null;
  releasedAt?: string | null;
  cancelledAt?: string | null;
  satisfiedAt?: string | null;
  /**
   * Pay-to-book attempts that exhausted the 20‑min window unpaid (0–3).
   * Derived from statusHistory; optional cache for clients.
   */
  paymentAttemptCount?: number;
  /** ISO end of the current open pay session (if any) */
  paymentSessionEndsAt?: string | null;
  /** SSPE dispatch fields (see docs/SSPE_REFACTOR_PLAN.md §3) */
  pairingStage?: string | null;
  pairingDeadline?: string | null;
  queuePosition?: number | null;
  remainingCandidates?: number | null;
  reservationStatus?: string | null;
  assignmentStatus?: string | null;
  chosenProId?: string | null;
  pairingRadiusKm?: number | null;
  radiusKm?: number | null;
  /**
   * Tow "add another repair pro": id of the primary (tow) request that arms
   * this scheduled second request. Non-null only on the linked request.
   */
  linkedRequestId?: string | null;
  /**
   * ISO when the second request becomes dispatchable (armed 60 min after the
   * primary request's pro accepts). Null until armed.
   */
  scheduledDispatchAt?: string | null;
  /** ISO when the motorist was first pinged to enter their address (notify once) */
  dispatchNotifiedAt?: string | null;
};

export type CreateJobInput = {
  motoristId: string;
  motoristName: string;
  motoristPhoto?: string | null;
  /** e.g. "Toyota Camry 2018" — which vehicle needs help */
  motoristVehicle?: string | null;
  /** Empty / omitted → SSPE picks the first Live pro (no customer pick). */
  repairProId?: string;
  repairProName?: string;
  repairProPhoto?: string;
  emergency?: boolean;
  serviceType: ProService;
  problem: string;
  voiceNote?: JobMedia | null;
  photos?: JobMedia[];
  currency: AppCurrency;
  proBaseMajor?: number | null;
  locationLabel: string;
  motoristLocation: Coordinates;
  /** Customer's chosen search radius (0–5 km slider); caps pairing expansion */
  radiusKm?: number | null;
  /** Client idempotency sticker — dedupes bad-network retries */
  clientRequestId?: string | null;
  /** Optional classification — server still re-derives eligibility. */
  atWorkshop?: boolean;
  remoteConsultation?: boolean;
  physicalAttendanceRequired?: boolean;
  calloutEligible?: boolean;
  /** Call-out fee only: normal 1x, emergency 1.25x, remote 1.35x, night 1.5x */
  calloutUrgency?: "normal" | "emergency" | "remote" | "night";
  /**
   * Tow "add another repair pro": also create a scheduled linked request for
   * this trade (dispatched 60 min after the primary request's pro accepts).
   */
  meetProTrade?: ProService | null;
  /**
   * Internal — set only when creating the scheduled linked request itself
   * (points back at the primary request id).
   */
  linkedRequestId?: string | null;
};
