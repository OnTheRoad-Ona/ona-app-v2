import { AdminAuthError, requireAdmin } from "@/lib/server/admin-auth";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { createServiceSupabase } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Database not configured", 503, "no_db");
  }
  try {
    await requireAdmin();
  } catch (e) {
    if (e instanceof AdminAuthError) return apiFail(e.message, e.status);
    return apiFail("Unauthorized", 401);
  }

  const { userId } = await params;
  const body = await req.json().catch(() => null);
  if (!body || !body.action) return apiFail("action required", 400);

  const supabase = createServiceSupabase();

  if (body.action === "force_delete") {
    const { error: delError } = await supabase
      .from("profiles")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", userId)
      .eq("deletion_status", "pending_deletion");
    if (delError) return apiFail(delError.message, 500);

    const { error: authError } = await supabase.auth.admin.deleteUser(userId);
    if (authError) return apiFail(authError.message, 500);

    return apiOk({ deleted: true });
  }

  if (body.action === "restore") {
    const { error } = await supabase
      .from("profiles")
      .update({
        deletion_status: "active",
        deletion_scheduled_at: null,
        deleted_at: null,
      })
      .eq("id", userId);

    if (error) return apiFail(error.message, 500);
    return apiOk({ restored: true });
  }

  return apiFail("Invalid action", 400);
}
