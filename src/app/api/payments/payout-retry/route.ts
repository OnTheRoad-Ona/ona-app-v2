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
  const secret = (process.env.CRON_SECRET || process.env.ONA_CRON_SECRET || "").trim();
  if (!secret) {
    // Allow Vercel Cron without secret in preview only if explicitly enabled
    if (process.env.VERCEL === "1" && process.env.ALLOW_OPEN_PAYOUT_CRON === "true") {
      return true;
    }
    // If no secret configured, still accept Vercel cron user-agent + GET from cron
    const ua = req.headers.get("user-agent") || "";
    if (ua.includes("vercel-cron")) return true;
    return false;
  }
  const auth = req.headers.get("authorization") || "";
  if (auth === `Bearer ${secret}`) return true;
  if (req.headers.get("x-cron-secret") === secret) return true;
  const url = new URL(req.url);
  if (url.searchParams.get("secret") === secret) return true;
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
