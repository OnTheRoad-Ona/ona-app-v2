"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { navigateBack } from "@/lib/navigation";
import {
  formatMoneyMinor,
  type AppCurrency,
} from "@/lib/pricing";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

type PayRow = {
  id: string;
  requestId: string;
  amountMinor: number;
  currency: AppCurrency;
  escrowStatus: string;
  discountPercent: number;
  platformFeeMinor: number;
  proPayoutMinor: number;
  provider: string;
  providerRef: string | null;
  paidAt: string | null;
  releasedAt: string | null;
  refundedAt: string | null;
  labourOnly: boolean;
  createdAt: string;
};

export default function PaymentHistoryPage() {
  const router = useRouter();
  const { theme, userProfile } = useApp();
  const isLight = theme === "light";
  const [rows, setRows] = useState<PayRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const userId = userProfile?.identityId || "motorist-local";
    void fetch(`/api/payments/history?userId=${encodeURIComponent(userId)}`)
      .then((r) => r.json())
      .then((json) => {
        if (json?.ok) setRows(json.data.payments || []);
      })
      .finally(() => setLoading(false));
  }, [userProfile?.identityId]);

  const sheet = isLight ? "bg-[#c8c9cd]" : "bg-black";
  const ink = isLight ? "text-slate-900" : "text-white";
  const muted = isLight ? "text-slate-600" : "text-white/55";

  return (
    <div className={cn("flex h-full min-h-0 flex-col", sheet)}>
      <header className="flex items-center gap-2 px-3 py-2.5">
        <button
          type="button"
          onClick={() => navigateBack(router, "/profile")}
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-lg border-0 bg-transparent",
            ink
          )}
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h1 className={cn("text-[15px] font-bold", ink)}>
          Payments & payouts
        </h1>
      </header>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pb-4 scrollbar-hide">
        {loading && (
          <p className={cn("text-[12px]", muted)}>Loading…</p>
        )}
        {!loading && rows.length === 0 && (
          <p className={cn("text-[12px]", muted)}>
            No payments yet. Labour fees paid at request confirmation appear
            here with escrow status and receipts.
          </p>
        )}
        {rows.map((p) => (
          <article
            key={p.id}
            className={cn(
              "rounded-2xl px-3 py-3",
              isLight ? "bg-black/[0.04]" : "bg-[#1c1c1e]"
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className={cn("text-[14px] font-black tabular-nums", ink)}>
                  {formatMoneyMinor(p.amountMinor, p.currency)}
                </p>
                <p className={cn("text-[10px]", muted)}>
                  {p.provider} · {p.escrowStatus}
                  {p.discountPercent > 0 ? ` · −${p.discountPercent}%` : ""}
                </p>
              </div>
              <span className="rounded-full bg-brand/15 px-2 py-0.5 text-[10px] font-bold text-brand">
                {p.labourOnly ? "Labour only" : "Payment"}
              </span>
            </div>
            <p className={cn("mt-1.5 text-[10px]", muted)}>
              Pro payout 95% ·{" "}
              {formatMoneyMinor(p.proPayoutMinor, p.currency)} · Platform 5% ·{" "}
              {formatMoneyMinor(p.platformFeeMinor, p.currency)}
            </p>
            {p.providerRef && (
              <p className="mt-1 text-[10px] font-semibold text-brand">
                Receipt · {p.providerRef}
              </p>
            )}
            <p className={cn("mt-0.5 text-[10px]", muted)}>
              {p.paidAt
                ? `Paid ${new Date(p.paidAt).toLocaleString()}`
                : new Date(p.createdAt).toLocaleString()}
              {p.releasedAt
                ? ` · Released ${new Date(p.releasedAt).toLocaleString()}`
                : ""}
              {p.refundedAt ? " · Refunded" : ""}
            </p>
          </article>
        ))}
      </div>
    </div>
  );
}
