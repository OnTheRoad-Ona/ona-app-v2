import {
  AdminAuthError,
  requirePermission,
  requireSensitiveAction,
} from "@/lib/server/admin-auth";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { careUserDetail } from "@/lib/server/modules/care-service";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
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
    const url = new URL(req.url);
    const reveal = url.searchParams.get("pii") === "1";
    if (reveal) {
      await requireSensitiveAction("view_pii", req);
    } else {
      await requirePermission("view_users");
    }
    const { id } = await ctx.params;
    const detail = await careUserDetail(id, { revealPii: reveal });
    if (!detail) return apiFail("User not found", 404);
    return apiOk(detail);
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return apiFail(e.message, e.status, e.code || "auth");
    }
    return apiFail("Failed to load user", 500);
  }
}
