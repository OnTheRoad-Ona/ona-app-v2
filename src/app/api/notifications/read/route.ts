import { z } from "zod";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { requireUser } from "@/lib/server/auth-utils";
import { createServiceSupabase } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  userId: z.string().min(1),
  ids: z.array(z.string().min(1)).min(1).max(50),
});

/** POST /api/notifications/read — mark specific notifications read */
export async function POST(req: Request) {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Supabase is not configured", 503);
  }
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return apiFail("Invalid JSON", 400);
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return apiFail("userId and ids required", 400, "validation");
  }
  if (parsed.data.userId !== auth.userId) {
    return apiFail("Forbidden", 403, "forbidden");
  }
  const { ids } = parsed.data;
  const sb = createServiceSupabase();
  const now = new Date().toISOString();
  const { error } = await sb
    .from("notifications")
    .update({ read_at: now })
    .eq("user_id", auth.userId)
    .in("id", ids)
    .is("read_at", null);

  if (error) {
    if (/Could not find the table|does not exist/i.test(error.message || "")) {
      return apiOk({ ok: true, skipped: true });
    }
    return apiFail(error.message, 500);
  }
  return apiOk({ readAt: now, ids });
}
