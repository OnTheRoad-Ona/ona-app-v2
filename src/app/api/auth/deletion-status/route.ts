import { apiFail, apiOk } from "@/lib/server/api-json";
import { createServiceSupabase } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { getUserFromRequest } from "@/lib/server/auth-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(req: Request) {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Database not configured", 503, "no_db");
  }
  const user = await getUserFromRequest(req);
  if (!user) return apiFail("Unauthorized", 401);

  const supabase = createServiceSupabase();
  const { data: profile } = await supabase
    .from("profiles")
    .select("deletion_status, deletion_scheduled_at, deleted_at, self_reactivated_at")
    .eq("id", user.id)
    .single();

  if (!profile) return apiFail("Profile not found", 404);

  return apiOk(profile);
}

export const GET = handle;
export const POST = handle;
