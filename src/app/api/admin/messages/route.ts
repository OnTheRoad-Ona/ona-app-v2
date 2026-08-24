import { AdminAuthError, requireAdmin } from "@/lib/server/admin-auth";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { createServiceSupabase } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Supabase is not configured", 503);
  }
  try {
    await requireAdmin();
    const supabase = createServiceSupabase();
    const [conversations, messages, reports] = await Promise.all([
      supabase
        .from("conversations")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("messages")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("message_reports")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100),
    ]);
    if (conversations.error) return apiFail(conversations.error.message, 500);
    if (messages.error) return apiFail(messages.error.message, 500);
    return apiOk({
      conversations: conversations.data ?? [],
      messages: messages.data ?? [],
      // Moderation queue: open reports first (message_reports may not exist
      // until migration 069 is applied, degrade gracefully)
      reports: reports.error ? [] : reports.data ?? [],
    });
  } catch (e) {
    if (e instanceof AdminAuthError)
      return apiFail(e.message, e.status, "auth");
    return apiFail("Failed to load messages", 500);
  }
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Moderation actions:
 * - review-report / dismiss-report / action-report: update report status
 * - delete-message: remove an abusive message (hard moderation)
 */
export async function POST(req: Request) {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Supabase is not configured", 503);
  }
  try {
    const admin = await requireAdmin();
    const adminId = admin.session.userId;
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");
    const id = String(body.id || "");
    const supabase = createServiceSupabase();

    if (
      action === "review-report" ||
      action === "dismiss-report" ||
      action === "action-report"
    ) {
      if (!UUID_RE.test(id)) return apiFail("Invalid id", 400);
      const status =
        action === "review-report"
          ? "reviewed"
          : action === "dismiss-report"
            ? "dismissed"
            : "actioned";
      const { error } = await supabase
        .from("message_reports")
        .update({
          status,
          admin_id: adminId,
          admin_note: body.note ? String(body.note).slice(0, 500) : null,
          resolved_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) return apiFail(error.message, 500);
      return apiOk({ id, status });
    }

    if (action === "delete-message") {
      if (!UUID_RE.test(id)) return apiFail("Invalid id", 400);
      const { error } = await supabase
        .from("messages")
        .delete()
        .eq("id", id);
      if (error) return apiFail(error.message, 500);
      // Auto-action any open reports on this message
      await supabase
        .from("message_reports")
        .update({
          status: "actioned",
          admin_id: adminId,
          admin_note: "Message deleted",
          resolved_at: new Date().toISOString(),
        })
        .eq("message_id", id)
        .eq("status", "open");
      return apiOk({ deleted: id });
    }

    return apiFail(`Unknown action: ${action}`, 400);
  } catch (e) {
    if (e instanceof AdminAuthError)
      return apiFail(e.message, e.status, "auth");
    return apiFail("Moderation action failed", 500);
  }
}
