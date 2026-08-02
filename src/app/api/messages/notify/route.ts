/**
 * After a chat message is saved, notify the other party (in-app toast via notifications table).
 */
import { z } from "zod";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { requireUser } from "@/lib/server/auth-utils";
import { insertNotification } from "@/lib/server/notifications";
import { createServiceSupabase } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  conversationId: z.string().min(1),
  senderId: z.string().min(1),
  preview: z.string().min(1).max(280),
  senderName: z.string().optional(),
});

export async function POST(req: Request) {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Supabase not configured", 503);
  }
  try {
    const auth = await requireUser(req);
    if (!auth.ok) return auth.response;

    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) return apiFail("Invalid body", 400);
    const { conversationId, preview, senderName } = parsed.data;
    const senderId = auth.userId;
    if (parsed.data.senderId !== auth.userId) {
      return apiFail("senderId must match signed-in user", 403);
    }

    const sb = createServiceSupabase();
    const { data: conv, error } = await sb
      .from("conversations")
      .select("id, motorist_id, repair_pro_id, request_id")
      .eq("id", conversationId)
      .maybeSingle();
    if (error || !conv) return apiFail("Conversation not found", 404);

    const motoristId = String(conv.motorist_id || "");
    const proId = String(conv.repair_pro_id || "");
    const recipientId =
      senderId === motoristId
        ? proId
        : senderId === proId
          ? motoristId
          : "";
    if (!recipientId || recipientId === senderId) {
      return apiOk({ skipped: true });
    }

    let name = (senderName || "").trim();
    if (!name) {
      const { data: prof } = await sb
        .from("profiles")
        .select("full_name")
        .eq("id", senderId)
        .maybeSingle();
      name = String(prof?.full_name || "New message").trim() || "New message";
    }

    const href = `/messages/${conversationId}`;
    const res = await insertNotification({
      userId: recipientId,
      category: "messages",
      priority: "high",
      title: name,
      body: preview.slice(0, 160),
      href,
      actionType: "open_chat",
      actionPayload: { conversationId },
      groupKey: `msg-${conversationId}`,
      jobId: conv.request_id ? String(conv.request_id) : null,
      messageText: preview.slice(0, 200),
    });
    if ("error" in res) return apiFail(res.error, 500);
    return apiOk({ id: res.id });
  } catch (e) {
    return apiFail(e instanceof Error ? e.message : "Notify failed", 500);
  }
}
