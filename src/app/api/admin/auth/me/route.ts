import { AdminAuthError, requireAdmin } from "@/lib/server/admin-auth";
import { apiFail, apiOk } from "@/lib/server/api-json";
import {
  ADMIN_LEVEL,
  normalizeAdminRole,
  permissionsForRole,
  roleLabel,
  roleTheme,
} from "@/lib/server/modules/admin-roles";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!isSupabaseAdminConfigured()) {
    return apiFail(
      "Supabase is not configured",
      503,
      "supabase_not_configured",
    );
  }
  try {
    const { profile, adminRole } = await requireAdmin();
    const role = normalizeAdminRole(adminRole || profile.admin_role);
    const theme = roleTheme(role);
    const level = ADMIN_LEVEL[role];
    return apiOk({
      id: profile.id,
      email: profile.email,
      fullName: profile.full_name,
      role: profile.role,
      adminRole: role,
      level,
      roleLabel: roleLabel(role),
      permissions: permissionsForRole(role),
      roleTheme: {
        key: theme.key,
        color: theme.color,
        soft: theme.soft,
        brandTitle: theme.brandTitle,
        brandSub: theme.brandSub,
      },
      security: {
        idleTimeoutMinutes: 30,
        sensitiveUnlockMinutes: 3,
        twoFactor: "planned", // Phase B
      },
    });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return apiFail(e.message, e.status, "auth");
    }
    return apiFail("Unexpected error", 500);
  }
}
