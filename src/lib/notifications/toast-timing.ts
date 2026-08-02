/**
 * In-app toast timing — inDrive-style auto banners.
 *
 * - Visible for 66s, then fully hide
 * - Auto-show at most one “wave” every 10 minutes
 * - Within the open 66s window, new items pile up (stack)
 * - Manual open of notification center is not throttled
 */

/** How long each auto toast stays on screen (inDrive-like). */
export const TOAST_VISIBLE_MS = 66_000;

/** Quiet period after an auto-toast wave starts before another auto-show. */
export const TOAST_AUTO_THROTTLE_MS = 10 * 60 * 1000;

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
  // After hide until 10 min — no auto popup
  if (age < TOAST_AUTO_THROTTLE_MS) {
    return { allow: false, reason: "throttled" };
  }
  return { allow: true, reason: "new_wave" };
}
