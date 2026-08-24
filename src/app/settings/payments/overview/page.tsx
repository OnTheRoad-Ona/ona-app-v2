"use client";

/**
 * Payment / Payout overview money showcase on the main stage only.
 * No cards, no extra fills, no glow, no gradient.
 */

import { Loader2, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { formatMoneyMinor, type AppCurrency } from "@/lib/pricing";
import { usePaymentHistory } from "@/lib/payments/use-payment-history";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

export default function PaymentsOverviewPage() {
  const { theme } = useApp();
  const isLight = theme === "light";
  const { isPro, summary, notes, loading, error, reload, rows } =
    usePaymentHistory();

  const ink = isLight ? "text-slate-900" : "text-white";
  const muted = isLight ? "text-slate-600" : "text-white/60";
  const hair = isLight ? "border-black/12" : "border-white/12";
  const currency = (rows[0]?.currency || "NGN") as AppCurrency;
  const currencyCode = currency === "NGN" ? "NGN" : String(currency);

  const heroLabel = isPro ? "Money held for you" : "Money held now";
  const heroValue = summary
    ? formatMoneyMinor(summary.heldMinor, currency)
    : null;
  const openCount = summary ? summary.heldCount + summary.processingCount : 0;

  const ledger = summary
    ? [
        {
          label: isPro ? "Paid to your bank" : "Released",
          sub: isPro
            ? `${summary.releasedCount} payout${summary.releasedCount === 1 ? "" : "s"} done`
            : `${summary.releasedCount} job${summary.releasedCount === 1 ? "" : "s"} done`,
          value: formatMoneyMinor(summary.releasedMinor, currency),
          money: true,
        },
        {
          label: "Still open",
          sub:
            openCount === 0
              ? "Nothing waiting"
              : `${openCount} job${openCount === 1 ? "" : "s"} in progress`,
          value: formatMoneyMinor(summary.heldMinor, currency),
          money: true,
        },
        {
          label: "Refunded",
          sub:
            summary.refundedCount === 0
              ? "No refunds"
              : `${summary.refundedCount} refund${summary.refundedCount === 1 ? "" : "s"}`,
          value: String(summary.refundedCount),
          money: false,
        },
        {
          label: "Total moves",
          sub: "All time on this role",
          value: String(summary.totalCount),
          money: false,
        },
      ]
    : [];

  return (
    <div
      className={cn(
        "flex h-full flex-col",
        isLight ? "bg-[#c8c9cd]" : "bg-black",
      )}
    >
      <PageHeader
        title={isPro ? "Payout overview" : "Payment overview"}
        backHref="/settings/payments"
      />

      <div className="flex-1 overflow-y-auto px-4 pb-10 scrollbar-hide">
        {/* Top bar: role + refresh */}
        <div className="flex items-center justify-between gap-2 pt-2 pb-1">
          <p
            className={cn(
              "text-[11px] font-bold uppercase tracking-[0.14em]",
              muted,
            )}
          >
            {isPro ? "Repair Pro balance" : "Customer balance"}
          </p>
          <button
            type="button"
            onClick={() => void reload()}
            className={cn(
              "inline-flex items-center gap-1.5 border-0 bg-transparent py-1 text-[12px] font-bold",
              muted,
            )}
            aria-label="Refresh"
          >
            <RefreshCw className="h-3.5 w-3.5" strokeWidth={2.25} />
            Refresh
          </button>
        </div>

        {loading && !summary ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-[#FF6B35]" />
          </div>
        ) : null}

        {error ? (
          <p className="py-6 text-center text-[13px] font-semibold text-red-500">
            {error}
          </p>
        ) : null}

        {summary && heroValue ? (
          <>
            {/* Hero money large, clear, brand accent on the figure */}
            <section className="pt-6 pb-8 text-center">
              <p className={cn("text-[13px] font-semibold", muted)}>
                {heroLabel}
              </p>
              <p
                className={cn(
                  "mt-1 text-[12px] font-bold uppercase tracking-[0.18em]",
                  muted,
                )}
              >
                {currencyCode}
              </p>
              <p
                className="mt-2 text-[40px] font-black leading-none tracking-tight tabular-nums text-[#FF6B35]"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {heroValue}
              </p>
              <p className={cn("mt-3 text-[13px] font-medium", muted)}>
                {openCount === 0
                  ? isPro
                    ? "No payout waiting right now"
                    : "No payment waiting right now"
                  : isPro
                    ? `${openCount} payout${openCount === 1 ? "" : "s"} still open`
                    : `${openCount} payment${openCount === 1 ? "" : "s"} still open`}
              </p>
            </section>

            {/* Money ledger full-width rows, amount on the right */}
            <section aria-label="Balance breakdown">
              <p
                className={cn(
                  "mb-1 text-[11px] font-bold uppercase tracking-[0.14em]",
                  muted,
                )}
              >
                Breakdown
              </p>
              <ul className="m-0 list-none p-0">
                {ledger.map((row, i) => (
                  <li
                    key={row.label}
                    className={cn(
                      "flex items-end justify-between gap-4 py-4",
                      i > 0 && "border-t",
                      i > 0 && hair,
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          "text-[15px] font-bold leading-snug",
                          ink,
                        )}
                      >
                        {row.label}
                      </p>
                      <p
                        className={cn(
                          "mt-0.5 text-[12px] font-medium leading-snug",
                          muted,
                        )}
                      >
                        {row.sub}
                      </p>
                    </div>
                    <p
                      className={cn(
                        "shrink-0 text-right text-[18px] font-black tabular-nums tracking-tight",
                        row.money ? "text-[#FF6B35]" : ink,
                      )}
                      style={{ fontVariantNumeric: "tabular-nums" }}
                    >
                      {row.value}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          </>
        ) : !loading ? (
          <div className="py-20 text-center">
            <p
              className={cn(
                "text-[28px] font-black tabular-nums text-[#FF6B35]",
              )}
            >
              {formatMoneyMinor(0, currency)}
            </p>
            <p className={cn("mt-3 text-[14px] font-semibold", ink)}>
              No money moves yet
            </p>
            <p className={cn("mt-1 text-[12px] font-medium", muted)}>
              {isPro
                ? "When you finish jobs, your pay shows here."
                : "When you pay for a job, it shows here."}
            </p>
          </div>
        ) : null}

        {notes ? (
          <p
            className={cn(
              "mt-8 text-[12px] font-medium leading-relaxed",
              muted,
            )}
          >
            {notes}
          </p>
        ) : null}
      </div>
    </div>
  );
}
