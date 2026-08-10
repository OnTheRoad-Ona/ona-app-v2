import { NextRequest } from "next/server";
import { z } from "zod";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { requireUser } from "@/lib/server/auth-utils";
import { createServiceSupabase } from "@/lib/supabase/server";
import { estimateDelivery, listDeliveryZones } from "@/lib/server/shop/delivery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  addressId: z.string().uuid(),
  subtotalMinor: z.coerce.number().int().min(0).default(0),
  zoneCode: z.string().max(40).optional().nullable(),
});

/** Preview the server-computed delivery fee for an address/zone before checkout. */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireUser(req);
    if (!auth.ok) return auth.response;

    const parsed = querySchema.safeParse(
      Object.fromEntries(new URL(req.url).searchParams)
    );
    if (!parsed.success) {
      return apiFail("addressId and subtotalMinor required", 400, "invalid_query");
    }

    const sb = createServiceSupabase();
    const { data: addr } = await sb
      .from("user_addresses")
      .select("id, delivery_zone_code")
      .eq("id", parsed.data.addressId)
      .eq("user_id", auth.userId)
      .maybeSingle();
    if (!addr) {
      return apiFail("Delivery address not found", 404, "address_not_found");
    }

    const estimate = await estimateDelivery({
      addressId: String(addr.id),
      userId: auth.userId,
      zoneCode: parsed.data.zoneCode || addr.delivery_zone_code || null,
      subtotalMinor: parsed.data.subtotalMinor,
    });
    const zones = await listDeliveryZones();

    return apiOk({
      estimate,
      zones: zones.map((z) => ({ code: z.code, name: z.name })),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Estimate failed";
    return apiFail(msg, 500, "SHOP_DELIVERY_ESTIMATE_ERROR");
  }
}
