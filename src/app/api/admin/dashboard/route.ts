import { AdminAuthError, requireAdmin } from "@/lib/server/admin-auth";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { createServiceSupabase } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Supabase is not configured", 503, "supabase_not_configured");
  }
  try {
    await requireAdmin();
    const supabase = createServiceSupabase();

    const [
      users,
      motorists,
      pros,
      pendingPros,
      openJobs,
      completedJobs,
      paymentsPaid,
      recentActions,
      customerIdPending,
    ] = await Promise.all([
      supabase.from("profiles").select("id", { count: "exact", head: true }),
      // Side tables are source of truth (dual accounts not missed)
      supabase
        .from("motorist_profiles")
        .select("user_id", { count: "exact", head: true }),
      supabase
        .from("repair_pro_profiles")
        .select("user_id", { count: "exact", head: true }),
      supabase
        .from("repair_pro_profiles")
        .select("user_id", { count: "exact", head: true })
        .eq("status", "pending"),
      supabase
        .from("service_requests")
        .select("id", { count: "exact", head: true })
        .in("status", [
          "requested",
          "matched",
          "accepted",
          "en_route",
          "in_progress",
        ]),
      supabase
        .from("service_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "completed"),
      supabase
        .from("payments")
        .select("amount_kobo")
        .eq("status", "paid"),
      supabase
        .from("admin_actions")
        .select("id, action, target_user_id, meta, created_at, admin_id")
        .order("created_at", { ascending: false })
        .limit(12),
      supabase
        .from("motorist_profiles")
        .select("user_id", { count: "exact", head: true })
        .eq("identity_review_status", "submitted"),
    ]);

    const revenueKobo = (paymentsPaid.data ?? []).reduce(
      (sum, row) => sum + Number(row.amount_kobo || 0),
      0
    );

    return apiOk({
      totals: {
        users: users.count ?? 0,
        motorists: motorists.count ?? 0,
        repairPros: pros.count ?? 0,
        pendingPros: pendingPros.count ?? 0,
        customerIdPending: customerIdPending.count ?? 0,
        openJobs: openJobs.count ?? 0,
        completedJobs: completedJobs.count ?? 0,
        revenueKobo,
        revenueNgn: revenueKobo / 100,
      },
      recentActions: recentActions.data ?? [],
    });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return apiFail(e.message, e.status, "auth");
    }
    console.error(e);
    return apiFail("Failed to load dashboard", 500);
  }
}
