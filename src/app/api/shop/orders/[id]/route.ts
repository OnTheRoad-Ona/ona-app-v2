import { NextRequest } from "next/server";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { requireUser } from "@/lib/server/auth-utils";
import { getOrderForUser } from "@/lib/server/shop/orders";
import { shopCtxFromQuery } from "@/lib/server/shop/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireUser(req);
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;
    const data = await getOrderForUser(
      id,
      auth.userId,
      shopCtxFromQuery(req.nextUrl.searchParams.get("ctx"))
    );
    if (!data) return apiFail("Order not found", 404, "not_found");
    return apiOk(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Order failed";
    return apiFail(msg, 500);
  }
}
