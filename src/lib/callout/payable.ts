import type { CalloutQuote, CalloutStatus } from "@/lib/callout/constants";

const PAYABLE_STATUSES = new Set<CalloutStatus>([
  "CALCULATED",
  "LOCKED",
  "IN_PROGRESS",
  "ARRIVED",
  "COMPLETED",
]);

const UNSETTLED_STATUSES = new Set<CalloutStatus>(["PENDING", "CALCULATING"]);

/** True when the ₦ total can paint (fee known, or definitely none). */
export function isCalloutAmountReady(
  quote: CalloutQuote | null | undefined,
): boolean {
  if (!quote) return false;
  return !UNSETTLED_STATUSES.has(quote.calloutStatus);
}

/** Camel or snake escrow total (kobo) from a job payload. */
export function jobEscrowAmountMinor(job: {
  amountMinor?: number | null;
  amount_minor?: number | null;
} | null | undefined): number | null {
  if (!job) return null;
  const n = job.amountMinor ?? job.amount_minor;
  if (n == null || !Number.isFinite(Number(n))) return null;
  return Number(n);
}

/** Camel or snake call-out quote on a job payload. */
export function jobCalloutQuoteOf(job: {
  calloutQuote?: CalloutQuote | null;
  callout_quote?: CalloutQuote | null;
} | null | undefined): CalloutQuote | null {
  return job?.calloutQuote ?? job?.callout_quote ?? null;
}

/** Raw call-out ₦ on a quote (camel or snake). 0 if missing. */
export function quoteCalloutFeeMajor(
  quote: CalloutQuote | null | undefined,
): number {
  if (!quote) return 0;
  const n = Number(quote.calloutFee ?? quote.callout_fee ?? 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 100) / 100;
}

/** Server quote → major units to collect. 0 if not a payable call-out. */
export function payableCalloutMajor(
  quote: CalloutQuote | null | undefined,
): number {
  if (!quote) return 0;
  if (!quote.calloutEligible) return 0;
  if (!PAYABLE_STATUSES.has(quote.calloutStatus)) return 0;
  return quoteCalloutFeeMajor(quote);
}

/**
 * Combined ₦ to show. Null until the call-out is settled so labour-only
 * never flashes first.
 */
export function jobTotalMajor(
  labourMajor: number | null | undefined,
  quote: CalloutQuote | null | undefined,
): number | null {
  if (labourMajor == null || !Number.isFinite(Number(labourMajor))) return null;
  if (!isCalloutAmountReady(quote)) return null;
  return composeCustomerPayableMajor(Number(labourMajor), quote).totalMajor;
}

/** Labour charge (existing) + separate call-out. Does not change labour split. */
export function composeCustomerPayableMajor(
  labourChargeMajor: number,
  quote: CalloutQuote | null | undefined,
): {
  labourMajor: number;
  calloutMajor: number;
  totalMajor: number;
} {
  const labour = Math.max(0, Number(labourChargeMajor) || 0);
  const callout = payableCalloutMajor(quote);
  return {
    labourMajor: labour,
    calloutMajor: callout,
    totalMajor: Math.round((labour + callout) * 100) / 100,
  };
}

/**
 * Single source of truth for display Total (Labour + Call Out Fee).
 * Use everywhere instead of `formatMoney(agreedMajor)` alone.
 * - Prefers escrow `amountMinor/100` when present (held/released)
 * - Then `jobTotalMajor` when callout is settled
 * - Falls back to labour + raw `calloutFee` even when pending
 */
export function getDisplayTotalMajor(input: {
  agreedMajor?: number | null;
  labourMajor?: number | null;
  amountMinor?: number | null;
  quote?: CalloutQuote | null;
  fallbackQuote?: CalloutQuote | null;
}): number | null {
  const labourRaw = input.labourMajor ?? input.agreedMajor;
  if (labourRaw == null || !Number.isFinite(Number(labourRaw))) return null;
  const labour = Number(labourRaw);
  const quote = input.quote ?? input.fallbackQuote ?? null;
  const fallbackQuote = input.fallbackQuote ?? quote;
  const q = quote ?? fallbackQuote;
  // escrow is ground truth after payment
  const escrow = input.amountMinor;
  if (escrow != null && Number.isFinite(Number(escrow)) && Number(escrow) > 0) {
    return Math.round(Number(escrow)) / 100;
  }
  const total = jobTotalMajor(labour, q);
  if (total != null) return total;
  const rawCallout = quoteCalloutFeeMajor(q);
  const callout = rawCallout > 0 ? rawCallout : payableCalloutMajor(q);
  return Math.round((labour + callout) * 100) / 100;
}
