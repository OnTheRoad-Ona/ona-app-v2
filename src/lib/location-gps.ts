/**
 * Single source of truth for customer-side GPS acquisition.
 *
 * A device GPS fix can legitimately take 5–15s (cold start, indoors, first
 * unlock). The customer home must NEVER hardcode a shorter timeout in a screen
 * or show a latency banner when a usable cached location already exists.
 */

/** First pull right after the page loads (never shown as an error unless the
 *  user has no usable cached location). */
export const GPS_BOOT_TIMEOUT_MS = 15_000;

/** Silent background refresh (20-min cadence) — must not interrupt the UI. */
export const GPS_REFRESH_TIMEOUT_MS = 15_000;

/** Explicit "Retry" / "Use my location" tap — patient, fresh fix. */
export const GPS_RETRY_TIMEOUT_MS = 20_000;

/** Guard floor: any regressed value below this fails review (was 5s → false
 *  "Location timed out" on every page reload). */
export const GPS_TIMEOUT_FLOOR_MS = 10_000;

/**
 * Whether a GPS failure should surface an error banner.
 * A silent refresh (or any boot pull where the user already has a usable
 * location from cache) must never interrupt the screen with
 * "Location timed out / Retry" — that was the reload regression.
 */
export function shouldSurfaceLocationError(opts: {
  /** Pull was a background refresh / silent boot request */
  silentRequest: boolean;
  /** A usable location (cached fix or manual pin / default city) already exists */
  hasUsableLocation: boolean;
}): boolean {
  if (!opts.silentRequest) return true; // explicit user action → always surface
  return !opts.hasUsableLocation;
}