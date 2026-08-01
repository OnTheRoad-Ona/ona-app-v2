"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { navigateBack } from "@/lib/navigation";
import { formatMoneyMinor, type AppCurrency } from "@/lib/pricing";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

type PayRow = {
  id: string;
  requestId: string;
  amountMinor: number;
  currency: AppCurrency;
  escrowStatus: string;
  statusLabel?: string;
  statusTone?: string;
  provider: string;
  providerRef?: string | null;
  paidAt: string | null;
  releasedAt: string | null;
  refundedAt?: string | null;
  createdAt: string;
  proPayoutMinor?: number | null;
  platformFeeMinor?: number | null;
  showSplit?: boolean;
  href?: string;
};

export default function PaymentHistoryPage() {
  const router = useRouter();
  const { theme, userProfile, accountType, backendUserId } = useApp();
  const isLight = theme === "light";
  const isPro = accountType === "professional";
  const userId = backendUserId || userProfile?.identityId || null;
  const [rows, setRows] = useState<PayRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }
    const role = isPro ? "professional" : "motorist";
    void fetch(
      `/api/payments/history?userId=${encodeURIComponent(userId)}&role=${role}`,
      { cache: "no-store" }
    )
      .then((r) => r.json())
      .then((json) => {
        if (json?.ok) setRows(json.data.payments || []);
      })
      .finally(() => setLoading(false));
  }, [userId, isPro]);

  const sheet = isLight ? "bg-[#c8c9cd]" : "bg-black";
  const ink = isLight ? "text-slate-900" : "text-white";
  const muted = isLight ? "text-slate-600" : "text-white/55";

  return (
    <div className={cn("flex h-full min-h-0 flex-col", sheet)}>
      <header className="flex items-center gap-2 px-3 py-2.5">
        <button
          type="button"
          onClick={() => navigateBack(router, isPro ? "/dashboard" : "/settings")}
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-lg border-0",
            isLight ? "bg-[#c8c9cd] text-slate-900" : "bg-black text-white"
          )}
          style={{
            backgroundColor: isLight ? "#c8c9cd" : "#000000",
          }}
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h1 className={cn("text-[15px] font-bold", ink)}>
          {isPro ? "Payout history" : "Payment history"}
        </h1>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 pb-4 pt-3 scrollbar-hide">
        <div className="rounded-xl p-3.5 bg-transparent">
          <div className="flex items-center justify-between">
            <div>
              <p className={cn("text-[11px] font-semibold uppercase tracking-wide", isLight ? "text-slate-500" : "text-white/60")}>
                Linked Bank Account ({isPro ? "Payouts" : "Refunds"})
              </p>
              <p className={cn("mt-1 text-[14px] font-bold", ink)}>
                {userProfile?.bankName ? `${userProfile.bankName} · ••••${(userProfile.bankAccountNumber || "").slice(-4)}` : "No bank account added"}
              </p>
              {userProfile?.bankAccountName && (
                <p className={cn("text-[12px] font-medium", muted)}>
                  {userProfile.bankAccountName}
                </p>
              )}
            </div>
            <Link
              href="/settings/payments"
              className="rounded-lg bg-[#FF6B35] px-3 py-1.5 text-[11px] font-bold text-white shadow-sm hover:bg-[#ff8255]"
            >
              {userProfile?.bankName ? "Edit" : "Add Bank"}
            </Link>
          </div>
        </div>

        {loading && <p className={cn("text-[12px]", muted)}>Loading…</p>}
        {!loading && rows.length === 0 && (
          <p className={cn("text-[12px]", muted)}>
            {isPro
              ? "No payouts yet. Earnings appear after jobs are confirmed."
              : "No payments yet. Escrow payments appear here with status."}
          </p>
        )}
        {rows.map((p) => {
          const displayAmt =
            isPro && p.proPayoutMinor != null ? p.proPayoutMinor : p.amountMinor;
          return (
            <Link
              key={p.id}
              href={p.href || `/jobs/${p.requestId}`}
              className={cn(
                "block rounded-2xl px-3 py-3 active:opacity-90",
                isLight ? "bg-black/[0.04]" : "bg-[#1c1c1e]"
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className={cn("text-[14px] font-black tabular-nums", ink)}>
                    {formatMoneyMinor(displayAmt, p.currency)}
                  </p>
                  <p className={cn("text-[10px]", muted)}>
                    {p.statusLabel || p.escrowStatus}
                    {p.provider ? ` · ${p.provider}` : ""}
                  </p>
                </div>
                <span className="rounded-full bg-[#FF6B35]/15 px-2 py-0.5 text-[10px] font-bold text-[#FF6B35]">
                  {p.escrowStatus}
                </span>
              </div>
              {isPro && p.showSplit && p.proPayoutMinor != null ? (
                <p className={cn("mt-1.5 text-[10px]", muted)}>
                  Your share (87.5% after Ona 5% + VAT 7.5%) ·{" "}
                  {formatMoneyMinor(p.proPayoutMinor, p.currency)}
                </p>
              ) : null}
              {p.providerRef ? (
                <p className="mt-1 text-[10px] font-semibold text-[#FF6B35]">
                  Receipt · {p.providerRef}
                </p>
              ) : null}
              <p className={cn("mt-0.5 text-[10px]", muted)}>
                {p.paidAt
                  ? `Paid ${new Date(p.paidAt).toLocaleString()}`
                  : new Date(p.createdAt).toLocaleString()}
                {p.releasedAt
                  ? ` · Released ${new Date(p.releasedAt).toLocaleString()}`
                  : ""}
                {p.refundedAt ? " · Refunded" : ""}
              </p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
