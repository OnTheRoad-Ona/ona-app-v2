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

/**
 * Admin / customer care: approve customer Tier 2 identity
 * (unlocks unlimited booking after free-request limit).
 */
const bodySchema = z.object({
  action: z.enum(["approve", "reject"]),
  reason: z.string().max(500).optional(),
});

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Supabase is not configured", 503, "supabase_not_configured");
  }
  try {
    // Customer care / admin with PII access can approve Tier 2 ID
    const { session } = await requireSensitiveAction("view_pii", req);
    const { id } = await ctx.params;
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) return apiFail("Invalid body", 400);

    const supabase = createServiceSupabase();
    const now = new Date().toISOString();
    const approve = parsed.data.action === "approve";

    const { error } = await supabase
      .from("motorist_profiles")
      .update({
        nin_verified: approve,
        bvn_verified: approve,
        identity_verified_at: approve ? now : null,
      })
      .eq("user_id", id);

    if (error) return apiFail(error.message, 500);

    await logAdminAction(
      session.userId,
      approve ? "motorist_identity_approve" : "motorist_identity_reject",
      id,
      {
        sensitive: true,
        ip: clientIp(req),
        user_agent: userAgent(req),
        meta: { reason: parsed.data.reason || null },
      }
    );

    return apiOk({
      userId: id,
      action: parsed.data.action,
      identityVerifiedAt: approve ? now : null,
    });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return apiFail(e.message, e.status, e.code || "auth");
    }
    return apiFail("Failed to update identity", 500);
  }
}
