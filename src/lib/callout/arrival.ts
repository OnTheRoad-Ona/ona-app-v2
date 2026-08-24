import { haversineMeters } from "@/lib/callout/integrity";

/** Default: Repair Pro must be this close to the customer to tap Arrived. */
export const DEFAULT_ARRIVAL_PROXIMITY_M = 200;

/** Client GPS vs server Live pin must agree within this to corroborate origin. */
export const ORIGIN_CORROBORATE_M = 200;

export function isWithinArrivalProximity(
  pro: { lat: number; lng: number },
  customer: { lat: number; lng: number },
  maxMeters: number = DEFAULT_ARRIVAL_PROXIMITY_M,
):
  | { ok: true; meters: number }
  | { ok: false; meters: number; maxMeters: number } {
  const meters = haversineMeters(pro, customer);
  if (meters <= maxMeters) return { ok: true, meters };
  return { ok: false, meters, maxMeters };
}
