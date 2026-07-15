import { AdminAuthError, requireAdmin } from "@/lib/server/admin-auth";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { createServiceSupabase } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Recent signup attempts (success + failures) for admin control centre */
export async function GET(req: Request) {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Supabase is not configured", 503);
  }
  try {
    await requireAdmin();
    const { searchParams } = new URL(req.url);
    const onlyFailed = searchParams.get("failed") === "1";
    const supabase = createServiceSupabase();

    let q = supabase
      .from("signup_events")
      .select(
        "id, email, full_name, phone, account_type, success, error_message, user_id, meta, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(150);

    if (onlyFailed) q = q.eq("success", false);

    const { data, error } = await q;
    if (error) return apiFail(error.message, 500);

    const rows = data ?? [];
    const totals = {
      total: rows.length,
      success: rows.filter((r) => r.success).length,
      failed: rows.filter((r) => !r.success).length,
    };

    return apiOk({ events: rows, totals });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return apiFail(e.message, e.status, "auth");
    }
    return apiFail("Failed to load signup events", 500);
  }
}
