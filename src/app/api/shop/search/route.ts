import { NextRequest } from "next/server";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { requireUser } from "@/lib/server/auth-utils";
import { searchShop } from "@/lib/server/shop/search";
import { shopCtxFromQuery } from "@/lib/server/shop/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/shop/search?q=...&trade=mechanic&lockTrade=1
 * - Global: omit trade (intent may suggest a trade for UI jump)
 * - Per-trade: pass trade + lockTrade=1 so results stay inside that trade
 */
export async function GET(req: NextRequest) {
  try {
    const q = req.nextUrl.searchParams.get("q")?.trim() || "";
    if (!q) return apiFail("Missing q", 400, "BAD_REQUEST");

    const tradeKey =
      req.nextUrl.searchParams.get("trade")?.trim() ||
      req.nextUrl.searchParams.get("tradeKey")?.trim() ||
      undefined;
    const lockTrade =
      req.nextUrl.searchParams.get("lockTrade") === "1" ||
      req.nextUrl.searchParams.get("lockTrade") === "true";

    let userId: string | undefined;
    const auth = await requireUser(req);
    if (auth.ok) userId = auth.userId;

    const data = await searchShop(q, {
      userId,
      limit: 40,
      tradeKey,
      lockTrade: lockTrade && Boolean(tradeKey),
      accountContext: shopCtxFromQuery(req.nextUrl.searchParams.get("ctx")),
    });
    return apiOk(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Search failed";
    return apiFail(msg, 500, "SHOP_SEARCH_ERROR");
  }
}
