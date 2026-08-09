import { NextRequest } from "next/server";
import { apiFail, apiOk } from "@/lib/server/api-json";
import {
  getProductBySlug,
  shopCtxFromQuery,
} from "@/lib/server/shop/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await ctx.params;
    const data = await getProductBySlug(
      slug,
      shopCtxFromQuery(req.nextUrl.searchParams.get("ctx"))
    );
    if (!data) return apiFail("Product not found", 404, "NOT_FOUND");
    return apiOk(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Product failed";
    return apiFail(msg, 500, "SHOP_PRODUCT_ERROR");
  }
}
