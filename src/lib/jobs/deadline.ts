/**
 * Single source of truth for "is this server-owned window still open?".
 *
 * Every deadline (`pairing_deadline`, `negotiate_ends_at`,
 * `payment_session_ends_at`, 6h auto-release) is issued by the server. Clients
 * must compare it against the estimated SERVER clock (`serverNow`), never the
 * raw device clock. Reusing these helpers everywhere keeps the job screens,
 * dashboard, jobs list and incoming popup on the same clock base — previously
 * each re-derived "past deadline?" with `Date.now()`, so a skewed phone clock
 * hid or kept popups differently against the ring countdown.
 */

import { serverNow } from "@/lib/jobs/server-clock";

/** Milliseconds until `endsAt` passes (0 when missing / already past).
 *  Defaults to the estimated server clock — the base every caller should use. */
export function windowLeftMs(endsAt?: string | null, nowMs: number = serverNow()): number {
  if (!endsAt) return 0;
  const t = Date.parse(endsAt);
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, t - nowMs);
}

/** True while a server-issued deadline is still in the future. */
export function windowStillOpen(
  endsAt?: string | null,
  nowMs: number = serverNow()
): boolean {
  return windowLeftMs(endsAt, nowMs) > 0;
}