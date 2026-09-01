"use client";

import type { CalloutQuote } from "@/lib/callout/constants";
import {
  jobChargeParts,
  payableCalloutMajor,
  type JobChargeInput,
} from "@/lib/callout/payable";
import { CALLOUT_URGENCY_OPTIONS } from "@/lib/callout/urgency";
import { formatMoney, type AppCurrency } from "@/lib/pricing";
import { cn } from "@/lib/utils";

/**
 * Always Labour + Call Out Fee (₦0 if none) + Total.
 * Display only — see `jobChargeParts`.
 */
export function JobChargeLines({
  labourMajor,
  agreedMajor,
  amountMinor,
  quote,
  fallbackQuote,
  currency,
  ink,
  muted,
  compact,
  isLight,
}: JobChargeInput & {
  currency?: AppCurrency | string | null;
  ink: string;
  muted: string;
  compact?: boolean;
  isLight?: boolean;
}) {
  const parts = jobChargeParts({
    labourMajor,
    agreedMajor,
    amountMinor,
    quote,
    fallbackQuote,
  });
  if (!parts) return null;
  const cur = (currency || quote?.currency || fallbackQuote?.currency || "NGN") as AppCurrency;
  const size = compact ? "text-[11px]" : "text-[12px]";
  return (
    <div className={cn("w-full text-left", size)}>
      <div className="flex items-baseline justify-between gap-3">
        <span className={cn("font-medium", muted)}>Labour</span>
        <span className={cn("font-semibold tabular-nums", ink)}>
          {formatMoney(parts.labourMajor, cur)}
        </span>
      </div>
      <div className="mt-1 flex items-baseline justify-between gap-3">
        <span className={cn("font-medium", muted)}>Call Out Fee</span>
        <span className={cn("font-semibold tabular-nums", ink)}>
          {formatMoney(parts.calloutMajor, cur)}
        </span>
      </div>
      <div
        className={cn(
          "mt-2 flex items-baseline justify-between gap-3 border-t",
          compact ? "pt-1.5" : "pt-2",
          isLight === false ? "border-white/10" : "border-black/10",
        )}
      >
        <span className={cn("font-black", ink)}>Total</span>
        <span className={cn("font-black tabular-nums", ink)}>
          {formatMoney(parts.totalMajor, cur)}
        </span>
      </div>
    </div>
  );
}

export function CalloutFeeLines({
  quote,
  currency,
  ink,
  muted,
  compact,
  totalOnly,
}: {
  quote: CalloutQuote | null | undefined;
  currency?: AppCurrency | string | null;
  ink: string;
  muted: string;
  compact?: boolean;
  totalOnly?: boolean;
}) {
  if (!quote) return null;
  const fee = payableCalloutMajor(quote);
  if (fee <= 0) {
    if (quote.calloutStatus === "NOT_ELIGIBLE") {
      return (
        <p
          className={cn(
            compact ? "text-[11px]" : "text-[12px]",
            "font-medium",
            muted,
          )}
        >
          No Call Out Fee
        </p>
      );
    }
    return null;
  }
  const cur = (currency || quote.currency || "NGN") as AppCurrency;
  const size = compact ? "text-[11px]" : "text-[12px]";

  if (totalOnly) {
    return (
      <div className={cn("space-y-0.5", size)}>
        <div className="flex items-baseline justify-between gap-3">
          <span className={cn("font-bold", ink)}>Call Out Fee</span>
          <span className={cn("font-black tabular-nums", ink)}>
            {formatMoney(fee, cur)}
          </span>
        </div>
      </div>
    );
  }

  const base = quote.tradeBaseFee;
  const distance = quote.distanceCharge;
  const km = quote.billableDistanceKm;
  const mult = quote.urgencyMultiplier;
  const kind =
    quote.urgencyKind == null
      ? ""
      : (CALLOUT_URGENCY_OPTIONS.find((o) => o.id === quote.urgencyKind)
          ?.label ?? "");
  const raw = base != null && distance != null ? base + distance : null;
  // The exact amount the multiplier added on top of Base + Travel.
  const added = mult != null && mult !== 1 && raw != null ? fee - raw : null;

  if (base == null || distance == null) {
    return (
      <div className={cn("space-y-0.5", size)}>
        <div className="flex items-baseline justify-between gap-3">
          <span className={cn("font-medium", muted)}>Call Out Fee</span>
          <span className={cn("font-semibold tabular-nums", ink)}>
            {formatMoney(fee, cur)}
          </span>
        </div>
        <p className={cn("font-medium", muted)}>Travel / attendance fee</p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-1", size)}>
      <div className="flex items-baseline justify-between gap-3">
        <span className={cn("font-medium", muted)}>Base Fee</span>
        <span className={cn("font-semibold tabular-nums", ink)}>
          {formatMoney(base, cur)}
        </span>
      </div>
      <div className="flex items-baseline justify-between gap-3">
        <span className={cn("font-medium", muted)}>
          Travel Fee{km != null ? ` (${km} km)` : ""}
        </span>
        <span className={cn("font-semibold tabular-nums", ink)}>
          {formatMoney(distance, cur)}
        </span>
      </div>
      {mult != null && mult !== 1 && added != null ? (
        <div className="flex items-baseline justify-between gap-3">
          <span className={cn("font-medium", muted)}>
            × {mult}
            {kind ? ` ${kind}` : ""}
          </span>
          <span className={cn("font-semibold tabular-nums", ink)}>
            +{formatMoney(added, cur)}
          </span>
        </div>
      ) : null}
      <div className="flex items-baseline justify-between gap-3 pt-1">
        <span className={cn("font-bold", ink)}>Call Out Fee</span>
        <span className={cn("font-black tabular-nums", ink)}>
          {formatMoney(fee, cur)}
        </span>
      </div>
    </div>
  );
}
