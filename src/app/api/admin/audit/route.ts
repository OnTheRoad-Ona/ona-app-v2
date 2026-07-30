import { AdminAuthError, requireAdmin } from "@/lib/server/admin-auth";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { createServiceSupabase } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Supabase is not configured", 503);
  }
  try {
    await requireAdmin();
    const url = new URL(req.url);
    const period = url.searchParams.get("period") || "all";
    const supabase = createServiceSupabase();

    let from: string | undefined;
    const now = new Date();
    if (period === "ytd") {
      from = new Date(now.getFullYear(), 0, 1).toISOString();
    } else if (period === "year") {
      from = new Date(now.getFullYear() - 1, 0, 1).toISOString();
    }

    let query = supabase
      .from("admin_actions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(300);

    if (from) query = query.gte("created_at", from);

    const { data, error } = await query;
    if (error) return apiFail(error.message, 500);

    // Compute year summary
    const ytdStart = new Date(now.getFullYear(), 0, 1);
    const ytdCount = (data ?? []).filter(
      (a: Record<string, unknown>) => new Date(String(a.created_at)) >= ytdStart
    ).length;

    return apiOk({ actions: data ?? [], yearSummary: { ytdCount } });
  } catch (e) {
    if (e instanceof AdminAuthError) return apiFail(e.message, e.status, "auth");
    return apiFail("Failed to load audit log", 500);
  }
}
