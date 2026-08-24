/**
 * Payment gateway adapters Flutterwave (default) + Paystack.
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
  /** Customer full name Flutterwave hosted checkout prefers this */
  customerName?: string | null;
  /** Customer phone Flutterwave hosted checkout prefers this */
  customerPhone?: string | null;
  reference: string;
  callbackUrl: string;
  metadata?: Record<string, unknown>;
  channels?: string[];
  /** Pro Flutterwave subaccount id (RS_…) for split optional */
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

/** In-app bank transfer details (no Flutterwave hosted page / new tab). */
export type BankTransferInstructions = {
  accountNumber: string;
  bankName: string;
  accountName: string;
  amountMajor: number;
  currency: string;
  expiresAt: string | null;
  note: string;
  flwRef: string | null;
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

/** True on Vercel Production/Preview or when NODE_ENV=production. */
export function isProductionRuntime(): boolean {
  const env = process.env.VERCEL_ENV || process.env.NODE_ENV || "";
  return (
    env === "production" ||
    env === "preview" ||
    (process.env.VERCEL === "1" && env !== "development" && env !== "test")
  );
}

export function resolveProvider(preferred?: string | null): PaymentProviderId {
  // Ona default: Flutterwave (Nigeria-first). Paystack secondary.
  // Prefer live keys whenever present never fall through to mock just because
  // PAYMENT_PROVIDER is unset/typo'd (that caused silent mock-book with no checkout).
  const raw = (preferred || process.env.PAYMENT_PROVIDER || "flutterwave")
    .toLowerCase()
    .trim();

  if (raw === "mock") {
    // Fail closed on deployed runtimes: mock-mode payouts are a dev-only tool.
    // A missing/misconfigured key must NEVER silently "succeed" a real escrow
    // release (that paid nothing while marking the job released).
    if (isProductionRuntime()) return "flutterwave";
    return "mock";
  }

  if (raw === "paystack" && paystackSecret()) return "paystack";
  if (raw === "flutterwave" && flutterwaveSecret()) return "flutterwave";

  // Keys win over misconfigured PAYMENT_PROVIDER
  if (flutterwaveSecret()) return "flutterwave";
  if (paystackSecret()) return "paystack";
  return isProductionRuntime() ? "flutterwave" : "mock";
}

/** Reject instruction sentences wrongly used as bank account names */
function sanitizeBankAccountName(
  candidate: string | null | undefined,
  fallback = "Ona",
): string {
  const raw = String(candidate || "").trim();
  if (!raw) return fallback;
  const low = raw.toLowerCase();
  // Narration / help text must never appear as "Account name"
  if (
    low.startsWith("please ") ||
    low.includes("make a bank transfer") ||
    low.includes("transfer to") ||
    low.includes("exact amount") ||
    raw.length > 48
  ) {
    return fallback;
  }
  return raw;
}

function sanitizeTransferNote(note: string | null | undefined): string {
  const raw = String(note || "").trim();
  if (!raw) return "";
  // Strip accidental "Please make a bank transfer to X" → clearer escrow copy
  const m = raw.match(/^please\s+make\s+a\s+bank\s+transfer\s+to\s+(.+)$/i);
  if (m?.[1]) {
    const pro = m[1].trim();
    return `For ${pro}. Pay into Ona escrow (account below). Funds are released after the job is confirmed. Transfer the exact amount only.`;
  }
  return raw
    .replace(/\(account above\)/gi, "(account below)")
    .replace(/Funds release after/gi, "Funds are released after");
}

/**
 * Create a one-time NGN bank-transfer charge on Flutterwave.
 * Returns virtual account details to show inside Ona never leaves the app.
 * Docs: POST /v3/charges?type=bank_transfer
 */
export async function createFlutterwaveBankTransfer(input: {
  amountMajor: number;
  currency?: string;
  email: string;
  customerName?: string | null;
  customerPhone?: string | null;
  reference: string;
  narration?: string;
  /** Shown to customer as transfer instruction */
  transferNote?: string;
  accountDisplayName?: string;
}): Promise<
  | { ok: true; instructions: BankTransferInstructions; raw: unknown }
  | { ok: false; error: string }
> {
  const secret = flutterwaveSecret();
  if (!secret) {
    return { ok: false, error: "Flutterwave secret key not configured" };
  }
  const amount = Number(input.amountMajor);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "Invalid amount" };
  }
  const email = (input.email || "").trim();
  if (!email.includes("@")) {
    return { ok: false, error: "Valid customer email required" };
  }
  const phone = (input.customerPhone || "")
    .replace(/\s+/g, "")
    .replace(/^\+234/, "0");
  const fullname =
    (input.customerName || "").trim() || email.split("@")[0] || "Ona Customer";

  try {
    // amount as string per Flutterwave bank-transfer docs
    const res = await fetch(
      "https://api.flutterwave.com/v3/charges?type=bank_transfer",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tx_ref: input.reference,
          amount: String(amount),
          currency: (input.currency || "NGN").toUpperCase(),
          email,
          fullname,
          phone_number: phone.length >= 10 ? phone : "08000000000",
          narration:
            input.narration ||
            input.transferNote ||
            "Ona labour fee escrow transfer exact amount",
          bank_transfer_options: {
            // Align with our 20‑min pay window (seconds)
            expires: 20 * 60,
          },
        }),
      },
    );
    const json = (await res.json()) as Record<string, unknown>;
    // FLW success shape (official docs):
    // { status: "success", message: "Charge initiated", meta: { authorization: { transfer_account, transfer_bank, ... } } }
    // Account details are under meta.authorization not under data.
    const meta = (json.meta || {}) as Record<string, unknown>;
    const dataObj =
      json.data && typeof json.data === "object"
        ? (json.data as Record<string, unknown>)
        : {};
    const dataMeta =
      dataObj.meta && typeof dataObj.meta === "object"
        ? (dataObj.meta as Record<string, unknown>)
        : {};
    const auth = {
      ...((dataMeta.authorization as Record<string, unknown>) || {}),
      ...((meta.authorization as Record<string, unknown>) || {}),
    };

    const accountNumber = String(
      auth.transfer_account ||
        dataObj.account_number ||
        dataObj.transfer_account ||
        "",
    ).trim();
    const bankName = String(
      auth.transfer_bank ||
        dataObj.bank_name ||
        dataObj.transfer_bank ||
        "Flutterwave MFB",
    ).trim();
    const transferAmount = Number(
      auth.transfer_amount ?? dataObj.amount ?? amount,
    );
    const expiresAt =
      (auth.account_expiration as string | undefined) ||
      (dataObj.account_expiration as string | undefined) ||
      null;
    const flwRef = String(
      auth.transfer_reference || dataObj.flw_ref || dataObj.id || "",
    ).trim();

    // Real bank recipient name for the VA (what customers type in their bank app).
    // Never use narration / "Please make a bank transfer to …" as account name.
    const flwAccountName = String(
      auth.transfer_account_name ||
        auth.account_name ||
        auth.accountName ||
        dataObj.account_name ||
        dataObj.accountName ||
        "",
    ).trim();

    const status = String(json.status || "").toLowerCase();
    const hasAccount = accountNumber.length >= 8;
    const okStatus =
      status === "success" || status === "successful" || (res.ok && hasAccount);

    if (!okStatus && !hasAccount) {
      const msg = String(json.message || "").trim();
      return {
        ok: false,
        error:
          msg && msg.toLowerCase() !== "charge initiated"
            ? msg
            : `Flutterwave bank transfer failed (${res.status}). Try again.`,
      };
    }

    if (!hasAccount) {
      console.error(
        "FLW bank_transfer missing account",
        JSON.stringify(json).slice(0, 800),
      );
      return {
        ok: false,
        error:
          "Flutterwave did not return a transfer account. Enable Pay with Bank Transfer on your Flutterwave dashboard.",
      };
    }

    const brandName = (input.accountDisplayName || "").trim() || "Ona";
    // Prefer FLW VA name only if it looks like a real account holder (not a sentence)
    const accountName = sanitizeBankAccountName(flwAccountName, brandName);

    // Customer-facing instruction only (never the account name field)
    const notePreferred =
      sanitizeTransferNote(input.transferNote) ||
      "Transfer the exact amount. Funds are held in Ona escrow until the job is done.";

    // Do not surface Flutterwave's echo of narration as the note if it's the old bad copy
    void auth.transfer_note;

    return {
      ok: true,
      instructions: {
        accountNumber,
        bankName: bankName || "Flutterwave MFB",
        accountName,
        amountMajor: Number.isFinite(transferAmount) ? transferAmount : amount,
        currency: String(
          dataObj.currency || input.currency || "NGN",
        ).toUpperCase(),
        expiresAt: expiresAt ? String(expiresAt) : null,
        note: notePreferred,
        flwRef: flwRef || null,
      },
      raw: json,
    };
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof Error
          ? e.message
          : "Could not create bank transfer details",
    };
  }
}

export async function initCharge(
  input: InitChargeInput,
  preferred?: string | null,
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
  const isShop = input.metadata?.kind === "ona_shop";
  const query = new URLSearchParams({
    ref: input.reference,
    amount: String(input.amountMinor),
    currency: input.currency,
  });
  if (input.metadata?.jobId) query.set("jobId", String(input.metadata.jobId));
  if (isShop && input.metadata?.orderId) {
    query.set("kind", "ona_shop");
    query.set("orderId", String(input.metadata.orderId));
  }
  return {
    provider: "mock",
    reference: input.reference,
    authorizationUrl: `${base}/payments/mock-checkout?${query.toString()}`,
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
      // Ona NG: bank transfer only (no USSD/card at checkout)
      channels: input.channels ?? ["bank_transfer", "bank"],
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
 * Do NOT attach subaccounts on collection that caused:
 * "The total subaccount transaction charge cannot be greater than the amount…"
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
  input: InitChargeInput,
): Promise<InitChargeResult> {
  const secret = flutterwaveSecret();
  const feePct = Math.min(50, Math.max(0, input.platformFeePercent ?? 5));
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
  const customerPhone =
    (input.customerPhone || "").replace(/\s+/g, "").trim() || "08000000000";

  // Shop retail is direct-to-Ona collection (never job escrow).
  const isShop = input.metadata?.kind === "ona_shop";

  // Force NGN for Nigerian market never surface GBP/USD for NG accounts
  let payCurrency = input.currency || "NGN";
  if (process.env.FLUTTERWAVE_FORCE_NGN !== "false") {
    payCurrency = "NGN";
  } else if (
    payCurrency !== "NGN" &&
    payCurrency !== "USD" &&
    payCurrency !== "GHS" &&
    payCurrency !== "KES" &&
    payCurrency !== "ZAR" &&
    payCurrency !== "EUR" &&
    payCurrency !== "GBP"
  ) {
    payCurrency = "NGN";
  }

  const amountMajor = Number((input.amountMinor / 100).toFixed(2));

  // Nigeria: bank transfer only (no USSD, card, or mobile money)
  const channels = input.channels?.length ? input.channels : ["bank_transfer"];
  const hasBank = channels.some((c) =>
    ["bank_transfer", "banktransfer", "bank"].includes(String(c).toLowerCase()),
  );
  const ngPaymentOptions =
    hasBank || channels.length === 0 ? "banktransfer" : "banktransfer";

  const body: Record<string, unknown> = {
    tx_ref: input.reference,
    amount: amountMajor,
    currency: payCurrency,
    redirect_url: input.callbackUrl,
    customer: {
      email: input.email,
      name: customerName,
      phonenumber: customerPhone,
    },
    customizations: {
      title: "Ona",
      description: isShop
        ? "Ona Shop purchase · Bank transfer only"
        : "Labour / service fee escrow · Bank transfer only",
    },
    meta: {
      ...(input.metadata ?? {}),
      ...(isShop
        ? {
            escrowMode: "none",
            splitEnabled: false,
            shop: true,
          }
        : {
            labourOnly: true,
            // Escrow: hold full amount on main account unless explicit split opt-in
            splitEnabled: false,
            escrowMode: "main_merchant",
          }),
      platformFeePercent: feePct,
      preferredPaymentMethod: "banktransfer",
      paymentMethodsAllowed: "banktransfer",
    },
    // Bank transfer only never USSD / card / mobilemoney for NG collections
    payment_options: ngPaymentOptions,
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
  preferred?: string | null,
): Promise<VerifyChargeResult> {
  const provider = resolveProvider(preferred);

  if (provider === "paystack") {
    const secret = paystackSecret();
    const res = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      { headers: { Authorization: `Bearer ${secret}` } },
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
      { headers: { Authorization: `Bearer ${secret}` } },
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
 * Map Flutterwave transfer errors to short actionable copy.
 * Does NOT invent IP-whitelist failures only mention IP when FLW says so.
 * Real failures always come from Flutterwave’s API / wallet state.
 */
export function humanizeFlutterwaveTransferError(raw: string): string {
  const m = (raw || "").trim();
  const low = m.toLowerCase();

  // Only if Flutterwave itself mentions IP (informational not an Ona hard block)
  if (
    low.includes("ip whitelist") ||
    low.includes("ip whitelisting") ||
    (low.includes("whitelist") && low.includes("ip"))
  ) {
    return (
      "Flutterwave rejected this transfer (IP policy on their side). " +
      "IP Whitelisting is ON: either turn it OFF for testing, or whitelist the " +
      "actual Vercel egress IP from /api/payments/egress-ip (rotating) not only " +
      "a static VPS IP unless FLUTTERWAVE_TRANSFER_PROXY_URL is set and used. " +
      "Funds remain in escrow until payout succeeds."
    );
  }
  if (
    low.includes("account administrator") ||
    low.includes("cannot be processed") ||
    low.includes("contact your account administrator") ||
    low.includes("merchant is not enabled") ||
    low.includes("not enabled to make transfers") ||
    low.includes("transfer is not enabled") ||
    low.includes("transfers are disabled")
  ) {
    return (
      "Flutterwave blocked Transfer API on this merchant (not an Ona IP bug). " +
      "Dashboard → Settings → Transfers / API → enable Transfer via API; " +
      "complete KYC; wait until NGN Available balance ≥ pro 87.5% payout " +
      "(Ledger balance alone is not enough). If still blocked, open a Flutterwave " +
      "support ticket for account id transfer enablement. " +
      "Funds remain in escrow until payout succeeds."
    );
  }
  if (
    low.includes("below minimum") ||
    low.includes("minimum limit") ||
    low.includes("minimum amount")
  ) {
    return (
      "Flutterwave rejected payout: amount is below their minimum transfer (usually ₦100). " +
      "Use a service charge of at least ₦120 so pro payout can complete. Funds remain in escrow."
    );
  }
  if (low.includes("insufficient") || low.includes("balance")) {
    return (
      "Flutterwave transfer failed: insufficient Available NGN balance for pro payout. " +
      "Collections can show on Ledger before they become Available wait for settlement " +
      "or top up the Flutterwave wallet. Escrow stays held."
    );
  }
  if (
    low.includes("account") &&
    (low.includes("invalid") || low.includes("not found"))
  ) {
    return (
      "Flutterwave transfer failed: Repair Pro bank account could not be verified. " +
      "Escrow stays held until bank details are fixed."
    );
  }
  if (
    low.includes("unauthorized") ||
    (low.includes("proxy") && low.includes("secret"))
  ) {
    return (
      "Payout proxy rejected the request (check FLUTTERWAVE_TRANSFER_PROXY_URL / SECRET). " +
      "Funds remain in escrow."
    );
  }
  // Node fetch network errors (unreachable proxy host / closed Oracle port)
  if (
    low === "fetch failed" ||
    low.includes("fetch failed") ||
    low.includes("econnrefused") ||
    low.includes("etimedout") ||
    low.includes("enotfound") ||
    low.includes("network")
  ) {
    return (
      "Could not reach the payout server (network/proxy). " +
      "If using FLUTTERWAVE_TRANSFER_PROXY_URL, open TCP 8787 (or 80) on that host in Oracle Security List, " +
      "or remove the proxy env to call Flutterwave directly. Funds remain in escrow."
    );
  }
  if (!m) {
    return "Could not transfer pro share (87.5%) to Repair Pro. Funds remain in escrow.";
  }
  // Pass through real FLW message do not rewrite into IP-whitelist scare text
  return `${m} Funds remain in escrow until payout succeeds.`;
}

/** Flutterwave NGN minimum for bank transfers (major units). */
const FLW_NGN_TRANSFER_MIN_MAJOR = 100;

/**
 * Read merchant NGN Available + Ledger (collections settle Ledger → Available).
 * Returns null if unavailable.
 */
export async function getFlutterwaveNgnBalances(): Promise<{
  available: number;
  ledger: number;
} | null> {
  const secret = flutterwaveSecret();
  if (!secret) return null;
  try {
    const res = await fetch("https://api.flutterwave.com/v3/balances/NGN", {
      headers: { Authorization: `Bearer ${secret}` },
      cache: "no-store",
    });
    const json = (await res.json()) as {
      status?: string;
      data?: { available_balance?: number; ledger_balance?: number };
    };
    if (json.status !== "success" || json.data == null) return null;
    const available = Number(json.data.available_balance);
    const ledger = Number(json.data.ledger_balance);
    if (!Number.isFinite(available) || !Number.isFinite(ledger)) return null;
    return { available, ledger };
  } catch {
    return null;
  }
}

async function flutterwaveNgnAvailableBalance(
  secret: string,
): Promise<number | null> {
  void secret;
  const b = await getFlutterwaveNgnBalances();
  return b?.available ?? null;
}

/**
 * Transfer targets: prefer static-IP proxy (FLW IP whitelist), fall back to
 * direct Flutterwave when proxy is unreachable so Available balance can still pay.
 */
function flutterwaveTransferEndpoints(): Array<{
  url: string;
  headers: Record<string, string>;
  via: "proxy" | "direct";
}> {
  const out: Array<{
    url: string;
    headers: Record<string, string>;
    via: "proxy" | "direct";
  }> = [];
  const proxyBase = (process.env.FLUTTERWAVE_TRANSFER_PROXY_URL || "")
    .trim()
    .replace(/\/$/, "");
  const proxySecret = (
    process.env.FLUTTERWAVE_TRANSFER_PROXY_SECRET ||
    process.env.ONA_PROXY_SECRET ||
    ""
  ).trim();
  const secret = flutterwaveSecret();

  if (proxyBase) {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (proxySecret) headers["x-ona-proxy-secret"] = proxySecret;
    out.push({ url: `${proxyBase}/v3/transfers`, headers, via: "proxy" });
  }

  // Always register direct as fallback (and primary when no proxy)
  out.push({
    url: "https://api.flutterwave.com/v3/transfers",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
    },
    via: "direct",
  });

  return out;
}

/**
 * Look up an existing Flutterwave transfer by our idempotency reference.
 * Used to avoid a second bank credit when retries race.
 */
export async function findExistingFlutterwaveTransfer(
  reference: string,
): Promise<
  | { found: true; id: string; status: string; reference: string }
  | { found: false }
> {
  const secret = flutterwaveSecret();
  const ref = (reference || "").trim();
  if (!secret || !ref) return { found: false };
  try {
    const res = await fetch(
      `https://api.flutterwave.com/v3/transfers?reference=${encodeURIComponent(ref)}`,
      {
        headers: { Authorization: `Bearer ${secret}` },
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      },
    );
    const json = (await res.json()) as {
      status?: string;
      data?:
        | Array<{ id?: number; status?: string; reference?: string }>
        | { id?: number; status?: string; reference?: string };
    };
    if (json.status !== "success" || json.data == null) return { found: false };
    const rows = Array.isArray(json.data) ? json.data : [json.data];
    const hit = rows.find(
      (t) =>
        String(t.reference || "") === ref &&
        /success|successful|NEW|PENDING|pending/i.test(String(t.status || "")),
    );
    if (!hit) return { found: false };
    const st = String(hit.status || "").toUpperCase();
    // Treat NEW/PENDING/SUCCESSFUL as already initiated never create another
    if (
      st.includes("SUCCESS") ||
      st === "NEW" ||
      st === "PENDING" ||
      st.includes("PENDING")
    ) {
      return {
        found: true,
        id: String(hit.id || ""),
        status: st,
        reference: ref,
      };
    }
    return { found: false };
  } catch {
    return { found: false };
  }
}

/**
 * Transfer pro net (87.5% of service) to pro bank after escrow. Flutterwave Transfer API.
 * No Ona-side IP whitelist hard-block. Uses FLUTTERWAVE_TRANSFER_PROXY_URL when set.
 * Platform 5% stays on merchant balance (caller only transfers proPayoutMinor).
 */
export async function releaseToPro(input: {
  amountMinor: number;
  currency: AppCurrency;
  reference: string;
  reason: string;
  bankCode?: string;
  accountNumber?: string;
  accountName?: string;
  /** Stable FLW transfer reference for idempotent retries (never double-pay) */
  transferReference?: string;
}): Promise<{
  ok: boolean;
  transferRef?: string;
  message?: string;
  code?: "pending_settlement" | "hard_fail" | "ok";
}> {
  const provider = resolveProvider();
  if (provider === "mock") {
    return {
      ok: true,
      transferRef: `mock-xfer-${input.reference}`,
      code: "ok",
    };
  }

  if (!input.bankCode || !input.accountNumber || !input.accountName) {
    return {
      ok: false,
      code: "hard_fail",
      message:
        "Repair Pro must save bank details (bank code + account) before payout. Funds remain in escrow.",
    };
  }

  if (provider === "flutterwave") {
    try {
      const secret = flutterwaveSecret();
      if (!secret) {
        return {
          ok: false,
          code: "hard_fail",
          message:
            "Flutterwave secret key missing on server. Funds remain in escrow.",
        };
      }

      const amountMajor = input.amountMinor / 100;
      if (
        process.env.FLUTTERWAVE_FORCE_NGN !== "false" &&
        amountMajor + 1e-9 < FLW_NGN_TRANSFER_MIN_MAJOR
      ) {
        return {
          ok: false,
          code: "hard_fail",
          message: humanizeFlutterwaveTransferError(
            `Amount is below minimum limit of ${FLW_NGN_TRANSFER_MIN_MAJOR}`,
          ),
        };
      }

      // Soft preflight: only block when Available (payout wallet) is too low.
      // Do NOT require the job's collection to have settled use any Available funds.
      const available = await flutterwaveNgnAvailableBalance(secret);
      if (available != null && available + 1e-9 < amountMajor) {
        console.error("[releaseToPro] pending settlement", {
          available,
          need: amountMajor,
        });
        return {
          ok: false,
          code: "pending_settlement",
          message:
            `Flutterwave Available NGN balance is ₦${available.toFixed(2)} but pro payout is ₦${amountMajor.toFixed(2)}. ` +
            "PENDING_SETTLEMENT funds stay in Ona escrow; auto-retry every 10 min when Available is sufficient.",
        };
      }

      // CRITICAL: never invent a new reference on retry same ref forever for this payout.
      // A random fallback would risk double pay; refuse if no stable ref was provided.
      const flwRef = (input.transferReference || input.reference || "")
        .trim()
        .slice(0, 50);
      if (!flwRef) {
        return {
          ok: false,
          code: "hard_fail",
          message:
            "Missing stable transfer reference refusing payout to prevent double pay.",
        };
      }

      // If Flutterwave already has this reference, treat as paid (no second credit)
      const existing = await findExistingFlutterwaveTransfer(flwRef);
      if (existing.found) {
        console.info(
          "[releaseToPro] existing transfer found skip create",
          flwRef,
          existing.status,
        );
        return {
          ok: true,
          code: "ok",
          transferRef: existing.reference || flwRef,
        };
      }

      const body = {
        account_bank: input.bankCode,
        account_number: input.accountNumber,
        amount: amountMajor,
        currency:
          process.env.FLUTTERWAVE_FORCE_NGN === "false"
            ? input.currency
            : "NGN",
        narration: input.reason.slice(0, 100),
        reference: flwRef,
        beneficiary_name: input.accountName,
      };

      let lastErr = "Transfer failed";
      for (const endpoint of flutterwaveTransferEndpoints()) {
        try {
          const headers: Record<string, string> = { ...endpoint.headers };
          if (endpoint.via === "proxy") {
            headers["x-flutterwave-secret"] = secret;
            if (!headers.Authorization) {
              headers.Authorization = `Bearer ${secret}`;
            }
          }

          const res = await fetch(endpoint.url, {
            method: "POST",
            headers,
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(25_000),
          });

          let json: {
            status?: string;
            message?: string;
            data?: { id?: number; reference?: string };
          };
          try {
            json = (await res.json()) as typeof json;
          } catch {
            lastErr = `Flutterwave transfer failed (${res.status}) via ${endpoint.via}`;
            // try next endpoint (e.g. direct if proxy body invalid)
            if (endpoint.via === "proxy") continue;
            return {
              ok: false,
              code: "pending_settlement",
              message: humanizeFlutterwaveTransferError(lastErr),
            };
          }

          if (json.status === "success") {
            console.info("[releaseToPro] success via", endpoint.via, flwRef);
            return {
              ok: true,
              code: "ok",
              transferRef: String(
                json.data?.reference || json.data?.id || flwRef,
              ),
            };
          }

          const rawMsg = String(
            json.message ||
              (res.status === 401
                ? "Unauthorized (check secret key or proxy secret)"
                : `Flutterwave transfer failed (${res.status})`),
          );
          const low = rawMsg.toLowerCase();
          // Idempotent: same reference already paid
          if (
            low.includes("already exists") ||
            low.includes("duplicate") ||
            low.includes("same reference")
          ) {
            return { ok: true, code: "ok", transferRef: flwRef };
          }

          console.error(
            "[releaseToPro]",
            endpoint.via,
            res.status,
            rawMsg,
            available != null ? `availNGN=${available}` : "availNGN=unknown",
          );

          // Proxy auth/network try direct next
          if (
            endpoint.via === "proxy" &&
            (res.status >= 500 ||
              res.status === 401 ||
              low.includes("unauthorized") ||
              low.includes("proxy"))
          ) {
            lastErr = rawMsg;
            continue;
          }

          const pending =
            low.includes("insufficient") ||
            low.includes("balance") ||
            low.includes("available") ||
            low.includes("ip whitelist");
          return {
            ok: false,
            code: pending ? "pending_settlement" : "hard_fail",
            message: humanizeFlutterwaveTransferError(rawMsg),
          };
        } catch (e) {
          lastErr = e instanceof Error ? e.message : "Transfer error";
          console.error("[releaseToPro] endpoint error", endpoint.via, lastErr);
          // Network failure on proxy → try direct
          if (endpoint.via === "proxy") continue;
          return {
            ok: false,
            code: "pending_settlement",
            message: humanizeFlutterwaveTransferError(lastErr),
          };
        }
      }

      return {
        ok: false,
        code: "pending_settlement",
        message: humanizeFlutterwaveTransferError(lastErr),
      };
    } catch (e) {
      return {
        ok: false,
        code: "pending_settlement",
        message: humanizeFlutterwaveTransferError(
          e instanceof Error ? e.message : "Transfer error",
        ),
      };
    }
  }

  return {
    ok: false,
    code: "hard_fail",
    message:
      "Configure pro bank details + Flutterwave transfer. Funds remain held until release succeeds.",
  };
}

/**
 * Attempt a Flutterwave transaction refund by provider reference / transaction id.
 * Returns gateway status without throwing callers update ledger meta accordingly.
 */
export async function attemptFlutterwaveRefund(input: {
  providerRef: string;
  amountMajor?: number;
  reason?: string;
}): Promise<
  | { ok: true; status: string; flwId?: string; raw?: unknown }
  | {
      ok: false;
      code: "no_key" | "gateway" | "not_found";
      message: string;
      raw?: unknown;
    }
> {
  const secret = flutterwaveSecret();
  const ref = (input.providerRef || "").trim();
  if (!secret) {
    return {
      ok: false,
      code: "no_key",
      message: "Flutterwave secret not configured",
    };
  }
  if (!ref) {
    return {
      ok: false,
      code: "not_found",
      message: "Missing payment reference",
    };
  }

  try {
    // Resolve transaction id from our reference (tx_ref)
    const lookup = await fetch(
      `https://api.flutterwave.com/v3/transactions?tx_ref=${encodeURIComponent(ref)}`,
      {
        headers: { Authorization: `Bearer ${secret}` },
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      },
    );
    const lookupJson = (await lookup.json().catch(() => null)) as {
      status?: string;
      data?:
        | Array<{ id?: number; status?: string; tx_ref?: string }>
        | { id?: number };
      message?: string;
    } | null;

    let txId: number | null = null;
    if (lookupJson?.status === "success" && lookupJson.data) {
      const rows = Array.isArray(lookupJson.data)
        ? lookupJson.data
        : [lookupJson.data];
      const hit = rows.find((r) => r?.id != null) || rows[0];
      if (hit?.id != null) txId = Number(hit.id);
    }

    // Some refs are already numeric FLW ids
    if (txId == null && /^\d+$/.test(ref)) txId = Number(ref);

    if (txId == null) {
      return {
        ok: false,
        code: "not_found",
        message: "Flutterwave transaction not found for refund",
        raw: lookupJson,
      };
    }

    const body: Record<string, unknown> = {
      comments: (input.reason || "Ona escrow refund").slice(0, 200),
    };
    if (input.amountMajor != null && input.amountMajor > 0) {
      body.amount = input.amountMajor;
    }

    const res = await fetch(
      `https://api.flutterwave.com/v3/transactions/${txId}/refund`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${secret}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20_000),
      },
    );
    const json = (await res.json().catch(() => null)) as {
      status?: string;
      message?: string;
      data?: { id?: number; status?: string };
    } | null;

    if (json?.status === "success") {
      return {
        ok: true,
        status: String(json.data?.status || "success"),
        flwId: json.data?.id != null ? String(json.data.id) : undefined,
        raw: json,
      };
    }

    return {
      ok: false,
      code: "gateway",
      message: json?.message || `Refund failed (${res.status})`,
      raw: json,
    };
  } catch (e) {
    return {
      ok: false,
      code: "gateway",
      message: e instanceof Error ? e.message : "Refund request failed",
    };
  }
}
