"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, Gift, Wallet as WalletIcon, ArrowUpRight, CreditCard, History, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { useT } from "@/lib/i18n";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

type WalletData = {
  totalEarned: number;
  pendingCredits: number;
  availableCredits: number;
  redeemedCredits: number;
  cashableCredits: number;
  serviceSpendCredits: number;
  reversedCredits: number;
  blockedCredits: number;
};

type ReferralData = {
  code: { referralCode: string; referralLink: string };
  events: { id: string; status: string; rewardAmount: number; createdAt: string }[];
};

type TxData = {
  id: string;
  transactionType: string;
  amount: number;
  status: string;
  reason?: string;
  createdAt: string;
}[];

export default function WalletPage() {
  const { theme, backendUserId } = useApp();
  const isLight = theme === "light";
  const t = useT();

  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [referral, setReferral] = useState<ReferralData | null>(null);
  const [txs, setTxs] = useState<TxData>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [cashoutAmount, setCashoutAmount] = useState("");
  const [cashoutBusy, setCashoutBusy] = useState(false);
  const [cashoutMsg, setCashoutMsg] = useState<string | null>(null);

  const bg = isLight ? "bg-[#c8c9cd]" : "bg-black";
  const card = isLight ? "bg-white" : "bg-[#1c1c1e]";
  const ink = isLight ? "text-black" : "text-white";
  const muted = isLight ? "text-slate-600" : "text-white/60";
  const accent = "#FF6B35";

  const fetchData = useCallback(async () => {
    if (!backendUserId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { authFetch } = await import("@/lib/api-auth-headers");
      const [walletRes, refRes] = await Promise.all([
        authFetch(`/api/security/wallet?userId=${encodeURIComponent(backendUserId)}`),
        authFetch(`/api/security/referral?userId=${encodeURIComponent(backendUserId)}`),
      ]);
      const wJson = await walletRes.json();
      const rJson = await refRes.json();
      if (wJson.ok) {
        setWallet(wJson.data.wallet);
        setTxs(wJson.data.transactions || []);
      }
      if (rJson.ok) setReferral(rJson.data);
    } catch { /* */ }
    setLoading(false);
  }, [backendUserId]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  const handleCopy = async () => {
    if (!referral?.code.referralCode) return;
    try {
      await navigator.clipboard.writeText(referral.code.referralCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* */ }
  };

  const handleCashout = async () => {
    if (!cashoutAmount || !backendUserId) return;
    setCashoutBusy(true);
    setCashoutMsg(null);
    try {
      const { authFetch } = await import("@/lib/api-auth-headers");
      const res = await authFetch("/api/security/cashout", {
        method: "POST",
        body: JSON.stringify({ userId: backendUserId, requestedAmount: Number(cashoutAmount) }),
      });
      const json = await res.json();
      if (json.ok) {
        setCashoutMsg("Cashout request submitted. Awaiting admin approval.");
        setCashoutAmount("");
        void fetchData();
      } else {
        setCashoutMsg(json.error || "Failed");
      }
    } catch { setCashoutMsg("Network error"); }
    setCashoutBusy(false);
  };

  const statBox = (label: string, value: string | number, compact = false) => (
    <div className={cn("rounded-xl", compact ? "p-2" : "p-3", card)}>
      <p className={cn("text-[10px] font-semibold", muted)}>{label}</p>
      <p className={cn("mt-0.5 text-[15px] font-bold", ink)}>{value}</p>
    </div>
  );

  return (
    <div className={cn("flex h-full flex-col", bg)}>
      <PageHeader title="Refer & Earn" />
      <div className="flex-1 overflow-hidden px-4 pb-4">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin" style={{ color: accent }} />
          </div>
        ) : !backendUserId ? (
          <div className="flex items-center justify-center py-20">
            <p className={cn("text-[13px] font-medium", muted)}>Sign in to view your referral & earnings</p>
          </div>
        ) : (
          <div className="mt-2 space-y-3">
            {/* Balance card */}
            <div className={cn("rounded-2xl p-3", card)}>
              <p className={cn("text-[11px] font-semibold", muted)}>Available Credit</p>
              <p className="mt-0.5 text-[24px] font-black" style={{ color: accent }}>
                ₦{wallet?.availableCredits?.toLocaleString() ?? 0}
              </p>
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                {statBox("Total Earned", `₦${(wallet?.totalEarned ?? 0).toLocaleString()}`, true)}
                {statBox("Pending", `₦${(wallet?.pendingCredits ?? 0).toLocaleString()}`, true)}
                {statBox("Cashable", `₦${(wallet?.cashableCredits ?? 0).toLocaleString()}`, true)}
                {statBox("Spent", `₦${(wallet?.serviceSpendCredits ?? 0).toLocaleString()}`, true)}
              </div>
            </div>

            {/* Referral card */}
            <div className={cn("rounded-2xl p-3", card)}>
              <div className="flex items-center gap-1.5">
                <Gift className="h-4 w-4" style={{ color: accent }} />
                <p className={cn("text-[13px] font-bold", ink)}>Refer & Earn</p>
              </div>
              <p className={cn("mt-1 text-[11px] font-medium", muted)}>
                Share your code. Earn credits when friends sign up.
              </p>
              {referral?.code ? (
                <div className="mt-2">
                  <div className={cn("flex items-center gap-2 rounded-xl px-3 py-2", isLight ? "bg-slate-100" : "bg-black/40")}>
                    <code className={cn("flex-1 text-[14px] font-bold tracking-wider", ink)}>
                      {referral.code.referralCode}
                    </code>
                    <button
                      type="button"
                      onClick={handleCopy}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border-0"
                      style={{ backgroundColor: accent, color: "#fff" }}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {copied && <p className="mt-0.5 text-[10px] font-medium text-green-500">Copied!</p>}
                </div>
              ) : (
                <p className={cn("mt-1 text-[11px]", muted)}>Loading referral code...</p>
              )}
            </div>

            {/* Cashout card */}
            <div className={cn("rounded-2xl p-3", card)}>
              <div className="flex items-center gap-1.5">
                <ArrowUpRight className="h-4 w-4" style={{ color: accent }} />
                <p className={cn("text-[13px] font-bold", ink)}>Cash Out</p>
              </div>
              <p className={cn("mt-0.5 text-[10px] font-medium", muted)}>
                Convert eligible credits to cash. Minimum ₦2,000.
              </p>
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="number"
                  placeholder="Amount"
                  value={cashoutAmount}
                  onChange={(e) => setCashoutAmount(e.target.value)}
                  className={cn(
                    "flex-1 rounded-xl border-0 px-3 py-2 text-[13px] font-semibold outline-none",
                    isLight ? "bg-slate-100 text-black" : "bg-black/40 text-white"
                  )}
                />
                <button
                  type="button"
                  disabled={cashoutBusy || !cashoutAmount}
                  onClick={handleCashout}
                  className="h-10 rounded-xl border-0 px-4 text-[12px] font-bold text-white disabled:opacity-50"
                  style={{ backgroundColor: accent }}
                >
                  {cashoutBusy ? "..." : "Request"}
                </button>
              </div>
              {cashoutMsg ? (
                <p className={cn("mt-1 text-[10px] font-medium", cashoutMsg.includes("submitted") ? "text-green-500" : "text-red-500")}>
                  {cashoutMsg}
                </p>
              ) : null}
            </div>

            {/* Transaction history */}
            <div className={cn("rounded-2xl p-3", card)}>
              <div className="flex items-center gap-1.5">
                <History className="h-4 w-4" style={{ color: accent }} />
                <p className={cn("text-[13px] font-bold", ink)}>History</p>
              </div>
              {txs.length === 0 ? (
                <p className={cn("mt-1 text-[11px]", muted)}>No transactions yet.</p>
              ) : (
                <div className="mt-2 space-y-1.5">
                  {txs.slice(0, 20).map((tx) => (
                    <div key={tx.id} className={cn("flex items-center justify-between rounded-xl px-3 py-2", isLight ? "bg-slate-50" : "bg-black/30")}>
                      <div>
                        <p className={cn("text-[11px] font-semibold capitalize", ink)}>
                          {tx.transactionType.replace("_", " ")}
                        </p>
                        <p className={cn("text-[9px]", muted)}>
                          {new Date(tx.createdAt).toLocaleDateString()}
                          {tx.reason ? ` · ${tx.reason}` : ""}
                        </p>
                      </div>
                      <p className={cn("text-[12px] font-bold", tx.amount > 0 ? "text-green-500" : "text-red-400")}>
                        {tx.amount > 0 ? "+" : ""}₦{tx.amount.toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
