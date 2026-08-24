/**
 * Automated payout retry (Vercel Cron + admin).
 * Processes pending_settlement escrows when Flutterwave Available is ready.
 * Auth: Authorization: Bearer CRON_SECRET or x-cron-secret, or admin session.
 */

import { apiFail, apiOk } from "@/lib/server/api-json";
import { processDuePayoutRetries } from "@/lib/server/payments/payout-settlement";
import { requirePermission, AdminAuthError } from "@/lib/server/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function cronAuthorized(req: Request): boolean {
  // Accept any configured cron secret (cron-job.org / Vercel / local) so the
  // 10-min pg_cron job, Vercel cron, and external schedulers all authenticate
  // even when several secrets are set. Mirrors pairing-sweep/route.ts.
  const secrets = [
    process.env.CRON_SECRET?.trim(),
    process.env.ONA_CRON_SECRET?.trim(),
    process.env.JOB_EXPIRE_SECRET?.trim(),
  ].filter((s): s is string => Boolean(s));
  const auth = req.headers.get("authorization") || "";
  const header =
    req.headers.get("x-cron-secret") ||
    req.headers.get("x-job-expire-secret") ||
    "";
  const url = new URL(req.url);
  const querySecret = url.searchParams.get("secret") || "";
  for (const secret of secrets) {
    if (auth === `Bearer ${secret}`) return true;
    if (auth === secret) return true;
    if (header === secret) return true;
    if (querySecret === secret) return true;
  }
  if (secrets.length > 0) return false;
  // No secret configured allow Vercel Cron in preview only if explicitly enabled
  if (
    process.env.VERCEL === "1" &&
    process.env.ALLOW_OPEN_PAYOUT_CRON === "true"
  ) {
    return true;
  }
  const ua = req.headers.get("user-agent") || "";
  if (ua.includes("vercel-cron")) return true;
  return false;
}

async function run(req: Request) {
  if (cronAuthorized(req)) {
    const result = await processDuePayoutRetries(30);
    return apiOk({ ...result, source: "cron" });
  }
  try {
    await requirePermission("escrow_release");
    const result = await processDuePayoutRetries(30);
    return apiOk({ ...result, source: "admin" });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return apiFail(e.message, e.status, e.code || "auth");
    }
    return apiFail("Unauthorized", 401);
  }
}

export async function GET(req: Request) {
  return run(req);
}

export async function POST(req: Request) {
  return run(req);
}
