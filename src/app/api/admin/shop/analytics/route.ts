import { NextRequest } from "next/server";
import { apiFail, apiOk } from "@/lib/server/api-json";
import {
  AdminAuthError,
  requireAdmin,
} from "@/lib/server/admin-auth";
import { createServiceSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Mechanic Shop demand analytics for Admin. */
export async function GET(_req: NextRequest) {
  try {
    await requireAdmin();
    const sb = createServiceSupabase();

    const { data: zeroEvents } = await sb
      .from("shop_search_events")
      .select("query, trade_key, created_at, vehicle_make, vehicle_model")
      .eq("zero_result", true)
      .order("created_at", { ascending: false })
      .limit(200);

    const zeroCounts = new Map<string, number>();
    for (const e of zeroEvents ?? []) {
      const q = String(e.query || "").toLowerCase().trim();
      if (!q) continue;
      zeroCounts.set(q, (zeroCounts.get(q) || 0) + 1);
    }
    const topZeroResult = [...zeroCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([query, count]) => ({ query, count }));

    const { data: requests } = await sb
      .from("shop_product_requests")
      .select("search_term, status, trade_key")
      .eq("status", "open")
      .limit(100);

    const { count: listingAvailable } = await sb
      .from("shop_seller_listings")
      .select("id", { count: "exact", head: true })
      .eq("listing_status", "available")
      .eq("is_active", true);

    const { count: listingLow } = await sb
      .from("shop_seller_listings")
      .select("id", { count: "exact", head: true })
      .eq("listing_status", "low_stock")
      .eq("is_active", true);

    const { count: listingOos } = await sb
      .from("shop_seller_listings")
      .select("id", { count: "exact", head: true })
      .eq("listing_status", "out_of_stock")
      .eq("is_active", true);

    return apiOk({
      topZeroResult,
      openProductRequests: requests ?? [],
      listingCounts: {
        available: listingAvailable ?? 0,
        low_stock: listingLow ?? 0,
        out_of_stock: listingOos ?? 0,
      },
      recentZeroEvents: (zeroEvents ?? []).slice(0, 40),
    });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return apiFail(e.message, e.status, "auth");
    }
    const msg = e instanceof Error ? e.message : "Analytics failed";
    if (/relation .* does not exist|Could not find the table/i.test(msg)) {
      return apiOk({
        setupRequired: true,
        message: "Run migration 061 for listings/requests analytics",
        topZeroResult: [],
        openProductRequests: [],
        listingCounts: {},
      });
    }
    return apiFail(msg, 500, "SHOP_ANALYTICS");
  }
}
