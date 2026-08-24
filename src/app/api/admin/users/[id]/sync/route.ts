import {
  AdminAuthError,
  logAdminAction,
  requireAdmin,
} from "@/lib/server/admin-auth";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { createServiceSupabase } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import {
  identityStatus,
  runIdentitySync,
} from "@/lib/server/identity/identity-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Re-run identity sync for a user (fix sync issues from the admin board). */
export async function POST(
  _req: Request,
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
    const supabase = createServiceSupabase();

    const result = await runIdentitySync(supabase, id, {
      userId: session.userId,
      role: session.adminRole,
      source: "admin_sync",
    });
    if (!result.ok) return apiFail(result.error || "Sync failed", 500);

    await logAdminAction(session.userId, "identity_sync", id, {
      roles: result.roles,
    });

    const status = await identityStatus(supabase, id);
    return apiOk({ synced: true, roles: result.roles, status });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return apiFail(e.message, e.status, "auth");
    }
    return apiFail("Identity sync failed", 500);
  }
}
