import {
  MAX_NEGOTIATION_OFFERS,
  paymentEndsAtIso,
  paymentWindowsExpiredCount,
} from "@/lib/jobs/constants";
import { NEGOTIATE_WINDOW_MS } from "@/lib/jobs/constants";
import type { JobFlowStatus, JobMedia, JobOffer, JobRecord } from "@/lib/jobs/types";
import type { AppCurrency } from "@/lib/pricing";
import { splitServiceChargeMinor, toMinorUnits } from "@/lib/pricing";
import { MAX_RADIUS_KM } from "@/lib/matching";
import { FLOW_STATUSES } from "./constants";
import { randomUUID } from "node:crypto";

export function legacyToFlowStatus(
  legacy: string | null | undefined,
): JobFlowStatus | null {
  switch ((legacy || "").toLowerCase()) {
    case "requested":
    case "draft":
    case "matched":
      return "negotiating";
    case "accepted":
      return "paid_booked";
    case "en_route":
      return "en_route";
    case "arrived":
      return "arrived";
    case "in_progress":
      return "in_progress";
    case "completed":
      return "completed";
    case "cancelled":
      return "cancelled";
    default:
      return null;
  }
}

export function flowToLegacyStatus(flow: JobFlowStatus): string {
  switch (flow) {
    case "scheduled":
    case "waiting_for_selected":
    case "selected_review":
    case "sequential_pairing":
    case "waiting_for_pro":
    case "reserved":
    case "negotiating":
    case "searching":
    case "agreed":
      return "requested";
    case "paid_booked":
      return "accepted";
    case "en_route":
      return "en_route";
    case "arrived":
      return "arrived";
    case "in_progress":
      return "in_progress";
    case "completed":
    case "satisfied":
    case "released":
      return "completed";
    case "cancelled":
    case "expired":
    case "refunded":
    case "disputed":
    case "under_appeal":
      return "cancelled";
    default:
      return "requested";
  }
}

export function resolveFlowStatus(row: Record<string, unknown>): JobFlowStatus {
  const flow = String(row.flow_status || "").trim();
  if (flow && FLOW_STATUSES.has(flow)) return flow as JobFlowStatus;
  return legacyToFlowStatus(String(row.status || "")) || "negotiating";
}

export function rowToJob(row: Record<string, unknown>): JobRecord {
  let offers: JobOffer[] = [];
  const rawOffers = row.offers;
  if (Array.isArray(rawOffers)) {
    offers = rawOffers as JobOffer[];
  } else if (typeof rawOffers === "string" && rawOffers.trim()) {
    try {
      const parsed = JSON.parse(rawOffers) as JobOffer[];
      if (Array.isArray(parsed)) offers = parsed;
    } catch {
      offers = [];
    }
  }
  const statusHistory =
    (row.status_history as JobRecord["statusHistory"]) || [];
  const status = resolveFlowStatus(row);
  return {
    id: String(row.id),
    clientRequestId: row.client_request_id
      ? String(row.client_request_id)
      : null,
    motoristId: String(row.motorist_id),
    motoristName: String(row.motorist_name || "Customer"),
    motoristPhoto: row.motorist_photo ? String(row.motorist_photo) : null,
    motoristVehicle: row.motorist_vehicle
      ? String(row.motorist_vehicle).trim() || null
      : row.vehicle_label
        ? String(row.vehicle_label).trim() || null
        : null,
    repairProId: String(row.repair_pro_id || ""),
    repairProName: String(row.repair_pro_name || "Repair Pro"),
    repairProPhoto: row.repair_pro_photo
      ? String(row.repair_pro_photo)
      : undefined,
    serviceType: (row.service_type as JobRecord["serviceType"]) || "mechanic",
    problem: String(row.problem_text || row.description || ""),
    voiceNote: (row.voice_note as JobMedia) || null,
    photos: (row.photos as JobMedia[]) || [],
    status,
    currency: (row.pricing_currency as AppCurrency) || "NGN",
    proBaseMajor:
      row.pro_base_major != null ? Number(row.pro_base_major) : null,
    agreedMajor: row.agreed_major != null ? Number(row.agreed_major) : null,
    offers,
    negotiateEndsAt:
      String(row.negotiate_ends_at || "") ||
      new Date(Date.now() + NEGOTIATE_WINDOW_MS).toISOString(),
    maxOffers: Number(row.max_offers) || MAX_NEGOTIATION_OFFERS,
    locationLabel: String(row.pickup_address || "Near you"),
    motoristLocation: {
      lat: Number(row.pickup_lat) || 0,
      lng: Number(row.pickup_lng) || 0,
    },
    proLocation:
      row.pro_lat != null && row.pro_lng != null
        ? { lat: Number(row.pro_lat), lng: Number(row.pro_lng) }
        : null,
    distanceKm: row.distance_km != null ? Number(row.distance_km) : undefined,
    etaMinutes: row.eta_minutes != null ? Number(row.eta_minutes) : undefined,
    etaText: row.eta_text ? String(row.eta_text) : null,
    distanceText: row.distance_text ? String(row.distance_text) : null,
    etaSource: row.eta_source ? String(row.eta_source) : null,
    proLocationAt: row.pro_location_at ? String(row.pro_location_at) : null,
    motoristLocationAt: row.motorist_location_at
      ? String(row.motorist_location_at)
      : null,
    paymentId: row.payment_id ? String(row.payment_id) : null,
    paymentReference: row.payment_reference
      ? String(row.payment_reference)
      : null,
    escrowStatus: row.escrow_status ? String(row.escrow_status) : null,
    amountMinor: row.amount_minor != null ? Number(row.amount_minor) : null,
    platformFeeMinor:
      row.platform_fee_minor != null ? Number(row.platform_fee_minor) : null,
    proPayoutMinor:
      row.pro_payout_minor != null ? Number(row.pro_payout_minor) : null,
    dispute: (row.dispute as JobRecord["dispute"]) || null,
    evidence: (row.evidence as JobRecord["evidence"]) || null,
    rating: row.rating != null ? Number(row.rating) : null,
    ratingNote: row.rating_note ? String(row.rating_note) : null,
    statusHistory,
    createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || new Date().toISOString()),
    paidAt: row.paid_at ? String(row.paid_at) : null,
    releasedAt: row.released_at ? String(row.released_at) : null,
    cancelledAt: row.cancelled_at ? String(row.cancelled_at) : null,
    satisfiedAt: row.satisfied_at ? String(row.satisfied_at) : null,
    paymentAttemptCount: paymentWindowsExpiredCount({ statusHistory }),
    paymentSessionEndsAt: paymentEndsAtIso({ status, statusHistory }),
    pairingStage: row.pairing_stage ? String(row.pairing_stage) : null,
    pairingDeadline: row.pairing_deadline ? String(row.pairing_deadline) : null,
    queuePosition:
      row.queue_position != null ? Number(row.queue_position) : null,
    remainingCandidates:
      row.remaining_candidates != null
        ? Number(row.remaining_candidates)
        : null,
    reservationStatus: row.reservation_status
      ? String(row.reservation_status)
      : null,
    assignmentStatus: row.assignment_status
      ? String(row.assignment_status)
      : null,
    chosenProId: row.chosen_pro_id ? String(row.chosen_pro_id) : null,
    pairingRadiusKm:
      row.pairing_radius_km != null ? Number(row.pairing_radius_km) : null,
    radiusKm: row.radius_km != null ? Number(row.radius_km) : null,
    linkedRequestId: row.linked_request_id
      ? String(row.linked_request_id)
      : null,
    scheduledDispatchAt: row.scheduled_dispatch_at
      ? String(row.scheduled_dispatch_at)
      : null,
    dispatchNotifiedAt: row.dispatch_notified_at
      ? String(row.dispatch_notified_at)
      : null,
  };
}

export function jobToDbPatch(job: JobRecord): Record<string, unknown> {
  return {
    client_request_id: job.clientRequestId ?? null,
    flow_status: job.status,
    status: flowToLegacyStatus(job.status),
    problem_text: job.problem,
    description: job.problem,
    voice_note: job.voiceNote,
    photos: job.photos,
    offers: job.offers,
    negotiate_ends_at: job.negotiateEndsAt,
    pro_base_major: job.proBaseMajor,
    agreed_major: job.agreedMajor,
    max_offers: job.maxOffers,
    motorist_name: job.motoristName,
    motorist_photo: job.motoristPhoto || null,
    motorist_vehicle: job.motoristVehicle?.trim() || null,
    repair_pro_name: job.repairProName,
    repair_pro_photo: job.repairProPhoto || null,
    pickup_lat: job.motoristLocation?.lat ?? null,
    pickup_lng: job.motoristLocation?.lng ?? null,
    motorist_location_at: job.motoristLocationAt ?? null,
    pro_lat: job.proLocation?.lat ?? null,
    pro_lng: job.proLocation?.lng ?? null,
    eta_minutes: job.etaMinutes ?? null,
    distance_km: job.distanceKm ?? null,
    eta_text: job.etaText ?? null,
    distance_text: job.distanceText ?? null,
    eta_source: job.etaSource ?? null,
    pro_location_at: job.proLocationAt ?? null,
    payment_id: job.paymentId ?? null,
    payment_reference: job.paymentReference ?? null,
    escrow_status: job.escrowStatus ?? null,
    amount_minor: job.amountMinor ?? null,
    platform_fee_minor: job.platformFeeMinor ?? null,
    pro_payout_minor: job.proPayoutMinor ?? null,
    dispute: job.dispute,
    evidence: job.evidence,
    status_history: job.statusHistory,
    paid_at: job.paidAt ?? null,
    released_at: job.releasedAt ?? null,
    cancelled_at: job.cancelledAt ?? null,
    satisfied_at: job.satisfiedAt ?? null,
    rating: job.rating ?? null,
    rating_note: job.ratingNote ?? null,
    labour_agreed_kobo: job.amountMinor ?? null,
    labour_base_kobo:
      job.proBaseMajor != null
        ? toMinorUnits(job.proBaseMajor, job.currency)
        : null,
    pricing_currency: job.currency,
    negotiation_status:
      job.status === "negotiating"
        ? "pending_pro"
        : job.status === "agreed"
          ? "accepted"
          : job.status === "paid_booked" || job.status === "released"
            ? "paid"
            : "none",
    pairing_stage: job.pairingStage ?? null,
    pairing_deadline: job.pairingDeadline ?? null,
    queue_position: job.queuePosition ?? null,
    remaining_candidates: job.remainingCandidates ?? null,
    reservation_status: job.reservationStatus ?? null,
    assignment_status: job.assignmentStatus ?? null,
    pairing_radius_km: job.pairingRadiusKm ?? null,
    radius_km: job.radiusKm ?? null,
    linked_request_id: job.linkedRequestId ?? null,
    scheduled_dispatch_at: job.scheduledDispatchAt ?? null,
    dispatch_notified_at: job.dispatchNotifiedAt ?? null,
    updated_at: job.updatedAt,
  };
}

export function nowIso() {
  return new Date().toISOString();
}

export function uid(prefix: string) {
  if (prefix === "job") {
    return randomUUID();
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function splitMinor(amountMinor: number) {
  const s = splitServiceChargeMinor(amountMinor);
  return {
    platformFeeMinor: s.platformFeeMinor,
    proPayoutMinor: s.proPayoutMinor,
    vatMinor: s.vatMinor,
  };
}

/** Customer's chosen search radius (0-5 slider), clamped to a usable minimum
 * so pairing always has a tight starting circle and a sane cap. */
export function clampCustomerRadius(radius: number | null | undefined): number {
  if (radius == null || !Number.isFinite(radius) || radius <= 0) {
    return MAX_RADIUS_KM;
  }
  return Math.min(MAX_RADIUS_KM, Math.max(1, Math.round(radius)));
}
