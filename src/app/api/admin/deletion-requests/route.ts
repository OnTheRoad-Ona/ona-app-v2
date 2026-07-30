import { AdminAuthError, requireAdmin } from "@/lib/server/admin-auth";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { createServiceSupabase } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Database not configured", 503, "no_db");
  }
  try {
    await requireAdmin();
  } catch (e) {
    if (e instanceof AdminAuthError) return apiFail(e.message, e.status);
    return apiFail("Unauthorized", 401);
  }

  const supabase = createServiceSupabase();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, phone, deletion_status, deletion_scheduled_at, deleted_at, self_reactivated_at, created_at, updated_at")
    .neq("deletion_status", "active")
    .order("deletion_scheduled_at", { ascending: true, nullsFirst: true });

  if (error) return apiFail(error.message, 500);
  return apiOk({ requests: data ?? [] });
}

export async function POST(req: Request) {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Database not configured", 503, "no_db");
  }
  try {
    await requireAdmin();
  } catch (e) {
    if (e instanceof AdminAuthError) return apiFail(e.message, e.status);
    return apiFail("Unauthorized", 401);
  }

  const body = await req.json().catch(() => null);
  if (!body || !body.userId || !body.action) {
    return apiFail("userId and action required", 400);
  }

  const supabase = createServiceSupabase();

  if (body.action === "force_delete") {
    const { error } = await supabase
      .from("profiles")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", body.userId)
      .eq("deletion_status", "pending_deletion");
    if (error) return apiFail(error.message, 500);

    const { error: authError } = await supabase.auth.admin.deleteUser(body.userId);
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
      .eq("id", body.userId);

    if (error) return apiFail(error.message, 500);
    return apiOk({ restored: true });
  }

  return apiFail("Invalid action", 400);
}
