import { z } from "zod";
import {
  AdminAuthError,
  logAdminAction,
  requireSensitiveAction,
  clientIp,
  userAgent,
} from "@/lib/server/admin-auth";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { createServiceSupabase } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  is_active: z.boolean(),
});

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Supabase is not configured", 503, "supabase_not_configured");
  }
  try {
    // Freeze / unfreeze requires temporary password unlock
    const { session } = await requireSensitiveAction("user_freeze", req);
    const { id } = await ctx.params;
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) return apiFail("Invalid body", 400);

    const supabase = createServiceSupabase();
    const { data, error } = await supabase
      .from("profiles")
      .update({ is_active: parsed.data.is_active })
      .eq("id", id)
      .select("*")
      .single();

    if (error) return apiFail(error.message, 500);

    await logAdminAction(
      session.userId,
      parsed.data.is_active ? "activate_user" : "deactivate_user",
      id,
      {
        sensitive: true,
        ip: clientIp(req),
        user_agent: userAgent(req),
      }
    );

    return apiOk({ user: data });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return apiFail(e.message, e.status, e.code || "auth");
    }
    return apiFail("Failed to update user status", 500);
  }
}
