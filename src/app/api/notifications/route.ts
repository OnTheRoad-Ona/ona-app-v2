import { apiFail, apiOk } from "@/lib/server/api-json";
import { mapNotificationRow } from "@/lib/server/notifications";
import { createServiceSupabase } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/notifications?userId=
 * Lists notifications for a user (service role; client must pass own id).
 */
export async function GET(req: Request) {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Supabase is not configured", 503, "supabase_not_configured");
  }

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId")?.trim();
  if (!userId) {
    return apiFail("userId required", 400, "validation");
  }

  const sb = createServiceSupabase();
  const { data, error } = await sb
    .from("notifications")
    .select("id,user_id,category,priority,title,body,href,action_type,group_key,job_id,job_status,message_text,read_at,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    if (
      error.code === "PGRST205" ||
      /Could not find the table|schema cache|does not exist/i.test(
        error.message || ""
      )
    ) {
      return apiOk({ notifications: [], unreadCount: 0, tableMissing: true });
    }
    return apiFail(error.message, 500);
  }

  const rows = (data || []).map((r) =>
    mapNotificationRow(r as Record<string, unknown>)
  );
  const unreadCount = rows.filter((n) => !n.readAt).length;
  return apiOk({ notifications: rows, unreadCount });
}
