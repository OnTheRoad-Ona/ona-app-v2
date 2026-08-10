/**
 * Phase 3 E2E integration verification against the real Supabase DB.
 * Creates a throwaway user + address, runs cart → delivery estimate →
 * checkout (idempotent) → payment init → verify (reserve → paid → delivery
 * row → cart closed), then refunds and cleans up its rows.
 *
 * Usage: npx tsx scripts/shop-e2e-verify.mts [--keep]
 */

import { createServiceSupabase } from "@/lib/supabase/server";
import { config } from "dotenv";

config({ path: ".env.local" });
// Force the mock provider so the E2E verify path is deterministic (no live keys).
process.env.PAYMENT_PROVIDER = "mock";
import { getOrCreateCart, addToCart, validateCartForCheckout } from "@/lib/server/shop/cart";
import { estimateDelivery } from "@/lib/server/shop/delivery";
import { createOrderFromCart, refundShopOrder } from "@/lib/server/shop/orders";
import { createShopPaymentAndInit, verifyShopPayment } from "@/lib/server/shop/payments";
import { createHash } from "node:crypto";

const KEEP = process.argv.includes("--keep");
type DB = ReturnType<typeof createServiceSupabase>;

async function main() {
  const sb = createServiceSupabase();
  const stamp = Date.now().toString(36);
  const email = `e2e-${stamp}@ona.app`;

  // 1. Throwaway auth user + auto-created profile (on_auth_user_created trigger)
  const { data: created, error: ce } = await sb.auth.admin.createUser({
    email,
    password: `E2ePass!${stamp}`,
    email_confirm: true,
    user_metadata: {
      role: "motorist",
      full_name: "E2E Verify",
    },
  });
  if (ce || !created?.user) throw new Error("auth user: " + (ce?.message ?? "none"));
  const userId = created.user.id as string;
  console.log("user", userId);

  const { error: roleErr } = await sb
    .from("profiles")
    .update({ role: "motorist", primary_role: "motorist" })
    .eq("id", userId);
  if (roleErr) throw new Error("profile role: " + roleErr.message);

  try {
    // 2. Address
    const { data: addr, error: ae } = await sb
      .from("user_addresses")
      .insert({
        user_id: userId,
        label: "E2E Home",
        address_text: "12 Test Road, Ikoyi",
        is_default: true,
        delivery_zone_code: "island",
      })
      .select("id")
      .single();
    if (ae || !addr) throw new Error("address: " + (ae?.message ?? "none"));

    // 3. Pick a stocked variant
    const { data: variant } = await sb
      .from("shop_product_variants")
      .select("id, product_id, sku")
      .eq("status", "active")
      .limit(1)
      .single();
    if (!variant) throw new Error("no active variant");

    // 4. Cart
    const ctx: "motorist" | "professional" = "motorist";
    const cart = await getOrCreateCart(userId, ctx);
    await addToCart({
      userId,
      accountContext: ctx,
      variantId: variant.id as string,
      qty: 2,
    });
    const cartWithItems = await getOrCreateCart(userId, ctx);
    const v = validateCartForCheckout(cartWithItems);
    if (!v.ok) throw new Error("cart invalid: " + v.errors.join("; "));
    console.log("cart subtotal", cartWithItems.subtotalMinor, "items", cartWithItems.itemCount);

    // 5. Delivery estimate (server-computed)
    const delivery = await estimateDelivery({
      addressId: addr.id as string,
      userId,
      zoneCode: "island",
      subtotalMinor: cartWithItems.subtotalMinor,
    });
    console.log("delivery", JSON.stringify(delivery));

    // 6. Checkout (idempotent on checkout_token)
    const itemSig = cartWithItems.items
      .map((i) => `${i.variantId}:${i.qty}`)
      .join("|");
    const checkoutToken = `cart:${cart.id}:${createHash("sha256")
      .update(itemSig)
      .digest("hex")
      .slice(0, 16)}`;
    const orderArgs = {
      userId,
      accountContext: ctx,
      cartId: cart.id,
      checkoutToken,
      shipToAddressId: addr.id as string,
      shipToSnapshot: {
        id: addr.id,
        label: "E2E Home",
        address: "12 Test Road, Ikoyi",
        deliveryZoneCode: delivery.zoneCode,
        deliveryZoneName: delivery.zoneName,
      },
      delivery: {
        deliveryFeeMinor: delivery.deliveryFeeMinor,
        zoneCode: delivery.zoneCode,
        zoneName: delivery.zoneName,
        serviceCode: delivery.serviceCode,
        etaMinutesMin: delivery.etaMinutesMin,
        etaMinutesMax: delivery.etaMinutesMax,
      },
      notes: "E2E verification",
    };
    const order1 = await createOrderFromCart(orderArgs);
    console.log("order1", order1.orderId, "alreadyExists", order1.alreadyExists);
    const order2 = await createOrderFromCart(orderArgs);
    if (order2.orderId !== order1.orderId) throw new Error("idempotency broken");
    console.log("idempotent OK — same order id", order2.orderId);

    // 7. Payment init
    const pay = await createShopPaymentAndInit({
      orderId: order1.orderId,
      userId,
      email,
      customerName: "E2E Verify",
      idempotencyKey: `shop-checkout-${order1.orderId}`,
    });
    console.log("payment", pay.provider, pay.reference, "amount", pay.amountMinor);

    // 8. Verify → reserve + paid + delivery row + cart closed
    const reservedBefore = await reservedQty(sb, variant.id as string);
    const ver = await verifyShopPayment({ reference: pay.reference, userId });
    console.log("verify", JSON.stringify(ver));
    const reservedAfter = await reservedQty(sb, variant.id as string);
    if (reservedAfter <= reservedBefore) {
      throw new Error("inventory was NOT reserved on payment");
    }
    console.log("reserve OK", reservedBefore, "->", reservedAfter);

    const { data: orderRow } = await sb
      .from("shop_orders")
      .select("status, refunded_at")
      .eq("id", order1.orderId)
      .single();
    if (orderRow?.status !== "paid") throw new Error("order not paid");
    console.log("order status", orderRow.status);

    const { data: deliv } = await sb
      .from("shop_deliveries")
      .select("status, zone_name, service_code, eta_minutes")
      .eq("order_id", order1.orderId)
      .single();
    console.log("delivery row", JSON.stringify(deliv));
    if (deliv?.status !== "pending") throw new Error("delivery not pending");

    const { data: openCart } = await sb
      .from("shop_carts")
      .select("status")
      .eq("id", cart.id)
      .single();
    if (openCart?.status !== "converted") throw new Error("cart not converted");
    console.log("cart converted OK");

    // 9. Refund → release inventory + refunded_at
    const released = await refundShopOrder({
      orderId: order1.orderId,
      actorId: userId,
      reason: "e2e cleanup",
    });
    const reservedAfterRefund = await reservedQty(sb, variant.id as string);
    console.log("refund released", released, "reserved now", reservedAfterRefund);

    const { data: payRow } = await sb
      .from("shop_payments")
      .select("status, refunded_at")
      .eq("order_id", order1.orderId)
      .single();
    console.log("payment after refund", JSON.stringify(payRow));

    console.log("E2E VERIFY PASSED");
  } finally {
    if (!KEEP) {
      await cleanup(sb, userId);
      console.log("cleaned up user", userId);
    }
  }
}

async function reservedQty(sb: DB, variantId: string): Promise<number> {
  const { data } = await sb
    .from("shop_inventory")
    .select("qty_on_hand, qty_reserved")
    .eq("variant_id", variantId);
  return (data ?? []).reduce(
    (s, r) => s + (Number(r.qty_reserved) || 0),
    0
  );
}

async function cleanup(sb: DB, userId: string) {
  const { data: orders } = await sb
    .from("shop_orders")
    .select("id")
    .eq("user_id", userId);
  for (const o of orders ?? []) {
    await sb.from("shop_order_events").delete().eq("order_id", o.id);
    await sb.from("shop_order_items").delete().eq("order_id", o.id);
    await sb.from("shop_payments").delete().eq("order_id", o.id);
    await sb.from("shop_deliveries").delete().eq("order_id", o.id);
    await sb.from("shop_orders").delete().eq("id", o.id);
  }
  const { data: carts } = await sb
    .from("shop_carts")
    .select("id")
    .eq("user_id", userId);
  for (const c of carts ?? []) {
    await sb.from("shop_cart_items").delete().eq("cart_id", c.id);
    await sb.from("shop_carts").delete().eq("id", c.id);
  }
  await sb.from("user_addresses").delete().eq("user_id", userId);
  await sb.from("profiles").delete().eq("id", userId);
  await sb.auth.admin.deleteUser(userId);
}

main().catch((e) => {
  console.error("E2E FAILED:", e.message || e);
  process.exit(1);
});
