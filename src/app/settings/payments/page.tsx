"use client";

/**
 * Settings → Payments
 * - Bank details (both roles)
 * - Payment / payout history + status (role-aware)
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Building2,
  ChevronRight,
  Clock3,
  Loader2,
  RefreshCw,
  Wallet,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import {
  BankDetailsFields,
  type BankDetailsValue,
} from "@/components/auth/bank-details-fields";
import {
  checkBankAccountAvailable,
  hasCompleteBankDetails,
  validateBankDetailsInput,
} from "@/lib/bank-details";
import { formatMoneyMinor, type AppCurrency } from "@/lib/pricing";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

type PayRow = {
  id: string;
  requestId: string;
  amountMinor: number;
  currency: AppCurrency;
  escrowStatus: string;
  statusLabel: string;
  statusTone: "ok" | "warn" | "bad" | "muted";
  provider: string;
  paidAt: string | null;
  releasedAt: string | null;
  createdAt: string;
  href: string;
  proPayoutMinor: number | null;
  platformFeeMinor: number | null;
  showSplit: boolean;
  nextRetryAt?: string | null;
  payoutStatus?: string | null;
};

type Summary = {
  totalCount: number;
  heldCount: number;
  releasedCount: number;
  processingCount: number;
  refundedCount: number;
  heldMinor: number;
  releasedMinor: number;
};

function toneClass(tone: PayRow["statusTone"], isLight: boolean) {
  switch (tone) {
    case "ok":
      return "text-emerald-600";
    case "warn":
      return "text-[#FF6B35]";
    case "bad":
      return "text-red-500";
    default:
      return isLight ? "text-slate-600" : "text-white/60";
  }
}

export default function SettingsPaymentsPage() {
  const {
    theme,
    userProfile,
    updateUserProfile,
    accountType,
    backendUserId,
  } = useApp();
  const isLight = theme === "light";
  const isPro = accountType === "professional";
  const userId =
    backendUserId || userProfile?.identityId || null;

  const [details, setDetails] = useState<BankDetailsValue>({
    bankCode: "",
    bankName: "",
    bankAccountName: "",
    bankAccountNumber: "",
  });
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);

  const [rows, setRows] = useState<PayRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [notes, setNotes] = useState<string | null>(null);
  const [histLoading, setHistLoading] = useState(true);
  const [histErr, setHistErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<
    "all" | "active" | "released" | "refunded"
  >("all");

  useEffect(() => {
    if (!userProfile) return;
    setDetails({
      bankCode: userProfile.bankCode || "",
      bankName: userProfile.bankName || "",
      bankAccountName: userProfile.bankAccountName || "",
      bankAccountNumber: userProfile.bankAccountNumber || "",
    });
  }, [userProfile]);

  const complete = hasCompleteBankDetails({
    ...userProfile!,
    bankCode: details.bankCode,
    bankName: details.bankName,
    bankAccountName: details.bankAccountName,
    bankAccountNumber: details.bankAccountNumber,
  } as NonNullable<typeof userProfile>);

  useEffect(() => {
    if (!complete) setEditing(true);
  }, [complete]);

  const loadHistory = useCallback(async () => {
    if (!userId) {
      setHistLoading(false);
      setRows([]);
      return;
    }
    setHistLoading(true);
    setHistErr(null);
    try {
      const role = isPro ? "professional" : "motorist";
      const res = await fetch(
        `/api/payments/history?userId=${encodeURIComponent(userId)}&role=${role}`,
        { cache: "no-store" }
      );
      const json = (await res.json()) as {
        ok?: boolean;
        data?: {
          payments?: PayRow[];
          summary?: Summary;
          notes?: string;
        };
        error?: { message?: string };
      };
      if (!json?.ok) {
        setHistErr(json?.error?.message || "Could not load payments");
        setRows([]);
        setSummary(null);
      } else {
        setRows(json.data?.payments || []);
        setSummary(json.data?.summary || null);
        setNotes(json.data?.notes || null);
      }
    } catch {
      setHistErr("Could not load payments");
    } finally {
      setHistLoading(false);
    }
  }, [userId, isPro]);

  useEffect(() => {
    void loadHistory();
    const t = window.setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      void loadHistory();
    }, 45_000);
    return () => window.clearInterval(t);
  }, [loadHistory]);

  const save = async () => {
    setErr(null);
    setMsg(null);
    const num = details.bankAccountNumber.replace(/\D/g, "").slice(0, 10);
    const code = details.bankCode.trim();
    const validation = validateBankDetailsInput(
      { ...details, bankAccountNumber: num, bankCode: code },
      undefined,
      userProfile?.fullName
    );
    if (validation) {
      setErr(validation);
      return;
    }
    setBusy(true);
    const uniq = await checkBankAccountAvailable({
      bankCode: code,
      accountNumber: num,
    });
    if (!uniq.ok) {
      setBusy(false);
      setErr(uniq.error);
      return;
    }
    const e = updateUserProfile({
      bankCode: code,
      bankName: details.bankName.trim(),
      bankAccountName: details.bankAccountName.trim(),
      bankAccountNumber: num,
    });
    setBusy(false);
    if (e) setErr(e);
    else {
      setMsg("Bank details saved");
      setEditing(false);
    }
  };

  const sheet = isLight ? "bg-[#c8c9cd]" : "bg-black";
  const ink = isLight ? "text-slate-900" : "text-white";
  const muted = isLight ? "text-slate-600" : "text-white/65";
  const card = isLight ? "bg-black/[0.04]" : "bg-[#1c1c1e]";

  const filtered = rows.filter((p) => {
    if (filter === "all") return true;
    if (filter === "active")
      return ["held", "pending_settlement", "release_pending", "pending_payment"].includes(
        p.escrowStatus
      );
    if (filter === "released")
      return p.escrowStatus === "released" || p.statusLabel === "Paid out";
    if (filter === "refunded") return p.escrowStatus === "refunded";
    return true;
  });

  const currency = (rows[0]?.currency || "NGN") as AppCurrency;

  return (
    <div className={cn("flex h-full flex-col", sheet)}>
      <PageHeader
        title={isPro ? "Payments & payouts" : "Payments & refunds"}
        backHref="/settings"
      />
      <div className="flex-1 space-y-3 overflow-y-auto px-3 pb-8 scrollbar-hide">
        {/* Summary (Payment overview) */}
        <section className={cn("rounded-2xl px-3 py-3", card)}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-[#FF6B35]" />
              <p className={cn("text-[13px] font-black", ink)}>
                {isPro ? "Payout overview" : "Payment overview"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadHistory()}
              className={cn(
                "inline-flex items-center gap-1 border-0 bg-transparent text-[11px] font-bold",
                muted
              )}
              aria-label="Refresh"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </button>
          </div>
          {histLoading && !summary ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-[#FF6B35]" />
            </div>
          ) : summary ? (
            <div className="grid grid-cols-2 gap-2">
              <div className={cn("rounded-xl px-2.5 py-2", isLight ? "bg-black/[0.04]" : "bg-white/5")}>
                <p className={cn("text-[10px] font-bold uppercase", muted)}>
                  {isPro ? "In escrow / processing" : "Held / processing"}
                </p>
                <p className={cn("mt-0.5 text-[15px] font-black tabular-nums", ink)}>
                  {formatMoneyMinor(summary.heldMinor, currency)}
                </p>
                <p className={cn("text-[10px]", muted)}>
                  {summary.heldCount + summary.processingCount} open
                </p>
              </div>
              <div className={cn("rounded-xl px-2.5 py-2", isLight ? "bg-black/[0.04]" : "bg-white/5")}>
                <p className={cn("text-[10px] font-bold uppercase", muted)}>
                  {isPro ? "Paid out" : "Released"}
                </p>
                <p className={cn("mt-0.5 text-[15px] font-black tabular-nums", ink)}>
                  {formatMoneyMinor(summary.releasedMinor, currency)}
                </p>
                <p className={cn("text-[10px]", muted)}>
                  {summary.releasedCount} done
                </p>
              </div>
            </div>
          ) : (
            <p className={cn("text-[12px]", muted)}>No payment activity yet.</p>
          )}
          {notes ? (
            <p className={cn("mt-2 text-[11px] font-medium leading-snug", muted)}>
              {notes}
            </p>
          ) : null}
        </section>

        {/* Bank account details (Directly below Payment overview) */}
        <section className={cn("rounded-2xl px-3 py-3", card)}>
          <div className="mb-3 flex items-start gap-2">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#FF6B35]">
              <Building2 className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <p className={cn("text-[15px] font-black", ink)}>
                Bank account details
              </p>
              {complete && !editing ? (
                <p className="mt-1 text-[12px] font-semibold text-emerald-600">
                  {isPro ? "Payout bank on file" : "Refund bank on file"}
                </p>
              ) : (
                <p className={cn("mt-1 text-[11px] font-bold text-[#FF6B35]")}>
                  {isPro
                    ? "Required to receive job payouts"
                    : "Used if a refund is processed"}
                </p>
              )}
            </div>
            {complete && !editing ? (
              <button
                type="button"
                onClick={() => {
                  setEditing(true);
                  setMsg(null);
                  setErr(null);
                }}
                className="shrink-0 rounded-md border-0 bg-[#FF6B35] px-3 py-1.5 text-[12px] font-bold text-white"
              >
                Edit
              </button>
            ) : null}
          </div>

          {complete && !editing ? (
            <div className={cn("space-y-2 text-[13px] font-semibold", ink)}>
              <p>
                <span className={cn("text-[11px] font-bold uppercase", muted)}>
                  Bank
                </span>
                <br />
                {details.bankName || "—"}
              </p>
              <p>
                <span className={cn("text-[11px] font-bold uppercase", muted)}>
                  Account number
                </span>
                <br />
                {details.bankAccountNumber
                  ? `••••${details.bankAccountNumber.slice(-4)}`
                  : "—"}
              </p>
              <p>
                <span className={cn("text-[11px] font-bold uppercase", muted)}>
                  Account name
                </span>
                <br />
                {details.bankAccountName || "—"}
              </p>
            </div>
          ) : (
            <>
              <BankDetailsFields
                isLight={isLight}
                initial={details}
                onChange={setDetails}
                signupFullName={userProfile?.fullName}
                countryIso={userProfile?.identityCountryIso || "NG"}
              />

              {err ? (
                <p className="mt-2 text-center text-[12px] font-semibold text-red-500">
                  {err}
                </p>
              ) : null}
              {msg ? (
                <p className="mt-2 text-center text-[12px] font-semibold text-emerald-600">
                  {msg}
                </p>
              ) : null}

              <div className="mt-3 flex gap-2">
                {complete ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setEditing(false);
                      setErr(null);
                      setMsg(null);
                      if (userProfile) {
                        setDetails({
                          bankCode: userProfile.bankCode || "",
                          bankName: userProfile.bankName || "",
                          bankAccountName: userProfile.bankAccountName || "",
                          bankAccountNumber:
                            userProfile.bankAccountNumber || "",
                        });
                      }
                    }}
                    className={cn(
                      "inline-flex h-12 flex-1 items-center justify-center rounded-lg border-0 text-[14px] font-black",
                      isLight
                        ? "bg-black/10 text-slate-900"
                        : "bg-white/10 text-white"
                    )}
                  >
                    Cancel
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void save()}
                  className="inline-flex h-12 flex-1 items-center justify-center rounded-lg border-0 bg-[#FF6B35] text-[14px] font-black text-white disabled:opacity-50"
                >
                  {busy ? "Saving…" : "Save bank details"}
                </button>
              </div>
            </>
          )}
        </section>

        {/* History list */}
        <section className={cn("rounded-2xl px-3 py-3", card)}>
          <div className="mb-2 flex items-center gap-2">
            <Clock3 className="h-4 w-4 text-[#FF6B35]" />
            <p className={cn("text-[13px] font-black", ink)}>Activity</p>
          </div>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {(
              [
                ["all", "All"],
                ["active", "Open"],
                ["released", isPro ? "Paid out" : "Released"],
                ["refunded", "Refunded"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setFilter(k)}
                className={cn(
                  "rounded-full border-0 px-2.5 py-1 text-[11px] font-bold",
                  filter === k
                    ? "bg-[#FF6B35] text-white"
                    : isLight
                      ? "bg-black/10 text-slate-800"
                      : "bg-white/10 text-white/85"
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {histErr ? (
            <p className="text-center text-[12px] font-semibold text-red-500">
              {histErr}
            </p>
          ) : null}
          {histLoading && rows.length === 0 ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-[#FF6B35]" />
            </div>
          ) : null}
          {!histLoading && filtered.length === 0 ? (
            <p className={cn("py-4 text-center text-[12px]", muted)}>
              {rows.length === 0
                ? "No payment transactions yet."
                : "No transactions match this filter."}
            </p>
          ) : null}

          <div className="space-y-2">
            {filtered.map((p) => {
              const displayAmt =
                isPro && p.proPayoutMinor != null ? p.proPayoutMinor : p.amountMinor;
              return (
                <Link
                  key={p.id}
                  href={p.href}
                  className={cn(
                    "flex items-center justify-between rounded-xl p-2.5 no-underline transition-colors",
                    isLight ? "bg-black/[0.03] hover:bg-black/[0.06]" : "bg-white/5 hover:bg-white/10"
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className={cn("text-[13px] font-bold tabular-nums", ink)}>
                      {formatMoneyMinor(displayAmt, p.currency)}
                    </p>
                    <p className={cn("text-[11px]", muted)}>
                      {new Date(p.createdAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <div className="text-right">
                    <p
                      className={cn(
                        "text-[12px] font-bold",
                        toneClass(p.statusTone, isLight)
                      )}
                    >
                      {p.statusLabel}
                    </p>
                    <p className={cn("text-[10px]", muted)}>
                      {p.provider}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
