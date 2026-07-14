import { AdminAuthError, requireAdmin } from "@/lib/server/admin-auth";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { createServiceSupabase } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Identity verification overview across Repair Pros */
export async function GET() {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Supabase is not configured", 503);
  }
  try {
    await requireAdmin();
    const supabase = createServiceSupabase();
    const { data, error } = await supabase
      .from("repair_pro_profiles")
      .select(
        "user_id, business_name, status, verified, nin_verified, bvn_verified, nin_last4, bvn_last4, primary_service"
      )
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) return apiFail(error.message, 500);

    const pros = data ?? [];
    const userIds = pros.map((p) => p.user_id);
    let profiles: Record<string, { full_name: string; email: string | null }> =
      {};
    if (userIds.length) {
      const { data: rows } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", userIds);
      for (const r of rows ?? []) {
        profiles[r.id] = { full_name: r.full_name, email: r.email };
      }
    }

    const rows = pros.map((p) => ({
      ...p,
      full_name: profiles[p.user_id]?.full_name ?? "—",
      email: profiles[p.user_id]?.email ?? null,
    }));

    const totals = {
      total: rows.length,
      fullyVerified: rows.filter((r) => r.nin_verified && r.bvn_verified)
        .length,
      partial: rows.filter(
        (r) => (r.nin_verified || r.bvn_verified) && !(r.nin_verified && r.bvn_verified)
      ).length,
      unverified: rows.filter((r) => !r.nin_verified && !r.bvn_verified).length,
    };

    return apiOk({ rows, totals });
  } catch (e) {
    if (e instanceof AdminAuthError) return apiFail(e.message, e.status, "auth");
    return apiFail("Failed to load verification", 500);
  }
}
