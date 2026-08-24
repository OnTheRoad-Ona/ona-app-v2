import { NextRequest } from "next/server";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { getTradeFilterConfig } from "@/lib/shop/trade-filters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Phase 2 dynamic filter engine public read of per-trade filter facets.
 * GET ?trade=mechanic → filters for that trade only
 * GET (no trade) → all trades' filter configs
 */
export async function GET(req: NextRequest) {
  try {
    const trade = req.nextUrl.searchParams.get("trade");
    if (trade) {
      const config = getTradeFilterConfig(trade);
      if (!config)
        return apiFail(`Unknown trade: ${trade}`, 404, "UNKNOWN_TRADE");
      // Client expects `filters` as FilterDef[] (not the full config object).
      return apiOk({
        trade: config.tradeKey,
        filters: config.filters,
        hasVehicleFitment: config.hasVehicleFitment,
      });
    }
    const trades = [
      "mechanic",
      "vulcanizer",
      "towing",
      "ac",
      "battery",
      "body",
      "electrical",
      "diagnostics",
      "fashion",
      "plumber",
      "carpenter",
      "painter",
      "solar",
      "generator",
    ];
    const configs = trades
      .map((t) => getTradeFilterConfig(t))
      .filter((c): c is NonNullable<typeof c> => Boolean(c));
    return apiOk({
      filters: configs.map((c) => ({
        trade: c.tradeKey,
        filters: c.filters,
        hasVehicleFitment: c.hasVehicleFitment,
      })),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Filters failed";
    return apiFail(msg, 500, "SHOP_FILTERS_ERROR");
  }
}
