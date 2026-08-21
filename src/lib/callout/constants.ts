/**
 * Ona Call-Out Fee Engine — defaults and catalogues.
 * Travel/attendance fee only. Not labour, parts, or diagnosis price.
 */

import type { ProService } from "@/lib/types";

export const CALLOUT_POLICY_ID = "default";

export const CALLOUT_CURRENCY = "NGN" as const;

/** ₦350 per kilometre */
export const DEFAULT_RATE_PER_KM = 350;

/** 0–500 m bills as 0.5 km */
export const DEFAULT_MINIMUM_BILLABLE_KM = 0.5;

/** Standard call-out pool (same as marketplace max) */
export const DEFAULT_MAXIMUM_RADIUS_KM = 5;

export const DEFAULT_BILLING_INCREMENT_KM = 0.1;

/**
 * Short-distance rule: an approved route under 500 m bills the full floor
 * (0.5 km) but BOTH the Base Fee and the Call-Out Fee are then reduced by 60%
 * (multiplied by 0.40) after the multiplier is applied.
 */
export const SHORT_DISTANCE_THRESHOLD_KM = 0.5;
export const SHORT_DISTANCE_REDUCTION_MULTIPLIER = 0.4;

/**
 * Auto Remote band: an approved route of 4.95–5.00 km adds the Remote
 * multiplier (1.35×) on top of the customer's chip — the highest multiplier
 * wins (Night > Remote > Emergency > Normal).
 */
export const AUTO_REMOTE_BAND_MIN_KM = 4.95;
export const AUTO_REMOTE_BAND_MAX_KM = 5;

/**
 * Auto Night band: an acceptance between 9PM and 5AM (local) adds the Night
 * multiplier (1.50×) on top of the customer's chip — highest wins.
 */
export const AUTO_NIGHT_START_HOUR = 21;
export const AUTO_NIGHT_END_HOUR = 5;

/**
 * Trades that NEVER charge a Call-Out Fee (hard rule, not distance-dependent).
 * Vulcanizer + Battery are excluded; every other Ona trade may charge.
 */
export const CALLOUT_EXCLUDED_TRADES: ReadonlySet<ProService> = new Set([
  "vulcanizer",
  "battery",
]);

export const SERVICE_INTENTS = [
  "VEHICLE_BREAKDOWN",
  "DIAGNOSTIC",
  "SPECIFIC_REPAIR",
  "WORKSHOP",
  "REMOTE_CONSULTATION",
  "ON_SITE_SERVICE",
] as const;

export type ServiceIntent = (typeof SERVICE_INTENTS)[number];

export const CALLOUT_STATUSES = [
  "NOT_ELIGIBLE",
  "PENDING",
  "CALCULATING",
  "CALCULATED",
  "LOCKED",
  "IN_PROGRESS",
  "ARRIVED",
  "COMPLETED",
  "WAIVED",
  "CANCELLED",
  "DISPUTED",
] as const;

export type CalloutStatus = (typeof CALLOUT_STATUSES)[number];

/**
 * Seed Base Fees (₦, major units).
 * fashion = existing 12th-style wash trade (renamed; spec Car Wash ₦1,500).
 * diagnostics = the 14th existing Ona trade (spec Scan ₦3,000) — admin-configurable seed.
 */
export const DEFAULT_TRADE_BASE_FEES: Record<ProService, number> = {
  mechanic: 3000,
  vulcanizer: 1500,
  towing: 4000,
  battery: 2000,
  ac: 2500,
  body: 3000,
  electrical: 2500,
  solar: 3000,
  generator: 2500,
  carpenter: 2500,
  plumber: 2000,
  fashion: 1500,
  painter: 2500,
  diagnostics: 3000,
};

export const CALLOUT_FOURTEENTH_TRADE: ProService = "diagnostics";

export type CalloutPolicy = {
  id: string;
  enabled: boolean;
  currency: string;
  ratePerKm: number;
  minimumBillableDistanceKm: number;
  maximumRadiusKm: number;
  billingIncrementKm: number;
  updatedBy: string | null;
  updatedAt: string | null;
};

export type TradeCalloutPricing = {
  tradeId: ProService;
  baseFee: number;
  currency: string;
  enabled: boolean;
  updatedBy: string | null;
  updatedAt: string | null;
};

export type CalloutQuote = {
  requestId: string;
  calloutEligible: boolean;
  calloutStatus: CalloutStatus;
  tradeId: ProService | null;
  tradeBaseFee: number | null;
  distanceRate: number | null;
  approvedRouteDistanceKm: number | null;
  billableDistanceKm: number | null;
  distanceCharge: number | null;
  calloutFee: number | null;
  currency: string;
  originLatitude: number | null;
  originLongitude: number | null;
  destinationLatitude: number | null;
  destinationLongitude: number | null;
  routeSource: string | null;
  calculatedAt: string | null;
  lockedAt: string | null;
  originAccuracyM?: number | null;
  originCapturedAt?: string | null;
  originProId?: string | null;
  lockIdempotencyKey?: string | null;
  voidedAt?: string | null;
  voidReason?: string | null;
  travelPhase?: string | null;
  billedFromDrivenKm?: boolean;
  urgencyKind?: string | null;
  urgencyMultiplier?: number | null;
};

export const DEFAULT_CALLOUT_POLICY: CalloutPolicy = {
  id: CALLOUT_POLICY_ID,
  enabled: true,
  currency: CALLOUT_CURRENCY,
  ratePerKm: DEFAULT_RATE_PER_KM,
  minimumBillableDistanceKm: DEFAULT_MINIMUM_BILLABLE_KM,
  maximumRadiusKm: DEFAULT_MAXIMUM_RADIUS_KM,
  billingIncrementKm: DEFAULT_BILLING_INCREMENT_KM,
  updatedBy: null,
  updatedAt: null,
};

export function isServiceIntent(v: string): v is ServiceIntent {
  return (SERVICE_INTENTS as readonly string[]).includes(v);
}

export function isCalloutStatus(v: string): v is CalloutStatus {
  return (CALLOUT_STATUSES as readonly string[]).includes(v);
}
