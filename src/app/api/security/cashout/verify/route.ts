import { apiFail, apiOk } from "@/lib/server/api-json";
import {
  processDueCashoutRetries,
  verifyPendingCashouts,
} from "@/lib/server/security/cashout-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cashout settlement cron: retries due transfers + verifies stuck ones.
 * Same secret pattern as /api/payments/payout-retry.
 * Wire in Supabase pg_cron or Vercel Cron every 10 minutes.
 */
function cronAuthorized(req: Request): boolean {
  const secret =
    process.env.CRON_SECRET ||
    process.env.ONA_CRON_SECRET ||
    process.env.JOB_EXPIRE_SECRET;
  if (!secret) return true; // matches payout-retry behavior
  const url = new URL(req.url);
  const provided =
    url.searchParams.get("secret") ||
    req.headers.get("x-cron-secret") ||
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return provided === secret;
}

export async function GET(req: Request) {
  if (!cronAuthorized(req)) return apiFail("Unauthorized", 401, "unauthorized");
  const retries = await processDueCashoutRetries();
  const verified = await verifyPendingCashouts();
  return apiOk({ retries, verified });
}

export async function POST(req: Request) {
  return GET(req);
}
