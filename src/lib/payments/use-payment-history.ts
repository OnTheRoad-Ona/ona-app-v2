"use client";

/**
 * Shared loader for Payments hub sub-pages (overview + activity).
 * Role-aware: motorist = charges/refunds; pro = payouts.
 */

import { useCallback, useEffect, useState } from "react";
import type { AppCurrency } from "@/lib/pricing";
import { useApp } from "@/lib/store";

export type PayRow = {
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

export type PaySummary = {
  totalCount: number;
  heldCount: number;
  releasedCount: number;
  processingCount: number;
  refundedCount: number;
  heldMinor: number;
  releasedMinor: number;
};

export function usePaymentHistory() {
  const { accountType, backendUserId, userProfile } = useApp();
  const isPro = accountType === "professional";
  const userId = backendUserId || userProfile?.identityId || null;

  const [rows, setRows] = useState<PayRow[]>([]);
  const [summary, setSummary] = useState<PaySummary | null>(null);
  const [notes, setNotes] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      setRows([]);
      setSummary(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const role = isPro ? "professional" : "motorist";
      const { authFetch } = await import("@/lib/api-auth-headers");
      const res = await authFetch(
        `/api/payments/history?userId=${encodeURIComponent(userId)}&role=${role}`,
        { cache: "no-store" }
      );
      const json = (await res.json()) as {
        ok?: boolean;
        data?: {
          payments?: PayRow[];
          summary?: PaySummary;
          notes?: string;
        };
        error?: { message?: string };
      };
      if (!json?.ok) {
        setError(json?.error?.message || "Could not load payments");
        setRows([]);
        setSummary(null);
        setNotes(null);
      } else {
        setRows(json.data?.payments || []);
        setSummary(json.data?.summary || null);
        setNotes(json.data?.notes || null);
      }
    } catch {
      setError("Could not load payments");
    } finally {
      setLoading(false);
    }
  }, [userId, isPro]);

  // Load once when the page opens. Manual Refresh reloads — no background poll
  // (payments pages were re-downloading history every 90s for no reason).
  useEffect(() => {
    void load();
  }, [load]);

  return {
    isPro,
    userId,
    rows,
    summary,
    notes,
    loading,
    error,
    reload: load,
  };
}

export function toneClass(
  tone: PayRow["statusTone"],
  isLight: boolean
): string {
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

export function isOpenStatus(escrowStatus: string): boolean {
  return ["held", "pending_settlement", "release_pending", "pending_payment"].includes(
    escrowStatus
  );
}

export function isReleasedStatus(
  escrowStatus: string,
  statusLabel: string
): boolean {
  return escrowStatus === "released" || statusLabel === "Paid out";
}
