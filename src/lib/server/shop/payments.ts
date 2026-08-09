/**
 * Shop pay-now via Flutterwave — NEVER uses job escrow store.
 */

import { createServiceSupabase } from "@/lib/supabase/server";
import {
  initCharge,
  resolveProvider,
  verifyCharge,
} from "@/lib/server/payments/providers";
import type { AppCurrency } from "@/lib/pricing";
import { markShopOrderPaid } from "@/lib/server/shop/orders";

export async function createShopPaymentAndInit(opts: {
  orderId: string;
  userId: string;
  email: string;
  customerName?: string | null;
  customerPhone?: string | null;
  idempotencyKey?: string;
}): Promise<{
  paymentId: string;
  reference: string;
  authorizationUrl: string;
  provider: string;
  amountMinor: number;
}> {
  const sb = createServiceSupabase();
  const { data: order } = await sb
    .from("shop_orders")
    .select("*")
    .eq("id", opts.orderId)
    .eq("user_id", opts.userId)
    .maybeSingle();
  if (!order) throw new Error("Order not found");
  if (order.status !== "pending_payment") {
    throw new Error(`Order is ${order.status}, cannot pay`);
  }

  const amountMinor = Number(order.total_minor);
  if (amountMinor <= 0) throw new Error("Invalid order total");

  // Idempotent: existing pending payment
  if (opts.idempotencyKey) {
    const { data: existing } = await sb
      .from("shop_payments")
      .select("*")
      .eq("idempotency_key", opts.idempotencyKey)
      .maybeSingle();
    if (existing?.provider_ref && existing.status === "pending") {
      return {
        paymentId: String(existing.id),
        reference: String(existing.provider_ref),
        authorizationUrl: String(
          (existing.raw_init as { authorizationUrl?: string } | null)
            ?.authorizationUrl || ""
        ),
        provider: String(existing.provider),
        amountMinor: Number(existing.amount_minor),
      };
    }
  }

  const reference = `shop_${opts.orderId.slice(0, 8)}_${Date.now().toString(36)}`;
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "http://localhost:3000";
  const callbackUrl = `${appUrl}/shop/checkout/callback?ref=${encodeURIComponent(
    reference
  )}&order=${encodeURIComponent(opts.orderId)}`;

  const provider = resolveProvider(null);
  const currency = (order.currency || "NGN") as AppCurrency;

  const init = await initCharge({
    amountMinor,
    currency,
    email: opts.email,
    customerName: opts.customerName,
    customerPhone: opts.customerPhone,
    reference,
    callbackUrl,
    metadata: {
      kind: "ona_shop",
      orderId: opts.orderId,
      orderNumber: order.order_number,
      userId: opts.userId,
      // Explicitly no job escrow fields
      shop: true,
    },
    // No pro subaccount split for retail
    proSubaccountId: null,
  });

  const { data: payment, error } = await sb
    .from("shop_payments")
    .insert({
      order_id: opts.orderId,
      user_id: opts.userId,
      provider: init.provider,
      provider_ref: init.reference,
      amount_minor: amountMinor,
      currency,
      status: "pending",
      raw_init: init,
      idempotency_key: opts.idempotencyKey || null,
    })
    .select("id")
    .single();
  if (error || !payment) throw new Error(error?.message || "Payment row failed");

  await sb.from("shop_order_events").insert({
    order_id: opts.orderId,
    event_type: "payment_init",
    payload: { paymentId: payment.id, reference: init.reference, provider },
    actor_id: opts.userId,
  });

  return {
    paymentId: String(payment.id),
    reference: init.reference,
    authorizationUrl: init.authorizationUrl,
    provider: init.provider,
    amountMinor,
  };
}

export async function verifyShopPayment(opts: {
  reference: string;
  userId?: string;
}): Promise<{
  success: boolean;
  orderId: string | null;
  alreadyPaid?: boolean;
}> {
  const sb = createServiceSupabase();
  const { data: payment } = await sb
    .from("shop_payments")
    .select("*")
    .eq("provider_ref", opts.reference)
    .maybeSingle();
  if (!payment) throw new Error("Shop payment not found");
  if (opts.userId && payment.user_id !== opts.userId) {
    throw new Error("Forbidden");
  }

  if (payment.status === "succeeded") {
    return {
      success: true,
      orderId: String(payment.order_id),
      alreadyPaid: true,
    };
  }

  const verified = await verifyCharge(
    opts.reference,
    payment.provider as "flutterwave" | "paystack" | "mock"
  );

  if (!verified.success) {
    await sb
      .from("shop_payments")
      .update({
        status: "failed",
        raw_verify: verified.raw ?? verified,
        updated_at: new Date().toISOString(),
      })
      .eq("id", payment.id);
    return { success: false, orderId: String(payment.order_id) };
  }

  // Amount check (tolerance 1 minor unit)
  if (
    Math.abs(Number(verified.amountMinor) - Number(payment.amount_minor)) > 1
  ) {
    await sb
      .from("shop_payments")
      .update({
        status: "failed",
        raw_verify: { ...((verified.raw as object) || {}), amountMismatch: true },
        updated_at: new Date().toISOString(),
      })
      .eq("id", payment.id);
    throw new Error("Payment amount mismatch");
  }

  await sb
    .from("shop_payments")
    .update({
      status: "succeeded",
      paid_at: verified.paidAt || new Date().toISOString(),
      raw_verify: verified.raw ?? verified,
      updated_at: new Date().toISOString(),
    })
    .eq("id", payment.id);

  await markShopOrderPaid({
    orderId: String(payment.order_id),
    paymentId: String(payment.id),
    providerRef: opts.reference,
  });

  return { success: true, orderId: String(payment.order_id) };
}
