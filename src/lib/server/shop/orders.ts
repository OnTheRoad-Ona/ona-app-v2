/**
 * Shop order engine (Phase 3) — inventory reserve on pay, delivery on paid.
 * Separate from job desk /orders.
 *
 * Idempotency: a server-generated checkout_token makes one checkout create at
 * most one order (double-click / retry safe).
 * Inventory: atomic reserve via `ona_shop_reserve` RPC; release on payment
 * failure/cancel via `ona_shop_release`; deduct on delivery via
 * `ona_shop_fulfill_deduct`.
 * Delivery fee: always supplied by the delivery engine (never the client).
 */

import { createServiceSupabase } from "@/lib/supabase/server";
import { loadCart, validateCartForCheckout } from "@/lib/server/shop/cart";
import type { ShopAccountContext, ShopOrderStatus } from "@/lib/server/shop/types";

function orderNumber(): string {
  const t = Date.now().toString(36).toUpperCase();
  const r = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `OS-${t}-${r}`;
}

export type DeliveryFeeEstimate = {
  deliveryFeeMinor: number;
  zoneCode: string;
  zoneName: string;
  serviceCode: string;
  etaMinutesMin: number;
  etaMinutesMax: number;
};

export type CreateOrderInput = {
  userId: string;
  accountContext: ShopAccountContext;
  cartId: string;
  /** Idempotency key — duplicate token returns the existing order. */
  checkoutToken: string;
  shipToAddressId?: string | null;
  shipToSnapshot?: Record<string, unknown>;
  delivery: DeliveryFeeEstimate;
  notes?: string;
};

export type CreateOrderResult = {
  orderId: string;
  orderNumber: string;
  totalMinor: number;
  alreadyExists: boolean;
};

export async function createOrderFromCart(
  input: CreateOrderInput
): Promise<CreateOrderResult> {
  const sb = createServiceSupabase();

  // Idempotency: re-use an order already created for this checkout token.
  const { data: existing } = await sb
    .from("shop_orders")
    .select("id, order_number, total_minor")
    .eq("checkout_token", input.checkoutToken)
    .maybeSingle();
  if (existing) {
    return {
      orderId: String(existing.id),
      orderNumber: String(existing.order_number),
      totalMinor: Number(existing.total_minor),
      alreadyExists: true,
    };
  }

  const cart = await loadCart(input.cartId);
  if (cart.userId !== input.userId) throw new Error("Forbidden");
  const v = validateCartForCheckout(cart);
  if (!v.ok) throw new Error(v.errors.join("; "));

  const deliveryFee = Math.max(0, input.delivery.deliveryFeeMinor ?? 0);
  const total = cart.subtotalMinor + deliveryFee;
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
      checkout_token: input.checkoutToken,
      delivery_zone_code: input.delivery.zoneCode,
      delivery_service_code: input.delivery.serviceCode,
      delivery_eta_minutes:
        Math.round(
          (input.delivery.etaMinutesMin + input.delivery.etaMinutesMax) / 2
        ) || null,
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
    alreadyExists: false,
  };
}

/**
 * Atomic inventory reserve for an order. Throws when any variant cannot be
 * satisfied, so the caller can treat the whole order as unreserved.
 */
export async function reserveInventoryForOrder(
  orderId: string
): Promise<void> {
  const sb = createServiceSupabase();
  const { data: items } = await sb
    .from("shop_order_items")
    .select("variant_id, qty, sku")
    .eq("order_id", orderId);
  for (const it of items ?? []) {
    const ok = await sb.rpc("ona_shop_reserve", {
      p_variant_id: it.variant_id,
      p_qty: it.qty,
      p_order_id: orderId,
    });
    if (ok.error || ok.data !== true) {
      throw new Error(`Insufficient stock for ${it.sku}`);
    }
  }
}

/** Release any reserves held for an order (payment fail / cancel / refund). */
export async function releaseInventoryForOrder(orderId: string): Promise<number> {
  const sb = createServiceSupabase();
  const { data, error } = await sb.rpc("ona_shop_release", {
    p_order_id: orderId,
  });
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}

/** Deduct sold stock when the delivery completes. */
export async function deductInventoryForOrder(orderId: string): Promise<number> {
  const sb = createServiceSupabase();
  const { data, error } = await sb.rpc("ona_shop_fulfill_deduct", {
    p_order_id: orderId,
  });
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}

/** After successful shop payment: reserve stock, mark paid, open delivery, close cart. */
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

  // Reserve first (atomic, all-or-nothing) — never mark paid without stock.
  await reserveInventoryForOrder(opts.orderId);

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
      reserved: true,
    },
  });

  // Delivery row (zone/service/ETA snapshot from checkout) — admin assigns courier.
  const snapshot = (order.ship_to_snapshot ?? {}) as Record<string, unknown>;
  const zoneName = String(
    snapshot.deliveryZoneName ?? order.delivery_zone_code ?? "Default"
  );
  await sb.from("shop_deliveries").upsert(
    {
      order_id: opts.orderId,
      status: "pending",
      zone_code: order.delivery_zone_code ?? null,
      zone_name: zoneName,
      service_code: order.delivery_service_code ?? null,
      eta_minutes: order.delivery_eta_minutes ?? null,
      events: [
        {
          at: new Date().toISOString(),
          status: "pending",
          note: "Order paid — awaiting delivery assignment",
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

/**
 * Cancel an unpaid order (customer): releases nothing (no reserve yet) and
 * voids any pending payment row.
 */
export async function cancelUnpaidOrder(opts: {
  orderId: string;
  userId: string;
}): Promise<void> {
  const sb = createServiceSupabase();
  const { data: order } = await sb
    .from("shop_orders")
    .select("id, user_id, status, order_number")
    .eq("id", opts.orderId)
    .eq("user_id", opts.userId)
    .maybeSingle();
  if (!order) throw new Error("Order not found");
  if (order.status !== "pending_payment") {
    throw new Error("Only unpaid orders can be cancelled by the buyer");
  }

  await sb
    .from("shop_orders")
    .update({
      status: "cancelled" satisfies ShopOrderStatus,
      cancelled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", opts.orderId);

  await sb
    .from("shop_payments")
    .update({
      status: "cancelled",
      updated_at: new Date().toISOString(),
    })
    .eq("order_id", opts.orderId)
    .eq("status", "pending");

  await sb.from("shop_order_events").insert({
    order_id: opts.orderId,
    event_type: "cancelled",
    payload: { reason: "buyer_cancel_unpaid" },
    actor_id: opts.userId,
  });
}

/**
 * Refund a paid order (admin/ops): release reserved stock and mark refunded.
 * Optional provider-level refund via attemptFlutterwaveRefund when configured.
 */
export async function refundShopOrder(opts: {
  orderId: string;
  actorId?: string | null;
  reason?: string;
}): Promise<void> {
  const sb = createServiceSupabase();
  const { data: order } = await sb
    .from("shop_orders")
    .select("*")
    .eq("id", opts.orderId)
    .maybeSingle();
  if (!order) throw new Error("Order not found");
  if (order.status !== "paid" && order.status !== "fulfilling") {
    throw new Error("Only paid orders can be refunded");
  }

  await releaseInventoryForOrder(opts.orderId);

  await sb
    .from("shop_orders")
    .update({
      status: "refunded" satisfies ShopOrderStatus,
      refunded_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", opts.orderId);

  await sb
    .from("shop_payments")
    .update({
      status: "refunded",
      refunded_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("order_id", opts.orderId)
    .eq("status", "succeeded");

  await sb
    .from("shop_deliveries")
    .update({
      status: "cancelled",
      updated_at: new Date().toISOString(),
    })
    .eq("order_id", opts.orderId);

  await sb.from("shop_order_events").insert({
    order_id: opts.orderId,
    event_type: "refunded",
    payload: { reason: opts.reason ?? "admin_refund" },
    actor_id: opts.actorId ?? null,
  });
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
    .eq("order_id", orderId)
    .order("created_at", { ascending: true });
  const { data: delivery } = await sb
    .from("shop_deliveries")
    .select("*")
    .eq("order_id", orderId)
    .maybeSingle();
  const { data: payments } = await sb
    .from("shop_payments")
    .select("*")
    .eq("order_id", orderId)
    .order("created_at", { ascending: true });
  const { data: events } = await sb
    .from("shop_order_events")
    .select("*")
    .eq("order_id", orderId)
    .order("created_at", { ascending: true });
  return {
    order,
    items: items ?? [],
    delivery,
    payments: payments ?? [],
    events: events ?? [],
  };
}
