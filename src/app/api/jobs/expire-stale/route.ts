import { apiFail, apiOk } from "@/lib/server/api-json";
import {
  expireOverdueBookedJobs,
  expireUnacceptedJobs,
} from "@/lib/server/jobs/job-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Auto-cancel Booked jobs not completed within 6h of payment + full refund.
 * Safe to call from:
 *  - Vercel cron / external scheduler
 *  - Client backup while app is open
 *
 * Optional: CRON_SECRET or JOB_EXPIRE_SECRET header Authorization: Bearer …
 * When secret is set in env, request must match; when unset, open (dev).
 */
function authorized(req: Request): boolean {
  const secret =
    process.env.CRON_SECRET?.trim() ||
    process.env.JOB_EXPIRE_SECRET?.trim() ||
    "";
  if (!secret) return true;
  const auth = req.headers.get("authorization") || "";
  const header = req.headers.get("x-cron-secret") || "";
  if (auth === `Bearer ${secret}`) return true;
  if (header === secret) return true;
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
    if (authorized(req)) {
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
      payoutRetry,
      rule:
        "Agreed unpaid: payment details expire after 20 min; Booked not completed within 6h: cancel + refund; Completed 6h: auto-release pro 87.5%; PENDING_SETTLEMENT: auto-retry when FLW Available is enough",
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
