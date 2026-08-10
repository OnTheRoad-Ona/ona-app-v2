import { NextRequest } from "next/server";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { getTradeFilterConfig } from "@/lib/shop/trade-filters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Phase 2 dynamic filter engine — public read of per-trade filter facets.
 * GET ?trade=mechanic  → filters for that trade only
 * GET (no trade)        → all trades' filter configs
 */
export async function GET(req: NextRequest) {
  try {
    const trade = req.nextUrl.searchParams.get("trade");
    if (trade) {
      const config = getTradeFilterConfig(trade);
      if (!config) return apiFail(`Unknown trade: ${trade}`, 404, "UNKNOWN_TRADE");
      return apiOk({ trade, filters: config });
    }
    const trades = [
      "mechanic", "vulcanizer", "towing", "ac", "battery", "body",
      "electrical", "diagnostics", "wash", "plumber", "carpenter",
      "painter", "solar", "generator",
    ];
    const filters = trades
      .map((t) => getTradeFilterConfig(t))
      .filter((c): c is NonNullable<typeof c> => Boolean(c));
    return apiOk({ filters });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Filters failed";
    return apiFail(msg, 500, "SHOP_FILTERS_ERROR");
  }
}
