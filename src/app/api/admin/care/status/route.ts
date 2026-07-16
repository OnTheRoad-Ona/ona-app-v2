import { AdminAuthError, requireAdmin } from "@/lib/server/admin-auth";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { readUnlockFromCookies } from "@/lib/server/modules/sensitive-unlock";
import { roleLabel } from "@/lib/server/modules/admin-roles";
import { ADMIN_IDLE_TIMEOUT_MS } from "@/lib/server/modules/security";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Care session status: role + whether sensitive unlock is active */
export async function GET() {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Supabase is not configured", 503, "supabase_not_configured");
  }
  try {
    const { session, adminRole } = await requireAdmin();
    const unlock = await readUnlockFromCookies(session.userId);
    return apiOk({
      adminRole,
      roleLabel: roleLabel(adminRole),
      fullName: session.fullName,
      email: session.email,
      sensitiveUnlocked: unlock.unlocked,
      unlockExpiresAt: unlock.expiresAt,
      idleTimeoutMs: ADMIN_IDLE_TIMEOUT_MS,
    });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return apiFail(e.message, e.status, e.code || "auth");
    }
    return apiFail("Status failed", 500);
  }
}
