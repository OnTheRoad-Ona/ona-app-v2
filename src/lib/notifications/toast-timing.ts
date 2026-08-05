/**
 * In-app toast timing (top notifications).
 *
 * - Visible for 3s, then fully hide
 * - Within the open 3s window, new items can pile (stack)
 * - Manual open of notification center is not throttled
 */

/** How long each auto toast stays on screen. */
export const TOAST_VISIBLE_MS = 3_000;

/**
 * Quiet period after a toast wave before another auto-show.
 * Short cooldown so legitimate alerts still land quickly (not 10 min).
 */
export const TOAST_AUTO_THROTTLE_MS = 3_000;

/** Max stacked toasts in one wave (pile). */
export const TOAST_MAX_STACK = 4;

export type ToastGateDecision =
  | { allow: true; reason: "new_wave" | "pile" }
  | { allow: false; reason: "throttled" };

/**
 * Gate auto-toasts.
 * @param lastWaveAtMs  When the current/last auto wave started (0 = never)
 * @param nowMs         Now
 */
export function canAutoShowToast(
  lastWaveAtMs: number,
  nowMs: number = Date.now()
): ToastGateDecision {
  if (!lastWaveAtMs || lastWaveAtMs <= 0) {
    return { allow: true, reason: "new_wave" };
  }
  const age = nowMs - lastWaveAtMs;
  // Still in the visible window → pile more cards on top
  if (age < TOAST_VISIBLE_MS) {
    return { allow: true, reason: "pile" };
  }
  // Brief quiet after hide
  if (age < TOAST_AUTO_THROTTLE_MS) {
    return { allow: false, reason: "throttled" };
  }
  return { allow: true, reason: "new_wave" };
}
