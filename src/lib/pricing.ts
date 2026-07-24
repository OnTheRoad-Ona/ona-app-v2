/**
 * Ona labour/service pricing.
 * Does NOT include spare parts — labour fee only.
 * Currency follows market/geo: ₦ NG, £ UK, R ZA, etc.
 */

import type { ProService } from "@/lib/types";

export type AppCurrency =
  | "NGN"
  | "USD"
  | "GBP"
  | "ZAR"
  | "EUR"
  | "GHS"
  | "KES"
  | "CAD"
  | "AUD";

/** Platform take on released escrow (Repair Pro receives the rest). */
export const PLATFORM_COMMISSION_PERCENT = 5;

/** Max motorist-negotiated discount off the pro’s base labour price. */
export const MAX_DISCOUNT_PERCENT = 50;

export const LABOUR_FEE_DISCLAIMER =
  "Labour / service fee only. Does not include spare parts or motor parts.";

export const LABOUR_SPLIT_LINE =
  "Labour only | 5% platform | 95% Repair Pro";

const COUNTRY_CURRENCY: Record<string, AppCurrency> = {
  NG: "NGN",
  NGA: "NGN",
  US: "USD",
  USA: "USD",
  GB: "GBP",
  UK: "GBP",
  GBR: "GBP",
  ZA: "ZAR",
  ZAF: "ZAR",
  GH: "GHS",
  GHA: "GHS",
  KE: "KES",
  KEN: "KES",
  CA: "CAD",
  CAN: "CAD",
  AU: "AUD",
  AUS: "AUD",
  IE: "EUR",
  DE: "EUR",
  FR: "EUR",
  NL: "EUR",
  ES: "EUR",
  IT: "EUR",
  AT: "EUR",
  BE: "EUR",
  PT: "EUR",
};

function nameToCurrency(name: string): AppCurrency | null {
  const n = name.toUpperCase();
  if (n.includes("NIGERIA") || n === "NG") return "NGN";
  if (n.includes("UNITED KINGDOM") || n.includes("ENGLAND") || n.includes("SCOTLAND") || n.includes("WALES") || n === "UK" || n === "GB")
    return "GBP";
  if (n.includes("SOUTH AFRICA") || n === "ZA") return "ZAR";
  if (n.includes("UNITED STATES") || n === "USA" || n === "US") return "USD";
  if (n.includes("GHANA")) return "GHS";
  if (n.includes("KENYA")) return "KES";
  if (n.includes("CANADA")) return "CAD";
  if (n.includes("AUSTRALIA")) return "AUD";
  if (
    n.includes("GERMANY") ||
    n.includes("FRANCE") ||
    n.includes("IRELAND") ||
    n.includes("NETHERLANDS") ||
    n.includes("SPAIN") ||
    n.includes("ITALY") ||
    n.includes("EUROPE")
  )
    return "EUR";
  return null;
}

/**
 * Resolve marketplace currency from country code/name or locale.
 * Defaults to NGN (primary market).
 */
export function detectCurrency(opts?: {
  countryCode?: string | null;
  countryName?: string | null;
  locale?: string | null;
}): AppCurrency {
  const code = (opts?.countryCode || "").trim().toUpperCase();
  if (code && COUNTRY_CURRENCY[code]) return COUNTRY_CURRENCY[code];

  const fromName = nameToCurrency(opts?.countryName || "");
  if (fromName) return fromName;

  const locale = (
    opts?.locale ||
    (typeof navigator !== "undefined" ? navigator.language : "en-NG")
  ).toLowerCase();

  // Prefer Nigeria market defaults — do not infer GBP/EUR from browser language alone
  // (many Nigerian devices report en-GB / en-US and wrongly priced in £).
  if (locale.startsWith("en-ng") || locale.startsWith("ha-ng") || locale.startsWith("yo-ng") || locale.startsWith("ig-ng") || locale.startsWith("pcm"))
    return "NGN";
  if (locale.startsWith("en-za") || locale.startsWith("af-za")) return "ZAR";
  if (locale.startsWith("en-gh")) return "GHS";
  if (locale.startsWith("en-ke") || locale.startsWith("sw-ke")) return "KES";

  // Primary market default
  return "NGN";
}

/**
 * Use browser GPS → reverse geocode country → currency.
 * Falls back to locale / NGN.
 */
export async function detectCurrencyFromGeolocation(): Promise<AppCurrency> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return detectCurrency();
  }

  try {
    const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 300_000,
      });
    });
    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;

    // Prefer server reverse-geocode (includes country when available)
    try {
      const res = await fetch(
        `/api/reverse-geocode?lat=${encodeURIComponent(String(lat))}&lng=${encodeURIComponent(String(lng))}`,
        { cache: "no-store" }
      );
      const data = (await res.json().catch(() => null)) as {
        country?: string;
        countryCode?: string;
        city?: string;
        label?: string;
      } | null;
      if (data) {
        const c = detectCurrency({
          countryCode: data.countryCode,
          countryName: data.country || data.city || data.label,
        });
        return c;
      }
    } catch {
      /* fall through */
    }

    // Rough lat/lng region fallback for common markets
    if (lat >= 4 && lat <= 14 && lng >= 2 && lng <= 15) return "NGN"; // Nigeria box
    if (lat >= -35 && lat <= -22 && lng >= 16 && lng <= 33) return "ZAR"; // SA
    if (lat >= 49 && lat <= 61 && lng >= -8 && lng <= 2) return "GBP"; // UK
    if (lat >= 24 && lat <= 50 && lng >= -125 && lng <= -66) return "USD"; // US
  } catch {
    /* permission denied etc. */
  }

  return detectCurrency();
}

export function currencySymbol(currency: AppCurrency): string {
  switch (currency) {
    case "NGN":
      return "₦";
    case "USD":
      return "$";
    case "GBP":
      return "£";
    case "ZAR":
      return "R";
    case "EUR":
      return "€";
    case "GHS":
      return "GH₵";
    case "KES":
      return "KSh ";
    case "CAD":
      return "C$";
    case "AUD":
      return "A$";
    default:
      return "₦";
  }
}

export function currencyLabel(currency: AppCurrency): string {
  return currency;
}

function usesDecimals(currency: AppCurrency): boolean {
  return currency === "USD" || currency === "GBP" || currency === "EUR" || currency === "CAD" || currency === "AUD";
}

/** Major units → minor (kobo / cents / pence). */
export function toMinorUnits(amountMajor: number, currency: AppCurrency): number {
  const n = Math.max(0, Number(amountMajor) || 0);
  return Math.round(n * 100);
}

export function fromMinorUnits(
  amountMinor: number,
  currency: AppCurrency
): number {
  return (Number(amountMinor) || 0) / 100;
}

/**
 * Format labour amounts for display.
 * Nigeria default: always show ₦ with grouping (e.g. ₦5,000).
 */
export function formatMoney(
  amountMajor: number | null | undefined,
  currency?: AppCurrency | string | null
): string {
  if (amountMajor == null || !Number.isFinite(Number(amountMajor))) {
    return "Quote on request";
  }
  // Default market is Nigeria — prefer ₦ when currency missing/unknown
  const cur: AppCurrency =
    currency === "USD" ||
    currency === "GBP" ||
    currency === "ZAR" ||
    currency === "EUR" ||
    currency === "GHS" ||
    currency === "KES" ||
    currency === "CAD" ||
    currency === "AUD"
      ? currency
      : "NGN";
  const sym = currencySymbol(cur);
  const dec = usesDecimals(cur);
  const n = Number(amountMajor);
  try {
    const locale = cur === "NGN" ? "en-NG" : undefined;
    return `${sym}${n.toLocaleString(locale, {
      minimumFractionDigits: dec ? 2 : 0,
      maximumFractionDigits: dec ? 2 : 0,
    })}`;
  } catch {
    return `${sym}${Math.round(n).toLocaleString("en-NG")}`;
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
