/**
 * Lock Call-Out at Repair Pro acceptance.
 * Origin = verified GPS at that tap. Never driven kilometres.
 */

import type { ProService } from "@/lib/types";
import type { CalloutQuote } from "@/lib/callout/constants";
import { calculateCalloutFee } from "@/lib/callout/engine";
import {
  assessTravelIntegrity,
  haversineMeters,
  isUsableAcceptanceFix,
  type GpsSample,
} from "@/lib/callout/integrity";
import { computeApprovedRoadRoute } from "@/lib/server/routing/approved-route";
import {
  getCalloutQuote,
  loadCalloutPolicy,
  loadTradeBaseFee,
  upsertCalloutQuote,
} from "@/lib/server/callout/store";
import { createServiceSupabase } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { LIVE_HEARTBEAT_MAX_MS } from "@/lib/matching";

export type AcceptanceGps = {
  lat: number;
  lng: number;
  accuracyM?: number | null;
  capturedAt?: string | null;
  mockLocation?: boolean | null;
};

function nowIso() {
  return new Date().toISOString();
}

async function logFeeEvent(input: {
  requestId: string;
  proId?: string | null;
  event: string;
  quote?: CalloutQuote | null;
  payload?: Record<string, unknown>;
}) {
  if (!isSupabaseAdminConfigured()) return;
  try {
    const sb = createServiceSupabase();
    await sb.from("callout_fee_events").insert({
      request_id: input.requestId,
      pro_id: input.proId ?? null,
      event: input.event,
      approved_route_distance_km: input.quote?.approvedRouteDistanceKm ?? null,
      billable_distance_km: input.quote?.billableDistanceKm ?? null,
      callout_fee: input.quote?.calloutFee ?? null,
      payload: input.payload ?? {},
    });
  } catch {
    /* optional */
  }
}

async function upsertIntegrity(row: Record<string, unknown>) {
  if (!isSupabaseAdminConfigured()) return;
  try {
    const sb = createServiceSupabase();
    await sb.from("callout_travel_integrity").upsert(row, {
      onConflict: "request_id",
    });
  } catch {
    try {
      const sb = createServiceSupabase();
      await sb.from("callout_travel_integrity").insert(row);
    } catch {
      /* optional */
    }
  }
}

function validCoord(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    !(lat === 0 && lng === 0) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
  );
}

async function loadFreshLivePin(proId: string): Promise<GpsSample | null> {
  if (!isSupabaseAdminConfigured()) return null;
  try {
    const sb = createServiceSupabase();
    const { data } = await sb
      .from("repair_pro_profiles")
      .select("lat, lng, location_updated_at")
      .eq("user_id", proId)
      .maybeSingle();
    const lat = Number(data?.lat);
    const lng = Number(data?.lng);
    const updated = data?.location_updated_at
      ? String(data.location_updated_at)
      : "";
    if (!validCoord(lat, lng) || !updated) return null;
    const age = Date.now() - Date.parse(updated);
    if (!Number.isFinite(age) || age > LIVE_HEARTBEAT_MAX_MS) return null;
    return { lat, lng, capturedAt: updated };
  } catch {
    return null;
  }
}

export async function resolveAcceptanceOrigin(input: {
  proId: string;
  gps?: AcceptanceGps | null;
}): Promise<
  | {
      ok: true;
      origin: GpsSample;
      source: "corroborated_gps" | "fresh_live_pin";
    }
  | { ok: false; reason: string }
> {
  const live = await loadFreshLivePin(input.proId);
  const clientOk =
    input.gps &&
    validCoord(input.gps.lat, input.gps.lng) &&
    isUsableAcceptanceFix({
      capturedAt: input.gps.capturedAt || nowIso(),
      accuracyM: input.gps.accuracyM,
      nowMs: Date.now(),
      maxAgeMs: 90_000,
    }).ok;

  if (clientOk && live) {
    const { ORIGIN_CORROBORATE_M } = await import("@/lib/callout/arrival");
    const gap = haversineMeters(input.gps!, live);
    if (gap <= ORIGIN_CORROBORATE_M) {
      return {
        ok: true,
        source: "corroborated_gps",
        origin: {
          lat: input.gps!.lat,
          lng: input.gps!.lng,
          accuracyM: input.gps!.accuracyM,
          capturedAt: input.gps!.capturedAt || nowIso(),
          mockLocation: input.gps!.mockLocation,
        },
      };
    }
    return {
      ok: true,
      source: "fresh_live_pin",
      origin: live,
    };
  }

  if (live) {
    return { ok: true, source: "fresh_live_pin", origin: live };
  }

  return { ok: false, reason: "no_corroborated_origin" };
}

/**
 * Calculate + LOCK from acceptance origin → customer destination.
 * Same accept + same idempotency key = same fee (no duplicate).
 * Already LOCKED for this pro is returned as-is (never re-meters).
 */
export async function lockCalloutOnAcceptance(input: {
  requestId: string;
  proId: string;
  trade: ProService;
  destination: { lat: number; lng: number };
  gps?: AcceptanceGps | null;
  idempotencyKey?: string | null;
}): Promise<CalloutQuote | null> {
  const existing = await getCalloutQuote(input.requestId);
  if (
    existing?.calloutStatus === "LOCKED" &&
    existing.originProId === input.proId
  ) {
    return existing;
  }
  const lockKey = input.idempotencyKey
    ? `${input.requestId}:${input.proId}:${input.idempotencyKey}`
    : null;
  if (
    lockKey &&
    existing?.lockIdempotencyKey === lockKey &&
    existing.calloutStatus === "LOCKED"
  ) {
    return existing;
  }

  const policy = await loadCalloutPolicy();
  if (!policy.enabled) {
    const q = await upsertCalloutQuote({
      requestId: input.requestId,
      calloutEligible: false,
      calloutStatus: "NOT_ELIGIBLE",
      tradeId: input.trade,
      tradeBaseFee: null,
      distanceRate: policy.ratePerKm,
      approvedRouteDistanceKm: null,
      billableDistanceKm: null,
      distanceCharge: null,
      calloutFee: null,
      currency: policy.currency,
      originLatitude: null,
      originLongitude: null,
      destinationLatitude: input.destination.lat,
      destinationLongitude: input.destination.lng,
      routeSource: null,
      calculatedAt: nowIso(),
      lockedAt: null,
    });
    return q;
  }

  const originRes = await resolveAcceptanceOrigin({
    proId: input.proId,
    gps: input.gps,
  });
  if (!originRes.ok) {
    await logFeeEvent({
      requestId: input.requestId,
      proId: input.proId,
      event: "acceptance_gps_rejected",
      payload: { reason: originRes.reason },
    });
    return upsertCalloutQuote({
      requestId: input.requestId,
      calloutEligible: true,
      calloutStatus: "PENDING",
      tradeId: input.trade,
      tradeBaseFee: null,
      distanceRate: policy.ratePerKm,
      approvedRouteDistanceKm: null,
      billableDistanceKm: null,
      distanceCharge: null,
      calloutFee: null,
      currency: policy.currency,
      originLatitude: null,
      originLongitude: null,
      destinationLatitude: input.destination.lat,
      destinationLongitude: input.destination.lng,
      routeSource: null,
      calculatedAt: nowIso(),
      lockedAt: null,
    });
  }

  const road = await computeApprovedRoadRoute(
    originRes.origin,
    input.destination
  );
  if (!road.ok) {
    await logFeeEvent({
      requestId: input.requestId,
      proId: input.proId,
      event: "no_road_route",
      payload: { reason: road.reason },
    });
    return upsertCalloutQuote({
      requestId: input.requestId,
      calloutEligible: true,
      calloutStatus: "PENDING",
      tradeId: input.trade,
      tradeBaseFee: null,
      distanceRate: policy.ratePerKm,
      approvedRouteDistanceKm: null,
      billableDistanceKm: null,
      distanceCharge: null,
      calloutFee: null,
      currency: policy.currency,
      originLatitude: originRes.origin.lat,
      originLongitude: originRes.origin.lng,
      destinationLatitude: input.destination.lat,
      destinationLongitude: input.destination.lng,
      routeSource: null,
      calculatedAt: nowIso(),
      lockedAt: null,
    });
  }

  const tradeFee = await loadTradeBaseFee(input.trade);
  const breakdown = calculateCalloutFee({
    tradeId: input.trade,
    approvedRouteDistanceKm: road.route.distanceKm,
    baseFee: tradeFee.baseFee,
    policy,
  });

  const quote: CalloutQuote = {
    requestId: input.requestId,
    calloutEligible: breakdown.withinRadius && tradeFee.enabled,
    calloutStatus:
      breakdown.withinRadius && tradeFee.enabled ? "LOCKED" : "NOT_ELIGIBLE",
    tradeId: input.trade,
    tradeBaseFee: breakdown.tradeBaseFee,
    distanceRate: breakdown.distanceRate,
    approvedRouteDistanceKm: breakdown.approvedRouteDistanceKm,
    billableDistanceKm: breakdown.billableDistanceKm,
    distanceCharge: breakdown.distanceCharge,
    calloutFee: breakdown.calloutFee,
    currency: breakdown.currency,
    originLatitude: originRes.origin.lat,
    originLongitude: originRes.origin.lng,
    destinationLatitude: input.destination.lat,
    destinationLongitude: input.destination.lng,
    routeSource: road.route.source,
    calculatedAt: nowIso(),
    lockedAt: breakdown.withinRadius ? nowIso() : null,
    originAccuracyM: originRes.origin.accuracyM ?? null,
    originCapturedAt: originRes.origin.capturedAt,
    originProId: input.proId,
    lockIdempotencyKey: lockKey,
    billedFromDrivenKm: false,
    travelPhase: "before_travel",
  };

  const saved = await upsertCalloutQuote(quote);
  await logFeeEvent({
    requestId: input.requestId,
    proId: input.proId,
    event: quote.calloutStatus === "LOCKED" ? "locked" : "not_eligible",
    quote: saved,
    payload: {
      originSource: originRes.source,
      routeSource: road.route.source,
      lockKey,
    },
  });
  await upsertIntegrity({
    request_id: input.requestId,
    pro_id: input.proId,
    acceptance_lat: originRes.origin.lat,
    acceptance_lng: originRes.origin.lng,
    acceptance_at: originRes.origin.capturedAt,
    acceptance_accuracy_m: originRes.origin.accuracyM ?? null,
    anomalies: assessTravelIntegrity({
      acceptance: originRes.origin,
      customer: input.destination,
    }).anomalies,
    integrity_status: assessTravelIntegrity({
      acceptance: originRes.origin,
      customer: input.destination,
    }).status,
    review_status: "none",
    updated_at: nowIso(),
  });
  return saved;
}

/** Void this pro's lock so the next SSPE pro gets a new calculation. */
export async function voidCalloutForReroute(
  requestId: string,
  reason: string,
  proId?: string | null
): Promise<void> {
  const existing = await getCalloutQuote(requestId);
  if (!existing) return;
  if (
    existing.calloutStatus === "CANCELLED" ||
    existing.calloutStatus === "WAIVED"
  ) {
    return;
  }
  const voided: CalloutQuote = {
    ...existing,
    calloutStatus: "CANCELLED",
    voidedAt: nowIso(),
    voidReason: reason,
    lockIdempotencyKey: null,
    lockedAt: existing.lockedAt,
  };
  await upsertCalloutQuote(voided);
  await logFeeEvent({
    requestId,
    proId,
    event: "voided",
    quote: existing,
    payload: { reason },
  });
}

export async function recordArrivalIntegrity(input: {
  requestId: string;
  proId: string;
  gps?: AcceptanceGps | null;
  customer: { lat: number; lng: number };
}): Promise<void> {
  const quote = await getCalloutQuote(input.requestId);
  if (quote?.calloutStatus === "LOCKED" || quote?.calloutStatus === "IN_PROGRESS") {
    await upsertCalloutQuote({
      ...quote,
      calloutStatus: "ARRIVED",
      travelPhase: "arrived",
    });
  }
  if (!input.gps || !validCoord(input.gps.lat, input.gps.lng)) return;
  const acceptance: GpsSample = {
    lat: quote?.originLatitude ?? input.gps.lat,
    lng: quote?.originLongitude ?? input.gps.lng,
    accuracyM: quote?.originAccuracyM,
    capturedAt: quote?.originCapturedAt || quote?.lockedAt || nowIso(),
  };
  const arrival: GpsSample = {
    lat: input.gps.lat,
    lng: input.gps.lng,
    accuracyM: input.gps.accuracyM,
    capturedAt: input.gps.capturedAt || nowIso(),
  };
  const assessed = assessTravelIntegrity({
    acceptance,
    arrival,
    customer: input.customer,
  });
  await upsertIntegrity({
    request_id: input.requestId,
    pro_id: input.proId,
    acceptance_lat: acceptance.lat,
    acceptance_lng: acceptance.lng,
    acceptance_at: acceptance.capturedAt,
    acceptance_accuracy_m: acceptance.accuracyM ?? null,
    arrival_lat: arrival.lat,
    arrival_lng: arrival.lng,
    arrival_at: arrival.capturedAt,
    arrival_accuracy_m: arrival.accuracyM ?? null,
    anomalies: assessed.anomalies,
    integrity_status: assessed.status,
    review_status: assessed.status === "NORMAL" ? "none" : "open",
    updated_at: nowIso(),
  });
  await logFeeEvent({
    requestId: input.requestId,
    proId: input.proId,
    event: "arrived",
    quote,
    payload: {
      anomalies: assessed.anomalies,
      integrity: assessed.status,
      nearM: haversineMeters(arrival, input.customer),
    },
  });
}

export async function setCalloutTravelPhase(
  requestId: string,
  phase: "before_travel" | "travelling" | "arrived"
): Promise<void> {
  const quote = await getCalloutQuote(requestId);
  if (!quote) return;
  if (quote.calloutStatus === "NOT_ELIGIBLE" || quote.calloutStatus === "WAIVED") {
    return;
  }
  await upsertCalloutQuote({
    ...quote,
    travelPhase: phase,
    calloutStatus:
      phase === "arrived"
        ? "ARRIVED"
        : phase === "travelling"
          ? "IN_PROGRESS"
          : quote.calloutStatus,
  });
}

export async function recordTravelSample(input: {
  requestId: string;
  proId: string;
  gps: AcceptanceGps;
}): Promise<void> {
  if (!validCoord(input.gps.lat, input.gps.lng)) return;
  if (!isSupabaseAdminConfigured()) return;
  const quote = await getCalloutQuote(input.requestId);
  const sample: GpsSample = {
    lat: input.gps.lat,
    lng: input.gps.lng,
    accuracyM: input.gps.accuracyM,
    capturedAt: input.gps.capturedAt || nowIso(),
    mockLocation: input.gps.mockLocation,
  };
  try {
    const sb = createServiceSupabase();
    const { data: prev } = await sb
      .from("callout_gps_samples")
      .select("lat, lng, captured_at, accuracy_m")
      .eq("request_id", input.requestId)
      .order("captured_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const later: GpsSample[] = [];
    if (prev) {
      later.push({
        lat: Number(prev.lat),
        lng: Number(prev.lng),
        capturedAt: String(prev.captured_at),
        accuracyM: prev.accuracy_m != null ? Number(prev.accuracy_m) : null,
      });
    }
    later.push(sample);
    const acceptance: GpsSample = {
      lat: quote?.originLatitude ?? sample.lat,
      lng: quote?.originLongitude ?? sample.lng,
      accuracyM: quote?.originAccuracyM,
      capturedAt: quote?.originCapturedAt || quote?.lockedAt || sample.capturedAt,
    };
    const assessed = assessTravelIntegrity({
      acceptance,
      laterSamples: later,
      customer: {
        lat: quote?.destinationLatitude ?? sample.lat,
        lng: quote?.destinationLongitude ?? sample.lng,
      },
    });
    await sb.from("callout_gps_samples").insert({
      request_id: input.requestId,
      pro_id: input.proId,
      lat: sample.lat,
      lng: sample.lng,
      accuracy_m: sample.accuracyM ?? null,
      captured_at: sample.capturedAt,
      mock_location: sample.mockLocation === true,
      anomalies: assessed.anomalies,
      integrity_status: assessed.status,
    });
    if (assessed.status !== "NORMAL") {
      await upsertIntegrity({
        request_id: input.requestId,
        pro_id: input.proId,
        acceptance_lat: acceptance.lat,
        acceptance_lng: acceptance.lng,
        acceptance_at: acceptance.capturedAt,
        anomalies: assessed.anomalies,
        integrity_status: assessed.status,
        review_status: "open",
        updated_at: nowIso(),
      });
    }
  } catch {
    /* optional table */
  }
  if (quote?.calloutStatus === "PENDING") {
    try {
      await lockCalloutOnAcceptance({
        requestId: input.requestId,
        proId: input.proId,
        trade: (quote.tradeId || "mechanic") as ProService,
        destination: {
          lat: quote.destinationLatitude ?? input.gps.lat,
          lng: quote.destinationLongitude ?? input.gps.lng,
        },
        gps: input.gps,
      });
    } catch {
      /* retry later */
    }
  }
}

export async function detectCustomerLocationChange(input: {
  requestId: string;
  actorId?: string | null;
  proId?: string | null;
  newLat: number;
  newLng: number;
}): Promise<void> {
  const quote = await getCalloutQuote(input.requestId);
  if (!quote || quote.calloutStatus === "NOT_ELIGIBLE") return;
  if (quote.calloutStatus !== "LOCKED" && quote.calloutStatus !== "IN_PROGRESS") {
    return;
  }
  if (quote.destinationLatitude == null || quote.destinationLongitude == null) {
    return;
  }
  const moved = haversineMeters(
    { lat: quote.destinationLatitude, lng: quote.destinationLongitude },
    { lat: input.newLat, lng: input.newLng }
  );
  const { customerMoveSurchargeNaira } = await import(
    "@/lib/callout/customer-move"
  );
  const { extraNaira, steps } = customerMoveSurchargeNaira(moved);
  if (steps < 1) return;
  const oldFee = Number(quote.calloutFee) || 0;
  const newFee = Math.round((oldFee + extraNaira) * 100) / 100;
  const next: CalloutQuote = {
    ...quote,
    destinationLatitude: input.newLat,
    destinationLongitude: input.newLng,
    calloutFee: newFee,
  };
  await upsertCalloutQuote(next);
  if (!isSupabaseAdminConfigured()) return;
  try {
    const sb = createServiceSupabase();
    await sb.from("callout_location_change_events").insert({
      request_id: input.requestId,
      actor_id: input.actorId ?? null,
      old_lat: quote.destinationLatitude,
      old_lng: quote.destinationLongitude,
      new_lat: input.newLat,
      new_lng: input.newLng,
      old_fee: oldFee,
      new_fee: newFee,
      status: "surcharge_applied",
    });
    await logFeeEvent({
      requestId: input.requestId,
      proId: input.proId,
      event: "customer_move_surcharge",
      quote: next,
      payload: { movedM: Math.round(moved), steps, extraNaira, oldFee },
    });
    const { insertNotification } = await import("@/lib/server/notifications");
    if (input.actorId) {
      await insertNotification({
        userId: input.actorId,
        category: "requests",
        priority: "high",
        title: "Call-out updated",
        body: `Your location moved about ${steps * 500} m. Call-out went up by ₦${extraNaira}.`,
        href: `/jobs/${input.requestId}`,
        jobId: input.requestId,
        groupKey: `callout-move-${input.requestId}-${steps}`,
      });
    }
    if (input.proId) {
      await insertNotification({
        userId: input.proId,
        category: "requests",
        priority: "high",
        title: "Customer moved",
        body: `Customer moved about ${steps * 500} m. Call-out increased by ₦${extraNaira}.`,
        href: `/jobs/${input.requestId}`,
        jobId: input.requestId,
        groupKey: `callout-move-pro-${input.requestId}-${steps}`,
      });
    }
  } catch {
    /* optional */
  }
}
