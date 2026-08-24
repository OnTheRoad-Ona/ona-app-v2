import { NextRequest } from "next/server";
import { z } from "zod";
import { createHash } from "node:crypto";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { requireUser } from "@/lib/server/auth-utils";
import { createServiceSupabase } from "@/lib/supabase/server";
import {
  getOrCreateCart,
  validateCartForCheckout,
} from "@/lib/server/shop/cart";
import { createOrderFromCart } from "@/lib/server/shop/orders";
import { createShopPaymentAndInit } from "@/lib/server/shop/payments";
import { estimateDelivery } from "@/lib/server/shop/delivery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  accountContext: z.enum(["motorist", "professional"]).optional(),
  addressId: z.string().uuid().optional().nullable(),
  zoneCode: z.string().max(40).optional().nullable(),
  notes: z.string().max(500).optional(),
  email: z.string().email().optional(),
});

/** Create order from cart + init FLW pay-now (no escrow). */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireUser(req);
    if (!auth.ok) return auth.response;

    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return apiFail("Invalid body", 400, "invalid_body");

    const ctx = parsed.data.accountContext ?? "motorist";
    const cart = await getOrCreateCart(auth.userId, ctx);
    const v = validateCartForCheckout(cart);
    if (!v.ok) return apiFail(v.errors.join("; "), 400, "cart_invalid");

    // Delivery address is mandatory for a payable order.
    if (!parsed.data.addressId) {
      return apiFail("A delivery address is required", 400, "address_required");
    }

    const sb = createServiceSupabase();
    const { data: addr } = await sb
      .from("user_addresses")
      .select("*")
      .eq("id", parsed.data.addressId)
      .eq("user_id", auth.userId)
      .maybeSingle();
    if (!addr) {
      return apiFail("Delivery address not found", 404, "address_not_found");
    }

    // Persist chosen zone on the address so future checkouts remember it.
    if (parsed.data.zoneCode) {
      await sb
        .from("user_addresses")
        .update({ delivery_zone_code: parsed.data.zoneCode })
        .eq("id", addr.id)
        .eq("user_id", auth.userId);
    }

    const shipSnapshot = {
      id: addr.id,
      label: addr.label,
      address: addr.address_text || addr.address || addr.line1,
      lat: addr.lat,
      lng: addr.lng,
    };

    // Delivery fee is ALWAYS server-computed by the delivery engine.
    const delivery = await estimateDelivery({
      addressId: String(addr.id),
      userId: auth.userId,
      zoneCode: parsed.data.zoneCode || addr.delivery_zone_code || null,
      subtotalMinor: cart.subtotalMinor,
    });

    const shipToSnapshot = {
      ...shipSnapshot,
      deliveryZoneCode: delivery.zoneCode,
      deliveryZoneName: delivery.zoneName,
      deliveryServiceCode: delivery.serviceCode,
    };

    // Idempotent checkout token: same cart + same items => same order.
    const itemSig = cart.items.map((i) => `${i.variantId}:${i.qty}`).join("|");
    const checkoutToken = `cart:${cart.id}:${createHash("sha256")
      .update(itemSig)
      .digest("hex")
      .slice(0, 16)}`;

    const order = await createOrderFromCart({
      userId: auth.userId,
      accountContext: ctx,
      cartId: cart.id,
      checkoutToken,
      shipToAddressId: String(addr.id),
      shipToSnapshot: shipToSnapshot,
      delivery: {
        deliveryFeeMinor: delivery.deliveryFeeMinor,
        zoneCode: delivery.zoneCode,
        zoneName: delivery.zoneName,
        serviceCode: delivery.serviceCode,
        etaMinutesMin: delivery.etaMinutesMin,
        etaMinutesMax: delivery.etaMinutesMax,
      },
      notes: parsed.data.notes,
    });

    const email =
      parsed.data.email ||
      auth.email ||
      auth.user.email ||
      `user-${auth.userId.slice(0, 8)}@ona.app`;

    const pay = await createShopPaymentAndInit({
      orderId: order.orderId,
      userId: auth.userId,
      email,
      customerName: auth.user.user_metadata?.full_name || null,
      customerPhone: auth.user.phone || null,
      idempotencyKey: `shop-checkout-${order.orderId}`,
    });

    return apiOk({
      orderId: order.orderId,
      orderNumber: order.orderNumber,
      alreadyExists: order.alreadyExists,
      totalMinor: order.totalMinor,
      payment: {
        paymentId: pay.paymentId,
        reference: pay.reference,
        authorizationUrl: pay.authorizationUrl,
        provider: pay.provider,
        amountMinor: pay.amountMinor,
      },
      delivery: {
        deliveryFeeMinor: delivery.deliveryFeeMinor,
        zoneCode: delivery.zoneCode,
        zoneName: delivery.zoneName,
        serviceCode: delivery.serviceCode,
        etaMinutesMin: delivery.etaMinutesMin,
        etaMinutesMax: delivery.etaMinutesMax,
        freeDelivery: delivery.freeDelivery,
      },
      subtotalMinor: cart.subtotalMinor,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Checkout failed";
    return apiFail(msg, 500, "SHOP_CHECKOUT_ERROR");
  }
}
