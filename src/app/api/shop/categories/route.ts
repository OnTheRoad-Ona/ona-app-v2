import { NextRequest } from "next/server";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { getTradeCategories } from "@/lib/server/shop/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const roots = sp.get("roots") === "1";
    const trade = sp.get("trade") || undefined;
    const parent = sp.get("parent");
    const data = await getTradeCategories({
      rootsOnly: roots,
      tradeKey: trade,
      parentId: parent === "null" ? null : parent || undefined,
    });
    return apiOk({ categories: data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Categories failed";
    return apiFail(msg, 500, "SHOP_CATEGORIES_ERROR");
  }
}
