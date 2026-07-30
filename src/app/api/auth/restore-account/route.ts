import { apiFail, apiOk } from "@/lib/server/api-json";
import { createServiceSupabase } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { getUserFromRequest } from "@/lib/server/auth-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Database not configured", 503, "no_db");
  }
  const user = await getUserFromRequest(req);
  if (!user) return apiFail("Unauthorized", 401);

  const supabase = createServiceSupabase();

  const { data: profile } = await supabase
    .from("profiles")
    .select("deletion_status")
    .eq("id", user.id)
    .single();

  if (!profile || profile.deletion_status !== "pending_deletion") {
    return apiFail("Account is not pending deletion", 400);
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      deletion_status: "active",
      deletion_scheduled_at: null,
      deleted_at: null,
      self_reactivated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (error) return apiFail(error.message, 500);

  return apiOk({ restored: true });
}
