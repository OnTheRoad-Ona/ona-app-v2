import { NextRequest } from "next/server";
import { apiFail, apiOk } from "@/lib/server/api-json";
import {
  getShopHomeSections,
  resolveAccountContext,
} from "@/lib/server/shop/catalog";
import { resolveShopUiScope } from "@/lib/server/market-scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const accountContext = await resolveAccountContext(req);
    const scope = await resolveShopUiScope(req);
    const data = await getShopHomeSections({
      accountContext,
      allowedTradeKeys: scope.allowedTradeKeys,
      defaultTradeKey: scope.defaultTradeKey,
    });
    return apiOk({
      ...data,
      shopTitle: scope.shopTitle,
      allowBrowseAllParts: scope.allowBrowseAllParts,
      defaultTradeKey: scope.defaultTradeKey,
      allowedTradeKeys: scope.allowedTradeKeys,
      proTrade: scope.proTrade,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Shop home failed";
    // Tables may not be migrated yet
    if (/relation .* does not exist|Could not find the table/i.test(msg)) {
      return apiOk({
        trades: [],
        popular: [],
        newArrivals: [],
        recommended: [],
        setupRequired: true,
        message:
          "Shop database not applied yet. Run migration 20260809_050_ona_shop_core.sql + 061",
      });
    }
    return apiFail(msg, 500, "SHOP_HOME_ERROR");
  }
}
