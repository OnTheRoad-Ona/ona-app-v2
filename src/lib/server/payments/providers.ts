/**
 * Payment gateway adapters — Flutterwave (default) + Paystack.
 * Escrow: capture full labour fee on charge; release/refund via transfer APIs.
 * Split payments: optional Flutterwave subaccount split when configured.
 * When keys are missing, runs in mock mode for local/dev.
 */

import type { AppCurrency } from "@/lib/pricing";

export type PaymentProviderId = "paystack" | "flutterwave" | "mock";

export type InitChargeInput = {
  amountMinor: number;
  currency: AppCurrency;
  email: string;
  /** Customer full name — Flutterwave hosted checkout prefers this */
  customerName?: string | null;
  /** Customer phone — Flutterwave hosted checkout prefers this */
  customerPhone?: string | null;
  reference: string;
  callbackUrl: string;
  metadata?: Record<string, unknown>;
  channels?: string[];
  /** Pro Flutterwave subaccount id (RS_…) for split — optional */
  proSubaccountId?: string | null;
  /** Platform share percent (default 5) when split enabled */
  platformFeePercent?: number;
};

export type InitChargeResult = {
  provider: PaymentProviderId;
  authorizationUrl: string;
  reference: string;
  accessCode?: string;
  splitEnabled?: boolean;
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

export function flutterwavePublicKey(): string {
  return (
    process.env.NEXT_PUBLIC_FLUTTERWAVE_PUBLIC_KEY ||
    process.env.FLUTTERWAVE_PUBLIC_KEY ||
    ""
  ).trim();
}

/**
 * Split-on-collection is OFF by default for escrow.
 * Escrow holds full labour on the main Ona merchant, then Transfer API pays pros.
 * Opt-in only: FLUTTERWAVE_SPLIT_ENABLED=true
 */
export function isFlutterwaveSplitEnabled(): boolean {
  const v = (process.env.FLUTTERWAVE_SPLIT_ENABLED || "false").toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export function resolveProvider(
  preferred?: string | null
): PaymentProviderId {
  // Ona default: Flutterwave (Nigeria-first). Paystack secondary.
  // Prefer live keys whenever present — never fall through to mock just because
  // PAYMENT_PROVIDER is unset/typo'd (that caused silent mock-book with no checkout).
  const raw = (
    preferred ||
    process.env.PAYMENT_PROVIDER ||
    "flutterwave"
  )
    .toLowerCase()
    .trim();

  if (raw === "mock") return "mock";

  if (raw === "paystack" && paystackSecret()) return "paystack";
  if (raw === "flutterwave" && flutterwaveSecret()) return "flutterwave";

  // Keys win over misconfigured PAYMENT_PROVIDER
  if (flutterwaveSecret()) return "flutterwave";
  if (paystackSecret()) return "paystack";
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

  const base =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "http://localhost:3000";
  return {
    provider: "mock",
    reference: input.reference,
    authorizationUrl: `${base}/payments/mock-checkout?ref=${encodeURIComponent(
      input.reference
    )}&amount=${input.amountMinor}&currency=${input.currency}${
      input.metadata?.jobId
        ? `&jobId=${encodeURIComponent(String(input.metadata.jobId))}`
        : ""
    }`,
    splitEnabled: false,
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
    data?: {
      authorization_url?: string;
      access_code?: string;
      reference?: string;
    };
  };
  if (!res.ok || !json.status || !json.data?.authorization_url) {
    throw new Error(json.message || "Paystack initialize failed");
  }
  return {
    provider: "paystack",
    authorizationUrl: json.data.authorization_url,
    reference: json.data.reference || input.reference,
    accessCode: json.data.access_code,
    splitEnabled: false,
  };
}

/**
 * Flutterwave standard payment.
 *
 * ESCROW RULE: always charge the full labour amount to the main Ona merchant.
 * Do NOT attach subaccounts on collection — that caused:
 *   "The total subaccount transaction charge cannot be greater than the amount…"
 *
 * Why it failed before:
 * - Flutterwave percentage commission uses fractions (0.05 = 5%), not 5
 * - Platform subaccount default split_value + per-tx charge stacked over the amount
 * - Dual subaccount "fees" of 5% + 95% were interpreted as charges, not shares
 *
 * Platform 5% / pro 95% is applied later via Transfer API on job release.
 * Opt-in split-on-collection only if FLUTTERWAVE_SPLIT_ENABLED=true (advanced).
 */
async function initFlutterwave(
  input: InitChargeInput
): Promise<InitChargeResult> {
  const secret = flutterwaveSecret();
  const feePct = Math.min(
    50,
    Math.max(0, input.platformFeePercent ?? 5)
  );
  // Fraction form required by Flutterwave (5% → 0.05), never pass 5
  const feeFraction = Math.round(feePct * 100) / 10000;
  const splitOn = isFlutterwaveSplitEnabled();
  const platformSub = (
    process.env.FLUTTERWAVE_PLATFORM_SUBACCOUNT || ""
  ).trim();
  const proSub = (input.proSubaccountId || "").trim();

  const customerName =
    (input.customerName || "").trim() ||
    input.email.split("@")[0] ||
    "Ona customer";
  // Flutterwave accepts local NG numbers; strip spaces
  const customerPhone = (input.customerPhone || "")
    .replace(/\s+/g, "")
    .trim() || "08000000000";

  const amountMajor = Number((input.amountMinor / 100).toFixed(2));

  const body: Record<string, unknown> = {
    tx_ref: input.reference,
    amount: amountMajor,
    currency: input.currency,
    redirect_url: input.callbackUrl,
    customer: {
      email: input.email,
      name: customerName,
      phonenumber: customerPhone,
    },
    customizations: {
      title: "Ona",
      description: "Labour / service fee escrow",
    },
    meta: {
      ...(input.metadata ?? {}),
      labourOnly: true,
      platformFeePercent: feePct,
      // Escrow: hold full amount on main account unless explicit split opt-in
      splitEnabled: false,
      escrowMode: "main_merchant",
    },
    payment_options: "card,banktransfer,ussd,account",
  };

  /**
   * HARD RULE for Ona escrow collections:
   * Never send `subaccounts` on payment init.
   * Full amount → main Flutterwave merchant account (held as escrow).
   * Platform fee + pro payout run later via Transfer API on job release.
   *
   * (splitOn / platformSub kept for future opt-in; intentionally unused here)
   */
  void splitOn;
  void platformSub;
  void proSub;
  void feeFraction;

  // Guarantee no residual subaccount keys
  delete body.subaccounts;

  const res = await fetch("https://api.flutterwave.com/v3/payments", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
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
    splitEnabled: false,
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
 * Transfer to pro bank (release after escrow). Flutterwave Transfer API.
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

  if (
    provider === "flutterwave" &&
    input.bankCode &&
    input.accountNumber &&
    input.accountName
  ) {
    try {
      const secret = flutterwaveSecret();
      const res = await fetch("https://api.flutterwave.com/v3/transfers", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          account_bank: input.bankCode,
          account_number: input.accountNumber,
          amount: input.amountMinor / 100,
          currency: input.currency,
          narration: input.reason.slice(0, 100),
          reference: `ona_rel_${input.reference}`.slice(0, 50),
          beneficiary_name: input.accountName,
        }),
      });
      const json = (await res.json()) as {
        status?: string;
        message?: string;
        data?: { id?: number; reference?: string };
      };
      if (json.status === "success") {
        return {
          ok: true,
          transferRef: String(json.data?.reference || json.data?.id || ""),
        };
      }
      return {
        ok: false,
        message: json.message || "Flutterwave transfer failed",
      };
    } catch (e) {
      return {
        ok: false,
        message: e instanceof Error ? e.message : "Transfer error",
      };
    }
  }

  return {
    ok: false,
    message:
      "Configure pro bank details + Flutterwave transfer. Funds remain held until release succeeds.",
  };
}
