import { apiFail, apiOk } from "@/lib/server/api-json";
import {
  expireOverdueBookedJobs,
  expireUnacceptedJobs,
} from "@/lib/server/jobs/job-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The pairing sweep has its own dedicated every-minute route; expire-stale
// only runs it as a backup, throttled to ≤1x/30s per instance so the ~8s
// external hits don't re-run the same indexed sweep 7× a minute.
const PAIRING_SWEEP_INTERVAL_MS = 30_000;
let lastPairingSweepAt = 0;

/**
 * Auto-cancel Booked jobs not completed within 6h of payment + full refund.
 * Safe to call from:
 *  - Vercel cron / external scheduler (Bearer CRON_SECRET / JOB_EXPIRE_SECRET)
 *  - Authenticated app client (Bearer user session) as backup while app is open
 *
 * Production/preview: secret required for unauthenticated callers (fail closed).
 * Local/dev without secret: open only when NODE_ENV is not production and not Vercel prod.
 */
async function authorized(req: Request): Promise<boolean> {
  const secrets = [
    process.env.CRON_SECRET?.trim(),
    process.env.JOB_EXPIRE_SECRET?.trim(),
    process.env.ONA_CRON_SECRET?.trim(),
  ].filter((s): s is string => Boolean(s));
  const auth = req.headers.get("authorization") || "";
  const header =
    req.headers.get("x-cron-secret") ||
    req.headers.get("x-job-expire-secret") ||
    "";
  for (const secret of secrets) {
    if (auth === `Bearer ${secret}`) return true;
    if (auth === secret) return true;
    if (header === secret) return true;
  }

  // Authenticated app users may trigger the sweep (idempotent maintenance)
  try {
    const { requireUser } = await import("@/lib/server/auth-utils");
    const u = await requireUser(req);
    if (u.ok) return true;
  } catch {
    /* fall through */
  }

  const isProd =
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL_ENV === "production" ||
    process.env.VERCEL_ENV === "preview";
  // Fail closed outside local: require secret or user session
  if (isProd) return false;
  // Local dev without secret configured — allow for DX
  if (secrets.length === 0) return true;
  return false;
}

async function run(req: Request) {
  try {
    // Job cancel/refund sweeps stay behind CRON_SECRET when configured.
    // Payout catch-up is always allowed (idempotent) so open jobs unstick when
    // Available is funded — even if the browser cannot send the cron secret.
    let result: { checked: number; cancelled: number; ids: string[] } = {
      checked: 0,
      cancelled: 0,
      ids: [],
    };
    if (await authorized(req)) {
      result = await expireOverdueBookedJobs(50);
    }

    // Sweep unaccepted jobs — reroute to next pro after 1 min, expire after 15 min
    let unacceptedResult: {
      checked: number;
      rerouted: number;
      expired: number;
    } | null = null;
    try {
      unacceptedResult = await expireUnacceptedJobs(40);
    } catch (e) {
      console.error("expireUnacceptedJobs in expire-stale", e);
    }

    // SSPE sweep — enforce 66s pairing deadlines and advance to next pro.
    // Backed by the dedicated pairing-sweep route (every minute); throttled
    // here so the frequent expire-stale hits don't duplicate it every 8s.
    let pairingResult: {
      checked: number;
      timedOut: number;
      expired: number;
    } | null = null;
    const now = Date.now();
    if (now - lastPairingSweepAt >= PAIRING_SWEEP_INTERVAL_MS) {
      lastPairingSweepAt = now;
      try {
        const { sweepPairing } = await import(
          "@/lib/server/pairing/pairing-engine"
        );
        pairingResult = await sweepPairing(50);
      } catch (e) {
        console.error("sweepPairing in expire-stale", e);
      }
    }

    let payoutRetry: {
      checked: number;
      succeeded: number;
      stillPending: number;
      failed: number;
      ids: string[];
    } | null = null;
    try {
      const { processDuePayoutRetries } = await import(
        "@/lib/server/payments/payout-settlement"
      );
      payoutRetry = await processDuePayoutRetries(30);
    } catch (e) {
      console.error("payout retry in expire-stale", e);
    }
    return apiOk({
      ...result,
      unaccepted: unacceptedResult,
      pairing: pairingResult,
      payoutRetry,
      rule:
        "Agreed unpaid: payment details expire after 11 min; Booked not completed within 6h: cancel + refund; Completed 6h: auto-release pro 87.5%; PENDING_SETTLEMENT: auto-retry when FLW Available is enough",
    });
  } catch (e) {
    return apiFail(
      e instanceof Error ? e.message : "Expire sweep failed",
      500
    );
  }
}

export async function GET(req: Request) {
  return run(req);
}

export async function POST(req: Request) {
  return run(req);
}
