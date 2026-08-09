/**
 * Client-side estimate of the server's wall clock.
 *
 * Every job API response carries `serverNow`. We compute
 * `offset = serverNow - clientNow` once and reuse it so countdowns (which are
 * server-issued deadlines like pairing_deadline / negotiate_ends_at) stay
 * accurate even when the device clock differs from the server clock. Without
 * this, two phones with different clocks show different remaining times and
 * the countdown "lags" the real server-side deadline.
 */
let serverOffsetMs = 0;

export function syncServerClock(serverNow?: string | null): void {
  if (!serverNow) return;
  const t = Date.parse(serverNow);
  if (!Number.isFinite(t)) return;
  serverOffsetMs = t - Date.now();
}

/** Estimated server time as epoch ms (local clock + measured offset). */
export function serverNow(): number {
  return Date.now() + serverOffsetMs;
}

/** Current clock offset in ms (server − client). Mainly for tests/debug. */
export function getServerClockOffsetMs(): number {
  return serverOffsetMs;
}
