import { AdminAuthError, requireAdmin } from "@/lib/server/admin-auth";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { createServiceSupabase } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Supabase is not configured", 503, "supabase_not_configured");
  }
  try {
    await requireAdmin();
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();
    const role = searchParams.get("role");
    const supabase = createServiceSupabase();

    let query = supabase
      .from("profiles")
      .select(
        "id, role, full_name, phone, email, city, area, is_active, created_at, updated_at, repair_pro_profiles(status, primary_service, verified, is_online)"
      )
      .order("created_at", { ascending: false })
      .limit(200);

    if (role && ["admin", "motorist", "repair_pro"].includes(role)) {
      query = query.eq("role", role);
    }
    if (q) {
      query = query.or(
        `full_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`
      );
    }

    const { data, error } = await query;
    if (error) return apiFail(error.message, 500);

    return apiOk({ users: data ?? [] });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return apiFail(e.message, e.status, "auth");
    }
    return apiFail("Failed to list users", 500);
  }
}
