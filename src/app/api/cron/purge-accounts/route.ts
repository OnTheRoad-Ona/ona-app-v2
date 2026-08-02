import { apiFail, apiOk } from "@/lib/server/api-json";
import { createServiceSupabase } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CRON_SECRET = process.env.CRON_SECRET?.trim() || "";

function authorized(req: Request): boolean {
  const authHeader = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  const header = req.headers.get("x-cron-secret") || "";
  if (CRON_SECRET) {
    return authHeader === CRON_SECRET || header === CRON_SECRET;
  }
  // Fail closed outside local when secret missing
  const isProd =
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL_ENV === "production" ||
    process.env.VERCEL_ENV === "preview";
  if (isProd) return false;
  return true; // local/dev only
}

export async function GET(req: Request) {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Database not configured", 503, "no_db");
  }
  if (!authorized(req)) {
    return apiFail("Unauthorized", 401, "auth");
  }

  const supabase = createServiceSupabase();
  const { data, error } = await supabase.rpc("purge_expired_deletions");

  if (error) return apiFail(error.message, 500);

  return apiOk({ purgedCount: data ?? 0 });
}
