/**
 * Ona Express upfront payment (base fee + call-out) via Flutterwave.
 * Separate ledger: ona_express_payments. NEVER job escrow, never shop.
 */

import { createServiceSupabase } from "@/lib/supabase/server";
import {
  createFlutterwaveBankTransfer,
  verifyCharge,
  type BankTransferInstructions,
} from "@/lib/server/payments/providers";

/**
 * Express payment on the SAME rails as the normal job checkout:
 * server creates a Flutterwave virtual account; customer transfers in-app;
 * polling verifies and triggers final assignment.
 */
export async function startExpressBankTransfer(input: {
  requestId: string;
  userId: string;
  email: string;
  customerName?: string | null;
  customerPhone?: string | null;
  urgency: string;
}): Promise<{
  reference: string;
  amountMajor: number;
  sessionEndsAt: string;
  bankTransfer: BankTransferInstructions | null;
}> {
  const PAYMENT_WINDOW_MS = 20 * 60 * 1000;

const sb = createServiceSupabase();
  const booking = await getExpressBookingSafe(input.requestId);
  if (!booking) throw new Error("Booking not found");

  const { computeExpressQuote } = await import(
    "@/lib/server/express/quote",
  );
  const quote = await computeExpressQuote(
    booking.service_type,
    Number(booking.pickup_lat ?? 0),
    Number(booking.pickup_lng ?? 0),
    input.urgency,
  );
  if (!(quote.totalMajor > 0)) throw new Error("Invalid express amount");

  // Expire any previous pending session for this booking
  await sb
    .from("ona_express_payments")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("request_id", input.requestId)
    .eq("status", "pending");

  const reference = `exp_${input.requestId.replace(/-/g, "").slice(0, 12)}_${Date.now().toString(36)}`;
  const sessionEndsAt = new Date(
    Date.now() + PAYMENT_WINDOW_MS,
  ).toISOString();

  const va = await createFlutterwaveBankTransfer({
    amountMajor: quote.totalMajor,
    currency: "NGN",
    email: input.email,
    customerName: input.customerName || null,
    customerPhone: input.customerPhone || null,
    reference,
    narration: `Ona Express · ${booking.service_type}`.slice(0, 80),
    transferNote:
      "Pay into Ona (account below). Transfer the exact amount only.",
    accountDisplayName: "Ona",
  });
  if (!va.ok) throw new Error(va.error);

  const { error } = await sb.from("ona_express_payments").insert({
    request_id: input.requestId,
    user_id: input.userId,
    provider: "flutterwave",
    provider_ref: reference,
    amount_minor: Math.round(quote.totalMajor * 100),
    base_minor: Math.round(quote.baseChargeMajor * 100),
    callout_minor: Math.round(quote.distanceChargeMajor * 100),
    currency: "NGN",
    status: "pending",
    raw_init: { bankTransfer: va.instructions, urgency: input.urgency },
    idempotency_key: reference,
  });
  if (error) throw new Error(`express payment insert: ${error.message}`);

  return {
    reference,
    amountMajor: quote.totalMajor,
    sessionEndsAt,
    bankTransfer: va.instructions,
  };
}


export async function verifyExpressPayment(opts: {
  reference: string;
  userId: string;
}): Promise<{
  success: boolean;
  assignedProId: string | null;
  assignedProName: string | null;
  trade: string | null;
}> {
  const sb = createServiceSupabase();
  const { data: payment } = await sb
    .from("ona_express_payments")
    .select("*")
    .eq("provider_ref", opts.reference)
    .eq("user_id", opts.userId)
    .maybeSingle();
  if (!payment) throw new Error("Payment not found");

  if (payment.status === "paid") {
    const named = await assignedProIdentity(
      sb,
      payment.assigned_pro_id,
      String(payment.request_id),
    );
    return {
      success: true,
      assignedProId: payment.assigned_pro_id ?? null,
      ...named,
    };
  }

  const verified = await verifyCharge(
    String(payment.provider_ref),
    payment.provider as "flutterwave" | "paystack" | "mock",
  );

  if (!verified.success) {
    await sb
      .from("ona_express_payments")
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .eq("id", payment.id);
    return {
      success: false,
      assignedProId: null,
      assignedProName: null,
      trade: null,
    };
  }

  // Amount check (tolerance 1 minor unit); mock carries no real amount.
  const amountOk =
    payment.provider === "mock"
      ? true
      : Math.abs(Number(verified.amountMinor) - Number(payment.amount_minor)) <=
        1;
  if (!amountOk) {
    await sb
      .from("ona_express_payments")
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .eq("id", payment.id);
    throw new Error("Payment amount mismatch");
  }

  // Idempotent finalization: claim the row before assigning.
  const { data: claimed } = await sb
    .from("ona_express_payments")
    .update({
      status: "paid",
      paid_at: verified.paidAt || new Date().toISOString(),
    })
    .eq("id", payment.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  const booking = await getExpressBookingSafe(String(payment.request_id));
  if (!booking) throw new Error("Booking not found");

  let assignedProId: string | null = null;
  if (claimed) {
    try {
      const assigned = await assignNearestExpressPro({
        requestId: booking.id,
        trade: booking.service_type,
        lat: Number(booking.pickup_lat ?? 0),
        lng: Number(booking.pickup_lng ?? 0),
        motoristName: "",
      });
      assignedProId = assigned?.proId ?? null;
    } catch {
      /* pool empty stays unassigned; admin desk can force-assign */
    }
    await sb
      .from("ona_express_payments")
      .update({ assigned_pro_id: assignedProId })
      .eq("id", payment.id);
  } else {
    const { data: fresh } = await sb
      .from("ona_express_payments")
      .select("assigned_pro_id")
      .eq("id", payment.id)
      .maybeSingle();
    assignedProId = fresh?.assigned_pro_id ?? null;
  }

  const named = await assignedProIdentity(sb, assignedProId, booking.id);
  return { success: true, assignedProId, ...named };
}

/** Pro display name + detected trade for the assignment screen. */
async function assignedProIdentity(
  sb: ReturnType<typeof createServiceSupabase>,
  proId: string | null,
  requestId: string,
): Promise<{ assignedProName: string | null; trade: string | null }> {
  let trade: string | null = null;
  if (requestId) {
    const { data } = await sb
      .from("service_requests")
      .select("service_type")
      .eq("id", requestId)
      .maybeSingle();
    trade = data?.service_type ? String(data.service_type) : null;
  }
  if (!proId) return { assignedProName: null, trade };
  const { data: pro } = await sb
    .from("profiles")
    .select("full_name")
    .eq("id", proId)
    .maybeSingle();
  return {
    assignedProName: pro?.full_name ? String(pro.full_name) : null,
    trade,
  };
}

async function getExpressBookingSafe(requestId: string) {
  const { getExpressBooking } = await import("@/lib/server/express/store");
  return getExpressBooking(requestId);
}

async function assignNearestExpressPro(opts: {
  requestId: string;
  trade: string;
  lat: number;
  lng: number;
  motoristName: string;
}) {
  const { assignNearestExpressPro: fn } =
    await import("@/lib/server/express/store");
  return fn(opts);
}
