import { NextRequest } from "next/server";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { requireUser } from "@/lib/server/auth-utils";
import { searchShop } from "@/lib/server/shop/search";
import { isListingStatus } from "@/lib/shop/listing-status";
import { resolveAccountContext } from "@/lib/server/shop/catalog";
import {
  assertTradeAllowed,
  resolveShopUiScope,
} from "@/lib/server/market-scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/shop/search?q=...&trade=mechanic&lockTrade=1
 * - Global: omit trade (intent may suggest a trade for UI jump)
 * - Per-trade: pass trade + lockTrade=1 so results stay inside that trade
 * - Mechanic pro: locked to mechanic catalog
 */
export async function GET(req: NextRequest) {
  try {
    const q = req.nextUrl.searchParams.get("q")?.trim() || "";
    if (!q) return apiFail("Missing q", 400, "BAD_REQUEST");

    const scope = await resolveShopUiScope(req);
    let tradeKey =
      req.nextUrl.searchParams.get("trade")?.trim() ||
      req.nextUrl.searchParams.get("tradeKey")?.trim() ||
      undefined;
    if (scope.allowedTradeKeys?.length === 1) {
      tradeKey = scope.allowedTradeKeys[0];
    } else if (tradeKey) {
      const gate = assertTradeAllowed(scope, tradeKey);
      if (!gate.ok) return apiFail(gate.message, 403, gate.code);
    }
    const lockTrade =
      req.nextUrl.searchParams.get("lockTrade") === "1" ||
      req.nextUrl.searchParams.get("lockTrade") === "true" ||
      Boolean(scope.allowedTradeKeys?.length === 1);

    let userId: string | undefined;
    const auth = await requireUser(req);
    if (auth.ok) userId = auth.userId;

    // Facet filters: category, price range, availability.
    const sp = req.nextUrl.searchParams;
    const filters: import("@/lib/server/shop/catalog").ProductFilterOptions =
      {};
    const categorySlug = sp.get("category");
    if (categorySlug) filters.categorySlug = categorySlug;
    const minPrice = sp.get("minPrice");
    const maxPrice = sp.get("maxPrice");
    if (minPrice && !Number.isNaN(Number(minPrice))) {
      filters.minPriceMinor = Math.max(0, Math.round(Number(minPrice)));
    }
    if (maxPrice && !Number.isNaN(Number(maxPrice))) {
      filters.maxPriceMinor = Math.max(0, Math.round(Number(maxPrice)));
    }
    if (sp.get("availability") === "in_stock") {
      filters.availability = "in_stock";
    }
    if (isListingStatus(sp.get("listingStatus"))) {
      filters.listingStatus = sp.get("listingStatus") as NonNullable<
        typeof filters.listingStatus
      >;
    }
    const attrs: Record<string, string | number | boolean> = {};
    for (const key of sp.keys()) {
      if (key.startsWith("attr.")) {
        const val = sp.get(key);
        if (val != null && val !== "") attrs[key.slice(5)] = val;
      }
    }
    if (Object.keys(attrs).length) filters.attributes = attrs;

    const data = await searchShop(q, {
      userId,
      limit: 40,
      tradeKey,
      lockTrade: lockTrade && Boolean(tradeKey),
      accountContext: await resolveAccountContext(req),
      filters,
    });
    return apiOk(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Search failed";
    return apiFail(msg, 500, "SHOP_SEARCH_ERROR");
  }
}
