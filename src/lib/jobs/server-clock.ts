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
let lastSyncAtMs = 0;

export function syncServerClock(serverNow?: string | null): void {
  if (!serverNow) return;
  const t = Date.parse(serverNow);
  if (!Number.isFinite(t)) return;
  serverOffsetMs = t - Date.now();
  lastSyncAtMs = Date.now();
}

/** Estimated server time as epoch ms (local clock + measured offset). */
export function serverNow(): number {
  return Date.now() + serverOffsetMs;
}

/** Current clock offset in ms (server − client). Mainly for tests/debug. */
export function getServerClockOffsetMs(): number {
  return serverOffsetMs;
}

/** How long ago the server clock was last synced (Infinity when never). */
export function getServerClockAgeMs(): number {
  return lastSyncAtMs ? Date.now() - lastSyncAtMs : Number.POSITIVE_INFINITY;
}

/**
 * Re-sync the server-clock estimate from a public endpoint, but only when the
 * current estimate is older than `maxAgeMs`. Every job API response already
 * syncs via `syncServerClock`, so this is just a catch-up for screens that
 * render a countdown long after their last fetch (a slow-to-load phone must
 * show the SAME remaining seconds as the phone that loaded earlier). Offline /
 * failures keep the last known offset never blocks or throws.
 */
export async function refreshServerClock(maxAgeMs = 30_000): Promise<void> {
  if (getServerClockAgeMs() < maxAgeMs) return;
  try {
    const res = await fetch("/api/health?public=1", { cache: "no-store" });
    const json = (await res.json().catch(() => null)) as {
      ok?: boolean;
      data?: { ts?: string; serverNow?: string };
      ts?: string;
      serverNow?: string;
    } | null;
    syncServerClock(
      json?.data?.ts || json?.data?.serverNow || json?.ts || json?.serverNow,
    );
  } catch {
    /* offline keep the last known offset */
  }
}
