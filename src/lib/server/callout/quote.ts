/**
 * Server-authoritative Call-Out quote for a service request.
 * Distance comes from Google Distance Matrix (haversine fallback).
 * Client-submitted km / fee / base fee are ignored.
 */

import type { JobFlowStatus } from "@/lib/jobs/types";
import type { ProService } from "@/lib/types";
import {
  type CalloutQuote,
  type CalloutStatus,
} from "@/lib/callout/constants";
import { calloutStatusFromJobFlow } from "@/lib/callout/status";
import {
  classifyRequest,
  type ServiceClassification,
} from "@/lib/callout/engine";
import {
  getCalloutQuote,
  loadCalloutPolicy,
  updateCalloutStatus,
  upsertCalloutQuote,
} from "@/lib/server/callout/store";
import { createServiceSupabase } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { isProService } from "@/lib/services";
import {
  calloutUrgencyMultiplier,
  isCalloutUrgencyKind,
} from "@/lib/callout/urgency";

export type CalloutAttachInput = {
  requestId: string;
  problem: string;
  selectedTrade: ProService;
  destination: { lat: number; lng: number };
  origin?: { lat: number; lng: number } | null;
  proId?: string | null;
  atWorkshop?: boolean;
  remoteConsultation?: boolean;
  physicalAttendanceRequired?: boolean;
  calloutEligible?: boolean;
  tradeLocked?: boolean;
  urgencyKind?: string | null;
};

function emptyQuote(
  requestId: string,
  status: CalloutStatus,
  extra: Partial<CalloutQuote> = {}
): CalloutQuote {
  return {
    requestId,
    calloutEligible: false,
    calloutStatus: status,
    tradeId: extra.tradeId ?? null,
    tradeBaseFee: extra.tradeBaseFee ?? null,
    distanceRate: extra.distanceRate ?? null,
    approvedRouteDistanceKm: extra.approvedRouteDistanceKm ?? null,
    billableDistanceKm: extra.billableDistanceKm ?? null,
    distanceCharge: extra.distanceCharge ?? null,
    calloutFee: extra.calloutFee ?? null,
    currency: extra.currency ?? "NGN",
    originLatitude: extra.originLatitude ?? null,
    originLongitude: extra.originLongitude ?? null,
    destinationLatitude: extra.destinationLatitude ?? null,
    destinationLongitude: extra.destinationLongitude ?? null,
    routeSource: extra.routeSource ?? null,
    calculatedAt: extra.calculatedAt ?? null,
    lockedAt: extra.lockedAt ?? null,
    ...extra,
  };
}

async function persistClassification(
  requestId: string,
  classification: ServiceClassification
): Promise<void> {
  if (!isSupabaseAdminConfigured()) return;
  try {
    const sb = createServiceSupabase();
    await sb
      .from("service_requests")
      .update({
        service_intent: classification.serviceIntent,
        diagnosis_required: classification.diagnosisRequired,
        physical_attendance_required: classification.physicalAttendanceRequired,
        callout_eligible: classification.calloutEligible,
        likely_trade_ids: classification.likelyTradeIds,
        confirmed_trade_id: classification.confirmedTradeId,
      })
      .eq("id", requestId);
  } catch {
    /* columns may not exist until migration is applied */
  }
}

export async function attachCalloutToRequest(
  input: CalloutAttachInput
): Promise<CalloutQuote | null> {
  const existing = await getCalloutQuote(input.requestId);
  if (existing?.calloutStatus === "LOCKED") return existing;

  const policy = await loadCalloutPolicy();
  const classification = classifyRequest({
    problem: input.problem,
    selectedTrade: input.selectedTrade,
    atWorkshop: input.atWorkshop,
    remoteConsultation: input.remoteConsultation,
    physicalAttendanceRequired: input.physicalAttendanceRequired,
    calloutEligible: input.calloutEligible,
    policyEnabled: policy.enabled,
    tradeLocked: input.tradeLocked,
  });
  await persistClassification(input.requestId, classification);

  const dest = input.destination;
  const urgencyKind = isCalloutUrgencyKind(String(input.urgencyKind || "normal"))
    ? input.urgencyKind
    : "normal";
  const urgencyMultiplier = calloutUrgencyMultiplier(urgencyKind);
  const destOk =
    Number.isFinite(dest.lat) &&
    Number.isFinite(dest.lng) &&
    !(dest.lat === 0 && dest.lng === 0);

  if (!classification.calloutEligible || !policy.enabled) {
    return upsertCalloutQuote(
      emptyQuote(input.requestId, "NOT_ELIGIBLE", {
        tradeId: isProService(input.selectedTrade) ? input.selectedTrade : null,
        calloutEligible: false,
        destinationLatitude: destOk ? dest.lat : null,
        destinationLongitude: destOk ? dest.lng : null,
        currency: policy.currency,
        urgencyKind,
        urgencyMultiplier,
      })
    );
  }

  // Fee is locked only at acceptance (live GPS + road route). Create stays PENDING.
  return upsertCalloutQuote(
    emptyQuote(input.requestId, "PENDING", {
      tradeId: input.selectedTrade,
      calloutEligible: true,
      destinationLatitude: destOk ? dest.lat : null,
      destinationLongitude: destOk ? dest.lng : null,
      currency: policy.currency,
      urgencyKind,
      urgencyMultiplier,
    })
  );
}

/** Keep an already-locked accept quote. Never lock a PENDING estimate. */
export async function lockCalloutQuote(requestId: string) {
  const existing = await getCalloutQuote(requestId);
  if (!existing) return null;
  if (!existing.calloutEligible) return existing;
  if (existing.calloutStatus === "LOCKED") return existing;
  if (existing.calloutStatus !== "CALCULATED") return existing;
  return upsertCalloutQuote({
    ...existing,
    calloutStatus: "LOCKED",
    lockedAt: new Date().toISOString(),
  });
}

export async function syncCalloutStatusFromJob(input: {
  requestId: string;
  flow: JobFlowStatus;
}): Promise<void> {
  const existing = await getCalloutQuote(input.requestId);
  if (!existing) return;
  const next = calloutStatusFromJobFlow(input.flow, existing.calloutStatus);
  if (!next || next === existing.calloutStatus) return;
  await updateCalloutStatus(input.requestId, next);
}
