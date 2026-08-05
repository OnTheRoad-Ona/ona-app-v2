import { apiFail, apiOk } from "@/lib/server/api-json";
import { sweepPairing } from "@/lib/server/pairing/pairing-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Server sweep for Smart Sequential Pairing (SSPE).
 * Enforces DB-owned `pairing_deadline` (66s) for requests in a pairing stage —
 * the single source of truth (D3). Safe to call every minute from:
 *  - Vercel cron (Bearer CRON_SECRET / JOB_EXPIRE_SECRET)
 *  - Authenticated app client while open (idempotent)
 *  - pg_cron wrapper `public.pairing_sweep()` (timeout transition only)
 *
 * Production/preview: secret required for unauthenticated callers (fail closed).
 */
async function authorized(req: Request): Promise<boolean> {
  const secret =
    process.env.CRON_SECRET?.trim() ||
    process.env.JOB_EXPIRE_SECRET?.trim() ||
    "";
  const auth = req.headers.get("authorization") || "";
  const header = req.headers.get("x-cron-secret") || "";
  if (secret) {
    if (auth === `Bearer ${secret}`) return true;
    if (header === secret) return true;
  }
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
  if (isProd) return false;
  if (!secret) return true;
  return false;
}

export async function GET(req: Request) {
  return run(req);
}

export async function POST(req: Request) {
  return run(req);
}

async function run(req: Request) {
  try {
    if (!(await authorized(req))) {
      return apiFail("Unauthorized", 401);
    }
    const result = await sweepPairing(50);
    return apiOk({
      ...result,
      rule:
        "Requests in a pairing stage past their 66s pairing_deadline are timed out and advanced to the next merit-ranked pro.",
    });
  } catch (e) {
    return apiFail(
      e instanceof Error ? e.message : "Pairing sweep failed",
      500
    );
  }
}
