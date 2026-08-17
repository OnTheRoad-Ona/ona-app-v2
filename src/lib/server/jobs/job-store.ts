/**
 * Job store: Supabase + in-memory fallback.
 * All premium escrow transitions go through here.
 */

import {
  isAgreedPastPaymentDeadline,
  isBookedPastCompletionDeadline,
  isCompletedPastAutoReleaseDeadline,
  MAX_NEGOTIATION_OFFERS,
  MAX_PAYMENT_ATTEMPTS,
  NEGOTIATE_WINDOW_MS,
  PAY_HISTORY,
  PAYMENT_WINDOW_MS,
  paymentEndsAtIso,
  paymentWindowsExpiredCount,
  PLATFORM_FEE_PERCENT,
} from "@/lib/jobs/constants";
import { computeEvidenceScores } from "@/lib/jobs/evidence";
import {
  assertTransition,
  canPlaceOffer,
  hasIdempotentOffer,
  validateOfferAmount,
  type TransitionActor,
  type TransitionEvent,
} from "@/lib/jobs/state-machine";
import type {
  CreateJobInput,
  DisputeOutcome,
  DisputeReason,
  JobFlowStatus,
  JobMedia,
  JobOffer,
  JobRecord,
  OfferSide,
} from "@/lib/jobs/types";
import {
  formatMoney,
  fromMinorUnits,
  splitServiceChargeMinor,
  toMinorUnits,
  type AppCurrency,
} from "@/lib/pricing";
import {
  createEscrowPayment,
  getEscrowByRef,
  getEscrowByRequest,
  supersedePendingPaymentsForRequest,
  updateEscrow,
} from "@/lib/server/payments/escrow-store";
import {
  initCharge,
  resolveProvider,
  verifyCharge,
} from "@/lib/server/payments/providers";
import { orderCandidatesByMerit } from "@/lib/server/merit/merit-engine";
import { PAIRING_WINDOW_MS } from "@/lib/server/pairing/pairing-engine";
import { isSyntheticAccount } from "@/lib/server/synthetic-accounts";
import { hasRecentLiveHeartbeat, MAX_RADIUS_KM } from "@/lib/matching";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { createServiceSupabase } from "@/lib/supabase/server";
import { randomUUID } from "node:crypto";

const memory = new Map<string, JobRecord>();

/**
 * In-process read-through cache. Every poll / click used to trigger a full
 * Supabase round-trip (≈300–1000ms); writes already keep `memory` fresh, so
 * reads inside this window short-circuit without hitting the network.
 */
const READ_CACHE_MS = 3_000;

function cacheJob(job: JobRecord): JobRecord {
  memory.set(job.id, job);
  if (memory.size > 512) {
    const now = Date.now();
    for (const [k, v] of memory) {
      const at = v.updatedAt ? new Date(v.updatedAt).getTime() : Number.NaN;
      if (!Number.isFinite(at) || now - at > 5 * 60 * 1000) {
        memory.delete(k);
      }
    }
  }
  return job;
}

function nowIso() {
  return new Date().toISOString();
}

function uid(prefix: string) {
  if (prefix === "job") {
    return randomUUID();
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Service charge S → pro 87.5% · Ona 5% · VAT 7.5% (see splitServiceChargeMinor). */
function splitMinor(amountMinor: number) {
  const s = splitServiceChargeMinor(amountMinor);
  return {
    platformFeeMinor: s.platformFeeMinor,
    proPayoutMinor: s.proPayoutMinor,
    vatMinor: s.vatMinor,
  };
}

/** Map classic service_requests.status → premium flow when flow_status is blank */
function legacyToFlowStatus(legacy: string | null | undefined): JobFlowStatus | null {
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

const FLOW_STATUSES = new Set<string>([
  "waiting_for_selected",
  "selected_review",
  "sequential_pairing",
  "waiting_for_pro",
  "reserved",
  "negotiating",
  "searching",
  "agreed",
  "paid_booked",
  "en_route",
  "arrived",
  "in_progress",
  "completed",
  "satisfied",
  "released",
  "cancelled",
  "expired",
  "disputed",
  "under_appeal",
  "refunded",
]);

function resolveFlowStatus(row: Record<string, unknown>): JobFlowStatus {
  const flow = String(row.flow_status || "").trim();
  if (flow && FLOW_STATUSES.has(flow)) return flow as JobFlowStatus;
  return legacyToFlowStatus(String(row.status || "")) || "negotiating";
}

function rowToJob(row: Record<string, unknown>): JobRecord {
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
    clientRequestId: row.client_request_id ? String(row.client_request_id) : null,
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
    proLocationAt: row.pro_location_at
      ? String(row.pro_location_at)
      : null,
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
    createdAt: String(row.created_at || nowIso()),
    updatedAt: String(row.updated_at || nowIso()),
    paidAt: row.paid_at ? String(row.paid_at) : null,
    releasedAt: row.released_at ? String(row.released_at) : null,
    cancelledAt: row.cancelled_at ? String(row.cancelled_at) : null,
    satisfiedAt: row.satisfied_at ? String(row.satisfied_at) : null,
    paymentAttemptCount: paymentWindowsExpiredCount({ statusHistory }),
    paymentSessionEndsAt: paymentEndsAtIso({ status, statusHistory }),
    pairingStage: row.pairing_stage ? String(row.pairing_stage) : null,
    pairingDeadline: row.pairing_deadline
      ? String(row.pairing_deadline)
      : null,
    queuePosition:
      row.queue_position != null ? Number(row.queue_position) : null,
    remainingCandidates:
      row.remaining_candidates != null ? Number(row.remaining_candidates) : null,
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

/** Keep classic status column in sync for older UI / queries */
function flowToLegacyStatus(flow: JobFlowStatus): string {
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

function jobToDbPatch(job: JobRecord): Record<string, unknown> {
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
    // Live motorist pin uses pickup coords (updated on motorist GPS pings)
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
    labour_base_kobo: job.proBaseMajor != null
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
    // SSPE dispatch columns (persist so state-machine transitions stay in sync)
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

async function persist(job: JobRecord): Promise<JobRecord> {
  cacheJob(job);
  if (!isSupabaseAdminConfigured()) return job;
  try {
    const sb = createServiceSupabase();
    const patch = jobToDbPatch(job);
    const { error } = await sb
      .from("service_requests")
      .update(patch)
      .eq("id", job.id);
    if (error) {
      console.error("job persist failed", job.id, job.status, error.message);
      // Retry with minimal columns if full patch fails (e.g. missing cols)
      const { error: e2 } = await sb
        .from("service_requests")
        .update({
          flow_status: job.status,
          status: flowToLegacyStatus(job.status),
          pickup_lat: job.motoristLocation?.lat ?? null,
          pickup_lng: job.motoristLocation?.lng ?? null,
          pro_lat: job.proLocation?.lat ?? null,
          pro_lng: job.proLocation?.lng ?? null,
          eta_minutes: job.etaMinutes ?? null,
          distance_km: job.distanceKm ?? null,
          status_history: job.statusHistory,
          updated_at: job.updatedAt,
        })
        .eq("id", job.id);
      if (e2) {
        console.error("job persist minimal failed", e2.message);
        // Last resort: flow_status only (text column — always writable)
        const { error: e3 } = await sb
          .from("service_requests")
          .update({
            flow_status: job.status,
            updated_at: job.updatedAt,
          })
          .eq("id", job.id);
        if (e3) {
          console.error("job persist flow_status failed", e3.message);
          throw new Error(
            `Could not save trip status (${job.status}). ${e3.message}`
          );
        }
      }
    }
    try {
      await sb.from("job_events").insert({
        request_id: job.id,
        event_type: "status",
        payload: { status: job.status },
      });
    } catch {
      /* optional table */
    }
  } catch (e) {
    console.error("job persist exception", e);
    if (e instanceof Error && e.message.startsWith("Could not save")) {
      throw e;
    }
  }
  return job;
}

/** Customer's chosen search radius (0–5 slider), clamped to a usable minimum
 * so pairing always has a tight starting circle and a sane cap. */
function clampCustomerRadius(radius: number | null | undefined): number {
  if (radius == null || !Number.isFinite(radius) || radius <= 0) {
    return MAX_RADIUS_KM;
  }
  return Math.min(MAX_RADIUS_KM, Math.max(1, Math.round(radius)));
}

async function startOpenSearchIfNeeded(
  job: JobRecord,
  input: CreateJobInput
): Promise<JobRecord> {
  if (input.repairProId) return job;
  try {
    const { advancePairing } = await import(
      "@/lib/server/pairing/pairing-engine"
    );
    await advancePairing(job.id);
    const fresh = await getJobRaw(job.id);
    return fresh || job;
  } catch (e) {
    console.error("[sspe] open-search start failed", e);
    return job;
  }
}

/** Best-effort Call-Out quote. Never blocks job create / SSPE. */
async function attachCalloutQuietly(
  job: JobRecord,
  input: CreateJobInput
): Promise<JobRecord> {
  try {
    const { attachCalloutToRequest } = await import("@/lib/server/callout/quote");
    await attachCalloutToRequest({
      requestId: job.id,
      problem: input.problem,
      selectedTrade: input.serviceType,
      destination: input.motoristLocation,
      proId: input.repairProId,
      atWorkshop: input.atWorkshop,
      remoteConsultation: input.remoteConsultation,
      physicalAttendanceRequired: input.physicalAttendanceRequired,
      calloutEligible: input.calloutEligible,
      tradeLocked: true,
      urgencyKind: input.calloutUrgency || "normal",
    });
  } catch (e) {
    console.error("[callout] attach failed", e);
  }
  const withCallout = job;
  await createScheduledLinkedRequestIfNeeded(job, input);
  return startOpenSearchIfNeeded(withCallout, input);
}

/**
 * Tow "add another repair pro": after the primary (tow) request is persisted,
 * also create a SCHEDULED second request for `input.meetProTrade` — same
 * details, new trade, linked to the primary via `linked_request_id`.
 * It is NOT dispatched yet: the pairing engine arms `scheduled_dispatch_at`
 * (now + SECOND_PRO_DELAY_MS) the moment the primary's pro accepts; the
 * scheduled-dispatch sweep then pings the motorist to enter their current
 * address, which dispatches it.
 */
async function createScheduledLinkedRequestIfNeeded(
  job: JobRecord,
  input: CreateJobInput
): Promise<void> {
  const trade = input.meetProTrade;
  if (!trade) return;
  if (!isSupabaseAdminConfigured()) return;
  const sb = createServiceSupabase();
  try {
    // Idempotent replay: a replayed createJob must never double the linked request.
    const { data: existing } = await sb
      .from("service_requests")
      .select("id")
      .eq("linked_request_id", job.id)
      .eq("flow_status", "scheduled")
      .maybeSingle();
    if (existing?.id) return;

    const ts = nowIso();
    const id = uid("job");
    const ends = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
    const second: JobRecord = {
      id,
      clientRequestId: null,
      motoristId: job.motoristId,
      motoristName: job.motoristName,
      motoristPhoto: job.motoristPhoto,
      motoristVehicle: job.motoristVehicle,
      repairProId: "",
      repairProName: "",
      repairProPhoto: undefined,
      serviceType: trade,
      problem: job.problem,
      voiceNote: job.voiceNote || null,
      photos: job.photos,
      status: "scheduled",
      currency: job.currency,
      proBaseMajor: null,
      agreedMajor: null,
      offers: [],
      negotiateEndsAt: ends,
      maxOffers: MAX_NEGOTIATION_OFFERS,
      locationLabel: job.locationLabel,
      motoristLocation: job.motoristLocation,
      proLocation: null,
      statusHistory: [{ status: "scheduled", at: ts, by: "motorist" }],
      pairingStage: "scheduled",
      pairingDeadline: null,
      queuePosition: null,
      remainingCandidates: null,
      reservationStatus: null,
      assignmentStatus: null,
      pairingRadiusKm: 1,
      radiusKm: job.radiusKm,
      linkedRequestId: job.id,
      scheduledDispatchAt: null,
      dispatchNotifiedAt: null,
      createdAt: ts,
      updatedAt: ts,
    };

    const { data, error } = await sb
      .from("service_requests")
      .insert({
        id,
        client_request_id: null,
        motorist_id: job.motoristId,
        repair_pro_id: null,
        service_type: trade,
        status: "requested",
        description: second.problem,
        pickup_lat: second.motoristLocation.lat,
        pickup_lng: second.motoristLocation.lng,
        pickup_address: second.locationLabel,
        radius_km: second.radiusKm,
        ...jobToDbPatch(second),
        flow_status: "scheduled",
        pairing_stage: "scheduled",
        created_at: ts,
      })
      .select("*")
      .maybeSingle();
    if (data) {
      const mapped = rowToJob(data as Record<string, unknown>);
      mapped.photos = second.photos;
      mapped.voiceNote = second.voiceNote;
      memory.set(mapped.id, mapped);
    }
    if (error) {
      console.error("[second-pro] create linked request failed", error.message);
    }
  } catch (e) {
    console.error("[second-pro] create linked request error", e);
  }
}

export async function createJob(input: CreateJobInput): Promise<JobRecord> {
  const ts = nowIso();
  // Negotiation clock does NOT start until Repair Pro taps “I can fix this”.
  // Far-future sentinel so expire logic / UI know the timer is unarmed.
  const ends = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
  const id = uid("job");

  // Prefer explicit photo; else hydrate from profiles.avatar_url
  let motoristPhoto = input.motoristPhoto?.trim() || null;
  if (!motoristPhoto && isSupabaseAdminConfigured()) {
    try {
      const sb = createServiceSupabase();
      const { data } = await sb
        .from("profiles")
        .select("avatar_url")
        .eq("id", input.motoristId)
        .maybeSingle();
      if (data?.avatar_url) motoristPhoto = String(data.avatar_url);
    } catch {
      /* optional */
    }
  }

  const job: JobRecord = {
    id,
    clientRequestId: input.clientRequestId || null,
    motoristId: input.motoristId,
    motoristName: input.motoristName,
    motoristPhoto,
    motoristVehicle: input.motoristVehicle?.trim() || null,
    repairProId: input.repairProId || "",
    repairProName: input.repairProName || "",
    repairProPhoto: input.repairProPhoto,
    serviceType: input.serviceType,
    problem: input.emergency
      ? `EMERGENCY: ${input.problem}`
      : input.problem,
    voiceNote: input.voiceNote || null,
    photos: input.photos || [],
    status: "waiting_for_selected",
    currency: input.currency,
    proBaseMajor: input.proBaseMajor ?? null,
    agreedMajor: null,
    offers: [],
    negotiateEndsAt: ends,
    maxOffers: MAX_NEGOTIATION_OFFERS,
    locationLabel: input.locationLabel,
    motoristLocation: input.motoristLocation,
    motoristLocationAt: ts,
    proLocation: null,
    statusHistory: [{ status: "waiting_for_selected", at: ts, by: "motorist" }],
    pairingStage: "waiting_for_selected",
    // Timer stays NULL until the request actually appears on the pro's screen.
    // The surface endpoint arms pairing_deadline exactly once at that moment
    // (chosen pro + open search alike), so customer ring and pro card both
    // start from 66 together and never roll back.
    pairingDeadline: null,
    queuePosition: 1,
    remainingCandidates: null,
    reservationStatus: null,
    assignmentStatus: null,
    pairingRadiusKm: 1,
    radiusKm: clampCustomerRadius(input.radiusKm),
    chosenProId: input.repairProId || null,
    createdAt: ts,
    updatedAt: ts,
  };

  const openSearch = !input.repairProId;
  if (openSearch) {
    job.status = "sequential_pairing";
    job.pairingStage = "sequential_pairing";
    job.queuePosition = 0;
    job.statusHistory = [
      { status: "sequential_pairing", at: ts, by: "motorist" },
    ];
  }

  if (isSupabaseAdminConfigured()) {
    try {
      const sb = createServiceSupabase();
      // Idempotent replay: a sticker we've seen before already created the
      // request. Return that job instead of creating a second one.
      if (input.clientRequestId) {
        const { data: existing } = await sb
          .from("service_requests")
          .select("*")
          .eq("motorist_id", input.motoristId)
          .eq("client_request_id", input.clientRequestId)
          .maybeSingle();
        if (existing) {
          const mapped = rowToJob(existing as Record<string, unknown>);
          memory.set(mapped.id, mapped);
          return attachCalloutQuietly(mapped, input);
        }
      }
      const { data, error } = await sb
        .from("service_requests")
        .insert({
          id: job.id,
          client_request_id: input.clientRequestId || null,
          motorist_id: input.motoristId,
          repair_pro_id: input.repairProId || null,
          service_type: input.serviceType,
          status: "requested",
          description: job.problem,
          pickup_lat: input.motoristLocation.lat,
          pickup_lng: input.motoristLocation.lng,
          pickup_address: input.locationLabel,
          radius_km: clampCustomerRadius(input.radiusKm),
          ...jobToDbPatch(job),
          flow_status: job.pairingStage,
          pairing_stage: job.pairingStage,
          pairing_deadline: job.pairingDeadline,
          queue_position: job.queuePosition,
          chosen_pro_id: input.repairProId || null,
          created_at: ts,
        })
        .select("*")
        .single();
      if (!error && data) {
        if (input.repairProId) {
        // The customer-chosen pro is the first queue entry (position 1).
        await sb
          .from("request_pairing_queue")
          .insert({
            request_id: job.id,
            pro_id: input.repairProId,
            position: 1,
            source: "chosen",
            status: "offered",
            offered_at: ts,
          });
        }
        const mapped = rowToJob(data as Record<string, unknown>);
        // preserve client-generated media / vehicle if DB stripped columns
        mapped.photos = job.photos;
        mapped.voiceNote = job.voiceNote;
        mapped.motoristPhoto = mapped.motoristPhoto || motoristPhoto;
        mapped.motoristVehicle =
          mapped.motoristVehicle || job.motoristVehicle || null;
        memory.set(mapped.id, mapped);
        // Instantly notify assigned repair pro
        if (input.repairProId) {
          try {
            const { insertNotification } = await import("@/lib/server/notifications");
            await insertNotification({
              userId: input.repairProId,
              category: "requests",
              priority: "high",
              title: "Service Request",
              body: `New request from ${job.motoristName} · ${job.problem.slice(0, 80)}`,
              href: `/jobs/${job.id}`,
              actionType: "open_job",
              actionPayload: { jobId: job.id },
              jobId: job.id,
              jobStatus: "waiting_for_selected",
              groupKey: `service-request-${job.id}`,
            });
          } catch {
            /* optional */
          }
        }
        return attachCalloutQuietly(mapped, input);
      }
      // Insert may fail if motorist_vehicle column missing — retry without it
      if (error) {
        // Unique-violation race: an identical request (same sticker) won.
        // Replay its job instead of creating a duplicate.
        if (
          input.clientRequestId &&
          String((error as { code?: string }).code) === "23505"
        ) {
          const { data: raced } = await sb
            .from("service_requests")
            .select("*")
            .eq("motorist_id", input.motoristId)
            .eq("client_request_id", input.clientRequestId)
            .maybeSingle();
          if (raced) {
            const mapped = rowToJob(raced as Record<string, unknown>);
            memory.set(mapped.id, mapped);
            return attachCalloutQuietly(mapped, input);
          }
        }
        const { motorist_vehicle: _mv, ...rest } = {
          id: job.id,
          client_request_id: input.clientRequestId || null,
          motorist_id: input.motoristId,
          repair_pro_id: input.repairProId || null,
          service_type: input.serviceType,
          status: "requested",
          description: job.problem,
          pickup_lat: input.motoristLocation.lat,
          pickup_lng: input.motoristLocation.lng,
          pickup_address: input.locationLabel,
          radius_km: clampCustomerRadius(input.radiusKm),
          ...jobToDbPatch(job),
          flow_status: job.pairingStage,
          pairing_stage: job.pairingStage,
          pairing_deadline: job.pairingDeadline,
          queue_position: job.queuePosition,
          chosen_pro_id: input.repairProId || null,
          created_at: ts,
        } as Record<string, unknown>;
        void _mv;
        const retry = await sb
          .from("service_requests")
          .insert(rest)
          .select("*")
          .single();
        if (!retry.error && retry.data) {
          if (input.repairProId) await sb
            .from("request_pairing_queue")
            .insert({
              request_id: job.id,
              pro_id: input.repairProId,
              position: 1,
              source: "chosen",
              status: "offered",
              offered_at: ts,
            });
          const mapped = rowToJob(retry.data as Record<string, unknown>);
          mapped.photos = job.photos;
          mapped.voiceNote = job.voiceNote;
          mapped.motoristPhoto = mapped.motoristPhoto || motoristPhoto;
          mapped.motoristVehicle = job.motoristVehicle || null;
          // Best-effort store vehicle in problem_text prefix is avoided;
          // hydrateMotoristVehicle will fill from profile if needed
          memory.set(mapped.id, mapped);
          // Try update with vehicle only (if column exists)
          if (job.motoristVehicle) {
            try {
              await sb
                .from("service_requests")
                .update({ motorist_vehicle: job.motoristVehicle })
                .eq("id", mapped.id);
            } catch {
              /* column may not exist yet */
            }
          }
          if (input.repairProId) {
            try {
              const { insertNotification } = await import("@/lib/server/notifications");
              await insertNotification({
                userId: input.repairProId,
                category: "requests",
                priority: "high",
                title: "Service Request",
                body: `New request from ${job.motoristName} · ${job.problem.slice(0, 80)}`,
                href: `/jobs/${job.id}`,
                actionType: "open_job",
                actionPayload: { jobId: job.id },
                jobId: job.id,
                groupKey: `service-request-${job.id}`,
              });
            } catch {
              /* optional */
            }
          }
          return attachCalloutQuietly(mapped, input);
        }
      }
    } catch {
      /* memory */
    }
  }

  cacheJob(job);
  return attachCalloutQuietly(job, input);
}

async function hydrateMotoristPhoto(job: JobRecord): Promise<JobRecord> {
  if (job.motoristPhoto?.trim()) return job;
  if (!isSupabaseAdminConfigured() || !job.motoristId) return job;
  try {
    const sb = createServiceSupabase();
    const { data } = await sb
      .from("profiles")
      .select("avatar_url")
      .eq("id", job.motoristId)
      .maybeSingle();
    if (data?.avatar_url) {
      return { ...job, motoristPhoto: String(data.avatar_url) };
    }
  } catch {
    /* optional */
  }
  return job;
}

/** Load motorist + repair pro phone numbers for Call buttons */
async function hydrateJobPhones(job: JobRecord): Promise<JobRecord> {
  if (!isSupabaseAdminConfigured()) return job;
  const needPhones =
    !job.motoristPhone?.trim() || !job.repairProPhone?.trim();
  if (!needPhones && job.motoristVehicle?.trim()) return job;
  try {
    const sb = createServiceSupabase();
    const ids = [job.motoristId, job.repairProId].filter(Boolean);
    if (!ids.length) return job;
    const { data } = await sb
      .from("profiles")
      .select("id, phone, avatar_url, full_name")
      .in("id", ids);
    let next = { ...job };
    if (data?.length) {
      for (const row of data as {
        id: string;
        phone?: string | null;
        avatar_url?: string | null;
        full_name?: string | null;
      }[]) {
        const phone = (row.phone || "").trim() || null;
        if (row.id === job.motoristId) {
          next = {
            ...next,
            motoristPhone: next.motoristPhone || phone,
            motoristPhoto:
              next.motoristPhoto ||
              (row.avatar_url ? String(row.avatar_url) : null),
            motoristName:
              next.motoristName && next.motoristName !== "Customer"
                ? next.motoristName
                : String(row.full_name || next.motoristName || "Customer"),
          };
        }
        if (row.id === job.repairProId) {
          next = {
            ...next,
            repairProPhone: next.repairProPhone || phone,
            repairProPhoto:
              next.repairProPhoto ||
              (row.avatar_url ? String(row.avatar_url) : undefined),
            repairProName:
              next.repairProName && next.repairProName !== "Repair Pro"
                ? next.repairProName
                : String(row.full_name || next.repairProName || "Repair Pro"),
          };
        }
      }
    }
    // Vehicle lives on motorist_profiles (not profiles)
    if (!next.motoristVehicle?.trim() && job.motoristId) {
      next = await hydrateMotoristVehicle(next);
    }
    return next;
  } catch {
    return job;
  }
}

/** Fill motoristVehicle from motorist_profiles when job row has none */
async function hydrateMotoristVehicle(job: JobRecord): Promise<JobRecord> {
  if (job.motoristVehicle?.trim() || !job.motoristId) return job;
  if (!isSupabaseAdminConfigured()) return job;
  try {
    const sb = createServiceSupabase();
    const { data } = await sb
      .from("motorist_profiles")
      .select("vehicle_make, vehicle_model, vehicle_year, vehicles")
      .eq("user_id", job.motoristId)
      .maybeSingle();
    if (!data) return job;
    const vehicles = Array.isArray(data.vehicles) ? data.vehicles : [];
    const first =
      vehicles.find(
        (v: { make?: string; model?: string }) =>
          v && (v.make || v.model)
      ) || null;
    let label = "";
    if (first && typeof first === "object") {
      const f = first as {
        vehicleType?: string;
        make?: string;
        model?: string;
        year?: string;
      };
      label = [f.vehicleType, f.make, f.model, f.year]
        .filter((x) => x && String(x).trim() && String(x) !== "Any")
        .join(" ");
    }
    if (!label) {
      label = [
        data.vehicle_make,
        data.vehicle_model,
        data.vehicle_year,
      ]
        .filter((x) => x && String(x).trim())
        .join(" ");
    }
    if (!label.trim()) return job;
    return { ...job, motoristVehicle: label.trim() };
  } catch {
    return job;
  }
}

/**
 * If money is already held/successful but job still says "agreed",
 * flip to paid_booked so UI never shows "Pay now to book" again.
 */
export async function reconcileJobPayment(
  job: JobRecord
): Promise<JobRecord> {
  if (job.status !== "agreed") return job;

  const payment = await getEscrowByRequest(job.id);
  if (!payment?.providerRef) return job;

  // Already held in escrow DB → book the job
  if (
    payment.escrowStatus === "held" ||
    payment.escrowStatus === "released" ||
    payment.status === "paid"
  ) {
    const booked = await markJobPaidFromReference(payment.providerRef);
    if ("job" in booked) return booked.job;
    return job;
  }

  // Pending row but Flutterwave already collected — verify live
  if (
    payment.escrowStatus === "pending_payment" ||
    payment.escrowStatus === "none"
  ) {
    try {
      const verified = await verifyCharge(
        payment.providerRef,
        String(payment.provider)
      );
      if (verified.success) {
        await updateEscrow(payment.id, {
          status: "paid",
          escrowStatus: "held",
          paidAt: verified.paidAt || nowIso(),
          providerChannel: verified.channel || null,
        });
        const booked = await markJobPaidFromReference(payment.providerRef);
        if ("job" in booked) return booked.job;
      }
    } catch {
      /* keep agreed until verify succeeds */
    }
  }

  return job;
}

/** Load job without payment reconciliation (avoids getJob ↔ markPaid loops). */
async function getJobRaw(id: string): Promise<JobRecord | null> {
  // Fast path — a copy this process persisted or read within the last
  // READ_CACHE_MS is served from memory instead of a Supabase round-trip.
  const fast = memory.get(id);
  if (fast) {
    const at = fast.updatedAt ? new Date(fast.updatedAt).getTime() : Number.NaN;
    if (Number.isFinite(at) && Date.now() - at < READ_CACHE_MS) {
      return fast;
    }
    memory.delete(id);
  }
  if (isSupabaseAdminConfigured()) {
    try {
      const sb = createServiceSupabase();
      const { data } = await sb
        .from("service_requests")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (data) {
        let job = rowToJob(data as Record<string, unknown>);
        // Keep vehicle from memory if DB column empty (pre-migration jobs)
        const memHit = memory.get(id);
        if (!job.motoristVehicle?.trim() && memHit?.motoristVehicle) {
          job = { ...job, motoristVehicle: memHit.motoristVehicle };
        }
        job = await hydrateJobPhones(job);
        job = await hydrateMotoristPhoto(job);
        job = await hydrateMotoristVehicle(job);
        memory.set(id, job);
        return job;
      }
    } catch {
      /* memory */
    }
  }
  const mem = memory.get(id);
  if (!mem) return null;
  let job = await hydrateJobPhones(mem);
  job = await hydrateMotoristVehicle(job);
  return job;
}

export async function getJob(id: string): Promise<JobRecord | null> {
  // Prefer Supabase so offers update across serverless instances (not stale memory)
  const job = await getJobRaw(id);
  if (!job) return null;
  const synced = await reconcileJobPayment(job);
  const recovered = await recoverReleasedFromFlutterwave(synced);
  const cleaned = await clearFalseSatisfiedStamp(recovered);
  return maybeExpire(cleaned);
}

/**
 * A payout may only be *recovered* (marked released) once a release was actually
 * attempted or confirmed — STATUS satisfied or escrow release_pending /
 * pending_settlement. Merely holding escrow ("held"/ paid_booked) or being
 * "completed" is never enough: the customer must release first.
 */
export function canRecoverReleaseFromJob(job: {
  status?: string;
  releasedAt?: string | null;
  escrowStatus?: string | null;
}): boolean {
  if (job.releasedAt || job.status === "released") return false;
  if (job.status === "satisfied") return true;
  if (job.escrowStatus === "release_pending") return true;
  return job.escrowStatus === "pending_settlement";
}

/**
 * If FLW already paid the pro transfer but job still shows satisfied/held
 * (cancel race or missed finalize), mark released so UI leaves “Payout processing”.
 */
async function recoverReleasedFromFlutterwave(
  job: JobRecord
): Promise<JobRecord> {
  if (!canRecoverReleaseFromJob(job)) return job;
  try {
    const { attemptProPayout } = await import(
      "@/lib/server/payments/payout-settlement"
    );
    // force false is fine: FLW success is recovered before cancel gate
    const result = await attemptProPayout({
      jobId: job.id,
      repairProId: job.repairProId,
      amountMinor: job.amountMinor,
      agreedMajor: job.agreedMajor,
      currency: job.currency,
      paymentReference: job.paymentReference,
      force: false,
    });
    if (result.ok) {
      const ts = nowIso();
      const next: JobRecord = {
        ...job,
        status: "released",
        escrowStatus: "released",
        releasedAt: job.releasedAt || ts,
        amountMinor: result.totalMinor ?? job.amountMinor,
        proPayoutMinor: result.proPayoutMinor ?? job.proPayoutMinor,
        platformFeeMinor: result.platformFeeMinor ?? job.platformFeeMinor,
        statusHistory: [
          ...job.statusHistory,
          { status: "released", at: ts, by: "system_flw_recover" },
        ],
        updatedAt: ts,
      };
      const saved = await persist(next);
      // Notify once if this was the first time we learned FLW already paid
      if (!result.alreadyReleased || !job.releasedAt) {
        try {
          const { finalizeJobReleasedAfterPayout } = await import(
            "@/lib/server/payments/payout-settlement"
          );
          await finalizeJobReleasedAfterPayout(job.id, {
            transferRef: result.transferRef || "",
            totalMinor: result.totalMinor,
            proPayoutMinor: result.proPayoutMinor,
            platformFeeMinor: result.platformFeeMinor,
          });
        } catch {
          /* notifications optional */
        }
      }
      return saved;
    }
  } catch (e) {
    console.error("recoverReleasedFromFlutterwave", job.id, e);
  }
  return job;
}

/**
 * Fix bad rows: satisfiedAt set while job still completed and escrow held
 * (failed release / auto-release stamp). Clear so customer can act again.
 */
async function clearFalseSatisfiedStamp(job: JobRecord): Promise<JobRecord> {
  if (job.status !== "completed") return job;
  if (!job.satisfiedAt) return job;
  if (job.releasedAt || job.escrowStatus === "released") return job;
  // Escrow still held or never paid out → stamp was premature
  if (
    job.escrowStatus === "held" ||
    job.escrowStatus === "release_pending" ||
    !job.escrowStatus ||
    job.escrowStatus === "none"
  ) {
    return persist({
      ...job,
      satisfiedAt: null,
      updatedAt: nowIso(),
    });
  }
  return job;
}

/**
 * Mark ALL pending Flutterwave / escrow charges as expired so the customer can
 * generate a fresh payment request (job stays agreed). Supersedes every unpaid
 * draft — not just the most recent — so a concurrent burst never leaves stale
 * "awaiting payment" rows behind.
 */
async function expirePendingPaymentForJob(
  job: JobRecord,
  reason = "payment_window_20m"
): Promise<void> {
  try {
    await supersedePendingPaymentsForRequest(job.id, null, reason);
  } catch (e) {
    console.error("expirePendingPaymentForJob", job.id, e);
  }
}

/**
 * Customer closed / cancelled Flutterwave without paying.
 * Does NOT count as a 20‑min attempt. Clears open session so the next Pay
 * starts a fresh 20‑minute timer.
 */
export async function cancelOpenPaymentSession(input: {
  jobId: string;
  motoristId?: string | null;
}): Promise<
  | { job: JobRecord; timerReset: true }
  | { error: string }
> {
  let job = await getJob(input.jobId);
  if (!job) return { error: "Job not found" };
  const mid = (input.motoristId || "").trim();
  // Allow unauthenticated timer reset from FLW cancel callback (no money moved)
  if (
    mid &&
    mid !== "callback" &&
    mid !== "system" &&
    job.motoristId !== mid
  ) {
    return { error: "Only the customer on this job can cancel payment." };
  }
  if (job.status !== "agreed") {
    // Already moved on — nothing to reset
    return { job, timerReset: true };
  }

  await expirePendingPaymentForJob(job, "customer_cancelled_checkout");

  const ts = nowIso();
  const last = [...(job.statusHistory || [])].sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()
  )[0];
  // Avoid stacking cancel markers if they spam close
  const history =
    last?.by === PAY_HISTORY.SESSION_CANCELLED
      ? job.statusHistory
      : [
          ...job.statusHistory,
          {
            status: "agreed" as const,
            at: ts,
            by: PAY_HISTORY.SESSION_CANCELLED,
          },
        ];

  job = await persist({
    ...job,
    status: "agreed",
    statusHistory: history,
    paymentSessionEndsAt: null,
    paymentReference: null,
    updatedAt: ts,
  });
  return { job, timerReset: true };
}

/**
 * Unpaid 20‑min window closed.
 * - Counts as 1 payment attempt (only full window expiry counts).
 * - Attempts 1–2: stay agreed, user can Pay again.
 * - Attempt 3: cancel job, notify both sides, refund if any hold.
 */
async function expireOpenPaymentWindow(job: JobRecord): Promise<JobRecord> {
  const ts = nowIso();
  // Idempotent: already recorded this window
  const last = [...(job.statusHistory || [])]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())[0];
  if (last?.by === PAY_HISTORY.WINDOW_EXPIRED) {
    // Already counted; ensure pending charge is expired
    await expirePendingPaymentForJob(job);
    return job;
  }

  await expirePendingPaymentForJob(job);

  const nextHistory = [
    ...job.statusHistory,
    {
      status: "agreed" as const,
      at: ts,
      by: PAY_HISTORY.WINDOW_EXPIRED,
    },
  ];
  const attempts = paymentWindowsExpiredCount({
    statusHistory: nextHistory,
  });

  if (attempts >= MAX_PAYMENT_ATTEMPTS) {
    // Final cancel + refund any held funds + notify both
    let cancelled: JobRecord = {
      ...job,
      statusHistory: [
        ...nextHistory,
        {
          status: "cancelled",
          at: ts,
          by: PAY_HISTORY.MAX_ATTEMPTS_CANCEL,
        },
      ],
      paymentAttemptCount: attempts,
      paymentSessionEndsAt: null,
      updatedAt: ts,
    };
    try {
      cancelled = await applyEvent(
        {
          ...job,
          statusHistory: nextHistory,
          paymentAttemptCount: attempts,
        },
        { type: "CANCEL", by: "system" },
        "system"
      );
      // Ensure history marker survives cancel
      if (
        !cancelled.statusHistory.some(
          (h) => h.by === PAY_HISTORY.MAX_ATTEMPTS_CANCEL
        )
      ) {
        cancelled = await persist({
          ...cancelled,
          statusHistory: [
            ...cancelled.statusHistory,
            {
              status: "cancelled",
              at: ts,
              by: PAY_HISTORY.MAX_ATTEMPTS_CANCEL,
            },
          ],
          paymentAttemptCount: attempts,
          paymentSessionEndsAt: null,
        });
      }
    } catch (e) {
      console.error("payment max attempts cancel failed", job.id, e);
      cancelled = await persist({
        ...job,
        status: "cancelled",
        cancelledAt: ts,
        statusHistory: nextHistory,
        paymentAttemptCount: attempts,
        paymentSessionEndsAt: null,
        updatedAt: ts,
      });
      await refundJobEscrow(cancelled).catch(() => undefined);
    }

    try {
      if (job.repairProId) {
        const { insertNotification } = await import(
          "@/lib/server/notifications"
        );
        const body = `Payment was not completed within ${MAX_PAYMENT_ATTEMPTS} timed windows (20 min each). This booking is cancelled.`;
        await insertNotification({
          userId: job.repairProId,
          category: "payments",
          priority: "high",
          title: "Booking cancelled — customer did not pay",
          body,
          href: `/requests/${job.id}`,
          actionType: "open_job",
          actionPayload: { jobId: job.id },
          jobId: job.id,
          jobStatus: "cancelled",
          groupKey: `pay-cancel-pro-${job.id}`,
        });
      }
    } catch {
      /* notifications optional */
    }
    return cancelled;
  }

  // Stay agreed — no open session until customer taps Pay again
  return persist({
    ...job,
    status: "agreed",
    statusHistory: nextHistory,
    paymentAttemptCount: attempts,
    paymentSessionEndsAt: null,
    paymentReference: null,
    updatedAt: ts,
  });
}

async function maybeExpire(job: JobRecord): Promise<JobRecord> {
  // 1) Negotiation timer — only after pro “I can fix this” armed the clock
  if (job.status === "negotiating") {
    const { isNegotiationTimerArmed } = await import("@/lib/jobs/constants");
    if (!isNegotiationTimerArmed(job)) return job;
    if (Date.now() <= new Date(job.negotiateEndsAt).getTime()) return job;
    return applyEvent(job, { type: "EXPIRE_NEGOTIATION" }, "system");
  }

  // 2) Open pay session past 20 min unpaid → count 1 attempt; after 3 → cancel
  if (isAgreedPastPaymentDeadline(job)) {
    return expireOpenPaymentWindow(job);
  }

  // 3) Booked but not completed within 6h of payment → cancel + full refund
  if (isBookedPastCompletionDeadline(job)) {
    try {
      return await applyEvent(
        job,
        { type: "CANCEL", by: "system" },
        "system"
      );
    } catch (e) {
      console.error("auto-cancel booked job failed", job.id, e);
      return job;
    }
  }

  // 4) Completed > 6h without satisfaction or dispute → auto-release 95/5.
  // On Flutterwave failure: keep escrow held, stay completed, retry later.
  if (isCompletedPastAutoReleaseDeadline(job)) {
    // Skip rapid retries when last Flutterwave payout failed
    try {
      const esc = await getEscrowByRequest(job.id);
      const lastAt = String(
        (esc?.meta as { lastReleaseAt?: string } | undefined)?.lastReleaseAt ||
          ""
      );
      if (lastAt) {
        const age = Date.now() - new Date(lastAt).getTime();
        // Don't hammer Flutterwave every poll — wait 15 min between auto attempts
        if (Number.isFinite(age) && age < 15 * 60 * 1000) {
          return job;
        }
      }
    } catch {
      /* continue to attempt */
    }
    try {
      let next = await applyEvent(job, { type: "SATISFIED" }, "system");
      // applyEvent(SATISFIED) already releases; if still satisfied, force RELEASE
      if (next.status === "satisfied") {
        next = await applyEvent(next, { type: "RELEASE" }, "system");
      }
      return next;
    } catch (e) {
      // Keep status=completed + escrow held; expire-stale / customer Release retries
      console.error("auto-release completed job failed (will retry)", job.id, e);
      return job;
    }
  }

  return job;
}

/**
 * Batch sweep for:
 *  - Agreed unpaid past 20 min payment window → expire pending payment
 *  - Booked not completed within 6h of payment → cancel + refund
 *  - Completed past 6h without satisfaction/dispute → auto-release 95/5
 * Safe for cron / client backup.
 */
export async function expireOverdueBookedJobs(limit = 40): Promise<{
  checked: number;
  cancelled: number;
  released: number;
  ids: string[];
}> {
  const ids: string[] = [];
  let checked = 0;
  let cancelled = 0;
  let released = 0;
  const statuses = [
    "agreed",
    "paid_booked",
    "en_route",
    "arrived",
    "in_progress",
    "completed",
  ] as const;

  // Memory first
  for (const j of memory.values()) {
    if (
      !isAgreedPastPaymentDeadline(j) &&
      !isBookedPastCompletionDeadline(j) &&
      !isCompletedPastAutoReleaseDeadline(j)
    ) {
      continue;
    }
    checked += 1;
    const prev = j.status;
    const next = await maybeExpire(j);
    if (next.status === "cancelled" || next.escrowStatus === "refunded") {
      cancelled += 1;
      ids.push(next.id);
    } else if (
      (prev === "completed" || prev === "satisfied") &&
      next.status === "released"
    ) {
      released += 1;
      ids.push(next.id);
    } else if (prev === "agreed" && next.status === "agreed") {
      // payment expired in place
      if (!ids.includes(next.id)) ids.push(next.id);
    }
  }

  if (isSupabaseAdminConfigured()) {
    try {
      const sb = createServiceSupabase();
      const { data } = await sb
        .from("service_requests")
        .select("*")
        .in("flow_status", [...statuses])
        .order("updated_at", { ascending: true })
        .limit(limit);
      for (const row of data || []) {
        const job = rowToJob(row as Record<string, unknown>);
        if (
          !isAgreedPastPaymentDeadline(job) &&
          !isBookedPastCompletionDeadline(job) &&
          !isCompletedPastAutoReleaseDeadline(job)
        ) {
          continue;
        }
        checked += 1;
        const prev = job.status;
        const next = await maybeExpire(job);
        if (next.status === "cancelled" || next.status === "refunded") {
          cancelled += 1;
          if (!ids.includes(next.id)) ids.push(next.id);
        } else if (
          (prev === "completed" || prev === "satisfied") &&
          next.status === "released"
        ) {
          released += 1;
          if (!ids.includes(next.id)) ids.push(next.id);
        } else if (prev === "agreed") {
          if (!ids.includes(next.id)) ids.push(next.id);
        }
      }
    } catch (e) {
      console.error("expireOverdueBookedJobs", e);
    }
  }

  return { checked, cancelled, released, ids };
}

const REROUTE_AFTER_MS = 60_000; // 1 minute before rerouting
const REROUTE_WINDOW_MS = 15 * 60_000; // 15 min total reroute window
const DEFER_DURATION_MS = 5 * 60_000; // Pro "Later" hides request for 5 minutes

/**
 * Dispatch exclusions (D6).
 * Deferrals are per-job and derived from status_history (`deferred:<proId>`),
 * so they survive restarts. Decline exclusions are PER-REQUEST only: the
 * `excluded:<proId>` marker in this job's status_history excludes that pro
 * permanently from THIS request. There is no cross-request cooldown.
 */
export function listActiveExclusions(): {
  customerId: string;
  proId: string;
  reason: string;
  at: string;
  expiresAt: string;
}[] {
  return [];
}

/** Latest `deferred:<proId>` timestamp from the job's history, if any. */
function latestDeferredAtMs(job: JobRecord, proId: string): number | null {
  let latest: number | null = null;
  for (const h of job.statusHistory || []) {
    if (h.by === `deferred:${proId}`) {
      const t = Date.parse(h.at);
      if (Number.isFinite(t) && (latest === null || t > latest)) latest = t;
    }
  }
  return latest;
}

/** True while this pro's "Later" is still active for this job (5 min). */
function isDeferredByPro(job: JobRecord, proId: string): boolean {
  const at = latestDeferredAtMs(job, proId);
  if (at === null) return false;
  return Date.now() - at < DEFER_DURATION_MS;
}

/** True if this pro declined this request (permanent per-request, D6). */
function isExcludedForJob(job: JobRecord, proId: string): boolean {
  return (job.statusHistory || []).some(
    (h) => h.by === `excluded:${proId}`
  );
}

/**
 * Pro taps "Later": hide the request from that pro and keep the customer's
 * search moving by rerouting to the next available pro immediately. The
 * deferred pro stays excluded for 5 minutes. If no other pro is available,
 * the request stays with the deferred pro and becomes deliverable again after
 * the 5-minute window.
 */
export async function deferJob(
  jobId: string,
  proId: string
): Promise<JobRecord | null> {
  const job = await getJob(jobId);
  if (!job) return null;
  if (job.repairProId !== proId) return job;

  // SSPE job → hand off to the pairing engine (queue + reservation + next pro).
  if (job.pairingStage) {
    try {
      const { deferRequest } = await import(
        "@/lib/server/pairing/pairing-engine"
      );
      const res = await deferRequest(jobId, proId);
      if (!res.ok) return job;
      return (await getJob(jobId)) || job;
    } catch (e) {
      console.error("[deferJob] SSPE defer failed", jobId, e);
      return job;
    }
  }

  const ts = new Date().toISOString();
  job.statusHistory = [
    ...(job.statusHistory || []),
    { status: job.status, at: ts, by: `deferred:${proId}` },
  ];

  // Keep the customer's search alive: move into the searching phase so the
  // customer sees the live search screen while dispatch finds another pro.
  const hasAccepted = (job.statusHistory || []).some(
    (h) => h.by === "negotiation_timer_start"
  );
  const canReroute =
    !hasAccepted &&
    isSupabaseAdminConfigured() &&
    (job.status === "negotiating" || job.status === "searching");

  if (canReroute) {
    job.status = "searching";
    job.statusHistory = [
      ...job.statusHistory,
      { status: "searching", at: ts, by: "searching_started" },
    ];
  }
  await persist(job);

  if (canReroute) {
    try {
      const sb = createServiceSupabase();
      // Do not expire the job when no other pro is available — the deferred
      // pro's request becomes deliverable again after the 5 minutes.
      await assignNextPro(job, sb);
    } catch (e) {
      console.error("[deferJob] reroute failed", jobId, e);
    }
  }

  return (await getJob(jobId)) || job;
}

/**
 * Find the next available pro of the same trade, closest to the customer.
 * Excludes pros already tried. Returns null if none found.
 */
async function findNextPro(
  job: JobRecord,
  sb: ReturnType<typeof createServiceSupabase>
): Promise<{ id: string; name: string; photo?: string } | null> {
  const triedProIds = new Set<string>();
  for (const h of job.statusHistory || []) {
    const by = h.by || "";
    if (by.startsWith("reroute:")) {
      triedProIds.add(by.slice("reroute:".length));
    }
  }
  triedProIds.add(job.repairProId);

  // Skip pros who tapped Later (5 min) or declined THIS request (permanent
  // per-request exclusion, D6) so the request is not re-delivered to them.
  for (const h of job.statusHistory || []) {
    const by = h.by || "";
    if (by.startsWith("deferred:")) {
      const proId = by.slice("deferred:".length);
      if (isDeferredByPro(job, proId)) triedProIds.add(proId);
    } else if (by.startsWith("excluded:")) {
      const proId = by.slice("excluded:".length);
      if (isExcludedForJob(job, proId)) triedProIds.add(proId);
    }
  }

  // Same trade only — never reassign a mechanic job to a plumber, etc.
  // Match primary_service OR services[] so multi-skill pros still get requests.
  const serviceType = String(job.serviceType || "").trim();
  const { data: pros } = await sb
    .from("repair_pro_profiles")
    .select(
      "user_id, business_name, lat, lng, primary_service, services, location_updated_at, visibility_tier"
    )
    .eq("is_online", true)
    .neq("status", "suspended")
    .neq("status", "rejected");

  if (!pros?.length) return null;

  const REROUTE_RADIUS_KM = MAX_RADIUS_KM;

  const offersTrade = (p: {
    primary_service?: string | null;
    services?: unknown;
  }) => {
    if (!serviceType) return true;
    if (String(p.primary_service || "").trim() === serviceType) return true;
    const list = p.services;
    if (Array.isArray(list)) {
      return list.some(
        (s) => String(s || "").trim().toLowerCase() === serviceType.toLowerCase()
      );
    }
    if (typeof list === "string" && list.trim()) {
      try {
        const parsed = JSON.parse(list) as unknown;
        if (Array.isArray(parsed)) {
          return parsed.some(
            (s) =>
              String(s || "").trim().toLowerCase() === serviceType.toLowerCase()
          );
        }
      } catch {
        return list.toLowerCase().includes(serviceType.toLowerCase());
      }
    }
    return false;
  };

  const available = pros.filter((p) => {
    if (triedProIds.has(p.user_id) || p.lat == null || p.lng == null) {
      return false;
    }
    // Stale is_online (pro closed the app without going Away) must not receive
    // a reroute — require a fresh heartbeat like the marketplace feed.
    if (
      !hasRecentLiveHeartbeat(
        (p as { location_updated_at?: string | null }).location_updated_at,
        Date.now()
      )
    ) {
      return false;
    }
    if (!offersTrade(p)) return false;
    // Never reroute a real customer to a demo/audit pro.
    if (
      isSyntheticAccount({
        businessName: (p as { business_name?: string | null }).business_name,
      })
    ) {
      return false;
    }
    return true;
  });
  if (!available.length) return null;

  const { lat: cLat, lng: cLng } = job.motoristLocation;
  const withDistance = available
    .map((p) => {
      const dLat = ((p.lat as number) - cLat) * 111;
      const dLng =
        ((p.lng as number) - cLng) *
        111 *
        Math.cos((cLat * Math.PI) / 180);
      const km = Math.hypot(dLat, dLng);
      return { p, km };
    })
    .filter((x) => x.km <= REROUTE_RADIUS_KM + 0.75);

  if (!withDistance.length) return null;

  // Merit-first ordering (D4): rank within 10-point merit bands, distance as
  // the tiebreak. Fall back to distance-only when merit scores are absent.
  const kmOf = (p: { user_id: string }) =>
    withDistance.find((x) => x.p.user_id === p.user_id)?.km ?? Number.POSITIVE_INFINITY;
  const ordered = await orderCandidatesByMerit(
    withDistance.map((x) => x.p),
    kmOf
  );
  const best = ordered[0];

  // Fetch name + photo from profiles
  const { data: profile } = await sb
    .from("profiles")
    .select("full_name, avatar_url")
    .eq("id", best.user_id)
    .maybeSingle();

  return {
    id: best.user_id,
    name: profile?.full_name || best.business_name || "Repair Pro",
    photo: profile?.avatar_url || undefined,
  };
}

/**
 * Assign the next available pro to an unaccepted job. Returns false when no
 * eligible pro is left (caller decides whether to expire or keep waiting).
 */
async function assignNextPro(
  job: JobRecord,
  sb: ReturnType<typeof createServiceSupabase>,
  skipNotifyPreviousPro = false
): Promise<boolean> {
  const nextPro = await findNextPro(job, sb);
  if (!nextPro) return false;

  const ts = new Date().toISOString();

  // Clean slate for the new pro — do not carry prior offers / armed timer / price.
  // Far-future negotiate_ends_at: timer unarmed until pro accepts (same as createJob).
  const unarmedEnds = new Date(
    Date.now() + 365 * 24 * 60 * 60 * 1000
  ).toISOString();
  await sb
    .from("service_requests")
    .update({
      status: "requested",
      flow_status: "negotiating",
      repair_pro_id: nextPro.id,
      repair_pro_name: nextPro.name,
      ...(nextPro.photo ? { repair_pro_photo: nextPro.photo } : {}),
      offers: [],
      pro_base_major: null,
      agreed_major: null,
      negotiate_ends_at: unarmedEnds,
      updated_at: ts,
      status_history: [
        ...job.statusHistory,
        {
          status: "negotiating",
          at: ts,
          by: `reroute:${nextPro.id}`,
        },
      ],
    })
    .eq("id", job.id);

  // Keep the in-memory store in sync so listJobsForUser (which merges memory
  // first) reflects the reassignment for both the previous and next pro.
  memory.set(job.id, {
    ...job,
    status: "negotiating",
    repairProId: nextPro.id,
    repairProName: nextPro.name,
    ...(nextPro.photo ? { repairProPhoto: nextPro.photo } : {}),
    offers: [],
    proBaseMajor: null,
    agreedMajor: null,
    negotiateEndsAt: unarmedEnds,
    updatedAt: ts,
    statusHistory: [
      ...job.statusHistory,
      { status: "negotiating", at: ts, by: `reroute:${nextPro.id}` },
    ],
  });

  // Notify the new pro (DB row so app center + realtime stay in sync)
  try {
    const { insertNotification } = await import(
      "@/lib/server/notifications"
    );
    await insertNotification({
      userId: nextPro.id,
      category: "requests",
      priority: "high",
      title: "Service Request",
      body: `New request from ${job.motoristName} · ${job.problem.slice(0, 80)}`,
      href: `/jobs/${job.id}`,
      actionType: "open_job",
      actionPayload: { jobId: job.id },
      jobId: job.id,
      jobStatus: "negotiating",
      groupKey: `service-request-${job.id}`,
    });
  } catch {
    /* notifications optional */
  }

  // Quiet persistent entry for the previous pro: the request moved on to
  // another pro. Skipped for the pro who actively declined (they initiated the
  // reroute — no need to tell them). groupKey dedupes per job.
  if (
    !skipNotifyPreviousPro &&
    job.repairProId &&
    job.repairProId !== nextPro.id
  ) {
    try {
      const { insertNotification } = await import(
        "@/lib/server/notifications"
      );
      await insertNotification({
        userId: job.repairProId,
        category: "requests",
        priority: "normal",
        title: "Request moved on",
        body: "This request was assigned to another pro.",
        href: `/jobs/${job.id}`,
        actionType: "open_job",
        actionPayload: { jobId: job.id },
        jobId: job.id,
        jobStatus: "negotiating",
        groupKey: `request-moved-on-${job.id}`,
      });
    } catch {
      /* notifications optional */
    }
  }

  return true;
}

/**
 * Reroute an unaccepted job to the next available pro.
 * When no pro is available right now, the job moves into the `searching`
 * phase (customer sees the live 60/40 search screen) and the sweep keeps
 * retrying until the 15-minute window expires with `reroute_exhausted`.
 */
async function rerouteUnacceptedJob(
  job: JobRecord,
  sb: ReturnType<typeof createServiceSupabase>
): Promise<boolean> {
  const ok = await assignNextPro(job, sb);
  if (ok) return true;

  // No eligible pro right now — enter searching so the customer sees the
  // search screen and dispatch keeps looking within the window.
  const ts = new Date().toISOString();
  const searchingHistory = [
    ...job.statusHistory,
    { status: "searching" as JobFlowStatus, at: ts, by: "reroute_no_pro" },
  ];
  const { error } = await sb
    .from("service_requests")
    .update({
      status: flowToLegacyStatus("searching"),
      flow_status: "searching",
      updated_at: ts,
      status_history: searchingHistory,
    })
    .eq("id", job.id);
  if (error) {
    console.error("rerouteUnacceptedJob: searching update failed", job.id, error.message);
  }
  // Keep memory in sync so the previous pro's dashboard drops the job from
  // Incoming (listJobsForUser merges memory first).
  memory.set(job.id, {
    ...job,
    status: "searching",
    updatedAt: ts,
    statusHistory: searchingHistory,
  });
  return false;
}

/**
 * Sweep for negotiating jobs where the pro has not tapped "I can fix this"
 * within 1 minute. Reroutes to the next available pro of the same trade.
 * After 15 minutes without any acceptance, the job expires with a
 * `reroute_exhausted` marker so the customer sees the retry message.
 * Also handles `searching` jobs (pro actively cancelled) — reroute immediately
 * without the 1-minute delay.
 */
export async function expireUnacceptedJobs(
  limit = 40
): Promise<{ checked: number; rerouted: number; expired: number }> {
  let checked = 0;
  let rerouted = 0;
  let expired = 0;

  if (!isSupabaseAdminConfigured()) return { checked, rerouted, expired };

  try {
    const sb = createServiceSupabase();

    // Sweep negotiating jobs (pro has not responded yet). SSPE jobs carry a
    // pairing_stage and are timed by the pairing sweep instead.
    // DB stores legacy status=requested + flow_status=negotiating for new jobs.
    const { data: negotiatingData } = await sb
      .from("service_requests")
      .select("*")
      .eq("flow_status", "negotiating")
      .is("pairing_stage", null)
      .order("created_at", { ascending: true })
      .limit(limit);

    for (const row of negotiatingData || []) {
      const job = rowToJob(row as Record<string, unknown>);
      checked++;

      const hasAccepted = job.statusHistory.some(
        (h) => h.by === "negotiation_timer_start"
      );
      if (hasAccepted) continue;

      if (isDeferredByPro(job, job.repairProId)) continue;

      const ageMs = Date.now() - new Date(job.createdAt).getTime();

      if (ageMs < REROUTE_AFTER_MS) continue;

      if (ageMs >= REROUTE_WINDOW_MS) {
        await sb
          .from("service_requests")
          .update({
            status: "expired",
            flow_status: "expired",
            updated_at: new Date().toISOString(),
            status_history: [
              ...job.statusHistory,
              {
                status: "expired",
                at: new Date().toISOString(),
                by: "reroute_exhausted",
              },
            ],
          })
          .eq("id", job.id);
        expired++;
      } else {
        const ok = await rerouteUnacceptedJob(job, sb);
        if (ok) rerouted++;
        // else: still searching / waiting — do not count as expired
      }
    }

    // Sweep searching jobs (pro cancelled — reroute immediately)
    const { data: searchingData } = await sb
      .from("service_requests")
      .select("*")
      .eq("flow_status", "searching")
      .is("pairing_stage", null)
      .order("created_at", { ascending: true })
      .limit(limit);

    for (const row of searchingData || []) {
      const job = rowToJob(row as Record<string, unknown>);
      checked++;

      // Measure the 15-minute search window from when searching actually
      // started (e.g. the decline), not from job creation.
      let searchingAt = 0;
      for (const h of job.statusHistory || []) {
        if (h.status === "searching") {
          const t = Date.parse(h.at);
          if (Number.isFinite(t) && t > searchingAt) searchingAt = t;
        }
      }
      const ageMs =
        Date.now() - (searchingAt || new Date(job.createdAt).getTime());

      if (ageMs >= REROUTE_WINDOW_MS) {
        // 15+ minutes — expire
        await sb
          .from("service_requests")
          .update({
            status: "expired",
            flow_status: "expired",
            updated_at: new Date().toISOString(),
            status_history: [
              ...job.statusHistory,
              {
                status: "expired",
                at: new Date().toISOString(),
                by: "reroute_exhausted",
              },
            ],
          })
          .eq("id", job.id);
        expired++;
      } else {
        // Reroute immediately (no 1-minute delay for actively cancelled jobs).
        // When no pro is available right now, keep the job searching — a pro
        // may free up before the 15-minute window ends.
        const ok = await assignNextPro(job, sb);
        if (ok) rerouted++;
      }
    }
  } catch (e) {
    console.error("expireUnacceptedJobs", e);
  }

  return { checked, rerouted, expired };
}

/** Reroute a single unaccepted job to the next nearest pro when the current pro declines. */
export async function rerouteDeclinedJob(
  jobId: string,
  cancelReason?: string
): Promise<{ ok: true; job: JobRecord } | { error: string }> {
  if (!isSupabaseAdminConfigured()) return { error: "Server not configured" };
  const sb = createServiceSupabase();
  const { data } = await sb
    .from("service_requests")
    .select("*")
    .eq("id", jobId)
    .single();
  if (!data) return { error: "Job not found" };
  const job = rowToJob(data as Record<string, unknown>);
  if (job.status !== "negotiating" && job.status !== "searching") {
    return { error: "Job is no longer available" };
  }

  // SSPE job → hand off to the pairing engine (per-request exclusion + next pro).
  if (job.pairingStage) {
    try {
      const { declineRequest } = await import(
        "@/lib/server/pairing/pairing-engine"
      );
      const res = await declineRequest(
        jobId,
        job.repairProId,
        cancelReason || "pro_declined"
      );
      if (!res.ok) return { error: res.error };
      const updated = await getJob(jobId);
      if (!updated) return { error: "Job not found" };
      return { ok: true, job: updated };
    } catch (e) {
      console.error("rerouteDeclinedJob: SSPE decline failed", jobId, e);
      return { error: "Could not reroute request" };
    }
  }

  // Record the cancellation in statusHistory, then move the job into the
  // "searching" phase so the customer's UI shows the live 60/40 search screen
  // while dispatch looks for the next pro.
  const cancelledProName = job.repairProName;
  const declineTs = new Date().toISOString();
  const cancelEntry = {
    status: "searching" as JobFlowStatus,
    at: declineTs,
    by: "repair_pro",
    note: cancelReason ? `pro_declined:${cancelReason}` : "pro_declined",
  };
  const history = [...(job.statusHistory || []), cancelEntry];

  // Per-request exclusion only (D6): this pro is excluded permanently from
  // THIS request, never across future requests from the same customer.
  history.push({
    status: "searching" as JobFlowStatus,
    at: declineTs,
    by: `excluded:${job.repairProId}`,
  });

  // 1) Persist the searching phase first (customer sees the search screen).
  const { error: searchErr } = await sb
    .from("service_requests")
    .update({
      status: flowToLegacyStatus("searching"),
      flow_status: "searching",
      updated_at: declineTs,
      status_history: history,
    })
    .eq("id", job.id);
  if (searchErr) {
    console.error("rerouteDeclinedJob: searching update failed", job.id, searchErr.message);
    return { error: "Could not enter searching phase" };
  }

  // Keep the in-memory store in sync so the declining pro's dashboard no
  // longer lists this job under Incoming (listJobsForUser merges memory first).
  memory.set(job.id, {
    ...job,
    status: "searching",
    updatedAt: declineTs,
    statusHistory: history,
  });

  // 2) Hand off ASAP to the next available pro. When none is available the
  // job stays in "searching" — the expireUnacceptedJobs sweep keeps retrying
  // and only expires after the 15-minute window. Skip notifying the previous
  // pro — the decliner initiated this reroute, so "moved on" would be noise.
  const jobWithHistory = { ...job, statusHistory: history };
  await assignNextPro(jobWithHistory, sb, true);

  // Notify customer that the pro declined and we're finding another
  try {
    const { insertNotification } = await import("@/lib/server/notifications");
    await insertNotification({
      userId: job.motoristId,
      category: "requests",
      priority: "high",
      title: "Repair Pro not available",
      body: `${cancelledProName} could not take this request. Finding another pro…`,
      href: `/jobs/${job.id}`,
      actionType: "open_job",
      actionPayload: { jobId: job.id },
      jobId: job.id,
      jobStatus: "searching",
      groupKey: `pro-declined-${job.id}`,
    });
  } catch {
    /* notification optional */
  }

  // Reload to get the post-reroute state (negotiating with new pro, or still
  // searching while we keep looking).
  const { data: updated } = await sb
    .from("service_requests")
    .select("*")
    .eq("id", jobId)
    .single();
  const finalJob = rowToJob((updated || data) as Record<string, unknown>);
  // Mirror the final state into memory (assignNextPro already does this on a
  // successful handoff, but reflect the searching fallback here too).
  memory.set(job.id, finalJob);
  return { ok: true, job: finalJob };
}

/**
 * Admin control: force-reroute an active job to the next eligible pro
 * (skipping deferred/excluded/tried pros). Returns the updated job, or an
 * error when the job isn't actively awaiting a pro or no pro is eligible.
 */
export async function forceRerouteJob(
  jobId: string
): Promise<{ ok: true; job: JobRecord } | { error: string }> {
  if (!isSupabaseAdminConfigured()) return { error: "Server not configured" };
  const sb = createServiceSupabase();
  const { data } = await sb
    .from("service_requests")
    .select("*")
    .eq("id", jobId)
    .single();
  if (!data) return { error: "Job not found" };
  const job = rowToJob(data as Record<string, unknown>);
  if (job.status !== "negotiating" && job.status !== "searching") {
    return { error: "Job is not awaiting a pro" };
  }

  job.statusHistory = [
    ...(job.statusHistory || []),
    {
      status: job.status as JobFlowStatus,
      at: new Date().toISOString(),
      by: "admin_force_reroute",
    },
  ];

  const ok = await assignNextPro(job, sb);
  if (!ok) return { error: "No eligible pro available" };

  const { data: updated } = await sb
    .from("service_requests")
    .select("*")
    .eq("id", jobId)
    .single();
  if (!updated) return { error: "Job not found after reroute" };
  return { ok: true, job: rowToJob(updated as Record<string, unknown>) };
}

/**
 * Admin control: clear every active cooldown (deferrals + exclusions) for a
 * job so dispatch may consider those pros again immediately.
 */
export async function clearJobCooldowns(
  jobId: string
): Promise<{ ok: true; job: JobRecord } | { error: string }> {
  if (!isSupabaseAdminConfigured()) return { error: "Server not configured" };
  const sb = createServiceSupabase();
  const { data } = await sb
    .from("service_requests")
    .select("*")
    .eq("id", jobId)
    .single();
  if (!data) return { error: "Job not found" };
  const job = rowToJob(data as Record<string, unknown>);

  // Strip deferral / exclusion markers from persisted history.
  const cleaned = (job.statusHistory || []).filter((h) => {
    const by = h.by || "";
    return !by.startsWith("deferred:") && !by.startsWith("excluded:");
  });
  await sb
    .from("service_requests")
    .update({
      status_history: cleaned,
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);

  // SSPE: un-terminate the request queue so declined/timed-out pros are
  // eligible again for this request (admin explicitly cleared the cooldowns).
  if (job.pairingStage) {
    await sb
      .from("request_pairing_queue")
      .update({ status: "offered", result_note: "admin_cleared" })
      .eq("request_id", jobId)
      .in("status", ["declined", "timed_out", "deferred", "skipped"]);
  }

  const { data: updated } = await sb
    .from("service_requests")
    .select("*")
    .eq("id", jobId)
    .single();
  if (!updated) return { error: "Job not found after clear" };
  return { ok: true, job: rowToJob(updated as Record<string, unknown>) };
}

/**
 * Admin control: force-expire an active job (ends the search/negotiation).
 */
export async function adminExpireJob(
  jobId: string
): Promise<{ ok: true; job: JobRecord } | { error: string }> {
  if (!isSupabaseAdminConfigured()) return { error: "Server not configured" };
  const sb = createServiceSupabase();
  const { data } = await sb
    .from("service_requests")
    .select("*")
    .eq("id", jobId)
    .single();
  if (!data) return { error: "Job not found" };
  const job = rowToJob(data as Record<string, unknown>);

  const ts = new Date().toISOString();
  await sb
    .from("service_requests")
    .update({
      status: "expired",
      flow_status: "expired",
      updated_at: ts,
      status_history: [
        ...(job.statusHistory || []),
        { status: "expired", at: ts, by: "admin_expired" },
      ],
    })
    .eq("id", jobId);

  const { data: updated } = await sb
    .from("service_requests")
    .select("*")
    .eq("id", jobId)
    .single();
  if (!updated) return { error: "Job not found after expire" };
  return { ok: true, job: rowToJob(updated as Record<string, unknown>) };
}

/**
 * Admin control: reassign an active job to a specific pro, bypassing the
 * normal dispatch order. The targeted pro's active deferral/exclusion for
 * this job is cleared first so the override sticks.
 */
export async function adminReassignJob(
  jobId: string,
  proId: string,
  proName?: string
): Promise<{ ok: true; job: JobRecord } | { error: string }> {
  if (!isSupabaseAdminConfigured()) return { error: "Server not configured" };
  if (!proId) return { error: "Missing proId" };
  const sb = createServiceSupabase();
  const { data } = await sb
    .from("service_requests")
    .select("*")
    .eq("id", jobId)
    .single();
  if (!data) return { error: "Job not found" };
  const job = rowToJob(data as Record<string, unknown>);

  const ts = new Date().toISOString();
  const history = (job.statusHistory || []).filter((h) => {
    const by = h.by || "";
    return !(by.startsWith("deferred:") && by.slice("deferred:".length) === proId) &&
      !(by.startsWith("excluded:") && by.slice("excluded:".length) === proId);
  });
  history.push({
    status: "negotiating",
    at: ts,
    by: `admin_reassign:${proId}`,
  });

  await sb
    .from("service_requests")
    .update({
      status: "negotiating",
      flow_status: "negotiating",
      repair_pro_id: proId,
      repair_pro_name: proName || job.repairProName,
      updated_at: ts,
      status_history: history,
    })
    .eq("id", jobId);

  try {
    const { insertNotification } = await import("@/lib/server/notifications");
    await insertNotification({
      userId: proId,
      category: "requests",
      priority: "high",
      title: "Service Request",
      body: `New request from ${job.motoristName} · ${job.problem.slice(0, 80)}`,
      href: `/jobs/${job.id}`,
      actionType: "open_job",
      actionPayload: { jobId: job.id },
      jobId: job.id,
      groupKey: `service-request-${job.id}`,
    });
  } catch {
    /* notifications optional */
  }

  const { data: updated } = await sb
    .from("service_requests")
    .select("*")
    .eq("id", jobId)
    .single();
  if (!updated) return { error: "Job not found after reassign" };
  return { ok: true, job: rowToJob(updated as Record<string, unknown>) };
}

/**
 * Every column rowToJob reads EXCEPT the heavy base64 media columns
 * (photos, voice_note). Selecting "*" pulled ~5 MB of embedded data-URLs
 * per list poll (16s+) — media is re-fetched only for open pro requests.
 */
/** Repair-pro statuses the incoming popup / dashboard must always show,
 *  regardless of how many history jobs a pro has accumulated. */
const PRO_ACTIONABLE_LIST_STATUSES = [
  "waiting_for_selected",
  "selected_review",
  "waiting_for_pro",
  "reserved",
  "sequential_pairing",
  "negotiating",
  "agreed",
];

const LEAN_JOB_COLUMNS = [
  "id",
  "flow_status",
  "status",
  "motorist_id",
  "motorist_name",
  "motorist_photo",
  "motorist_vehicle",
  "repair_pro_id",
  "repair_pro_name",
  "repair_pro_photo",
  "service_type",
  "problem_text",
  "description",
  "pricing_currency",
  "pro_base_major",
  "agreed_major",
  "offers",
  "negotiate_ends_at",
  "max_offers",
  "pickup_address",
  "pickup_lat",
  "pickup_lng",
  "pro_lat",
  "pro_lng",
  "distance_km",
  "eta_minutes",
  "eta_text",
  "distance_text",
  "eta_source",
  "pro_location_at",
  "motorist_location_at",
  "payment_id",
  "payment_reference",
  "escrow_status",
  "amount_minor",
  "platform_fee_minor",
  "pro_payout_minor",
  "dispute",
  "evidence",
  "rating",
  "rating_note",
  "status_history",
  "created_at",
  "updated_at",
  "paid_at",
  "released_at",
  "cancelled_at",
  "satisfied_at",
  "pairing_stage",
  "pairing_deadline",
  "queue_position",
  "remaining_candidates",
  "reservation_status",
  "assignment_status",
  "chosen_pro_id",
  "pairing_radius_km",
  "radius_km",
].join(", ");

export async function listJobsForUser(
  userId: string,
  role: "motorist" | "repair_pro",
  opts?: { lean?: boolean }
): Promise<JobRecord[]> {
  if (opts?.lean) {
    return listJobsForUserLean(userId, role);
  }
  const out: JobRecord[] = [];
  for (const j of memory.values()) {
    if (role === "motorist" && j.motoristId === userId) out.push(j);
    if (role === "repair_pro" && j.repairProId === userId) {
      if (isDeferredByPro(j, userId)) continue;
      out.push(j);
    }
  }
  if (isSupabaseAdminConfigured()) {
    try {
      const sb = createServiceSupabase();
      const col = role === "motorist" ? "motorist_id" : "repair_pro_id";
      // Lean list — exclude heavy base64 media columns (photos/voice_note).
      // Media is hydrated below only for open pro requests the popup needs.
      const { data } = await sb
        .from("service_requests")
        .select(LEAN_JOB_COLUMNS)
        .eq(col, userId)
        .order("created_at", { ascending: false })
        .limit(40);
      let rows = data || [];
      // Never let the windowed history list truncate an OPEN request: when the
      // pro has >40 jobs (mostly history), an older request still in an
      // actionable state would silently fall out of the top-40 and the incoming
      // popup would drop its card ("request disappears and comes back").
      if (role === "repair_pro") {
        const { data: openData } = await sb
          .from("service_requests")
          .select(LEAN_JOB_COLUMNS)
          .eq("repair_pro_id", userId)
          .in("status", PRO_ACTIONABLE_LIST_STATUSES);
        const openArr = openData || [];
        if (openArr.length > 0) {
          const idOf = (r: { id?: unknown }) => String(r.id);
          const openSet = new Set(openArr.map((r) => idOf(r as { id?: unknown })));
          rows = [
            ...openArr,
            ...rows.filter((r) => !openSet.has(idOf(r as { id?: unknown }))),
          ];
        }
      }
      // Parallel light processing (was sequential N+1 → multi-second hangs)
      let mapped = await Promise.all(
        rows.map(async (row) => {
          let j = rowToJob(row as unknown as Record<string, unknown>);
          // Only run expire checks on statuses that can auto-advance
          if (
            j.status === "negotiating" ||
            j.status === "agreed" ||
            j.status === "paid_booked" ||
            j.status === "en_route" ||
            j.status === "arrived" ||
            j.status === "in_progress" ||
            j.status === "completed" ||
            j.status === "searching"
          ) {
            try {
              j = await maybeExpire(j);
            } catch {
              /* keep raw row */
            }
          }
          return j;
        })
      );

      // Batch-fill missing customer profile photos for open pro requests
      // (service request image placeholder / popup avatar).
      if (role === "repair_pro") {
        const needPhoto = mapped.filter(
          (j) =>
            !j.motoristPhoto?.trim() &&
            j.motoristId &&
            [
              "waiting_for_selected",
              "selected_review",
              "waiting_for_pro",
              "reserved",
              "negotiating",
              "agreed",
            ].includes(j.status)
        );
        const ids = [
          ...new Set(needPhoto.map((j) => j.motoristId).filter(Boolean)),
        ];
        if (ids.length) {
          try {
            const { data: profiles } = await sb
              .from("profiles")
              .select("id, avatar_url")
              .in("id", ids);
            const byId = new Map(
              (profiles || [])
                .filter((p) => p.avatar_url)
                .map((p) => [String(p.id), String(p.avatar_url)])
            );
            if (byId.size) {
              mapped = mapped.map((j) => {
                if (j.motoristPhoto?.trim()) return j;
                const url = byId.get(j.motoristId);
                return url ? { ...j, motoristPhoto: url } : j;
              });
            }
          } catch {
            /* optional */
          }
        }
      }

      // Hydrate photos + voice note for open pro requests only — the incoming
      // popup needs them, but terminal/history jobs stay lean (base64 is heavy).
      if (role === "repair_pro") {
        const needMedia = mapped.filter((j) =>
          [
            "waiting_for_selected",
            "selected_review",
            "waiting_for_pro",
            "reserved",
            "sequential_pairing",
            "negotiating",
            "agreed",
          ].includes(j.status)
        );
        const mediaIds = [...new Set(needMedia.map((j) => j.id).filter(Boolean))];
        if (mediaIds.length) {
          try {
            const { data: mediaRows } = await sb
              .from("service_requests")
              .select("id, photos, voice_note")
              .in("id", mediaIds);
            const mediaById = new Map(
              (mediaRows || []).map((r) => [String(r.id), r])
            );
            if (mediaById.size) {
              mapped = mapped.map((j) => {
                const m = mediaById.get(j.id);
                if (!m) return j;
                return {
                  ...j,
                  photos: (m.photos as JobMedia[]) || j.photos,
                  voiceNote: (m.voice_note as JobMedia) || j.voiceNote,
                };
              });
            }
          } catch {
            /* media is optional */
          }
        }
      }

      for (const j of mapped) {
        if (role === "repair_pro" && isDeferredByPro(j, userId)) continue;
        if (!out.find((x) => x.id === j.id)) out.push(j);
      }
    } catch {
      /* */
    }
  }
  /** Open pairing / negotiate jobs for pros — keep customer photos+voice so the
   * incoming popup can show them with the request (not after a second fetch). */
  const KEEP_MEDIA_STATUSES = new Set<string>([
    "waiting_for_selected",
    "selected_review",
    "waiting_for_pro",
    "reserved",
    "sequential_pairing",
    "negotiating",
    "agreed",
  ]);

  return out
    .filter((j) => {
      // Keep finished jobs (released / completed / etc.) for Recent Bookings + History.
      // Only drop empty demo shells.
      if (!j.motoristId || !j.problem?.trim()) return false;
      return true;
    })
    .map((j) => {
      // Lean list for history/terminal jobs (base64 media is heavy).
      // Pro open requests keep photos so popup + request appear together.
      if (role === "repair_pro" && KEEP_MEDIA_STATUSES.has(j.status)) {
        return j;
      }
      return { ...j, photos: [], voiceNote: null };
    })
    .sort(
      (a, b) =>
        new Date(b.updatedAt || b.createdAt).getTime() -
        new Date(a.updatedAt || a.createdAt).getTime()
    );
}

/**
 * Fast "status snapshot" for the pro incoming popup poll — no media hydration,
 * no profile backfill, no expiry checks. Returns this pro's open actionable
 * jobs (never truncated) plus their recent jobs, in one or two lean queries.
 * The popup re-hydrates media the first time it surfaces a card, so each poll
 * stays a cheap round-trip: a request the customer closes/cancels drops the
 * pro's card within ~1s even when the realtime push is missed on a flaky
 * mobile connection.
 */
async function listJobsForUserLean(
  userId: string,
  role: "motorist" | "repair_pro"
): Promise<JobRecord[]> {
  const out: JobRecord[] = [];
  for (const j of memory.values()) {
    if (role === "motorist" && j.motoristId === userId) out.push(j);
    if (role === "repair_pro" && j.repairProId === userId) {
      if (isDeferredByPro(j, userId)) continue;
      out.push(j);
    }
  }
  if (isSupabaseAdminConfigured()) {
    try {
      const sb = createServiceSupabase();
      const col = role === "motorist" ? "motorist_id" : "repair_pro_id";
      const { data } = await sb
        .from("service_requests")
        .select(LEAN_JOB_COLUMNS)
        .eq(col, userId)
        .order("created_at", { ascending: false })
        .limit(40);
      let rows = data || [];
      // Never truncate an OPEN request (same protection as the full list): a
      // pro with lots of history must still see an actionable offer. Pairing
      // jobs keep their stage in flow_status, so the open set is matched on
      // flow_status (not the legacy status column).
      if (role === "repair_pro") {
        const { data: openData } = await sb
          .from("service_requests")
          .select(LEAN_JOB_COLUMNS)
          .eq("repair_pro_id", userId)
          .in("flow_status", PRO_ACTIONABLE_LIST_STATUSES);
        const openArr = openData || [];
        if (openArr.length > 0) {
          const idOf = (r: { id?: unknown }) => String(r.id);
          const openSet = new Set(
            openArr.map((r) => idOf(r as { id?: unknown }))
          );
          rows = [
            ...openArr,
            ...rows.filter((r) => !openSet.has(idOf(r as { id?: unknown }))),
          ];
        }
      }
      const mapped = rows.map((row) =>
        rowToJob(row as unknown as Record<string, unknown>)
      );
      for (const j of mapped) {
        if (role === "repair_pro" && isDeferredByPro(j, userId)) continue;
        if (!out.find((x) => x.id === j.id)) out.push(j);
      }
    } catch {
      /* fall back to memory */
    }
  }
  return out;
}

export async function listDisputedJobs(): Promise<JobRecord[]> {
  const all: JobRecord[] = [];
  for (const j of memory.values()) {
    if (j.status === "disputed" || j.status === "under_appeal") all.push(j);
  }
  if (isSupabaseAdminConfigured()) {
    try {
      const sb = createServiceSupabase();
      const { data } = await sb
        .from("service_requests")
        .select("*")
        .in("flow_status", ["disputed", "under_appeal"])
        .order("updated_at", { ascending: false })
        .limit(100);
      for (const row of data || []) {
        const j = rowToJob(row as Record<string, unknown>);
        if (!all.find((x) => x.id === j.id)) all.push(j);
      }
    } catch {
      /* */
    }
  }
  return all;
}

/**
 * Fire-and-forget Merit Ranking Engine refresh for a pro. Safe to call on any
 * completion / cancellation / dispute transition — recomputing is idempotent.
 * Keeps ranking current after completed jobs, cancellations and disputes.
 */
async function fireMeritRecalc(proId?: string | null): Promise<void> {
  if (!proId) return;
  try {
    const { recalculateMerit } = await import(
      "@/lib/server/merit/merit-engine"
    );
    void recalculateMerit(proId);
  } catch {
    /* merit recalc is best-effort */
  }
}
export { fireMeritRecalc };

async function applyEvent(
  job: JobRecord,
  event: TransitionEvent,
  actor: TransitionActor
): Promise<JobRecord> {
  const nextRaw = assertTransition(job.status, event);
  // Customer (or admin/system) cancelling during negotiation/search fully
  // cancels the job — only a Repair Pro decline enters the "searching"
  // (find-another-pro) phase, and that path is handled by rerouteDeclinedJob.
  const next =
    event.type === "CANCEL" && nextRaw === "searching" ? "cancelled" : nextRaw;
  const ts = nowIso();

  // Pro accepts request → arm 20 min negotiate timer (does not change status)
  if (event.type === "START_NEGOTIATION") {
    const ends = new Date(Date.now() + NEGOTIATE_WINDOW_MS).toISOString();
    // Notify customer that pro accepted
    try {
      const { insertNotification } = await import(
        "@/lib/server/notifications"
      );
      await insertNotification({
        userId: job.motoristId,
        category: "requests",
        priority: "high",
        title: "Pro can fix this",
        body: `${job.repairProName} confirmed they can fix your issue.`,
        href: `/jobs/${job.id}`,
        actionType: "open_job",
        actionPayload: { jobId: job.id },
        jobId: job.id,
        jobStatus: "negotiating",
        groupKey: `pro-accepted-${job.id}`,
      });
    } catch {
      /* notification optional */
    }
    return persist({
      ...job,
      negotiateEndsAt: ends,
      updatedAt: ts,
      statusHistory: [
        ...job.statusHistory,
        { status: job.status, at: ts, by: "negotiation_timer_start" },
      ],
    });
  }

  const updated: JobRecord = {
    ...job,
    status: next,
    updatedAt: ts,
    statusHistory: [
      ...job.statusHistory,
      { status: next, at: ts, by: actor, note: event.type === "CANCEL" && "reason" in event ? event.reason : undefined },
    ],
  };

  if (next === "cancelled") {
    updated.cancelledAt = ts;
    updated.paymentSessionEndsAt = null;
    await fireMeritRecalc(job.repairProId);
    // Customer cancelled → notify the assigned pro so the cancellation PERSISTS
    // in their notification center list (the in-app banner is transient).
    // groupKey dedupes, so a cancel never notifies twice.
    if (actor === "motorist" && job.repairProId) {
      try {
        const { insertNotification } = await import(
          "@/lib/server/notifications"
        );
        const cname = job.motoristName?.split(/\s+/)[0];
        const subject = job.motoristVehicle?.trim();
        const body =
          cname && subject
            ? `${cname} cancelled the ${subject} request.`
            : cname
              ? `${cname} cancelled this request.`
              : "A customer cancelled this request.";
        await insertNotification({
          userId: job.repairProId,
          category: "requests",
          priority: "high",
          title: "Request cancelled",
          body,
          href: `/jobs/${job.id}`,
          actionType: "open_job",
          actionPayload: { jobId: job.id },
          jobId: job.id,
          jobStatus: "cancelled",
          groupKey: `request-cancelled-${job.id}`,
        });
        // OS push (web-push, VAPID) even when the app is closed or the tab is
        // hidden — the in-app card + banner close from realtime/poll, but the
        // pro must still hear about the cancel without the app foregrounded.
        try {
          const { sendPushToUser } = await import(
            "@/lib/server/push/webpush"
          );
          await sendPushToUser(job.repairProId, {
            title: "Request cancelled",
            body,
            url: "/dashboard",
            tag: `cancelled-${job.id}`,
          });
        } catch {
          /* push best-effort */
        }
      } catch {
        /* notifications optional */
      }
    }
    // Full refund if money was held (so customer can pay fresh on a new request)
    if (
      job.paymentId ||
      job.escrowStatus === "held" ||
      job.escrowStatus === "release_pending"
    ) {
      await refundJobEscrow(updated);
      updated.escrowStatus = "refunded";
    }
  }
  if (next === "expired") {
    updated.cancelledAt = ts;
    // Quiet persistent entry for the assigned pro: the request timed out and
    // is no longer theirs, even if they missed the live card/banner. groupKey
    // dedupes so it never notifies twice.
    if (job.repairProId) {
      try {
        const { insertNotification } = await import(
          "@/lib/server/notifications"
        );
        const cname = job.motoristName?.split(/\s+/)[0];
        await insertNotification({
          userId: job.repairProId,
          category: "requests",
          priority: "normal",
          title: "Request expired",
          body: cname ? `${cname}'s request expired.` : "This request expired.",
          href: `/jobs/${job.id}`,
          actionType: "open_job",
          actionPayload: { jobId: job.id },
          jobId: job.id,
          jobStatus: "expired",
          groupKey: `request-expired-${job.id}`,
        });
      } catch {
        /* notifications optional */
      }
    }
  }
  if (next === "cancelled" || next === "expired" || next === "refunded") {
    // Leave the pairing flow cleanly: drop pairing stage/timer/reservation so
    // the pairing sweep never re-times-out a terminal job.
    updated.pairingStage = null;
    updated.pairingDeadline = null;
    updated.reservationStatus = null;
    updated.assignmentStatus = null;
  }
  if (next === "paid_booked") {
    updated.paidAt = ts;
    updated.escrowStatus = "held";
  }
  if (next === "completed") {
    // Prompt customer to confirm and release pay
    try {
      const { insertNotification } = await import(
        "@/lib/server/notifications"
      );
      await insertNotification({
        userId: job.motoristId,
        category: "payments",
        priority: "critical",
        title: "Confirm Job & Release Payment",
        body: "Tap Release to pay the pro (87.5% · 5% Ona · 7.5% VAT on FLW).",
        href: `/jobs/${job.id}`,
        actionType: "open_job",
        actionPayload: { jobId: job.id },
        jobId: job.id,
        jobStatus: "completed",
        groupKey: `job-complete-${job.id}`,
      });
    } catch {
      /* notifications optional */
    }
  }
  if (next === "satisfied") {
    await fireMeritRecalc(job.repairProId);
    // Customer “I am satisfied” → try instant pro transfer (87.5% of service).
    // If FLW Available is not ready → PENDING_SETTLEMENT (escrow kept, auto-retry).
    // Customer is not asked to manual-retry for settlement delays.
    //
    // UX: never leave the client hanging until FLW finishes (caused “signal aborted”
    // at 15s). Race payout for a short budget; if still running, return confirmed
    // pending_settlement and finish release in the background (idempotent).
    const confirmedBase: JobRecord = {
      ...updated,
      status: "satisfied",
      satisfiedAt: ts,
      escrowStatus: "pending_settlement",
      statusHistory: [
        ...job.statusHistory,
        { status: "satisfied", at: ts, by: actor },
      ],
      updatedAt: ts,
    };

    const payoutJob = { ...confirmedBase, satisfiedAt: ts };
    const payoutPromise = releaseJobEscrow(payoutJob);
    const PAYOUT_BUDGET_MS = 10_000;
    type PayoutResult = Awaited<ReturnType<typeof releaseJobEscrow>>;
    const raced = await Promise.race([
      payoutPromise.then((p) => ({ kind: "done" as const, p })),
      new Promise<{ kind: "timeout" }>((resolve) =>
        setTimeout(() => resolve({ kind: "timeout" }), PAYOUT_BUDGET_MS)
      ),
    ]);

    const finishFromPayout = async (payout: PayoutResult): Promise<JobRecord> => {
      if (payout.ok) {
        const released: JobRecord = {
          ...confirmedBase,
          status: "released",
          releasedAt: nowIso(),
          escrowStatus: "released",
          amountMinor: payout.totalMinor ?? confirmedBase.amountMinor,
          proPayoutMinor: payout.proPayoutMinor ?? confirmedBase.proPayoutMinor,
          platformFeeMinor:
            payout.platformFeeMinor ?? confirmedBase.platformFeeMinor,
          statusHistory: [
            ...job.statusHistory,
            { status: "satisfied", at: ts, by: actor },
            { status: "released", at: nowIso(), by: "system" },
          ],
          updatedAt: nowIso(),
        };
        await bumpProJobsCompleted(job.repairProId);
        await notifyPayoutReleased(released);
        return persist(released);
      }
      if (payout.pendingSettlement) {
        const pending: JobRecord = {
          ...confirmedBase,
          amountMinor: payout.totalMinor ?? confirmedBase.amountMinor,
          proPayoutMinor: payout.proPayoutMinor ?? confirmedBase.proPayoutMinor,
          platformFeeMinor:
            payout.platformFeeMinor ?? confirmedBase.platformFeeMinor,
        };
        await notifyPayoutPendingSettlement(pending);
        return persist(pending);
      }
      // Hard fail (bad bank, etc.) — stay completed so customer can retry or open dispute
      throw new Error(
        payout.message ||
          "Could not pay the Repair Pro (87.5%). Funds stay held. Fix pro bank details or contact support."
      );
    };

    if (raced.kind === "timeout") {
      // Confirm immediately so the customer can rate/review without aborting.
      const pending = await persist(confirmedBase);
      await notifyPayoutPendingSettlement(pending);
      void payoutPromise
        .then(async (payout) => {
          try {
            // Only advance if still waiting on settlement (never double-release).
            const fresh = await getJob(job.id);
            if (!fresh) return;
            if (
              fresh.status === "released" ||
              fresh.escrowStatus === "released" ||
              fresh.releasedAt
            ) {
              return;
            }
            if (payout.ok) {
              await finishFromPayout(payout);
              return;
            }
            if (payout.pendingSettlement) {
              await finishFromPayout(payout);
              return;
            }
            // Hard fail (bad bank etc.) after the client already left completed:
            // bounce back so customer can fix / dispute — not silent forever-pending.
            const revert: JobRecord = {
              ...fresh,
              status: "completed",
              satisfiedAt: null,
              escrowStatus: "held",
              updatedAt: nowIso(),
              statusHistory: [
                ...fresh.statusHistory,
                {
                  status: "completed",
                  at: nowIso(),
                  by: "system",
                  note: `payout_hard_fail:${payout.message || "unknown"}`,
                },
              ],
            };
            await persist(revert);
            console.error(
              "SATISFIED background hard fail — reverted to completed",
              job.id,
              payout.message
            );
          } catch (e) {
            console.error("SATISFIED background payout", job.id, e);
          }
        })
        .catch((e) => console.error("SATISFIED background payout", job.id, e));
      return pending;
    }

    return finishFromPayout(raced.p);
  }
  if (next === "released") {
    updated.releasedAt = ts;
    await fireMeritRecalc(job.repairProId);
    const payout = await releaseJobEscrow(updated);
    if (payout.ok) {
      updated.escrowStatus = "released";
      if (payout.totalMinor != null) updated.amountMinor = payout.totalMinor;
      if (payout.proPayoutMinor != null)
        updated.proPayoutMinor = payout.proPayoutMinor;
      if (payout.platformFeeMinor != null)
        updated.platformFeeMinor = payout.platformFeeMinor;
      await notifyPayoutReleased({ ...updated, status: "released" });
    } else if (payout.pendingSettlement) {
      updated.status = "satisfied";
      updated.escrowStatus = "pending_settlement";
      updated.satisfiedAt = updated.satisfiedAt || ts;
      await notifyPayoutPendingSettlement(updated);
      return persist(updated);
    } else {
      throw new Error(
        payout.message ||
          "Could not release payout to Repair Pro. Funds still held."
      );
    }
  }
  if (next === "refunded") {
    updated.escrowStatus = "refunded";
    await refundJobEscrow(updated);
  }

  return persist(updated);
}

async function refundJobEscrow(job: JobRecord) {
  const esc = await getEscrowByRequest(job.id);
  if (esc) {
    await updateEscrow(esc.id, {
      status: "refunded",
      escrowStatus: "refunded",
      refundedAt: nowIso(),
    });
  }
}

/**
 * Pay Repair Pro 87.5% of service via Flutterwave Transfer from merchant balance.
 * Ona keeps 5%. Collections (Ledger) ≠ Available for payout — settlement delays
 * become PENDING_SETTLEMENT with auto-retry (never double-pay).
 */
async function releaseJobEscrow(
  job: JobRecord
): Promise<{
  ok: boolean;
  pendingSettlement?: boolean;
  message?: string;
  transferRef?: string;
  totalMinor?: number;
  proPayoutMinor?: number;
  platformFeeMinor?: number;
}> {
  // Auto-heal pending payment → held when FLW already settled collection
  const esc = await getEscrowByRequest(job.id);
  if (
    esc?.providerRef &&
    (esc.escrowStatus === "pending_payment" ||
      esc.escrowStatus === "none" ||
      esc.escrowStatus === "failed" ||
      esc.status === "pending" ||
      esc.status === "failed")
  ) {
    try {
      const verified = await verifyCharge(
        esc.providerRef,
        String(esc.provider)
      );
      if (verified.success) {
        await updateEscrow(esc.id, {
          status: "paid",
          escrowStatus: "held",
          paidAt: verified.paidAt || nowIso(),
          providerChannel: verified.channel || null,
        });
        if (job.status === "agreed") {
          await markJobPaidFromReference(esc.providerRef);
        }
      }
    } catch (e) {
      console.error("releaseJobEscrow auto-verify", job.id, e);
    }
  }

  const { attemptProPayout } = await import(
    "@/lib/server/payments/payout-settlement"
  );
  const result = await attemptProPayout({
    jobId: job.id,
    repairProId: job.repairProId,
    repairProName: job.repairProName,
    amountMinor: job.amountMinor,
    agreedMajor: job.agreedMajor,
    currency: job.currency,
    paymentReference: job.paymentReference,
    // First release after “I’m Satisfied” may run immediately (no prior nextRetryAt).
    // Later auto-retries use processDuePayoutRetries with force:false (10‑min spacing).
    force: false,
  });

  if (result.ok) {
    return {
      ok: true,
      transferRef: result.transferRef,
      totalMinor: result.totalMinor,
      proPayoutMinor: result.proPayoutMinor,
      platformFeeMinor: result.platformFeeMinor,
    };
  }
  if (result.pendingSettlement) {
    return {
      ok: false,
      pendingSettlement: true,
      message: result.message,
      totalMinor: result.totalMinor,
      proPayoutMinor: result.proPayoutMinor,
      platformFeeMinor: result.platformFeeMinor,
    };
  }
  return {
    ok: false,
    pendingSettlement: false,
    message: result.message,
    totalMinor: result.totalMinor,
    proPayoutMinor: result.proPayoutMinor,
    platformFeeMinor: result.platformFeeMinor,
  };
}

async function notifyPayoutReleased(job: JobRecord) {
  try {
    const { insertNotification, markNotificationsByGroupKey } = await import(
      "@/lib/server/notifications"
    );
    // Close the old "Confirm Job & Release Payment" notification
    if (job.motoristId) {
      await markNotificationsByGroupKey(job.motoristId, `job-complete-${job.id}`);
    }
    if (job.repairProId) {
      await markNotificationsByGroupKey(job.repairProId, `job-complete-${job.id}`);
    }
    // group_key dedupe — one notification per user per job even if called twice
    if (job.motoristId) {
      await insertNotification({
        userId: job.motoristId,
        category: "payments",
        priority: "critical",
        title: "Payment released",
        body: "Your payment has been released to your Repair Pro.",
        href: `/jobs/${job.id}`,
        actionType: "view_payment",
        actionPayload: { jobId: job.id },
        jobId: job.id,
        jobStatus: "released",
        groupKey: `payout-released-${job.id}`,
      });
    }
    if (job.repairProId) {
      await insertNotification({
        userId: job.repairProId,
        category: "payments",
        priority: "critical",
        title: "Payout released",
        body: "Your labour payout has been released to your bank.",
        href: `/jobs/${job.id}`,
        actionType: "view_payment",
        actionPayload: { jobId: job.id },
        jobId: job.id,
        jobStatus: "released",
        groupKey: `payout-released-pro-${job.id}`,
      });
    }
  } catch {
    /* optional */
  }
}

async function notifyPayoutPendingSettlement(job: JobRecord) {
  try {
    const { insertNotification, markNotificationsByGroupKey } = await import(
      "@/lib/server/notifications"
    );
    // Close the old "Confirm Job & Release Payment" notification
    if (job.motoristId) {
      await markNotificationsByGroupKey(job.motoristId, `job-complete-${job.id}`);
    }
    if (job.repairProId) {
      await markNotificationsByGroupKey(job.repairProId, `job-complete-${job.id}`);
    }
    const body =
      "Payout processing — auto-retry every 10 minutes for up to 24 hours. You’ll be notified when payment is released.";
    if (job.motoristId) {
      await insertNotification({
        userId: job.motoristId,
        category: "payments",
        priority: "high",
        title: "Payout processing",
        body,
        href: `/jobs/${job.id}`,
        actionType: "open_job",
        actionPayload: { jobId: job.id },
        jobId: job.id,
        jobStatus: "satisfied",
        groupKey: `payout-pending-${job.id}`,
      });
    }
    if (job.repairProId) {
      await insertNotification({
        userId: job.repairProId,
        category: "payments",
        priority: "high",
        title: "Payout processing",
        body,
        href: `/jobs/${job.id}`,
        actionType: "open_job",
        actionPayload: { jobId: job.id },
        jobId: job.id,
        jobStatus: "satisfied",
        groupKey: `payout-pending-pro-${job.id}`,
      });
    }
  } catch {
    /* optional */
  }
}

/** Count completed trades when customer taps I am Satisfied (successful release). */
async function bumpProJobsCompleted(repairProId: string) {
  if (!repairProId || !isSupabaseAdminConfigured()) return;
  try {
    const sb = createServiceSupabase();
    const { data } = await sb
      .from("repair_pro_profiles")
      .select("jobs_completed")
      .eq("user_id", repairProId)
      .maybeSingle();
    const prev = Number(data?.jobs_completed) || 0;
    await sb
      .from("repair_pro_profiles")
      .update({
        jobs_completed: prev + 1,
        updated_at: nowIso(),
      })
      .eq("user_id", repairProId);
  } catch {
    /* non-fatal */
  }
}

async function loadProPayoutBank(repairProId: string): Promise<{
  bankCode: string | null;
  accountNumber: string | null;
  accountName: string | null;
}> {
  if (!repairProId || !isSupabaseAdminConfigured()) {
    return { bankCode: null, accountNumber: null, accountName: null };
  }
  try {
    const sb = createServiceSupabase();
    const { data } = await sb
      .from("repair_pro_profiles")
      .select("bank_code, bank_account_number, bank_account_name, bank_name")
      .eq("user_id", repairProId)
      .maybeSingle();
    if (!data) {
      return { bankCode: null, accountNumber: null, accountName: null };
    }
    return {
      bankCode: (data.bank_code as string) || null,
      accountNumber: (data.bank_account_number as string) || null,
      accountName:
        (data.bank_account_name as string) ||
        (data.bank_name as string) ||
        null,
    };
  } catch {
    return { bankCode: null, accountNumber: null, accountName: null };
  }
}

/**
 * Optimistic lock via updated_at — prevents lost offers under concurrent place/accept.
 * Returns null when another writer won the race.
 */
async function persistIfUnchanged(
  job: JobRecord,
  expectedUpdatedAt: string
): Promise<JobRecord | null> {
  cacheJob(job);
  if (!isSupabaseAdminConfigured()) {
    const mem = memory.get(job.id);
    if (mem && mem.updatedAt !== expectedUpdatedAt) return null;
    memory.set(job.id, job);
    return job;
  }
  try {
    const sb = createServiceSupabase();
    const patch = jobToDbPatch(job);
    const { data, error } = await sb
      .from("service_requests")
      .update(patch)
      .eq("id", job.id)
      .eq("updated_at", expectedUpdatedAt)
      .select("*")
      .maybeSingle();
    if (error) {
      console.error("job persist CAS failed", job.id, error.message);
      return null;
    }
    if (!data) return null;
    const mapped = rowToJob(data as Record<string, unknown>);
    // Preserve in-memory-only media if DB dropped them
    mapped.photos = job.photos?.length ? job.photos : mapped.photos;
    mapped.voiceNote = job.voiceNote || mapped.voiceNote;
    cacheJob(mapped);
    try {
      await sb.from("job_events").insert({
        request_id: job.id,
        event_type: "status",
        payload: { status: job.status, offers: job.offers.length },
      });
    } catch {
      /* optional */
    }
    return mapped;
  } catch (e) {
    console.error("job persist CAS exception", e);
    return null;
  }
}

async function notifyOfferPlaced(job: JobRecord, offer: JobOffer) {
  try {
    const { insertNotification } = await import(
      "@/lib/server/notifications"
    );
    const toUserId =
      offer.side === "repair_pro" ? job.motoristId : job.repairProId;
    if (!toUserId) return;
    const who = offer.side === "repair_pro" ? "Repair Pro" : "Customer";
    await insertNotification({
      userId: toUserId,
      category: "requests",
      priority: "high",
      title: "New labour price",
      body: `${who} offered ${formatMoney(offer.amountMajor)}`,
      href: `/jobs/${job.id}`,
      actionType: "open_job",
      actionPayload: { jobId: job.id },
      jobId: job.id,
      jobStatus: job.status,
      groupKey: `offer-${job.id}-${offer.offerIndex}`,
    });
  } catch {
    /* optional */
  }
}

export async function placeOffer(input: {
  jobId: string;
  side: OfferSide;
  amountMajor: number;
  actorId: string;
  clientOfferId?: string | null;
}): Promise<{ job: JobRecord } | { error: string }> {
  // Up to 2 attempts under CAS conflict
  for (let attempt = 0; attempt < 2; attempt++) {
    const job = await getJob(input.jobId);
    if (!job) return { error: "Job not found" };

    // Idempotent replay: this sticker already placed an offer on this side.
    // Return the job unchanged — a retry after a lost response must never
    // double-place. Checked before the gate so a now-closed negotiation
    // still replays the original result instead of erroring.
    if (hasIdempotentOffer(job.offers, input.clientOfferId, input.side)) {
      return { job };
    }

    const gate = canPlaceOffer({
      status: job.status,
      offerCount: job.offers.length,
      side: input.side,
      negotiateEndsAt: job.negotiateEndsAt,
    });
    if (!gate.ok) return { error: gate.reason };

    const lastPro = [...job.offers]
      .reverse()
      .find((o) => o.side === "repair_pro");
    const amountCheck = validateOfferAmount({
      side: input.side,
      amountMajor: input.amountMajor,
      proBaseMajor: job.proBaseMajor,
      lastProOfferMajor: lastPro?.amountMajor ?? null,
    });
    if (!amountCheck.ok) return { error: amountCheck.reason };

    const expectedUpdatedAt = job.updatedAt;
    const offer: JobOffer = {
      id: uid("off"),
      side: input.side,
      amountMajor: input.amountMajor,
      amountMinor: toMinorUnits(input.amountMajor, job.currency),
      currency: job.currency,
      createdAt: nowIso(),
      offerIndex: job.offers.length + 1,
      clientOfferId: input.clientOfferId || null,
    };

    const proBase =
      input.side === "repair_pro"
        ? input.amountMajor
        : job.proBaseMajor ?? lastPro?.amountMajor ?? null;

    const next: JobRecord = {
      ...job,
      // Negotiation owns the row — never re-write stale pairing stages.
      pairingStage: null,
      pairingDeadline: null,
      offers: [...job.offers, offer],
      proBaseMajor: proBase,
      updatedAt: nowIso(),
    };
    const saved = await persistIfUnchanged(next, expectedUpdatedAt);
    if (!saved) {
      if (attempt === 0) continue;
      return {
        error: "Price updated by the other party. Refresh and try again.",
      };
    }
    await notifyOfferPlaced(saved, offer);
    return { job: saved };
  }
  return { error: "Could not place offer. Try again." };
}

export async function acceptOffer(input: {
  jobId: string;
  by: "motorist" | "repair_pro";
  actorId: string;
}): Promise<{ job: JobRecord } | { error: string }> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const job = await getJob(input.jobId);
    if (!job) return { error: "Job not found" };
    if (job.status !== "negotiating") {
      return { error: "Negotiation is closed." };
    }
    if (job.offers.length === 0) {
      return { error: "No offer to accept yet." };
    }
    const last = job.offers[job.offers.length - 1];
    // Accepting party must be the other side
    if (last.side === input.by) {
      return { error: "You cannot accept your own offer. Wait for a counter." };
    }

    let nextStatus: JobFlowStatus;
    try {
      nextStatus = assertTransition(job.status, {
        type: "ACCEPT_OFFER",
        by: input.by,
      });
    } catch (e) {
      return {
        error: e instanceof Error ? e.message : "Cannot accept offer now",
      };
    }

    const expectedUpdatedAt = job.updatedAt;
    const agreedMajor = last.amountMajor;
    const amountMinor = last.amountMinor;
    const split = splitMinor(amountMinor);
    const ts = nowIso();

    const updated: JobRecord = {
      ...job,
      status: nextStatus,
      pairingStage: null,
      pairingDeadline: null,
      agreedMajor,
      amountMinor,
      platformFeeMinor: split.platformFeeMinor,
      proPayoutMinor: split.proPayoutMinor,
      statusHistory: [
        ...job.statusHistory,
        { status: nextStatus, at: ts, by: input.by },
      ],
      updatedAt: ts,
    };

    const saved = await persistIfUnchanged(updated, expectedUpdatedAt);
    if (!saved) {
      if (attempt === 0) continue;
      return {
        error: "Job changed while accepting. Refresh and try again.",
      };
    }
    return { job: saved };
  }
  return { error: "Could not accept offer. Refresh and try again." };
}

export async function mockPayJob(input: {
  jobId: string;
  motoristId: string;
  email?: string;
}): Promise<{ job: JobRecord; reference: string } | { error: string }> {
  const job = await getJob(input.jobId);
  if (!job) return { error: "Job not found" };
  if (job.status !== "agreed") {
    return { error: "Job must be in Agreed status before payment." };
  }
  if (job.agreedMajor == null) {
    return { error: "No agreed price." };
  }

  const { getCalloutQuote } = await import("@/lib/server/callout/store");
  const { lockCalloutQuote } = await import("@/lib/server/callout/quote");
  const { composeCustomerPayableMajor } = await import("@/lib/callout/payable");
  let mockQuote = await getCalloutQuote(job.id);
  if (mockQuote?.calloutStatus === "CALCULATED") {
    mockQuote = (await lockCalloutQuote(job.id)) ?? mockQuote;
  }
  const mockLabourMinor = toMinorUnits(job.agreedMajor, job.currency);
  const mockSplit = splitMinor(mockLabourMinor);
  const mockPayable = composeCustomerPayableMajor(job.agreedMajor, mockQuote);
  const amountMinor = toMinorUnits(mockPayable.totalMajor, job.currency);
  const calloutMinor = toMinorUnits(mockPayable.calloutMajor, job.currency);
  const split = {
    ...mockSplit,
    proPayoutMinor: mockSplit.proPayoutMinor + calloutMinor,
  };
  const reference = `mock_${job.id.slice(0, 10)}_${Date.now().toString(36)}`;

  const payment = await createEscrowPayment({
    requestId: job.id,
    motoristId: job.motoristId,
    repairProId: job.repairProId,
    amountMinor,
    baseAmountMinor: toMinorUnits(
      job.proBaseMajor ?? job.agreedMajor,
      job.currency
    ),
    discountPercent: 0,
    platformFeeMinor: split.platformFeeMinor,
    proPayoutMinor: split.proPayoutMinor,
    currency: job.currency,
    provider: "mock",
    providerRef: reference,
    serviceType: job.serviceType,
    meta: {
      mock: true,
      email: input.email,
      labourMinor: mockLabourMinor,
      calloutMinor,
      calloutMajor: mockPayable.calloutMajor,
      vatMinor: split.vatMinor,
      vatHeldOnFlutterwave: true,
      settlementModel: "service_only_v2",
    },
  });

  await updateEscrow(payment.id, {
    status: "held",
    escrowStatus: "held",
    paidAt: nowIso(),
  });

  let updated: JobRecord = {
    ...job,
    paymentId: payment.id,
    paymentReference: reference,
    amountMinor,
    platformFeeMinor: split.platformFeeMinor,
    proPayoutMinor: split.proPayoutMinor,
    escrowStatus: "held",
  };
  updated = await applyEvent(updated, { type: "PAYMENT_SUCCESS" }, "system");
  return { job: updated, reference };
}

/**
 * Start real Flutterwave (or configured provider) escrow charge for a job.
 * Flutterwave default: Inline-ready session (no forced full-page leave).
 * Hosted authorizationUrl is still returned as fallback when gateway creates one.
 * Job becomes Booked only after verify + markJobPaidFromReference.
 */
export async function startJobEscrowPayment(input: {
  jobId: string;
  motoristId: string;
  email: string;
  customerName?: string | null;
  customerPhone?: string | null;
  callbackUrl: string;
  provider?: string | null;
  /** Prefer in-app Inline (no separate page). Default true for Flutterwave. */
  preferInline?: boolean;
}): Promise<
  | {
      authorizationUrl: string;
      reference: string;
      provider: string;
      jobId: string;
      paymentSessionEndsAt: string;
      paymentAttemptCount: number;
      paymentAttemptsRemaining: number;
      /** @deprecated use useInAppBankTransfer */
      useInline: boolean;
      /** Show bank details inside Ona (no FLW page / tab) */
      useInAppBankTransfer: boolean;
      bankTransfer: import("@/lib/server/payments/providers").BankTransferInstructions | null;
      amountMajor: number;
      currency: AppCurrency;
    }
  | { error: string }
> {
  let job = await getJob(input.jobId);
  if (!job) return { error: "Job not found" };
  if (job.motoristId !== input.motoristId) {
    return { error: "Only the customer on this job can pay." };
  }
  // Reconcile first — user may have already paid on Flutterwave
  job = await reconcileJobPayment(job);
  if (
    job.status === "paid_booked" ||
    job.status === "en_route" ||
    job.status === "arrived" ||
    job.status === "in_progress" ||
    job.status === "completed" ||
    job.status === "satisfied" ||
    job.status === "released"
  ) {
    return {
      error: "ALREADY_PAID",
      jobId: job.id,
    } as { error: string; jobId: string };
  }
  if (job.agreedMajor == null || job.agreedMajor <= 0) {
    return { error: "No agreed price." };
  }
  const agreedMajor = Number(job.agreedMajor);

  /**
   * Pay again / re-open: if pay window left the job cancelled or expired
   * but labour was already agreed and nothing is held in escrow, restore
   * status → agreed so a new Flutterwave session can be created.
   */
  // Hard stop: already used 3 unpaid windows
  if (paymentWindowsExpiredCount(job) >= MAX_PAYMENT_ATTEMPTS) {
    return {
      error:
        "Payment attempts exhausted (3 × 20 min). This booking was cancelled. Start a new request if you still need help.",
    };
  }

  if (job.status !== "agreed") {
    // Only reopen soft cancels that were NOT max-attempt payment cancels
    const maxCancel = job.statusHistory?.some(
      (h) => h.by === PAY_HISTORY.MAX_ATTEMPTS_CANCEL
    );
    const canReopen =
      !maxCancel &&
      (job.status === "cancelled" || job.status === "expired") &&
      job.escrowStatus !== "held" &&
      job.escrowStatus !== "released" &&
      job.escrowStatus !== "release_pending";
    if (!canReopen) {
      return {
        error: `Job must be in Agreed status before payment (currently ${job.status}).`,
      };
    }
    const ts = nowIso();
    job = await persist({
      ...job,
      status: "agreed",
      agreedMajor,
      cancelledAt: null,
      updatedAt: ts,
      statusHistory: [
        ...job.statusHistory,
        { status: "agreed", at: ts, by: "system" },
      ],
    });
  }

  // Expire any previous pending charge so a fresh Flutterwave session can open
  await expirePendingPaymentForJob(job);

  // Nigeria-first: force NGN for Flutterwave escrow collections
  const payCurrency: AppCurrency =
    job.currency === "NGN" || !job.currency ? "NGN" : job.currency;
  // Ona primary market — never charge Nigerian jobs in GBP/USD
  const currency: AppCurrency =
    process.env.FLUTTERWAVE_FORCE_NGN === "false" ? payCurrency : "NGN";

  // Customer pays service charge S only. Split: pro 87.5% · Ona 5% · VAT 7.5% on FLW.
  // FLW collection + payout fees come from Ona’s 5% only (Ona absorbs if fees > 5%).
  // Call-out is a separate line: added to collection and to pro payout, not split.
  const { buildCustomerChargeMajor } = await import("@/lib/pricing");
  const { getCalloutQuote } = await import("@/lib/server/callout/store");
  const { attachCalloutToRequest, lockCalloutQuote } = await import(
    "@/lib/server/callout/quote"
  );
  const { composeCustomerPayableMajor } = await import("@/lib/callout/payable");
  let calloutQuote = await getCalloutQuote(job.id);
  if (!calloutQuote || calloutQuote.calloutStatus === "PENDING") {
    try {
      await attachCalloutToRequest({
        requestId: job.id,
        problem: job.problem,
        selectedTrade: job.serviceType,
        destination: job.motoristLocation,
        origin: job.proLocation,
        proId: job.repairProId,
      });
      calloutQuote = await getCalloutQuote(job.id);
    } catch {
      /* optional */
    }
  }
  if (calloutQuote?.calloutStatus === "CALCULATED") {
    calloutQuote = (await lockCalloutQuote(job.id)) ?? calloutQuote;
  }
  const pricing = buildCustomerChargeMajor(agreedMajor);
  const payable = composeCustomerPayableMajor(pricing.totalMajor, calloutQuote);
  const amountMinor = toMinorUnits(payable.totalMajor, currency);
  const labourMinor = toMinorUnits(pricing.labourMajor, currency);
  const calloutMinor = toMinorUnits(payable.calloutMajor, currency);
  const platformFeeMinor = toMinorUnits(pricing.platformFeeMajor, currency);
  const vatMinor = toMinorUnits(pricing.vatMajor, currency);
  const proPayoutMinor =
    toMinorUnits(pricing.proPayoutMajor, currency) + calloutMinor;
  const split = { platformFeeMinor, proPayoutMinor, vatMinor };
  const reference = `ona_${job.id.replace(/-/g, "").slice(0, 12)}_${Date.now().toString(36)}`;
  const sessionEndsAt = new Date(Date.now() + PAYMENT_WINDOW_MS).toISOString();

  let motoristBankCode: string | null = null;
  let proBankCode: string | null = null;
  if (isSupabaseAdminConfigured()) {
    try {
      const sb = createServiceSupabase();
      const [mot, pro] = await Promise.all([
        sb
          .from("motorist_profiles")
          .select("bank_code")
          .eq("user_id", job.motoristId)
          .maybeSingle(),
        sb
          .from("repair_pro_profiles")
          .select("bank_code")
          .eq("user_id", job.repairProId)
          .maybeSingle(),
      ]);
      motoristBankCode = (mot.data?.bank_code as string) || null;
      proBankCode = (pro.data?.bank_code as string) || null;
    } catch {
      /* optional meta */
    }
  }

  try {
    // Include ref on callback so verify works even if Flutterwave omits query params
    const callbackUrl = input.callbackUrl.includes("ref=")
      ? input.callbackUrl
      : `${input.callbackUrl}${input.callbackUrl.includes("?") ? "&" : "?"}ref=${encodeURIComponent(reference)}`;

    const resolvedProvider = input.provider || "flutterwave";
    const preferInApp =
      input.preferInline !== false &&
      resolvedProvider !== "mock" &&
      (resolvedProvider === "flutterwave" || !resolvedProvider);

    /**
     * In-app bank transfer (default for Flutterwave):
     * Server creates a VA via charges?type=bank_transfer and returns account
     * details for the Ona UI. Never opens Flutterwave.com (no new tab / 503).
     */
    let charge: {
      provider: string;
      authorizationUrl: string;
      reference: string;
    };
    let bankTransfer: import("@/lib/server/payments/providers").BankTransferInstructions | null =
      null;

    if (preferInApp) {
      const { createFlutterwaveBankTransfer } = await import(
        "@/lib/server/payments/providers"
      );
      // Full pro name for customer note only — NOT the bank account name.
      // Money is paid into Ona escrow (FLW VA), not the pro’s personal bank.
      const proLabel =
        (job.repairProName || "").trim() || "your Repair Pro";
      const shortNarration = `Ona escrow · ${proLabel}`.slice(0, 80);
      const customerNote = `For ${proLabel}. Pay into Ona escrow (account below). Funds are released after the job is confirmed. Transfer the exact amount only.`;
      const va = await createFlutterwaveBankTransfer({
        amountMajor: payable.totalMajor,
        currency,
        email: input.email,
        customerName: input.customerName || job.motoristName || null,
        customerPhone: input.customerPhone || job.motoristPhone || null,
        reference,
        // Short bank-statement narration — never a long "Please transfer to …"
        narration: shortNarration,
        transferNote: customerNote,
        // Display name for account holder field (escrow merchant brand)
        accountDisplayName: "Ona",
      });
      if (!va.ok) {
        return { error: va.error };
      }
      bankTransfer = {
        ...va.instructions,
        // Always show brand as account name if FLW returned junk/narration
        accountName:
          va.instructions.accountName &&
          !/please|transfer to|make a bank/i.test(va.instructions.accountName)
            ? va.instructions.accountName
            : "Ona",
        note: customerNote,
      };
      charge = {
        provider: "flutterwave",
        authorizationUrl: "",
        reference,
      };
    } else if (resolvedProvider === "mock") {
      charge = await initCharge(
        {
          amountMinor,
          currency,
          email: input.email,
          customerName: input.customerName || job.motoristName || null,
          customerPhone: input.customerPhone || job.motoristPhone || null,
          reference,
          callbackUrl,
          platformFeePercent: PLATFORM_FEE_PERCENT,
          channels: ["bank_transfer"],
          metadata: { requestId: job.id, jobId: job.id },
        },
        "mock"
      );
    } else {
      charge = await initCharge(
        {
          amountMinor,
          currency,
          email: input.email,
          customerName: input.customerName || job.motoristName || null,
          customerPhone: input.customerPhone || job.motoristPhone || null,
          reference,
          callbackUrl,
          platformFeePercent: PLATFORM_FEE_PERCENT,
          channels: ["bank_transfer"],
          metadata: {
            requestId: job.id,
            jobId: job.id,
            motoristId: job.motoristId,
            repairProId: job.repairProId,
            serviceType: job.serviceType,
            labourOnly: true,
            motoristBankCode,
            proBankCode,
            paymentSessionEndsAt: sessionEndsAt,
          },
        },
        input.provider
      );
    }

    await createEscrowPayment({
      requestId: job.id,
      motoristId: job.motoristId,
      repairProId: job.repairProId,
      amountMinor,
      baseAmountMinor: toMinorUnits(
        job.proBaseMajor ?? agreedMajor,
        currency
      ),
      discountPercent: 0,
      platformFeeMinor: split.platformFeeMinor,
      proPayoutMinor: split.proPayoutMinor,
      currency,
      provider: charge.provider,
      providerRef: charge.reference,
      serviceType: job.serviceType,
      meta: {
        labourOnly: calloutMinor <= 0,
        labourMajor: pricing.labourMajor,
        labourMinor,
        calloutMajor: payable.calloutMajor,
        calloutMinor,
        /** Ona 5% of S (gross before FLW fees) — settles to Zenith / platform subaccount */
        platformFeeMajor: pricing.platformFeeMajor,
        platformFeeMinor,
        /** VAT 7.5% of S — stays on Flutterwave main balance */
        vatMajor: pricing.vatMajor,
        vatMinor,
        vatHeldOnFlutterwave: true,
        chargeTotalMajor: payable.totalMajor,
        /** Pro net 87.5% of labour + 100% of call-out */
        proPayoutMajor: pricing.proPayoutMajor + payable.calloutMajor,
        proPayoutMinor,
        settlementModel: "service_only_v2",
        platformSubaccount:
          process.env.FLUTTERWAVE_PLATFORM_SUBACCOUNT || null,
        motoristBankCode,
        proBankCode,
        email: input.email,
        paymentSessionEndsAt: sessionEndsAt,
        paymentWindowMs: PAYMENT_WINDOW_MS,
        checkoutMode: preferInApp ? "in_app_bank_transfer" : "hosted",
        bankTransfer: bankTransfer || undefined,
      },
    });

    // Open a new 20‑min session (does NOT count as an attempt until it expires unpaid)
    const sessionStart = nowIso();
    const refreshed: JobRecord = {
      ...job,
      status: "agreed",
      currency,
      updatedAt: sessionStart,
      statusHistory: [
        ...job.statusHistory,
        {
          status: "agreed",
          at: sessionStart,
          by: PAY_HISTORY.SESSION_START,
        },
      ],
      paymentReference: charge.reference,
      paymentSessionEndsAt: sessionEndsAt,
      paymentAttemptCount: paymentWindowsExpiredCount(job),
    };
    await persist(refreshed);

    return {
      authorizationUrl: charge.authorizationUrl,
      reference: charge.reference,
      provider: charge.provider,
      jobId: job.id,
      paymentSessionEndsAt: sessionEndsAt,
      paymentAttemptCount: paymentWindowsExpiredCount(job),
      paymentAttemptsRemaining: Math.max(
        0,
        MAX_PAYMENT_ATTEMPTS - paymentWindowsExpiredCount(job)
      ),
      useInline: false,
      /** Native in-app bank transfer (preferred) */
      useInAppBankTransfer: Boolean(bankTransfer),
      bankTransfer,
      amountMajor: payable.totalMajor,
      currency,
    };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Could not start payment",
    };
  }
}

/**
 * After gateway verify: mark escrow held (if needed) and job Booked (paid_booked).
 */
export async function markJobPaidFromReference(
  reference: string
): Promise<
  | { job: JobRecord; paymentId: string; alreadyBooked?: boolean }
  | { error: string }
> {
  const payment = await getEscrowByRef(reference);
  if (!payment) return { error: "Payment not found for this reference." };

  if (payment.escrowStatus !== "held" && payment.escrowStatus !== "released") {
    await updateEscrow(payment.id, {
      status: "paid",
      escrowStatus: "held",
      paidAt: nowIso(),
    });
  }

  // Use raw load — getJob() reconciles payment and would recurse
  const job = await getJobRaw(payment.requestId);
  if (!job) return { error: "Job not found for this payment." };

  if (job.status === "paid_booked" || job.status === "en_route" || job.status === "arrived" || job.status === "in_progress" || job.status === "completed" || job.status === "satisfied" || job.status === "released") {
    return { job, paymentId: payment.id, alreadyBooked: true };
  }

  if (job.status !== "agreed") {
    return {
      error: `Job is ${job.status}; expected agreed before booking payment.`,
    };
  }

  let updated: JobRecord = {
    ...job,
    paymentId: payment.id,
    paymentReference: payment.providerRef || reference,
    amountMinor: payment.amountMinor,
    platformFeeMinor: payment.platformFeeMinor,
    proPayoutMinor: payment.proPayoutMinor,
    escrowStatus: "held",
  };
  try {
    updated = await applyEvent(updated, { type: "PAYMENT_SUCCESS" }, "system");
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Could not mark job Booked",
    };
  }
  return { job: updated, paymentId: payment.id };
}

export async function transitionJob(input: {
  jobId: string;
  event: TransitionEvent;
  actor: TransitionActor;
  actorId?: string;
  proLocation?: { lat: number; lng: number };
  etaMinutes?: number;
  distanceKm?: number;
  etaText?: string;
  distanceText?: string;
  etaSource?: string;
}): Promise<{ job: JobRecord } | { error: string }> {
  let job = await getJob(input.jobId);
  if (!job) return { error: "Job not found" };

  // After pro marks complete: no cancel/close — only Release, Dispute, or 6h auto-release
  if (input.event.type === "CANCEL" && job.status === "completed") {
    return {
      error:
        "This job is completed and cannot be closed. Release payment, open a dispute, or wait for auto-release after 6 hours.",
    };
  }

  try {
    if (input.proLocation) {
      job = {
        ...job,
        proLocation: input.proLocation,
        proLocationAt: nowIso(),
        etaMinutes: input.etaMinutes ?? job.etaMinutes,
        distanceKm: input.distanceKm ?? job.distanceKm,
        etaText: input.etaText ?? job.etaText,
        distanceText: input.distanceText ?? job.distanceText,
        etaSource: input.etaSource ?? job.etaSource,
      };
    }
    if (input.event.type === "MARK_ARRIVED") {
      const { isWithinArrivalProximity } = await import("@/lib/callout/arrival");
      const pin = input.proLocation || job.proLocation;
      if (!pin) {
        return {
          error:
            "Turn on location so we can confirm you are with the customer.",
        };
      }
      const near = isWithinArrivalProximity(pin, job.motoristLocation);
      if (!near.ok) {
        return {
          error: `You need to be closer to the customer (within ${near.maxMeters} m) to mark arrived.`,
        };
      }
    }

    const updated = await applyEvent(job, input.event, input.actor);
    try {
      const { syncCalloutStatusFromJob } = await import(
        "@/lib/server/callout/quote"
      );
      await syncCalloutStatusFromJob({
        requestId: updated.id,
        flow: updated.status,
      });
      if (input.event.type === "START_TRIP") {
        const { setCalloutTravelPhase } = await import(
          "@/lib/server/callout/acceptance"
        );
        await setCalloutTravelPhase(updated.id, "travelling");
      }
      if (input.event.type === "CANCEL") {
        const { setCalloutTravelPhase } = await import(
          "@/lib/server/callout/acceptance"
        );
        const phase =
          job.status === "arrived" || job.status === "in_progress"
            ? "arrived"
            : job.status === "en_route" || job.status === "paid_booked"
              ? "travelling"
              : "before_travel";
        await setCalloutTravelPhase(updated.id, phase);
      }
      if (
        input.event.type === "CANCEL" &&
        input.actor === "repair_pro" &&
        (job.status === "negotiating" ||
          job.status === "waiting_for_pro" ||
          job.status === "reserved" ||
          job.status === "selected_review" ||
          job.status === "waiting_for_selected")
      ) {
        const { voidCalloutForReroute } = await import(
          "@/lib/server/callout/acceptance"
        );
        await voidCalloutForReroute(
          updated.id,
          "pro_cancelled_before_travel",
          input.actorId || job.repairProId
        );
      }
      if (input.event.type === "MARK_ARRIVED") {
        const { recordArrivalIntegrity } = await import(
          "@/lib/server/callout/acceptance"
        );
        await recordArrivalIntegrity({
          requestId: updated.id,
          proId: updated.repairProId,
          gps: input.proLocation
            ? {
                lat: input.proLocation.lat,
                lng: input.proLocation.lng,
                capturedAt: new Date().toISOString(),
              }
            : null,
          customer: updated.motoristLocation,
        });
      }
    } catch {
      /* call-out table optional */
    }
    return { job: updated };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Transition failed",
    };
  }
}

/** Live GPS from Repair Pro or Motorist during active trip. */
export async function updateTripPartyLocation(input: {
  jobId: string;
  actor: "motorist" | "repair_pro";
  location: { lat: number; lng: number };
  distanceKm: number;
  etaMinutes: number;
  metricsSource?: string;
  durationText?: string;
  distanceText?: string;
}): Promise<JobRecord | null> {
  const job = await getJob(input.jobId);
  if (!job) return null;
  const ts = nowIso();
  const next: JobRecord = {
    ...job,
    distanceKm: input.distanceKm,
    etaMinutes: input.etaMinutes,
    etaText: input.durationText ?? job.etaText,
    distanceText: input.distanceText ?? job.distanceText,
    etaSource: input.metricsSource ?? job.etaSource,
    updatedAt: ts,
  };
  if (input.actor === "repair_pro") {
    next.proLocation = input.location;
    next.proLocationAt = ts;
    try {
      const { recordTravelSample } = await import(
        "@/lib/server/callout/acceptance"
      );
      await recordTravelSample({
        requestId: job.id,
        proId: job.repairProId,
        gps: {
          lat: input.location.lat,
          lng: input.location.lng,
          capturedAt: ts,
        },
      });
    } catch {
      /* optional */
    }
  } else {
    next.motoristLocation = input.location;
    next.motoristLocationAt = ts;
    try {
      const { detectCustomerLocationChange } = await import(
        "@/lib/server/callout/acceptance"
      );
      await detectCustomerLocationChange({
        requestId: job.id,
        actorId: job.motoristId,
        proId: job.repairProId,
        newLat: input.location.lat,
        newLng: input.location.lng,
      });
    } catch {
      /* optional */
    }
  }
  return persist(next);
}

/** @deprecated use updateTripPartyLocation */
export async function updateJobLocation(input: {
  jobId: string;
  proLocation: { lat: number; lng: number };
  distanceKm: number;
  etaMinutes: number;
  metricsSource?: string;
  durationText?: string;
  distanceText?: string;
}): Promise<JobRecord | null> {
  return updateTripPartyLocation({
    jobId: input.jobId,
    actor: "repair_pro",
    location: input.proLocation,
    distanceKm: input.distanceKm,
    etaMinutes: input.etaMinutes,
    metricsSource: input.metricsSource,
    durationText: input.durationText,
    distanceText: input.distanceText,
  });
}

export async function openDispute(input: {
  jobId: string;
  by: "motorist" | "repair_pro";
  reason: DisputeReason;
  description: string;
  media?: JobMedia[];
}): Promise<{ job: JobRecord } | { error: string }> {
  let job = await getJob(input.jobId);
  if (!job) return { error: "Job not found" };
  if (job.dispute && job.dispute.status !== "final") {
    return { error: "Only one active dispute per job." };
  }

  const { canOpenDisputeNow } = await import("@/lib/jobs/constants");
  if (!canOpenDisputeNow(job)) {
    return {
      error:
        "Dispute window closed. You can dispute within 48 hours after confirming satisfaction (I’m Satisfied).",
    };
  }

  const dispute = {
    id: uid("dsp"),
    openedBy: input.by,
    reason: input.reason,
    description: input.description,
    media: input.media || [],
    openedAt: nowIso(),
    status: "open" as const,
  };

  job = {
    ...job,
    dispute,
    evidence: computeEvidenceScores({ ...job, dispute }),
  };

  try {
    const updated = await applyEvent(
      job,
      { type: "OPEN_DISPUTE", by: input.by },
      input.by
    );
    await fireMeritRecalc(updated.repairProId);
    return { job: updated };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Cannot open dispute" };
  }
}

export async function resolveDispute(input: {
  jobId: string;
  outcome: DisputeOutcome;
  proPercent?: number;
  note?: string;
  adminId?: string;
}): Promise<{ job: JobRecord } | { error: string }> {
  let job = await getJob(input.jobId);
  if (!job || !job.dispute) return { error: "No open dispute" };
  if (job.status !== "disputed") return { error: "Job is not disputed" };

  let proPercent = 100;
  let motoristPercent = 0;
  let resolveOutcome: "release" | "refund" | "split" = "release";

  if (input.outcome === "full_release_pro") {
    proPercent = 100;
    motoristPercent = 0;
    resolveOutcome = "release";
  } else if (input.outcome === "full_refund_motorist") {
    proPercent = 0;
    motoristPercent = 100;
    resolveOutcome = "refund";
  } else {
    proPercent = Math.min(100, Math.max(0, input.proPercent ?? 70));
    motoristPercent = 100 - proPercent;
    resolveOutcome = "split";
  }

  const dispute = {
    ...job.dispute,
    decision: {
      outcome: input.outcome,
      proPercent,
      motoristPercent,
      note: input.note,
      decidedAt: nowIso(),
      decidedBy: input.adminId,
    },
    status: "resolved" as const,
  };

  // Adjust payout for split
  if (resolveOutcome === "split" && job.amountMinor) {
    const proPart = Math.round((job.amountMinor * proPercent) / 100);
    job = {
      ...job,
      proPayoutMinor: proPart,
      platformFeeMinor: job.amountMinor - proPart, // simplified: rest stays platform for mock
    };
  }

  job = { ...job, dispute };

  try {
    // After resolve we go released/refunded — but appeal window exists.
    // Spec: decision executes, then loser can appeal within 48h.
    // We'll mark decision but move to terminal; appeal re-locks via under_appeal.
    // For fairness with "money remains locked until final":
    // Keep status disputed until appeal window ends OR move to under_appeal only on appeal.
    // Spec says decision auto-executes. So we release/refund now; appeal would need reverse.
    // User said: "After final decision → funds automatically released" for appeal.
    // First decision also auto-executes. Appeal within 48h if loser — money remains locked during appeal.
    // So first decision should NOT release until appeal window ends OR no appeal.
    // Simpler product rule: first decision parks as "resolved" but status stays disputed with decision set for 48h... 
    // Spec: "Decision is final and auto-executes" for first, then appeal workflow says money remains locked under appeal.
    // I'll execute on first resolve (released/refunded). Appeal only if still within window before user navigates away — actually if already released, appeal reopens under_appeal and re-locks conceptually.
    
    const updated = await applyEvent(
      job,
      { type: "RESOLVE_DISPUTE", outcome: resolveOutcome },
      "admin"
    );
    await fireMeritRecalc(updated.repairProId);
    return { job: updated };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Resolve failed" };
  }
}

export async function openAppeal(input: {
  jobId: string;
  by: "motorist" | "repair_pro";
  reason: string;
  media?: JobMedia[];
}): Promise<{ job: JobRecord } | { error: string }> {
  let job = await getJob(input.jobId);
  if (!job?.dispute?.decision) {
    return { error: "No dispute decision to appeal." };
  }
  if (job.dispute.appeal) {
    return { error: "Only one appeal allowed per dispute." };
  }

  const decidedAt = new Date(job.dispute.decision.decidedAt).getTime();
  if (Date.now() > decidedAt + 48 * 60 * 60 * 1000) {
    return { error: "Appeal window (48 hours) has closed." };
  }

  // Loser only
  const d = job.dispute.decision;
  const proWon = d.proPercent >= d.motoristPercent;
  const loser: "motorist" | "repair_pro" = proWon ? "motorist" : "repair_pro";
  if (input.by !== loser) {
    return { error: "Only the party who lost can appeal." };
  }

  const existingDispute = job.dispute;
  if (!existingDispute) return { error: "No dispute to appeal." };

  // If already released/refunded, re-open to under_appeal
  if (job.status === "released" || job.status === "refunded") {
    job = {
      ...job,
      status: "disputed",
      escrowStatus: "held",
    };
  }

  const withAppeal: JobRecord = {
    ...job,
    dispute: {
      ...existingDispute,
      status: "under_appeal",
      appeal: {
        openedBy: input.by,
        reason: input.reason,
        media: input.media || [],
        openedAt: nowIso(),
      },
    },
  };
  withAppeal.evidence = computeEvidenceScores(withAppeal);

  try {
    const updated = await applyEvent(
      withAppeal,
      { type: "OPEN_APPEAL", by: input.by },
      input.by
    );
    return { job: updated };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Appeal failed" };
  }
}

export async function resolveAppeal(input: {
  jobId: string;
  outcome: DisputeOutcome;
  proPercent?: number;
  note?: string;
  adminId?: string;
}): Promise<{ job: JobRecord } | { error: string }> {
  const loaded = await getJob(input.jobId);
  if (!loaded?.dispute?.appeal) return { error: "No appeal" };
  if (loaded.status !== "under_appeal") {
    return { error: "Job is not under appeal" };
  }

  let proPercent = 100;
  let motoristPercent = 0;
  let resolveOutcome: "release" | "refund" | "split" = "release";

  if (input.outcome === "full_refund_motorist") {
    proPercent = 0;
    motoristPercent = 100;
    resolveOutcome = "refund";
  } else if (input.outcome === "partial_split") {
    proPercent = Math.min(100, Math.max(0, input.proPercent ?? 50));
    motoristPercent = 100 - proPercent;
    resolveOutcome = "split";
  }

  const dispute = loaded.dispute!;
  const appeal = dispute.appeal!;

  let job: JobRecord = loaded;
  if (resolveOutcome === "split" && job.amountMinor) {
    const proPart = Math.round((job.amountMinor * proPercent) / 100);
    job = {
      ...job,
      proPayoutMinor: proPart,
      platformFeeMinor: job.amountMinor - proPart,
    };
  }

  job = {
    ...job,
    dispute: {
      id: dispute.id,
      openedBy: dispute.openedBy,
      reason: dispute.reason,
      description: dispute.description,
      media: dispute.media,
      openedAt: dispute.openedAt,
      decision: dispute.decision,
      status: "final",
      appeal: {
        openedBy: appeal.openedBy,
        reason: appeal.reason,
        media: appeal.media,
        openedAt: appeal.openedAt,
        decision: {
          outcome: input.outcome,
          proPercent,
          motoristPercent,
          note: input.note,
          decidedAt: nowIso(),
          decidedBy: input.adminId,
          final: true,
        },
      },
    },
  };

  try {
    const updated = await applyEvent(
      job,
      { type: "RESOLVE_APPEAL", outcome: resolveOutcome },
      "admin"
    );
    return { job: updated };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Appeal resolve failed" };
  }
}

export async function rateJob(input: {
  jobId: string;
  rating: number;
  note?: string;
  /** Only motorists may rate the Repair Pro */
  actor?: "motorist" | "repair_pro";
}): Promise<{ job: JobRecord } | { error: string }> {
  const job = await getJob(input.jobId);
  if (!job) return { error: "Not found" };
  if (job.status !== "released" && job.status !== "satisfied") {
    return { error: "Rate after completion" };
  }
  // Pros never rate anyone (including other pros)
  if (input.actor === "repair_pro") {
    return { error: "Only the motorist can rate and review the Repair Pro" };
  }
  if (job.rating != null) {
    return { error: "This job was already rated" };
  }
  const noteRaw = (input.note || "").trim();
  if (noteRaw.length > 144) {
    return { error: "Review max 144 characters" };
  }
  const stars = Math.min(5, Math.max(1, Math.round(input.rating)));
  const updated = await persist({
    ...job,
    rating: stars,
    ratingNote: noteRaw || null,
    updatedAt: nowIso(),
  });

  // Publish to reviews table + pro profile aggregates (motorists see before offer)
  try {
    const { publishProReview } = await import("@/lib/server/reviews");
    const pub = await publishProReview({
      requestId: job.id,
      motoristId: job.motoristId,
      repairProId: job.repairProId,
      rating: stars,
      comment: noteRaw || null,
    });
    if (!pub.ok) {
      console.warn("rateJob: profile review publish failed", pub.error);
    }
  } catch (e) {
    console.warn("rateJob: profile review publish error", e);
  }

  return { job: updated };
}

export function publicJobView(job: JobRecord) {
  return {
    ...job,
    agreedDisplay:
      job.agreedMajor != null
        ? fromMinorUnits(
            toMinorUnits(job.agreedMajor, job.currency),
            job.currency
          )
        : null,
  };
}
