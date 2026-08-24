import {
  calculateCalloutFee,
  resolveAppliedMultiplier,
} from "@/lib/callout/engine";
import { CALLOUT_EXCLUDED_TRADES } from "@/lib/callout/constants";
import { calloutUrgencyMultiplier } from "@/lib/callout/urgency";
import { isProService } from "@/lib/services";
import { haversineKm } from "@/lib/supabase/mappers";
import type { CalloutQuote } from "@/lib/callout/constants";
import type { JobRecord } from "@/lib/jobs/types";

/**
 * Deterministic estimate used only while the real quote is still PENDING (or
 * missing on a fresh dev DB). The locked fee at acceptance always wins once
 * it exists; this simply lets the UI show a real amount and the pay session
 * collect the call-out fee even before a live GPS/road route is available.
 * It is deliberately NOT locked status stays CALCULATED.
 */
export async function estimateCalloutQuote(
  job: JobRecord,
  stored: CalloutQuote | null,
): Promise<CalloutQuote | null> {
  const now = new Date().toISOString();
  const trade = isProService(job.serviceType)
    ? job.serviceType
    : stored && isProService(stored.tradeId ?? "")
      ? stored.tradeId!
      : null;
  const dest = {
    lat: Number(stored?.destinationLatitude ?? job.motoristLocation.lat),
    lng: Number(stored?.destinationLongitude ?? job.motoristLocation.lng),
  };
  const origin = job.proLocation;
  const destOk =
    Number.isFinite(dest.lat) &&
    Number.isFinite(dest.lng) &&
    !(dest.lat === 0 && dest.lng === 0);
  const eligible =
    (stored?.calloutEligible ?? true) &&
    !!trade &&
    !CALLOUT_EXCLUDED_TRADES.has(trade);

  const urgencyKind = stored?.urgencyKind ?? "normal";
  const urgencyMultiplier =
    stored?.urgencyMultiplier ?? calloutUrgencyMultiplier(urgencyKind);

  if (!eligible || !destOk) {
    return {
      requestId: job.id,
      calloutEligible: false,
      calloutStatus: "NOT_ELIGIBLE",
      tradeId: trade,
      tradeBaseFee: null,
      distanceRate: null,
      approvedRouteDistanceKm: null,
      billableDistanceKm: null,
      distanceCharge: null,
      calloutFee: null,
      currency: stored?.currency ?? "NGN",
      originLatitude: origin?.lat ?? null,
      originLongitude: origin?.lng ?? null,
      destinationLatitude: destOk ? dest.lat : null,
      destinationLongitude: destOk ? dest.lng : null,
      routeSource: "estimate",
      calculatedAt: now,
      lockedAt: null,
      urgencyKind,
      urgencyMultiplier,
    };
  }

  const approxKm =
    origin && Number.isFinite(origin.lat) && Number.isFinite(origin.lng)
      ? haversineKm(
          { lat: origin.lat, lng: origin.lng },
          { lat: dest.lat, lng: dest.lng },
        )
      : 0;
  const applied = resolveAppliedMultiplier({
    chipKind: urgencyKind,
    chipMultiplier: urgencyMultiplier,
    approvedDistanceKm: approxKm,
    // Night applies at the CURRENT time, not the request's creation time a
    // request created in the day but shown/charged at night still gets 1.5×.
    acceptedAt: now,
    timeZone: "Africa/Lagos",
  });
  const fee = calculateCalloutFee({
    tradeId: trade,
    approvedRouteDistanceKm: approxKm,
    urgencyMultiplier: applied.multiplier,
  });

  return {
    requestId: job.id,
    calloutEligible: true,
    calloutStatus: "CALCULATED",
    tradeId: trade,
    tradeBaseFee: fee.tradeBaseFee,
    distanceRate: fee.distanceRate,
    approvedRouteDistanceKm: fee.approvedRouteDistanceKm,
    billableDistanceKm: fee.billableDistanceKm,
    distanceCharge: fee.distanceCharge,
    calloutFee: fee.calloutFee,
    currency: fee.currency,
    originLatitude: origin?.lat ?? null,
    originLongitude: origin?.lng ?? null,
    destinationLatitude: dest.lat,
    destinationLongitude: dest.lng,
    routeSource: "estimate",
    calculatedAt: now,
    lockedAt: null,
    urgencyKind: applied.kind,
    urgencyMultiplier: applied.multiplier,
  };
}
