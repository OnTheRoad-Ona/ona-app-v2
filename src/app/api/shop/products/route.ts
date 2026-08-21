import { NextRequest } from "next/server";
import { apiFail, apiOk } from "@/lib/server/api-json";
import {
  listProducts,
  resolveAccountContext,
} from "@/lib/server/shop/catalog";
import { applyTradeFilters } from "@/lib/shop/trade-filters";
import { isListingStatus } from "@/lib/shop/listing-status";
import {
  assertTradeAllowed,
  resolveShopUiScope,
} from "@/lib/server/market-scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ProductFilterOptions = import("@/lib/server/shop/catalog").ProductFilterOptions;

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
    const listingStatus = isListingStatus(sp.get("listingStatus"))
      ? (sp.get("listingStatus") as "all" | "available" | "low_stock" | "out_of_stock" | "pre_order" | "coming_soon")
      : undefined;
    const filters: ProductFilterOptions = tradeKey
      ? applyTradeFilters(tradeKey, selected)
      : {};
    if (listingStatus) filters.listingStatus = listingStatus;

    // Enforce pro trade cap when client omits trade
    const effectiveTrade =
      tradeKey ||
      (scope.allowedTradeKeys?.length === 1
        ? scope.allowedTradeKeys[0]
        : undefined);

    // Category is sent either as a slug (neutral browse / filters) or as a
    // UUID (all-parts). Only pass it as categoryId when it is a real UUID;
    // otherwise let the slug <-> id resolution in listProducts handle it.
    const rawCategory = sp.get("category") || sp.get("cat");
    const categoryId =
      typeof rawCategory === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        rawCategory
      )
        ? rawCategory
        : undefined;

    const data = await listProducts({
      tradeKey: effectiveTrade,
      categoryId,
      categorySlug: filters?.categorySlug,
      q: sp.get("q") || undefined,
      limit: Number(sp.get("limit") || 80),
      accountContext: await resolveAccountContext(req),
      filters,
    });
    return apiOk({ products: data, listingStatus: sp.get("listingStatus") });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "List failed";
    return apiFail(msg, 500, "SHOP_PRODUCTS_ERROR");
  }
}
