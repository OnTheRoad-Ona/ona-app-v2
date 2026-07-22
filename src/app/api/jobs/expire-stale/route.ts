import { apiFail, apiOk } from "@/lib/server/api-json";
import { expireOverdueBookedJobs } from "@/lib/server/jobs/job-store";

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
  if (!authorized(req)) {
    return apiFail("Unauthorized", 401);
  }
  try {
    const result = await expireOverdueBookedJobs(50);
    return apiOk({
      ...result,
      rule: "Booked jobs not completed within 6 hours of payment are cancelled with full refund",
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
