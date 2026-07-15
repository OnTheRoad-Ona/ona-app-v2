/**
 * OgaMecho labour/service pricing.
 * Does NOT include spare parts — labour fee only.
 */

import type { ProService } from "@/lib/types";

export type AppCurrency = "NGN" | "USD";

/** Platform take on released escrow (Repair Pro receives the rest). */
export const PLATFORM_COMMISSION_PERCENT = 5;

/** Max motorist-negotiated discount off the pro’s base labour price. */
export const MAX_DISCOUNT_PERCENT = 50;

export const LABOUR_FEE_DISCLAIMER =
  "Labour / service fee only. Does not include spare parts or motor parts.";

export function detectCurrency(opts?: {
  countryCode?: string | null;
  countryName?: string | null;
  locale?: string | null;
}): AppCurrency {
  const code = (opts?.countryCode || "").trim().toUpperCase();
  const name = (opts?.countryName || "").trim().toUpperCase();
  if (
    code === "US" ||
    code === "USA" ||
    name.includes("UNITED STATES") ||
    name === "US"
  ) {
    return "USD";
  }
  if (
    code === "NG" ||
    code === "NGA" ||
    name.includes("NIGERIA") ||
    name === "NG"
  ) {
    return "NGN";
  }
  const locale =
    opts?.locale ||
    (typeof navigator !== "undefined" ? navigator.language : "en-NG");
  if (locale.toLowerCase().startsWith("en-us")) return "USD";
  // Default marketplace: Nigeria
  return "NGN";
}

export function currencySymbol(currency: AppCurrency): string {
  return currency === "USD" ? "$" : "₦";
}

export function currencyLabel(currency: AppCurrency): string {
  return currency === "USD" ? "USD" : "NGN";
}

/** Major units → minor (kobo / cents). */
export function toMinorUnits(amountMajor: number, currency: AppCurrency): number {
  const n = Math.max(0, Number(amountMajor) || 0);
  const factor = currency === "USD" || currency === "NGN" ? 100 : 100;
  return Math.round(n * factor);
}

export function fromMinorUnits(
  amountMinor: number,
  currency: AppCurrency
): number {
  const factor = currency === "USD" || currency === "NGN" ? 100 : 100;
  return (Number(amountMinor) || 0) / factor;
}

export function formatMoney(
  amountMajor: number | null | undefined,
  currency: AppCurrency
): string {
  if (amountMajor == null || !Number.isFinite(amountMajor)) {
    return "Quote on request";
  }
  const sym = currencySymbol(currency);
  try {
    return `${sym}${amountMajor.toLocaleString(undefined, {
      minimumFractionDigits: currency === "USD" ? 2 : 0,
      maximumFractionDigits: currency === "USD" ? 2 : 0,
    })}`;
  } catch {
    return `${sym}${amountMajor}`;
  }
}

export function formatMoneyMinor(
  amountMinor: number,
  currency: AppCurrency
): string {
  return formatMoney(fromMinorUnits(amountMinor, currency), currency);
}

/** Parse free-text price ("₦5,000", "50", "$25.00") → major units or null. */
export function parsePriceInput(raw: string | number | null | undefined): number | null {
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) return raw;
  if (raw == null) return null;
  const s = String(raw).replace(/[^\d.]/g, "");
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/**
 * Read a pro’s base labour price for a skill.
 * Supports numeric maps and legacy string labels.
 */
export function getBaseLabourPrice(
  prices: Partial<Record<ProService, number | string>> | null | undefined,
  service: ProService
): number | null {
  if (!prices) return null;
  return parsePriceInput(prices[service]);
}

export function clampDiscountPercent(pct: number): number {
  if (!Number.isFinite(pct) || pct < 0) return 0;
  return Math.min(MAX_DISCOUNT_PERCENT, Math.round(pct));
}

export function applyDiscount(
  baseMajor: number,
  discountPercent: number
): number {
  const d = clampDiscountPercent(discountPercent);
  const agreed = baseMajor * (1 - d / 100);
  return Math.round(agreed * 100) / 100;
}

export function splitEscrow(amountMinor: number): {
  platformMinor: number;
  proMinor: number;
} {
  const total = Math.max(0, Math.round(amountMinor));
  const platformMinor = Math.round((total * PLATFORM_COMMISSION_PERCENT) / 100);
  return {
    platformMinor,
    proMinor: total - platformMinor,
  };
}

export type PricingSnapshot = {
  serviceType: ProService;
  currency: AppCurrency;
  baseAmountMajor: number;
  baseAmountMinor: number;
  discountPercent: number;
  agreedAmountMajor: number;
  agreedAmountMinor: number;
  platformFeeMinor: number;
  proPayoutMinor: number;
  labourOnly: true;
};

export function buildPricingSnapshot(input: {
  serviceType: ProService;
  currency: AppCurrency;
  baseAmountMajor: number;
  discountPercent?: number;
}): PricingSnapshot | null {
  const base = parsePriceInput(input.baseAmountMajor);
  if (base == null) return null;
  const discountPercent = clampDiscountPercent(input.discountPercent ?? 0);
  const agreedAmountMajor = applyDiscount(base, discountPercent);
  const agreedAmountMinor = toMinorUnits(agreedAmountMajor, input.currency);
  const baseAmountMinor = toMinorUnits(base, input.currency);
  const { platformMinor, proMinor } = splitEscrow(agreedAmountMinor);
  return {
    serviceType: input.serviceType,
    currency: input.currency,
    baseAmountMajor: base,
    baseAmountMinor,
    discountPercent,
    agreedAmountMajor,
    agreedAmountMinor,
    platformFeeMinor: platformMinor,
    proPayoutMinor: proMinor,
    labourOnly: true,
  };
}
