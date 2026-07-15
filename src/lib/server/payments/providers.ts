/**
 * Payment gateway adapters — Paystack + Flutterwave.
 * Escrow model: capture full amount on charge; release/refund via transfer APIs.
 * When keys are missing, runs in mock mode for local/dev.
 */

import type { AppCurrency } from "@/lib/pricing";

export type PaymentProviderId = "paystack" | "flutterwave" | "mock";

export type InitChargeInput = {
  amountMinor: number;
  currency: AppCurrency;
  email: string;
  reference: string;
  callbackUrl: string;
  metadata?: Record<string, unknown>;
  channels?: string[];
};

export type InitChargeResult = {
  provider: PaymentProviderId;
  authorizationUrl: string;
  reference: string;
  accessCode?: string;
};

export type VerifyChargeResult = {
  success: boolean;
  reference: string;
  amountMinor: number;
  currency: string;
  channel?: string;
  paidAt?: string;
  raw?: unknown;
};

function paystackSecret(): string {
  return (process.env.PAYSTACK_SECRET_KEY || "").trim();
}

function flutterwaveSecret(): string {
  return (process.env.FLUTTERWAVE_SECRET_KEY || "").trim();
}

export function resolveProvider(
  preferred?: string | null
): PaymentProviderId {
  const p = (preferred || process.env.PAYMENT_PROVIDER || "").toLowerCase();
  if (p === "flutterwave" && flutterwaveSecret()) return "flutterwave";
  if (p === "paystack" && paystackSecret()) return "paystack";
  if (paystackSecret()) return "paystack";
  if (flutterwaveSecret()) return "flutterwave";
  return "mock";
}

export async function initCharge(
  input: InitChargeInput,
  preferred?: string | null
): Promise<InitChargeResult> {
  const provider = resolveProvider(preferred);

  if (provider === "paystack") {
    return initPaystack(input);
  }
  if (provider === "flutterwave") {
    return initFlutterwave(input);
  }

  // Mock: local/dev without keys
  const base =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "http://localhost:3000";
  return {
    provider: "mock",
    reference: input.reference,
    authorizationUrl: `${base}/payments/mock-checkout?ref=${encodeURIComponent(
      input.reference
    )}&amount=${input.amountMinor}&currency=${input.currency}`,
  };
}

async function initPaystack(input: InitChargeInput): Promise<InitChargeResult> {
  const secret = paystackSecret();
  const res = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: input.email,
      amount: input.amountMinor,
      currency: input.currency,
      reference: input.reference,
      callback_url: input.callbackUrl,
      channels: input.channels ?? ["card", "bank", "ussd", "bank_transfer"],
      metadata: input.metadata ?? {},
    }),
  });
  const json = (await res.json()) as {
    status?: boolean;
    message?: string;
    data?: { authorization_url?: string; access_code?: string; reference?: string };
  };
  if (!res.ok || !json.status || !json.data?.authorization_url) {
    throw new Error(json.message || "Paystack initialize failed");
  }
  return {
    provider: "paystack",
    authorizationUrl: json.data.authorization_url,
    reference: json.data.reference || input.reference,
    accessCode: json.data.access_code,
  };
}

async function initFlutterwave(
  input: InitChargeInput
): Promise<InitChargeResult> {
  const secret = flutterwaveSecret();
  const res = await fetch("https://api.flutterwave.com/v3/payments", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      tx_ref: input.reference,
      amount: input.amountMinor / 100,
      currency: input.currency,
      redirect_url: input.callbackUrl,
      customer: { email: input.email },
      customizations: {
        title: "OgaMecho",
        description: "Labour / service fee escrow",
      },
      meta: input.metadata ?? {},
      payment_options: "card,banktransfer,ussd",
    }),
  });
  const json = (await res.json()) as {
    status?: string;
    message?: string;
    data?: { link?: string };
  };
  if (!res.ok || json.status !== "success" || !json.data?.link) {
    throw new Error(json.message || "Flutterwave initialize failed");
  }
  return {
    provider: "flutterwave",
    authorizationUrl: json.data.link,
    reference: input.reference,
  };
}

export async function verifyCharge(
  reference: string,
  preferred?: string | null
): Promise<VerifyChargeResult> {
  const provider = resolveProvider(preferred);

  if (provider === "paystack") {
    const secret = paystackSecret();
    const res = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      { headers: { Authorization: `Bearer ${secret}` } }
    );
    const json = (await res.json()) as {
      status?: boolean;
      data?: {
        status?: string;
        amount?: number;
        currency?: string;
        channel?: string;
        paid_at?: string;
        reference?: string;
      };
    };
    const ok =
      Boolean(json.status) &&
      (json.data?.status === "success" || json.data?.status === "successful");
    return {
      success: ok,
      reference: json.data?.reference || reference,
      amountMinor: json.data?.amount ?? 0,
      currency: json.data?.currency || "NGN",
      channel: json.data?.channel,
      paidAt: json.data?.paid_at,
      raw: json,
    };
  }

  if (provider === "flutterwave") {
    const secret = flutterwaveSecret();
    const res = await fetch(
      `https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${encodeURIComponent(reference)}`,
      { headers: { Authorization: `Bearer ${secret}` } }
    );
    const json = (await res.json()) as {
      status?: string;
      data?: {
        status?: string;
        amount?: number;
        currency?: string;
        payment_type?: string;
        created_at?: string;
        tx_ref?: string;
      };
    };
    const ok =
      json.status === "success" &&
      (json.data?.status === "successful" || json.data?.status === "success");
    const amountMajor = Number(json.data?.amount) || 0;
    return {
      success: ok,
      reference: json.data?.tx_ref || reference,
      amountMinor: Math.round(amountMajor * 100),
      currency: json.data?.currency || "NGN",
      channel: json.data?.payment_type,
      paidAt: json.data?.created_at,
      raw: json,
    };
  }

  // Mock always succeeds when reference present
  return {
    success: true,
    reference,
    amountMinor: 0,
    currency: "NGN",
    channel: "mock",
    paidAt: new Date().toISOString(),
  };
}

/**
 * Transfer to pro bank (release 95%). Requires recipient code / bank details
 * configured on the pro profile and gateway transfer API.
 */
export async function releaseToPro(input: {
  amountMinor: number;
  currency: AppCurrency;
  reference: string;
  reason: string;
  bankCode?: string;
  accountNumber?: string;
  accountName?: string;
}): Promise<{ ok: boolean; transferRef?: string; message?: string }> {
  const provider = resolveProvider();
  if (provider === "mock") {
    return { ok: true, transferRef: `mock-xfer-${input.reference}` };
  }
  // Production: wire Paystack Transfer / Flutterwave Transfer with recipient.
  // Without full KYC recipient setup, mark as pending ops review.
  return {
    ok: false,
    message:
      "Configure Paystack/Flutterwave transfer recipients for automatic pro payout. Funds remain held in escrow.",
  };
}
