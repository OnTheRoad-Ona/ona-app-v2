/**
 * Pure countdown math shared by EVERY timer so they cannot drift apart.
 *
 * All functions take an explicit `nowMs` (callers pass `serverNow()`, the
 * server-clock estimate) which keeps them deterministic and unit-testable.
 *
 * Contract (the reason this module exists):
 * - Display uses FLOOR seconds, clamped at 0 the customer ring and the
 * pro popup cards both show the SAME number at the same moment.
 * - Expiry fires at the exact deadline moment, never a tick early (rounding
 * up) and never a whole tick late (a 1s-interval expiry check).
 */

/** Whole seconds left, floored and clamped at 0 (matches the customer ring). */
export function secondsLeftFloor(deadlineMs: number, nowMs: number): number {
  return Math.max(0, Math.floor((deadlineMs - nowMs) / 1000));
}

/** True once the deadline has actually passed (raw ms, not rounded). */
export function isDeadlinePast(deadlineMs: number, nowMs: number): boolean {
  return deadlineMs - nowMs <= 0;
}

/**
 * Milliseconds to wait before firing "expired". Returns 0 when the deadline
 * is already past. The tiny buffer schedules the action just AFTER the
 * deadline passes never before, so a countdown can't end early.
 */
export function exactFireDelayMs(
  deadlineMs: number,
  nowMs: number,
  bufferMs = 25,
): number {
  const remaining = deadlineMs - nowMs;
  return remaining <= 0 ? 0 : remaining + bufferMs;
}
