import { AdminAuthError, requireAdmin } from "@/lib/server/admin-auth";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { createServiceSupabase } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Supabase is not configured", 503);
  }
  try {
    await requireAdmin();
    const supabase = createServiceSupabase();
    const { data, error } = await supabase
      .from("admin_actions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) return apiFail(error.message, 500);
    return apiOk({ actions: data ?? [] });
  } catch (e) {
    if (e instanceof AdminAuthError) return apiFail(e.message, e.status, "auth");
    return apiFail("Failed to load audit log", 500);
  }
}
