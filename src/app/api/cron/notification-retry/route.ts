import { apiFail, apiOk } from "@/lib/server/api-json";
import { processDueNotificationRetries } from "@/lib/server/notifications-retry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Notification delivery retry cron, processes the durable queue so a failed
 * push/SMS/email is retried with backoff instead of being lost forever.
 * Same secret pattern as the other crons.
 */
function cronAuthorized(req: Request): boolean {
  const secret =
    process.env.CRON_SECRET ||
    process.env.ONA_CRON_SECRET ||
    process.env.JOB_EXPIRE_SECRET;
  if (!secret) return true;
  const url = new URL(req.url);
  const provided =
    url.searchParams.get("secret") ||
    req.headers.get("x-cron-secret") ||
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return provided === secret;
}

export async function GET(req: Request) {
  if (!cronAuthorized(req)) return apiFail("Unauthorized", 401, "unauthorized");
  const result = await processDueNotificationRetries();
  return apiOk(result);
}

export async function POST(req: Request) {
  return GET(req);
}
