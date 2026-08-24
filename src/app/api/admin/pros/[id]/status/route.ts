import { z } from "zod";
import {
  AdminAuthError,
  logAdminAction,
  requireAdmin,
} from "@/lib/server/admin-auth";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { createServiceSupabase } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  status: z.enum(["pending", "approved", "suspended", "rejected"]),
});

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!isSupabaseAdminConfigured()) {
    return apiFail(
      "Supabase is not configured",
      503,
      "supabase_not_configured",
    );
  }
  try {
    const { session } = await requireAdmin();
    const { id } = await ctx.params;
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) return apiFail("Invalid status", 400);

    const supabase = createServiceSupabase();
    const { data, error } = await supabase
      .from("repair_pro_profiles")
      .update({
        status: parsed.data.status,
        verified: parsed.data.status === "approved",
      })
      .eq("user_id", id)
      .select("*")
      .single();

    if (error) return apiFail(error.message, 500);

    await logAdminAction(session.userId, "pro_status", id, {
      status: parsed.data.status,
    });

    return apiOk({ pro: data });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return apiFail(e.message, e.status, "auth");
    }
    return apiFail("Failed to update pro status", 500);
  }
}
