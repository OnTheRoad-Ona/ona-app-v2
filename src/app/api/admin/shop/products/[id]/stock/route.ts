import { NextRequest } from "next/server";
import { AdminAuthError, requirePermission } from "@/lib/server/admin-auth";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { adminSetStock } from "@/lib/server/shop/admin-catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  if (!isSupabaseAdminConfigured()) {
    return apiFail(
      "Supabase is not configured",
      503,
      "supabase_not_configured",
    );
  }
  try {
    const auth = await requirePermission("shop_catalog");
    await ctx.params;
    const body = (await req.json()) as {
      variantId?: string;
      qtyOnHand?: number;
      locationCode?: string;
    };
    if (!body.variantId) return apiFail("variantId required", 400);
    if (body.qtyOnHand == null) return apiFail("qtyOnHand required", 400);

    const inventory = await adminSetStock({
      variantId: body.variantId,
      qtyOnHand: Number(body.qtyOnHand),
      locationCode: body.locationCode,
      actorId: auth.session.userId,
    });
    return apiOk({ inventory });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return apiFail(e.message, e.status, "admin_auth");
    }
    const msg = e instanceof Error ? e.message : "Stock update failed";
    return apiFail(msg, 500);
  }
}
