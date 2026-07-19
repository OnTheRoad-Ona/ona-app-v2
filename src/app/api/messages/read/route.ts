import { z } from "zod";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { createServiceSupabase } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  conversationId: z.string().min(1),
  userId: z.string().uuid(),
});

/**
 * Mark all messages from the other party as read for this conversation.
 */
export async function POST(req: Request) {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Server not configured", 503);
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return apiFail("Invalid JSON", 400);
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return apiFail("Invalid request", 400);
  }

  const { conversationId, userId } = parsed.data;
  const sb = createServiceSupabase();
  const now = new Date().toISOString();

  const { error } = await sb
    .from("messages")
    .update({ read_at: now })
    .eq("conversation_id", conversationId)
    .neq("sender_id", userId)
    .is("read_at", null);

  if (error) {
    return apiFail(error.message, 500);
  }

  return apiOk({ ok: true, readAt: now });
}
