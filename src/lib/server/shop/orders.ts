/**
 * Shop order engine — inventory reserve on pay, delivery row on paid.
 * Separate from job desk /orders.
 */

import { createServiceSupabase } from "@/lib/supabase/server";
import { loadCart, validateCartForCheckout } from "@/lib/server/shop/cart";
import type { ShopAccountContext, ShopOrderStatus } from "@/lib/server/shop/types";

function orderNumber(): string {
  const t = Date.now().toString(36).toUpperCase();
  const r = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `OS-${t}-${r}`;
}

export type CreateOrderInput = {
  userId: string;
  accountContext: ShopAccountContext;
  cartId: string;
  shipToAddressId?: string | null;
  shipToSnapshot?: Record<string, unknown>;
  deliveryFeeMinor?: number;
  notes?: string;
};

export async function createOrderFromCart(
  input: CreateOrderInput
): Promise<{ orderId: string; orderNumber: string; totalMinor: number }> {
  const cart = await loadCart(input.cartId);
  if (cart.userId !== input.userId) throw new Error("Forbidden");
  const v = validateCartForCheckout(cart);
  if (!v.ok) throw new Error(v.errors.join("; "));

  const deliveryFee = Math.max(0, input.deliveryFeeMinor ?? 0);
  const total = cart.subtotalMinor + deliveryFee;
  const sb = createServiceSupabase();
  const num = orderNumber();

  const { data: order, error } = await sb
    .from("shop_orders")
    .insert({
      order_number: num,
      user_id: input.userId,
      account_context: input.accountContext,
      status: "pending_payment",
      currency: cart.currency || "NGN",
      subtotal_minor: cart.subtotalMinor,
      delivery_fee_minor: deliveryFee,
      discount_minor: 0,
      total_minor: total,
      ship_to_address_id: input.shipToAddressId || null,
      ship_to_snapshot: input.shipToSnapshot || {},
      notes: input.notes || null,
    })
    .select("id, order_number, total_minor")
    .single();
  if (error || !order) throw new Error(error?.message || "Order create failed");

  for (const line of cart.items) {
    const { error: ie } = await sb.from("shop_order_items").insert({
      order_id: order.id,
      variant_id: line.variantId,
      product_name: line.productName,
      variant_title: line.variantTitle,
      sku: line.sku,
      qty: line.qty,
      unit_price_minor: line.unitPriceMinor,
      line_total_minor: line.lineTotalMinor,
    });
    if (ie) throw new Error(ie.message);
  }

  await sb.from("shop_order_events").insert({
    order_id: order.id,
    event_type: "created",
    payload: { cartId: cart.id, itemCount: cart.itemCount },
    actor_id: input.userId,
  });

  return {
    orderId: String(order.id),
    orderNumber: String(order.order_number),
    totalMinor: Number(order.total_minor),
  };
}

/** After successful shop payment: mark paid, reserve stock, open delivery, close cart. */
export async function markShopOrderPaid(opts: {
  orderId: string;
  paymentId: string;
  providerRef: string;
}): Promise<void> {
  const sb = createServiceSupabase();
  const { data: order } = await sb
    .from("shop_orders")
    .select("*")
    .eq("id", opts.orderId)
    .maybeSingle();
  if (!order) throw new Error("Order not found");
  if (order.status === "paid" || order.status === "fulfilling") return;

  const { data: items } = await sb
    .from("shop_order_items")
    .select("*")
    .eq("order_id", opts.orderId);

  // Reserve inventory at first active location for each variant
  for (const it of items ?? []) {
    const variantId = String(it.variant_id);
    const qty = Number(it.qty);
    const { data: invRows } = await sb
      .from("shop_inventory")
      .select("*")
      .eq("variant_id", variantId)
      .order("qty_on_hand", { ascending: false })
      .limit(1);
    const inv = invRows?.[0];
    if (!inv) continue;
    const onHand = Number(inv.qty_on_hand);
    const reserved = Number(inv.qty_reserved);
    const avail = onHand - reserved;
    if (avail < qty) {
      throw new Error(`Insufficient stock for ${it.sku}`);
    }
    await sb
      .from("shop_inventory")
      .update({
        qty_reserved: reserved + qty,
        updated_at: new Date().toISOString(),
      })
      .eq("id", inv.id);

    await sb.from("shop_inventory_transactions").insert({
      variant_id: variantId,
      location_id: inv.location_id,
      delta: -qty,
      reason: "reserve_on_pay",
      ref_type: "shop_order",
      ref_id: opts.orderId,
    });
  }

  await sb
    .from("shop_orders")
    .update({
      status: "paid" satisfies ShopOrderStatus,
      paid_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", opts.orderId);

  await sb.from("shop_order_events").insert({
    order_id: opts.orderId,
    event_type: "paid",
    payload: {
      paymentId: opts.paymentId,
      providerRef: opts.providerRef,
    },
  });

  // Delivery stub for admin assign later
  await sb.from("shop_deliveries").upsert(
    {
      order_id: opts.orderId,
      status: "pending",
      events: [
        {
          at: new Date().toISOString(),
          status: "pending",
          note: "Awaiting courier assignment",
        },
      ],
    },
    { onConflict: "order_id" }
  );

  // Close any open cart for this user (best effort)
  const userId = String(order.user_id);
  const ctx = String(order.account_context);
  const { data: openCart } = await sb
    .from("shop_carts")
    .select("id")
    .eq("user_id", userId)
    .eq("account_context", ctx)
    .eq("status", "open")
    .maybeSingle();
  if (openCart) {
    await sb.from("shop_cart_items").delete().eq("cart_id", openCart.id);
    await sb
      .from("shop_carts")
      .update({ status: "converted", updated_at: new Date().toISOString() })
      .eq("id", openCart.id);
  }

  // Notify buyer
  try {
    const { insertNotification } = await import(
      "@/lib/server/notifications"
    );
    await insertNotification({
      userId,
      category: "payments",
      title: "Shop order paid",
      body: `Order ${order.order_number} is confirmed.`,
      href: `/shop/orders/${opts.orderId}`,
      groupKey: `shop-paid-${opts.orderId}`,
    });
  } catch {
    /* optional */
  }
}

export async function getUserOrders(
  userId: string,
  accountContext: ShopAccountContext = "motorist",
  limit = 30
) {
  const sb = createServiceSupabase();
  const { data, error } = await sb
    .from("shop_orders")
    .select("id, order_number, status, total_minor, currency, created_at, paid_at")
    .eq("user_id", userId)
    .eq("account_context", accountContext)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getOrderForUser(
  orderId: string,
  userId: string,
  accountContext: ShopAccountContext = "motorist"
) {
  const sb = createServiceSupabase();
  const { data: order, error } = await sb
    .from("shop_orders")
    .select("*")
    .eq("id", orderId)
    .eq("user_id", userId)
    .eq("account_context", accountContext)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!order) return null;
  const { data: items } = await sb
    .from("shop_order_items")
    .select("*")
    .eq("order_id", orderId);
  const { data: delivery } = await sb
    .from("shop_deliveries")
    .select("*")
    .eq("order_id", orderId)
    .maybeSingle();
  return { order, items: items ?? [], delivery };
}
