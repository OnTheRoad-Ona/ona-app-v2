"use client";

/**
 * Payment / payout activity.
 * Status tabs + period strip (1D…YTD). Flat money list. No cards, glow, gradient.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { formatMoneyMinor } from "@/lib/pricing";
import {
  isOpenStatus,
  isReleasedStatus,
  toneClass,
  usePaymentHistory,
} from "@/lib/payments/use-payment-history";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

type StatusFilter = "all" | "active" | "released" | "refunded";
type DateFilter =
  | "1d"
  | "3d"
  | "7d"
  | "1m"
  | "3m"
  | "6m"
  | "1y"
  | "ytd";

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Earliest timestamp for a period filter (inclusive). */
function periodStartMs(filter: DateFilter): number {
  const now = new Date();
  const start = startOfDay(now);

  switch (filter) {
    case "1d":
      return start.getTime();
    case "3d":
      start.setDate(start.getDate() - 2);
      return start.getTime();
    case "7d":
      start.setDate(start.getDate() - 6);
      return start.getTime();
    case "1m":
      start.setMonth(start.getMonth() - 1);
      return start.getTime();
    case "3m":
      start.setMonth(start.getMonth() - 3);
      return start.getTime();
    case "6m":
      start.setMonth(start.getMonth() - 6);
      return start.getTime();
    case "1y":
      start.setFullYear(start.getFullYear() - 1);
      return start.getTime();
    case "ytd":
      return new Date(now.getFullYear(), 0, 1).getTime();
    default:
      return 0;
  }
}

function periodLabel(filter: DateFilter): string {
  switch (filter) {
    case "1d":
      return "Today";
    case "3d":
      return "Last 3 days";
    case "7d":
      return "Last 7 days";
    case "1m":
      return "Last month";
    case "3m":
      return "Last 3 months";
    case "6m":
      return "Last 6 months";
    case "1y":
      return "Last year";
    case "ytd":
      return "Year to date";
    default:
      return "";
  }
}

const DATE_CHIPS: { key: DateFilter; label: string }[] = [
  { key: "1d", label: "1D" },
  { key: "3d", label: "3D" },
  { key: "7d", label: "7D" },
  { key: "1m", label: "1M" },
  { key: "3m", label: "3M" },
  { key: "6m", label: "6M" },
  { key: "1y", label: "1Y" },
  { key: "ytd", label: "YTD" },
];

export default function PaymentsActivityPage() {
  const { theme } = useApp();
  const isLight = theme === "light";
  const { isPro, rows, loading, error, reload } = usePaymentHistory();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("1m");

  const ink = isLight ? "text-slate-900" : "text-white";
  const muted = isLight ? "text-slate-600" : "text-white/60";
  const line = isLight ? "border-black/12" : "border-white/12";
  const segLine = isLight ? "border-black/15" : "border-white/15";

  const filtered = useMemo(() => {
    const dateMin = periodStartMs(dateFilter);

    return rows.filter((p) => {
      if (statusFilter === "active" && !isOpenStatus(p.escrowStatus)) {
        return false;
      }
      if (
        statusFilter === "released" &&
        !isReleasedStatus(p.escrowStatus, p.statusLabel)
      ) {
        return false;
      }
      if (statusFilter === "refunded" && p.escrowStatus !== "refunded") {
        return false;
      }
      const t = new Date(p.createdAt).getTime();
      if (Number.isNaN(t) || t < dateMin) return false;
      return true;
    });
  }, [rows, statusFilter, dateFilter]);

  const periodTotalMinor = useMemo(() => {
    return filtered.reduce((sum, p) => {
      const amt =
        isPro && p.proPayoutMinor != null ? p.proPayoutMinor : p.amountMinor;
      return sum + (Number(amt) || 0);
    }, 0);
  }, [filtered, isPro]);

  const periodCurrency = filtered[0]?.currency || rows[0]?.currency || "NGN";

  const statusChips: { key: StatusFilter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "active", label: "Open" },
    { key: "released", label: isPro ? "Paid out" : "Released" },
    { key: "refunded", label: "Refunded" },
  ];

  return (
    <div
      className={cn(
        "flex h-full flex-col",
        isLight ? "bg-[#c8c9cd]" : "bg-black"
      )}
    >
      <PageHeader title="Activity" backHref="/settings/payments" />

      <div className="flex-1 overflow-y-auto px-4 pb-10 scrollbar-hide">
        {/* Status: full-width segmented tabs */}
        <div
          className={cn("mt-1 flex w-full border-b", segLine)}
          role="tablist"
          aria-label="Status"
        >
          {statusChips.map(({ key, label }) => {
            const on = statusFilter === key;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setStatusFilter(key)}
                className={cn(
                  "relative flex-1 border-0 bg-transparent py-2.5 text-center text-[13px] font-semibold transition-colors",
                  on ? "text-[#FF6B35]" : muted
                )}
              >
                {label}
                {on ? (
                  <span
                    className="absolute inset-x-2 bottom-0 h-[2px] rounded-full bg-[#FF6B35]"
                    aria-hidden
                  />
                ) : null}
              </button>
            );
          })}
        </div>

        {/* Period strip: 1D 3D 7D 1M 3M 6M 1Y YTD */}
        <div className="mt-4 flex items-center gap-2">
          <div
            className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto scrollbar-hide"
            role="tablist"
            aria-label="Time period"
          >
            {DATE_CHIPS.map(({ key, label }) => {
              const on = dateFilter === key;
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => setDateFilter(key)}
                  className={cn(
                    "shrink-0 border-0 bg-transparent px-2.5 py-1.5 text-[12px] font-bold tracking-wide transition-colors",
                    on ? "text-[#FF6B35]" : muted
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => void reload()}
            className={cn(
              "inline-flex h-8 w-8 shrink-0 items-center justify-center border-0 bg-transparent",
              muted
            )}
            aria-label="Refresh"
          >
            <RefreshCw className="h-4 w-4" strokeWidth={2.25} />
          </button>
        </div>

        {/* Period summary — money showcase line */}
        <div className={cn("mt-5 border-b pb-4", line)}>
          <p
            className={cn(
              "text-[11px] font-bold uppercase tracking-[0.14em]",
              muted
            )}
          >
            {periodLabel(dateFilter)}
          </p>
          <div className="mt-1.5 flex items-end justify-between gap-3">
            <p
              className="text-[28px] font-black leading-none tracking-tight tabular-nums text-[#FF6B35]"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {formatMoneyMinor(periodTotalMinor, periodCurrency)}
            </p>
            <p className={cn("pb-0.5 text-[12px] font-semibold", muted)}>
              {filtered.length} move{filtered.length === 1 ? "" : "s"}
            </p>
          </div>
        </div>

        {error ? (
          <p className="py-4 text-center text-[13px] font-semibold text-red-500">
            {error}
          </p>
        ) : null}

        {loading && rows.length === 0 ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-[#FF6B35]" />
          </div>
        ) : null}

        {!loading && filtered.length === 0 ? (
          <div className="py-16 text-center">
            <p className={cn("text-[15px] font-bold", ink)}>
              No moves in this period
            </p>
            <p className={cn("mt-1 text-[12px] font-medium", muted)}>
              Try another range or status above.
            </p>
          </div>
        ) : null}

        {/* Ledger list */}
        <ul className="m-0 list-none p-0">
          {filtered.map((p, i) => {
            const displayAmt =
              isPro && p.proPayoutMinor != null
                ? p.proPayoutMinor
                : p.amountMinor;
            return (
              <li key={p.id}>
                <Link
                  href={p.href}
                  className={cn(
                    "flex items-center gap-3 py-4 no-underline",
                    i > 0 && "border-t",
                    i > 0 && line
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p
                      className="text-[17px] font-black tabular-nums tracking-tight text-[#FF6B35]"
                      style={{ fontVariantNumeric: "tabular-nums" }}
                    >
                      {formatMoneyMinor(displayAmt, p.currency)}
                    </p>
                    <p className={cn("mt-1 text-[12px] font-medium", muted)}>
                      {new Date(p.createdAt).toLocaleDateString(undefined, {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                      <span className="mx-1.5 opacity-35">·</span>
                      {new Date(p.createdAt).toLocaleTimeString(undefined, {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p
                      className={cn(
                        "text-[12px] font-bold leading-tight",
                        toneClass(p.statusTone, isLight)
                      )}
                    >
                      {p.statusLabel}
                    </p>
                    {p.provider ? (
                      <p
                        className={cn(
                          "mt-0.5 text-[10px] font-semibold uppercase tracking-wide",
                          muted
                        )}
                      >
                        {p.provider}
                      </p>
                    ) : null}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
