import { apiFail, apiOk } from "@/lib/server/api-json";
import { requireUser } from "@/lib/server/auth-utils";
import { createServiceSupabase } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Report an abusive message. Only conversation participants may report a
 * message in that conversation. Creates a row for the admin moderation queue.
 */
export async function POST(req: Request) {
  try {
    const auth = await requireUser(req);
    if (!auth.ok) return auth.response;
    if (!isSupabaseAdminConfigured())
      return apiFail("Service unavailable", 500);

    const body = await req.json().catch(() => ({}));
    const messageId = String(body.messageId || "");
    const reason = String(body.reason || "").trim();
    if (!messageId || !reason) {
      return apiFail("messageId and reason are required", 400);
    }

    const sb = createServiceSupabase();
    const { data: message, error: msgErr } = await sb
      .from("messages")
      .select("id, conversation_id, sender_id")
      .eq("id", messageId)
      .maybeSingle();
    if (msgErr || !message) return apiFail("Message not found", 404);

    const { data: conversation } = await sb
      .from("conversations")
      .select("motorist_id, repair_pro_id")
      .eq("id", message.conversation_id)
      .maybeSingle();
    const isParticipant =
      conversation &&
      (conversation.motorist_id === auth.userId ||
        conversation.repair_pro_id === auth.userId);
    if (!isParticipant) return apiFail("Forbidden", 403);

    const { data: report, error } = await sb
      .from("message_reports")
      .insert({
        message_id: messageId,
        conversation_id: message.conversation_id,
        reporter_id: auth.userId,
        reason: reason.slice(0, 200),
        details: body.details ? String(body.details).slice(0, 1000) : null,
      })
      .select()
      .single();
    if (error) return apiFail(error.message, 500);
    return apiOk({ report });
  } catch (e) {
    return apiFail(e instanceof Error ? e.message : "Failed", 500);
  }
}
