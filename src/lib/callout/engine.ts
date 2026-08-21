/**
 * Pure Call-Out pricing + eligibility. Frontend must never be the source
 * of fee / distance / base-fee — this module is what the server runs.
 */

import { resolveDispatchTrades } from "@/lib/callout/dispatch-trades";
import { isProService } from "@/lib/pro-service-id";
import { calloutUrgencyMultiplier, isCalloutUrgencyKind } from "@/lib/callout/urgency";
import type { ProService } from "@/lib/types";
import {
  AUTO_NIGHT_END_HOUR,
  AUTO_NIGHT_START_HOUR,
  AUTO_REMOTE_BAND_MAX_KM,
  AUTO_REMOTE_BAND_MIN_KM,
  CALLOUT_EXCLUDED_TRADES,
  DEFAULT_BILLING_INCREMENT_KM,
  DEFAULT_CALLOUT_POLICY,
  DEFAULT_MAXIMUM_RADIUS_KM,
  DEFAULT_MINIMUM_BILLABLE_KM,
  DEFAULT_RATE_PER_KM,
  DEFAULT_TRADE_BASE_FEES,
  SHORT_DISTANCE_REDUCTION_MULTIPLIER,
  SHORT_DISTANCE_THRESHOLD_KM,
  type CalloutPolicy,
  type ServiceIntent,
} from "@/lib/callout/constants";
import type { CalloutUrgencyKind } from "@/lib/callout/urgency";

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

/**
 * Hard per-trade exclusion: Vulcanizer and Battery NEVER charge a Call-Out
 * Fee, regardless of distance, attendance or policy.
 */
export function isCalloutExcludedTrade(
  trade: ProService | string | null | undefined
): boolean {
  return trade != null && CALLOUT_EXCLUDED_TRADES.has(trade as ProService);
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
  /** True when the approved route was < 500 m and both fees were × 0.40. */
  shortDistanceReduction: boolean;
};

export function calculateCalloutFee(input: {
  tradeId: ProService;
  approvedRouteDistanceKm: number;
  baseFee?: number;
  policy?: CalloutPolicy;
  /** Call-out only. Labour is never multiplied. */
  urgencyMultiplier?: number;
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
  const mult =
    typeof input.urgencyMultiplier === "number" &&
    Number.isFinite(input.urgencyMultiplier) &&
    input.urgencyMultiplier > 0
      ? input.urgencyMultiplier
      : 1;
  // Short-distance rule: approved route < 500 m → both Base and Call-Out are
  // reduced by 60% (× 0.40) AFTER the multiplier. The 0.5 km billing floor
  // still applies, then the whole call-out is discounted.
  const short = approved < SHORT_DISTANCE_THRESHOLD_KM;
  const discount = short ? SHORT_DISTANCE_REDUCTION_MULTIPLIER : 1;
  const tradeBaseFee = moneyRound(base * discount);
  const distanceCharge = moneyRound(billable * rate * discount);
  const raw = moneyRound(tradeBaseFee + distanceCharge);
  const calloutFee = moneyRound(raw * mult);
  return {
    tradeId: input.tradeId,
    tradeBaseFee,
    distanceRate: rate,
    approvedRouteDistanceKm: approved,
    billableDistanceKm: billable,
    distanceCharge,
    calloutFee,
    currency: policy.currency || "NGN",
    withinRadius: within,
    shortDistanceReduction: short,
  };
}

/**
 * Resolve the multiplier that actually applies to a call-out.
 * The customer's chip stays in effect, but AUTO-detected Remote (approved
 * route 4.95–5.00 km) and Night (acceptance 9PM–5AM local) override it when
 * higher. Priority: Night > Remote > Emergency > Normal — the highest
 * multiplier wins, never stacked.
 */
export function resolveAppliedMultiplier(input: {
  chipKind?: CalloutUrgencyKind | string | null;
  chipMultiplier?: number | null;
  approvedDistanceKm?: number | null;
  acceptedAt?: string | number | Date | null;
  /** IANA time zone for the Night band. Defaults to Africa/Lagos. */
  timeZone?: string;
}): {
  multiplier: number;
  kind: CalloutUrgencyKind;
  /** True when an AUTO band (night time / remote distance) raised the fee. */
  auto: boolean;
} {
  const chipKind = isCalloutUrgencyKind(input.chipKind ?? "")
    ? (input.chipKind as CalloutUrgencyKind)
    : "normal";
  const chipMult =
    typeof input.chipMultiplier === "number" &&
    Number.isFinite(input.chipMultiplier) &&
    input.chipMultiplier > 0
      ? input.chipMultiplier
      : calloutUrgencyMultiplier(chipKind);

  const distance = Number(input.approvedDistanceKm);
  const remote =
    Number.isFinite(distance) &&
    distance >= AUTO_REMOTE_BAND_MIN_KM &&
    distance <= AUTO_REMOTE_BAND_MAX_KM + 1e-9;

  let night = false;
  if (input.acceptedAt != null) {
    try {
      const d = new Date(input.acceptedAt);
      if (!Number.isNaN(d.getTime())) {
        const hour = Number(
          new Intl.DateTimeFormat("en-US", {
            timeZone: input.timeZone || "Africa/Lagos",
            hour: "numeric",
            hour12: false,
          }).format(d)
        ) % 24;
        night = hour >= AUTO_NIGHT_START_HOUR || hour < AUTO_NIGHT_END_HOUR;
      }
    } catch {
      night = false;
    }
  }

  const nightMult = night ? calloutUrgencyMultiplier("night") : 1;
  const remoteMult = remote ? calloutUrgencyMultiplier("remote") : 1;
  const multiplier = Math.max(chipMult, nightMult, remoteMult);

  let kind: CalloutUrgencyKind = chipKind;
  let auto = false;
  if (nightMult >= remoteMult && nightMult > chipMult) {
    kind = "night";
    auto = true;
  } else if (remoteMult > chipMult) {
    kind = "remote";
    auto = true;
  }
  return { multiplier, kind, auto };
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
  /** Customer already confirmed the trade — do not re-widen from keywords. */
  tradeLocked?: boolean;
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
    likelyTradeIds:
      input.tradeLocked &&
      input.selectedTrade &&
      isProService(String(input.selectedTrade))
        ? [input.selectedTrade as ProService]
        : resolveDispatchTrades(input.problem, input.selectedTrade)
            .dispatchTrades,
    confirmedTradeId: null,
  };
}
