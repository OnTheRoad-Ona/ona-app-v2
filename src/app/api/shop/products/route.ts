import { NextRequest } from "next/server";
import { apiFail, apiOk } from "@/lib/server/api-json";
import {
  listProducts,
  resolveAccountContext,
} from "@/lib/server/shop/catalog";
import { applyTradeFilters } from "@/lib/shop/trade-filters";
import {
  assertTradeAllowed,
  resolveShopUiScope,
} from "@/lib/server/market-scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const tradeKey = sp.get("trade") || undefined;
    const scope = await resolveShopUiScope(req);
    if (tradeKey) {
      const gate = assertTradeAllowed(scope, tradeKey);
      if (!gate.ok) return apiFail(gate.message, 403, gate.code);
    }

    // Phase 2 filter engine — parse attribute filters, drop irrelevant ones.
    const selected: Record<string, string | boolean> = {};
    for (const [key, value] of sp.entries()) {
      if (
        [
          "trade",
          "category",
          "q",
          "limit",
          "ctx",
          "cat",
          "availability",
          "listingStatus",
        ].includes(key)
      )
        continue;
      if (value === "true") selected[key] = true;
      else if (value === "false") selected[key] = false;
      else selected[key] = value;
    }
    if (sp.get("category") || sp.get("cat")) {
      selected.category = sp.get("category") || sp.get("cat") || "";
    }
    if (sp.get("availability")) {
      selected.availability = sp.get("availability") || "";
    }
    const filters = tradeKey
      ? applyTradeFilters(tradeKey, selected)
      : undefined;

    // Enforce pro trade cap when client omits trade
    const effectiveTrade =
      tradeKey ||
      (scope.allowedTradeKeys?.length === 1
        ? scope.allowedTradeKeys[0]
        : undefined);

    const data = await listProducts({
      tradeKey: effectiveTrade,
      categoryId: sp.get("category") || undefined,
      categorySlug: filters?.categorySlug,
      q: sp.get("q") || undefined,
      limit: Number(sp.get("limit") || 24),
      accountContext: await resolveAccountContext(req),
      filters,
    });
    return apiOk({ products: data, listingStatus: sp.get("listingStatus") });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "List failed";
    return apiFail(msg, 500, "SHOP_PRODUCTS_ERROR");
  }
}
