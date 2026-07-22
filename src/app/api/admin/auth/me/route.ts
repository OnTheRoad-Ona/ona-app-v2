import { AdminAuthError, requireAdmin } from "@/lib/server/admin-auth";
import { apiFail, apiOk } from "@/lib/server/api-json";
import {
  normalizeAdminRole,
  roleLabel,
  roleTheme,
} from "@/lib/server/modules/admin-roles";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Supabase is not configured", 503, "supabase_not_configured");
  }
  try {
    const { profile, adminRole } = await requireAdmin();
    const role = normalizeAdminRole(adminRole || profile.admin_role);
    const theme = roleTheme(role);
    return apiOk({
      id: profile.id,
      email: profile.email,
      fullName: profile.full_name,
      role: profile.role,
      adminRole: role,
      roleLabel: roleLabel(role),
      roleTheme: {
        key: theme.key,
        color: theme.color,
        soft: theme.soft,
        brandTitle: theme.brandTitle,
        brandSub: theme.brandSub,
      },
    });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return apiFail(e.message, e.status, "auth");
    }
    return apiFail("Unexpected error", 500);
  }
}
