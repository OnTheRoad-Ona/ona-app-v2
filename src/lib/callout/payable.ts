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

/** Server quote → major units to collect. 0 if not a payable call-out. */
export function payableCalloutMajor(
  quote: CalloutQuote | null | undefined,
): number {
  if (!quote) return 0;
  if (!quote.calloutEligible) return 0;
  if (!PAYABLE_STATUSES.has(quote.calloutStatus)) return 0;
  const n = Number(quote.calloutFee);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 100) / 100;
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
  const rawCallout = Number((q as any)?.calloutFee ?? 0);
  const callout = Number.isFinite(rawCallout) && rawCallout > 0 ? rawCallout : payableCalloutMajor(q);
  return Math.round((labour + callout) * 100) / 100;
}
