import { apiFail, apiOk } from "@/lib/server/api-json";
import { createServiceSupabase } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(req: Request) {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Database not configured", 503, "no_db");
  }
  const authHeader = req.headers.get("authorization")?.replace("Bearer ", "");
  if (CRON_SECRET && authHeader !== CRON_SECRET) {
    return apiFail("Unauthorized", 401);
  }

  const supabase = createServiceSupabase();
  const { data, error } = await supabase.rpc("purge_expired_deletions");

  if (error) return apiFail(error.message, 500);

  return apiOk({ purgedCount: data ?? 0 });
}
