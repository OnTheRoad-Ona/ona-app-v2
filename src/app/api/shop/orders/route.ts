import { NextRequest } from "next/server";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { requireUser } from "@/lib/server/auth-utils";
import { getUserOrders } from "@/lib/server/shop/orders";
import { shopCtxFromQuery } from "@/lib/server/shop/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireUser(req);
    if (!auth.ok) return auth.response;
    const orders = await getUserOrders(
      auth.userId,
      shopCtxFromQuery(req.nextUrl.searchParams.get("ctx")),
    );
    return apiOk({ orders });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Orders failed";
    return apiFail(msg, 500);
  }
}
