/**
 * Ona Express premium pricing rules.
 *
 * Base Fee (paid upfront, before any pro is involved):
 * Mechanic = ₦20,000
 * Any other Express trade = ₦15,000
 * Call-Out Fee = ₦350 / km on the locked road-route distance (existing rules).
 */

import type { ProService } from "@/lib/types";

export const EXPRESS_TRADES = [
  "mechanic",
  "vulcanizer",
  "towing",
  "battery",
  "ac",
  "body",
  "electrical",
  "diagnostics",
] as const satisfies readonly ProService[];

export type ExpressTrade = (typeof EXPRESS_TRADES)[number];

export function isExpressTrade(v: string): v is ExpressTrade {
  return (EXPRESS_TRADES as readonly string[]).includes(v);
}

/** ₦20,000 for Mechanic; ₦15,000 for every other detected service. */
export const EXPRESS_BASE_FEE_MECHANIC_MAJOR = 20_000;
export const EXPRESS_BASE_FEE_OTHER_MAJOR = 15_000;

export function expressBaseFeeMajor(trade: string): number {
  return trade === "mechanic"
    ? EXPRESS_BASE_FEE_MECHANIC_MAJOR
    : EXPRESS_BASE_FEE_OTHER_MAJOR;
}

export function expressBaseFeeMinor(trade: string): number {
  return expressBaseFeeMajor(trade) * 100;
}

/** Booking window for Schedule-for-Later: at most 1 week ahead. */
export const EXPRESS_SCHEDULE_MAX_MS = 7 * 24 * 60 * 60 * 1000;

export function isValidScheduleTime(iso: string, nowMs: number): boolean {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return false;
  if (t < nowMs) return false;
  return t - nowMs <= EXPRESS_SCHEDULE_MAX_MS;
}

export const EXPRESS_TITLES: Record<ExpressTrade, string> = {
  mechanic: "Mechanic Assigned",
  vulcanizer: "Vulcanizer Assigned",
  towing: "Tow Assigned",
  battery: "Battery Expert Assigned",
  ac: "A/C Expert Assigned",
  body: "Body Expert Assigned",
  electrical: "Auto Electrician Assigned",
  diagnostics: "Scan Expert Assigned",
};

export function expressAssignedTitle(trade: string): string {
  return EXPRESS_TITLES[trade as ExpressTrade] ?? "Professional Assigned";
}
