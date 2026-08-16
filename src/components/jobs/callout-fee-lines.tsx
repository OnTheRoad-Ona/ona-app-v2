"use client";

import type { CalloutQuote } from "@/lib/callout/constants";
import { payableCalloutMajor } from "@/lib/callout/payable";
import { formatMoney, type AppCurrency } from "@/lib/pricing";
import { cn } from "@/lib/utils";

export function CalloutFeeLines({
  quote,
  currency,
  ink,
  muted,
  compact,
}: {
  quote: CalloutQuote | null | undefined;
  currency?: AppCurrency | string | null;
  ink: string;
  muted: string;
  compact?: boolean;
}) {
  if (!quote) return null;
  const fee = payableCalloutMajor(quote);
  if (fee <= 0) {
    if (quote.calloutStatus === "NOT_ELIGIBLE") {
      return (
        <p className={cn(compact ? "text-[11px]" : "text-[12px]", "font-medium", muted)}>
          No call-out fee
        </p>
      );
    }
    return null;
  }
  const cur = (currency || quote.currency || "NGN") as AppCurrency;
  return (
    <div className={cn("space-y-0.5", compact ? "text-[11px]" : "text-[12px]")}>
      <p className={cn("font-semibold tabular-nums", ink)}>
        Call-out {formatMoney(fee, cur)}
      </p>
      {quote.tradeBaseFee != null && quote.distanceCharge != null ? (
        <p className={cn("font-medium leading-snug", muted)}>
          Travel fee · {formatMoney(quote.tradeBaseFee, cur)} base
          {quote.billableDistanceKm != null
            ? ` + ${quote.billableDistanceKm} km`
            : ""}
        </p>
      ) : (
        <p className={cn("font-medium", muted)}>Travel / attendance fee</p>
      )}
    </div>
  );
}
