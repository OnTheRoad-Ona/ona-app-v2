import { NextRequest } from "next/server";
import { z } from "zod";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { requireUser } from "@/lib/server/auth-utils";
import { createServiceSupabase } from "@/lib/supabase/server";
import {
  getOrCreateCart,
  validateCartForCheckout,
} from "@/lib/server/shop/cart";
import { createOrderFromCart } from "@/lib/server/shop/orders";
import { createShopPaymentAndInit } from "@/lib/server/shop/payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  accountContext: z.enum(["motorist", "professional"]).optional(),
  addressId: z.string().uuid().optional().nullable(),
  deliveryFeeMinor: z.number().int().min(0).optional(),
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

    let shipSnapshot: Record<string, unknown> = {};
    if (parsed.data.addressId) {
      const sb = createServiceSupabase();
      const { data: addr } = await sb
        .from("user_addresses")
        .select("*")
        .eq("id", parsed.data.addressId)
        .eq("user_id", auth.userId)
        .maybeSingle();
      if (addr) {
        shipSnapshot = {
          id: addr.id,
          label: addr.label,
          address: addr.address_text || addr.address || addr.line1,
          lat: addr.lat,
          lng: addr.lng,
        };
      }
    }

    // Flat delivery fee placeholder (admin/courier later) — ₦1,500 default Lagos hub
    const deliveryFeeMinor =
      parsed.data.deliveryFeeMinor ??
      (cart.subtotalMinor > 0 ? 1500_00 : 0);

    const order = await createOrderFromCart({
      userId: auth.userId,
      accountContext: ctx,
      cartId: cart.id,
      shipToAddressId: parsed.data.addressId || null,
      shipToSnapshot: shipSnapshot,
      deliveryFeeMinor,
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
      totalMinor: order.totalMinor,
      payment: {
        paymentId: pay.paymentId,
        reference: pay.reference,
        authorizationUrl: pay.authorizationUrl,
        provider: pay.provider,
        amountMinor: pay.amountMinor,
      },
      deliveryFeeMinor,
      subtotalMinor: cart.subtotalMinor,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Checkout failed";
    return apiFail(msg, 500, "SHOP_CHECKOUT_ERROR");
  }
}
