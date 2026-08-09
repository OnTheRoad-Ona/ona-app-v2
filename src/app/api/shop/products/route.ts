import { NextRequest } from "next/server";
import { apiFail, apiOk } from "@/lib/server/api-json";
import {
  listProducts,
  shopCtxFromQuery,
} from "@/lib/server/shop/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const data = await listProducts({
      tradeKey: sp.get("trade") || undefined,
      categoryId: sp.get("category") || undefined,
      q: sp.get("q") || undefined,
      limit: Number(sp.get("limit") || 24),
      accountContext: shopCtxFromQuery(sp.get("ctx")),
    });
    return apiOk({ products: data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "List failed";
    return apiFail(msg, 500, "SHOP_PRODUCTS_ERROR");
  }
}
