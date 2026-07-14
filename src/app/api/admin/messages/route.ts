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
    const [conversations, messages] = await Promise.all([
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
    ]);
    if (conversations.error) return apiFail(conversations.error.message, 500);
    if (messages.error) return apiFail(messages.error.message, 500);
    return apiOk({
      conversations: conversations.data ?? [],
      messages: messages.data ?? [],
    });
  } catch (e) {
    if (e instanceof AdminAuthError) return apiFail(e.message, e.status, "auth");
    return apiFail("Failed to load messages", 500);
  }
}
