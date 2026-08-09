import { AdminAuthError, requireAdmin } from "@/lib/server/admin-auth";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { createServiceSupabase } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** List shop orders + delivery status for admin control. */
export async function GET(req: Request) {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Supabase is not configured", 503, "supabase_not_configured");
  }
  try {
    await requireAdmin();
    const sb = createServiceSupabase();
    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    const limit = Math.min(Number(url.searchParams.get("limit") || 50), 100);

    let q = sb
      .from("shop_orders")
      .select(
        "id, order_number, user_id, status, total_minor, currency, created_at, paid_at, ship_to_snapshot"
      )
      .order("created_at", { ascending: false })
      .limit(limit);
    if (status) q = q.eq("status", status);

    const { data: orders, error } = await q;
    if (error) {
      if (/does not exist|Could not find the table/i.test(error.message)) {
        return apiOk({
          orders: [],
          setupRequired: true,
          message: "Apply migration 20260809_050_ona_shop_core.sql",
        });
      }
      throw new Error(error.message);
    }

    const ids = (orders ?? []).map((o) => o.id as string);
    let deliveries: Array<Record<string, unknown>> = [];
    if (ids.length) {
      const { data: d } = await sb
        .from("shop_deliveries")
        .select("*")
        .in("order_id", ids);
      deliveries = (d ?? []) as Array<Record<string, unknown>>;
    }
    const byOrder = new Map(
      deliveries.map((d) => [String(d.order_id), d])
    );

    return apiOk({
      orders: (orders ?? []).map((o) => ({
        ...o,
        delivery: byOrder.get(String(o.id)) || null,
      })),
      setupRequired: false,
    });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return apiFail(e.message, e.status, "admin_auth");
    }
    const msg = e instanceof Error ? e.message : "Failed";
    return apiFail(msg, 500);
  }
}
