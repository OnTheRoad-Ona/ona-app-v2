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

  const body = await req.json().catch(() => ({}));
  const targetRole = body.targetRole || "both";

  const supabase = createServiceSupabase();
  const thirtyDays = new Date(
    Date.now() + 30 * 24 * 60 * 60 * 1000,
  ).toISOString();

  if (targetRole === "both") {
    const { error } = await supabase
      .from("profiles")
      .update({
        deletion_status: "pending_deletion",
        deletion_scheduled_at: thirtyDays,
      })
      .eq("id", user.id);
    if (error) return apiFail(error.message, 500);

    await supabase
      .from("user_roles")
      .update({ role_status: "deleted" })
      .eq("user_id", user.id);
  } else {
    const { error } = await supabase
      .from("user_roles")
      .update({ role_status: "deleted" })
      .eq("user_id", user.id)
      .eq("role_type", targetRole);
    if (error) return apiFail(error.message, 500);
  }

  return apiOk({ deletionScheduledAt: thirtyDays, targetRole });
}
