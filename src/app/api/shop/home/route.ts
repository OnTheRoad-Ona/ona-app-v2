import { NextRequest } from "next/server";
import { apiFail, apiOk } from "@/lib/server/api-json";
import {
  getShopHomeSections,
  resolveAccountContext,
} from "@/lib/server/shop/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const accountContext = await resolveAccountContext(req);
    const data = await getShopHomeSections({ accountContext });
    return apiOk(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Shop home failed";
    // Tables may not be migrated yet
    if (/relation .* does not exist|Could not find the table/i.test(msg)) {
      return apiOk({
        trades: [],
        popular: [],
        newArrivals: [],
        setupRequired: true,
        message:
          "Shop database not applied yet. Run migration 20260809_050_ona_shop_core.sql",
      });
    }
    return apiFail(msg, 500, "SHOP_HOME_ERROR");
  }
}
