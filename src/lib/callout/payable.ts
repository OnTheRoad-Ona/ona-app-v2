import type { CalloutQuote, CalloutStatus } from "@/lib/callout/constants";

const PAYABLE_STATUSES = new Set<CalloutStatus>([
  "CALCULATED",
  "LOCKED",
  "IN_PROGRESS",
  "ARRIVED",
  "COMPLETED",
]);

/** Server quote → major units to collect. 0 if not a payable call-out. */
export function payableCalloutMajor(quote: CalloutQuote | null | undefined): number {
  if (!quote) return 0;
  if (!quote.calloutEligible) return 0;
  if (!PAYABLE_STATUSES.has(quote.calloutStatus)) return 0;
  const n = Number(quote.calloutFee);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 100) / 100;
}

/** Labour charge (existing) + separate call-out. Does not change labour split. */
export function composeCustomerPayableMajor(
  labourChargeMajor: number,
  quote: CalloutQuote | null | undefined
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
