import { NextRequest } from "next/server";
import { AdminAuthError, requirePermission } from "@/lib/server/admin-auth";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { adminSetPrice } from "@/lib/server/shop/admin-catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Set price for a variant (body.variantId required; product id in path for audit). */
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
      priceMajor?: number;
      currency?: string;
    };
    if (!body.variantId) return apiFail("variantId required", 400);
    if (body.priceMajor == null) return apiFail("priceMajor required", 400);

    const price = await adminSetPrice({
      variantId: body.variantId,
      priceMajor: Number(body.priceMajor),
      currency: body.currency,
      actorId: auth.session.userId,
    });
    return apiOk({ price });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return apiFail(e.message, e.status, "admin_auth");
    }
    const msg = e instanceof Error ? e.message : "Price update failed";
    return apiFail(msg, 500);
  }
}
