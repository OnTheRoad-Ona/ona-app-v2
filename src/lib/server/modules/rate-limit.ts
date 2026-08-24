/**
 * Rate limiter for sensitive routes.
 * - Default: in-process Map (single instance / local)
 * - Optional: Upstash Redis REST if UPSTASH_REDIS_REST_URL + TOKEN set
 *   (async path via rateLimitAsync)
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export function rateLimit(opts: {
  key: string;
  limit: number;
  windowMs: number;
}): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now();
  const b = buckets.get(opts.key);
  if (!b || now >= b.resetAt) {
    buckets.set(opts.key, { count: 1, resetAt: now + opts.windowMs });
    return { ok: true };
  }
  if (b.count >= opts.limit) {
    return {
      ok: false,
      retryAfterSec: Math.max(1, Math.ceil((b.resetAt - now) / 1000)),
    };
  }
  b.count += 1;
  return { ok: true };
}

/** Prefer this when Redis may be configured (falls back to memory). */
export async function rateLimitAsync(opts: {
  key: string;
  limit: number;
  windowMs: number;
}): Promise<{ ok: true } | { ok: false; retryAfterSec: number }> {
  const url = (process.env.UPSTASH_REDIS_REST_URL || "").trim();
  const token = (process.env.UPSTASH_REDIS_REST_TOKEN || "").trim();
  if (url && token) {
    try {
      const redisKey = `ona:rl:${opts.key}`;
      // INCR + EXPIRE window via Upstash REST pipeline
      const pipe = await fetch(`${url}/pipeline`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify([
          ["INCR", redisKey],
          ["PTTL", redisKey],
        ]),
        signal: AbortSignal.timeout(2_000),
      });
      const results = (await pipe.json()) as Array<{ result?: number }>;
      const count = Number(results?.[0]?.result ?? 0);
      let pttl = Number(results?.[1]?.result ?? -1);
      if (count === 1 || pttl < 0) {
        await fetch(
          `${url}/pexpire/${encodeURIComponent(redisKey)}/${opts.windowMs}`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(2_000),
          },
        ).catch(() => null);
        pttl = opts.windowMs;
      }
      if (count > opts.limit) {
        return {
          ok: false,
          retryAfterSec: Math.max(1, Math.ceil(Math.max(pttl, 0) / 1000)),
        };
      }
      return { ok: true };
    } catch {
      /* fall back to memory */
    }
  }
  return rateLimit(opts);
}

/** Prune old buckets occasionally */
export function pruneRateLimits() {
  const now = Date.now();
  for (const [k, b] of buckets) {
    if (now >= b.resetAt) buckets.delete(k);
  }
}
