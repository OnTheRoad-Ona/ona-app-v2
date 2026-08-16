/**
 * Pure Call-Out pricing + eligibility. Frontend must never be the source
 * of fee / distance / base-fee — this module is what the server runs.
 */

import { resolveDispatchTrades } from "@/lib/callout/dispatch-trades";
import type { ProService } from "@/lib/types";
import {
  DEFAULT_BILLING_INCREMENT_KM,
  DEFAULT_CALLOUT_POLICY,
  DEFAULT_MAXIMUM_RADIUS_KM,
  DEFAULT_MINIMUM_BILLABLE_KM,
  DEFAULT_RATE_PER_KM,
  DEFAULT_TRADE_BASE_FEES,
  type CalloutPolicy,
  type ServiceIntent,
} from "@/lib/callout/constants";

export type AttendanceFlags = {
  physicalAttendanceRequired: boolean;
  calloutEligible: boolean;
};

export type ServiceClassification = {
  serviceIntent: ServiceIntent;
  diagnosisRequired: boolean;
  physicalAttendanceRequired: boolean;
  calloutEligible: boolean;
  likelyTradeIds: ProService[];
  /** Official diagnosis — always null at create. Customer guess is never this. */
  confirmedTradeId: ProService | null;
};

function moneyRound(n: number): number {
  return Math.round(n * 100) / 100;
}

function kmRound(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** Ceil to billing increment (0.1 km default) without floating residue. */
export function applyBillingIncrement(
  km: number,
  incrementKm: number = DEFAULT_BILLING_INCREMENT_KM
): number {
  const inc = incrementKm > 0 ? incrementKm : DEFAULT_BILLING_INCREMENT_KM;
  const steps = Math.ceil((km - 1e-9) / inc);
  return kmRound(Math.max(0, steps) * inc);
}

/**
 * Minimum billable distance is a billing floor, not an eligibility gate.
 * 0–500 m → 0.5 km. Then snap up to the billing increment.
 */
export function billableDistanceKm(
  approvedRouteDistanceKm: number,
  policy: Pick<
    CalloutPolicy,
    "minimumBillableDistanceKm" | "billingIncrementKm"
  > = DEFAULT_CALLOUT_POLICY
): number {
  const raw = Number(approvedRouteDistanceKm);
  const distance = Number.isFinite(raw) && raw > 0 ? raw : 0;
  const min =
    policy.minimumBillableDistanceKm > 0
      ? policy.minimumBillableDistanceKm
      : DEFAULT_MINIMUM_BILLABLE_KM;
  return applyBillingIncrement(
    Math.max(distance, min),
    policy.billingIncrementKm
  );
}

export function isWithinCalloutRadius(
  approvedRouteDistanceKm: number,
  maximumRadiusKm: number = DEFAULT_MAXIMUM_RADIUS_KM
): boolean {
  const d = Number(approvedRouteDistanceKm);
  if (!Number.isFinite(d) || d < 0) return false;
  return d <= maximumRadiusKm + 1e-9;
}

export type CalloutFeeBreakdown = {
  tradeId: ProService;
  tradeBaseFee: number;
  distanceRate: number;
  approvedRouteDistanceKm: number;
  billableDistanceKm: number;
  distanceCharge: number;
  calloutFee: number;
  currency: string;
  withinRadius: boolean;
};

export function calculateCalloutFee(input: {
  tradeId: ProService;
  approvedRouteDistanceKm: number;
  baseFee?: number;
  policy?: CalloutPolicy;
}): CalloutFeeBreakdown {
  const policy = input.policy ?? DEFAULT_CALLOUT_POLICY;
  const rate =
    policy.ratePerKm > 0 ? policy.ratePerKm : DEFAULT_RATE_PER_KM;
  const seeded = DEFAULT_TRADE_BASE_FEES[input.tradeId];
  const base =
    typeof input.baseFee === "number" && Number.isFinite(input.baseFee)
      ? Math.max(0, input.baseFee)
      : seeded;
  const approved = kmRound(Math.max(0, Number(input.approvedRouteDistanceKm) || 0));
  const within = isWithinCalloutRadius(approved, policy.maximumRadiusKm);
  const billable = billableDistanceKm(approved, policy);
  const distanceCharge = moneyRound(billable * rate);
  const calloutFee = moneyRound(base + distanceCharge);
  return {
    tradeId: input.tradeId,
    tradeBaseFee: moneyRound(base),
    distanceRate: rate,
    approvedRouteDistanceKm: approved,
    billableDistanceKm: billable,
    distanceCharge,
    calloutFee,
    currency: policy.currency || "NGN",
    withinRadius: within,
  };
}

/**
 * Universal eligibility — never per-trade hard flags.
 * physical_attendance_required AND callout_eligible (and policy on).
 */
export function resolveCalloutEligibility(input: {
  physicalAttendanceRequired: boolean;
  calloutEligible: boolean;
  policyEnabled?: boolean;
}): boolean {
  if (input.policyEnabled === false) return false;
  return (
    input.physicalAttendanceRequired === true && input.calloutEligible === true
  );
}

const WORKSHOP_RE =
  /\b(workshop|already at (the )?(shop|garage|pro)|at (your|the) (shop|garage|workshop)|drop[- ]?off)\b/i;
const REMOTE_RE =
  /\b(remote|consult(ation)?|phone (call|help)|video call|whatsapp only|no (need )?to come)\b/i;
const DIAGNOSTIC_RE =
  /\b(don'?t know|do not know|not sure|what'?s wrong|no idea|cannot tell|can'?t tell)\b/i;
const BREAKDOWN_RE =
  /\b(won'?t start|will not start|broke down|breakdown|stalled|dead car|not starting)\b/i;
const SPECIFIC_RE =
  /\b(battery (replace|replacement|change)|change (the )?battery|jump start|flat (tyre|tire)|puncture|tow(ing)?|oil change)\b/i;

export function classifyServiceIntent(input: {
  problem: string;
  selectedTrade?: ProService | string | null;
  atWorkshop?: boolean;
  remoteConsultation?: boolean;
  physicalAttendanceRequired?: boolean;
}): ServiceIntent {
  if (input.atWorkshop) return "WORKSHOP";
  if (input.remoteConsultation) return "REMOTE_CONSULTATION";
  if (input.physicalAttendanceRequired === false) {
    return input.remoteConsultation ? "REMOTE_CONSULTATION" : "WORKSHOP";
  }
  const text = String(input.problem || "");
  if (WORKSHOP_RE.test(text)) return "WORKSHOP";
  if (REMOTE_RE.test(text)) return "REMOTE_CONSULTATION";
  if (DIAGNOSTIC_RE.test(text)) return "DIAGNOSTIC";
  if (SPECIFIC_RE.test(text)) return "SPECIFIC_REPAIR";
  if (BREAKDOWN_RE.test(text)) return "VEHICLE_BREAKDOWN";
  const trade = input.selectedTrade;
  if (
    trade === "mechanic" ||
    trade === "battery" ||
    trade === "towing" ||
    trade === "electrical" ||
    trade === "diagnostics"
  ) {
    return "VEHICLE_BREAKDOWN";
  }
  return "ON_SITE_SERVICE";
}

export function likelyTradesFromProblem(
  problem: string,
  selectedTrade?: ProService | string | null
): ProService[] {
  return resolveDispatchTrades(problem, selectedTrade).dispatchTrades;
}

export function classifyRequest(input: {
  problem: string;
  selectedTrade?: ProService | string | null;
  atWorkshop?: boolean;
  remoteConsultation?: boolean;
  physicalAttendanceRequired?: boolean;
  calloutEligible?: boolean;
  policyEnabled?: boolean;
}): ServiceClassification {
  const intent = classifyServiceIntent(input);
  const workshop = intent === "WORKSHOP";
  const remote = intent === "REMOTE_CONSULTATION";
  const attendance =
    input.physicalAttendanceRequired != null
      ? input.physicalAttendanceRequired
      : !(workshop || remote);
  const wantsCallout =
    input.calloutEligible != null ? input.calloutEligible : attendance;
  const eligible = resolveCalloutEligibility({
    physicalAttendanceRequired: attendance,
    calloutEligible: wantsCallout,
    policyEnabled: input.policyEnabled,
  });
  return {
    serviceIntent: intent,
    diagnosisRequired:
      intent === "VEHICLE_BREAKDOWN" || intent === "DIAGNOSTIC",
    physicalAttendanceRequired: attendance,
    calloutEligible: eligible,
    likelyTradeIds: resolveDispatchTrades(input.problem, input.selectedTrade)
      .dispatchTrades,
    confirmedTradeId: null,
  };
}
