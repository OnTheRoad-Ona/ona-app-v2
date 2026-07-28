"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { useAdminGate } from "@/components/admin/use-admin-gate";
import { withSensitivePassword } from "@/components/admin/sensitive-unlock";
import {
  adminRoleLabel,
  canCancelEscrowUi,
  canForcePayoutUi,
  canManualStandalonePayoutUi,
  normalizeAdminRoleUi,
} from "@/lib/admin-role-ui";

type Payment = {
  id: string;
  amount_kobo: number;
  currency: string;
  status: string;
  escrow_status?: string | null;
  effective_status?: string | null;
  display_status?: string | null;
  provider?: string;
  provider_ref?: string | null;
  created_at: string;
  request_id?: string | null;
  payout_status?: string | null;
  payout_suspended?: boolean | null;
  next_retry_at?: string | null;
  retry_count?: number | null;
  last_release_error?: string | null;
  last_available_ngn?: number | null;
  last_ledger_ngn?: number | null;
  paid_at?: string | null;
  released_at?: string | null;
  meta?: Record<string, unknown> | null;
};

type Ops = {
  flw: { available: number | null; ledger: number | null; refreshedAt: string };
  ona: {
    escrowHeldMinor: number;
    pendingSettlementMinor: number;
    pendingSettlementCount: number;
    releasedCount: number;
    failedCount: number;
    disputedCount: number;
    refundedCount: number;
  };
};

type FilterKey =
  | "all"
  | "held"
  | "pending_settlement"
  | "suspended"
  | "released"
  | "failed"
  | "refunded";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "held", label: "Escrow held" },
  { key: "pending_settlement", label: "Pending settlement" },
  { key: "suspended", label: "Suspended (admin)" },
  { key: "released", label: "Released (Paid)" },
  { key: "failed", label: "Failed" },
  { key: "refunded", label: "Refunded" },
];

function nairaFromKobo(k: number) {
  return `₦${(k / 100).toLocaleString("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function effectiveOf(p: Payment): string {
  if (p.effective_status) return String(p.effective_status).toLowerCase();
  const esc = String(p.escrow_status || p.status || "").toLowerCase();
  if (esc === "released" || p.released_at) return "released";
  if (esc === "refunded") return "refunded";
  const paySt = String(p.payout_status || "").toLowerCase();
  if (
    paySt === "suspended_admin" ||
    p.payout_suspended === true ||
    String(p.meta?.payoutStatus || "").toLowerCase() === "suspended_admin" ||
    p.meta?.payoutSuspended === true
  ) {
    return "suspended";
  }
  if (esc === "failed" || paySt === "failed") return "failed";
  if (esc === "pending_settlement" || esc === "release_pending")
    return "pending_settlement";
  if (esc === "held" || esc === "pending_payment") return "held";
  // status "paid" alone = customer paid (escrow), not pro payout complete
  if (String(p.status).toLowerCase() === "paid") return "held";
  return esc || "unknown";
}

function StatCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  /** Semantic tone for light + dark admin themes */
  tone?:
    | "ledger"
    | "available"
    | "held"
    | "pending"
    | "released"
    | "failed"
    | "refunded";
}) {
  return (
    <div className="om-admin-stat-card" data-tone={tone || undefined}>
      <div className="om-admin-stat-label">{label}</div>
      <div className="om-admin-stat-value">{value}</div>
      {sub ? <div className="om-admin-stat-sub">{sub}</div> : null}
    </div>
  );
}

export default function AdminPaymentsPage() {
  const { adminName, adminRole, ready, api } = useAdminGate();
  const role = normalizeAdminRoleUi(adminRole);
  const canCancel = canCancelEscrowUi(role);
  const canForce = canForcePayoutUi(role);
  const canManual = canManualStandalonePayoutUi(role);
  const [openId, setOpenId] = useState("");
  const [manual, setManual] = useState({
    amountMajor: "",
    bankCode: "",
    accountNumber: "",
    accountName: "",
    reason: "",
  });

  const [payments, setPayments] = useState<Payment[]>([]);
  const [filterCounts, setFilterCounts] = useState<Record<string, number>>({});
  const [ops, setOps] = useState<Ops | null>(null);
  const [opsError, setOpsError] = useState<string | null>(null);
  const [accessNote, setAccessNote] = useState("");
  const [canRetry, setCanRetry] = useState(false);
  const [canControl, setCanControl] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>("all");

  const load = useCallback(async () => {
    const res = await api<{
      payments: Payment[];
      filterCounts?: Record<string, number>;
      ops?: Ops | null;
      opsError?: string | null;
      access?: {
        levelNote?: string;
        canCancelEscrow?: boolean;
        canRetryPayout?: boolean;
        canControl?: boolean;
        canViewFull?: boolean;
      };
    }>("/api/admin/payments");
    setLoading(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setPayments(Array.isArray(res.data.payments) ? res.data.payments : []);
    setFilterCounts(res.data.filterCounts || {});
    setOps(res.data.ops || null);
    setOpsError(res.data.opsError || null);
    setAccessNote(res.data.access?.levelNote || "");
    setCanRetry(Boolean(res.data.access?.canRetryPayout));
    setCanControl(Boolean(res.data.access?.canControl));
    setError(null);
  }, [api]);

  useEffect(() => {
    if (!ready) return;
    void load();
    const t = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(t);
  }, [ready, load]);

  async function cancelEscrow(id: string) {
    const reason = window.prompt(
      "Reason for cancelling this escrow payment (required, min 8 chars):"
    );
    if (!reason || reason.trim().length < 8) {
      setError("Cancellation requires a reason (min 8 characters).");
      return;
    }
    setMsg(null);
    setError(null);
    await withSensitivePassword(
      {
        title: "Cancel escrow payment",
        detail: "Temporary access code required. This refunds held funds.",
      },
      async () => {
        const res = await api<{ message?: string }>("/api/admin/payments", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id,
            action: "cancel_escrow",
            reason: reason.trim(),
            status: "refunded",
          }),
        });
        if (!res.ok) {
          setError(res.message);
          return;
        }
        setMsg(res.data.message || "Payment cancelled");
        await load();
      }
    );
  }

  async function retryOne(p: Payment) {
    setBusy(true);
    setMsg(null);
    setError(null);
    await withSensitivePassword(
      {
        title: "Retry pro payout",
        detail: "Attempts Flutterwave transfer (idempotent).",
      },
      async () => {
        const res = await api<{ result?: { ok?: boolean; message?: string } }>(
          "/api/admin/payments",
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "retry_payout",
              jobId: p.request_id || p.id,
              id: p.id,
            }),
          }
        );
        if (!res.ok) {
          setError(res.message);
          return;
        }
        const r = res.data.result;
        setMsg(
          r?.ok
            ? "Payout released successfully"
            : r?.message || "Retry scheduled / pending settlement"
        );
        await load();
      }
    );
    setBusy(false);
  }

  async function retryAllDue() {
    setBusy(true);
    setMsg(null);
    setError(null);
    const res = await api<{
      succeeded?: number;
      stillPending?: number;
      failed?: number;
      checked?: number;
    }>("/api/admin/payments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "retry_all_due", id: "queue" }),
    });
    if (!res.ok) setError(res.message);
    else {
      setMsg(
        `Queue: checked ${res.data.checked ?? 0} · released ${res.data.succeeded ?? 0} · still pending ${res.data.stillPending ?? 0} · failed ${res.data.failed ?? 0}`
      );
      await load();
    }
    setBusy(false);
  }

  const filtered = useMemo(() => {
    return payments.filter((p) => {
      const e = effectiveOf(p);
      if (filter === "all") return true;
      if (filter === "held") return e === "held" || e === "pending_payment";
      if (filter === "pending_settlement")
        return e === "pending_settlement" || e === "release_pending";
      if (filter === "suspended") return e === "suspended";
      if (filter === "released") return e === "released";
      if (filter === "failed") return e === "failed";
      if (filter === "refunded") return e === "refunded";
      return true;
    });
  }, [payments, filter]);

  const counts = useMemo(() => {
    // Prefer server counts; fall back to client if missing
    if (filterCounts.all != null) return filterCounts;
    const c: Record<string, number> = {
      all: payments.length,
      held: 0,
      pending_settlement: 0,
      suspended: 0,
      released: 0,
      failed: 0,
      refunded: 0,
    };
    for (const p of payments) {
      const e = effectiveOf(p);
      if (e === "held" || e === "pending_payment") c.held += 1;
      else if (e === "suspended") c.suspended += 1;
      else if (e === "pending_settlement" || e === "release_pending")
        c.pending_settlement += 1;
      else if (e === "released") c.released += 1;
      else if (e === "failed") c.failed += 1;
      else if (e === "refunded") c.refunded += 1;
    }
    return c;
  }, [filterCounts, payments]);

  return (
    <AdminShell adminName={adminName} adminRole={adminRole}>
      <h1 className="om-admin-h1">Payment management</h1>
      <p className="om-admin-sub">
        Track the full money path: customer collection → escrow held → payout from
        FLW <strong>Available</strong> balance (not Ledger) → pro bank (87.5%) · Ona
        platform 5% (minus FLW fees, Zenith) · VAT 7.5% stays on FLW.{" "}
        <strong>Released (Paid)</strong> = pro transfer succeeded. Pending settlement
        auto-retries every 10 minutes for 24 hours, then suspends for admin
        manual pay. Idempotent transfer refs prevent double pay.
      </p>
      {accessNote ? (
        <p className="om-admin-muted" style={{ marginBottom: 8 }}>
          {accessNote}
        </p>
      ) : null}
      {error ? <div className="om-admin-error">{error}</div> : null}
      {msg ? <div className="om-admin-success">{msg}</div> : null}

      {/* Balances always rendered — never silently omit the board */}
      <div
        className="om-admin-panel"
        style={{ marginBottom: 16 }}
        aria-label="Payment balances"
      >
        <h2 className="om-admin-h2" style={{ marginTop: 0 }}>
          Balances & settlement
        </h2>
        {loading && !ops ? (
          <p className="om-admin-muted">Loading Flutterwave + Ona balances…</p>
        ) : ops ? (
          <>
            <p
              className="om-admin-muted"
              style={{ marginBottom: 10, fontSize: 12 }}
            >
              Flutterwave wallet refreshed{" "}
              {ops.flw.refreshedAt
                ? new Date(ops.flw.refreshedAt).toLocaleString()
                : "—"}
              {" · "}
              Backend source of truth; FE mirrors this snapshot.
            </p>
            <div className="om-admin-stat-grid">
              <StatCard
                label="Collection (FLW Ledger)"
                value={
                  ops.flw.ledger != null
                    ? `₦${ops.flw.ledger.toLocaleString("en-NG", {
                        minimumFractionDigits: 2,
                      })}`
                    : "—"
                }
                sub="Customer payments settling"
                tone="ledger"
              />
              <StatCard
                label="Payout balance (FLW Available)"
                value={
                  ops.flw.available != null
                    ? `₦${ops.flw.available.toLocaleString("en-NG", {
                        minimumFractionDigits: 2,
                      })}`
                    : "—"
                }
                sub="Used for pro transfers now"
                tone="available"
              />
              <StatCard
                label="Escrow held"
                value={nairaFromKobo(ops.ona.escrowHeldMinor)}
                sub="Paid by customer · not released"
                tone="held"
              />
              <StatCard
                label="Pending settlement / retry"
                value={nairaFromKobo(ops.ona.pendingSettlementMinor)}
                sub={`${ops.ona.pendingSettlementCount} jobs · 10 min · 24h max`}
                tone="pending"
              />
              <StatCard
                label="Released (Paid)"
                value={String(ops.ona.releasedCount)}
                sub="Pro paid 87.5%"
                tone="released"
              />
              <StatCard
                label="Failed (needs admin)"
                value={String(ops.ona.failedCount)}
                sub="Hard fail · bank/API"
                tone="failed"
              />
              <StatCard
                label="Refunded (in merchant)"
                value={String(ops.ona.refundedCount)}
                sub="Manual refund / resend"
                tone="refunded"
              />
            </div>
          </>
        ) : (
          <div className="om-admin-error" style={{ marginBottom: 0 }}>
            Balances unavailable
            {opsError ? `: ${opsError}` : ". Check FLW credentials / proxy."}
          </div>
        )}
        {canRetry || canControl ? (
          <div style={{ marginTop: 12 }}>
            <button
              type="button"
              className="om-admin-btn"
              disabled={busy || !canRetry}
              onClick={() => void retryAllDue()}
              title={
                canRetry
                  ? "Process all due pending_settlement payouts"
                  : "Requires escrow_release (L3+)"
              }
            >
              Run retry queue now
            </button>
          </div>
        ) : null}
      </div>

      <div className="om-admin-panel">
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            marginBottom: 12,
            alignItems: "center",
          }}
        >
          <h2 className="om-admin-h2" style={{ margin: 0, flex: 1 }}>
            Payments
          </h2>
          {FILTERS.map(({ key, label }) => {
            const n = counts[key] ?? 0;
            const active = filter === key;
            return (
              <button
                key={key}
                type="button"
                className="om-admin-btn-ghost"
                style={{
                  fontWeight: active ? 800 : 500,
                  textDecoration: active ? "underline" : "none",
                  opacity: key !== "all" && n === 0 ? 0.55 : 1,
                }}
                onClick={() => setFilter(key)}
              >
                {label} ({n})
              </button>
            );
          })}
          <button
            type="button"
            className="om-admin-btn-ghost"
            onClick={() => void load()}
          >
            Refresh
          </button>
        </div>
        <p className="om-admin-muted" style={{ marginTop: 0, fontSize: 12 }}>
          Filters show live counts from the backend. Zero means nothing in that
          bucket right now (e.g. no open escrow) — switch to{" "}
          <strong>All</strong> or <strong>Released (Paid)</strong> /{" "}
          <strong>Refunded</strong> to review history.
        </p>
        <table className="om-admin-table">
          <thead>
            <tr>
              <th>Amount</th>
              <th>Escrow</th>
              <th>Settlement</th>
              <th>When</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && payments.length === 0 ? (
              <tr>
                <td colSpan={5} className="om-admin-muted">
                  Loading payments…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="om-admin-muted">
                  No payments in <strong>{filter}</strong>
                  {counts.all != null ? ` (${counts.all} total in list)` : ""}.
                  {filter !== "all" && (counts.all ?? 0) > 0
                    ? " Try All or another filter with a non-zero count."
                    : null}
                </td>
              </tr>
            ) : (
              filtered.map((p) => {
                const e = effectiveOf(p);
                const label =
                  p.display_status ||
                  (e === "released" ? "Released (Paid)" : e);
                return (
                  <tr key={p.id}>
                    <td>{nairaFromKobo(p.amount_kobo)}</td>
                    <td>
                      <span className="om-admin-badge">{label}</span>
                    </td>
                    <td
                      className="om-admin-muted"
                      style={{ fontSize: 12, maxWidth: 220 }}
                    >
                      {p.payout_status || (e === "released" ? "success" : "—")}
                      {p.next_retry_at ? (
                        <div>
                          next retry{" "}
                          {new Date(p.next_retry_at).toLocaleString()}
                        </div>
                      ) : null}
                      {p.last_release_error ? (
                        <div
                          style={{ color: "#b91c1c" }}
                          title={String(p.last_release_error)}
                        >
                          {String(p.last_release_error).slice(0, 80)}
                        </div>
                      ) : null}
                    </td>
                    <td className="om-admin-muted" style={{ fontSize: 12 }}>
                      {p.paid_at
                        ? `customer paid ${new Date(p.paid_at).toLocaleString()}`
                        : new Date(p.created_at).toLocaleString()}
                      {p.released_at ? (
                        <div>
                          pro paid{" "}
                          {new Date(p.released_at).toLocaleString()}
                        </div>
                      ) : null}
                    </td>
                    <td>
                      <div
                        style={{ display: "flex", flexWrap: "wrap", gap: 6 }}
                      >
                        <a
                          className="om-admin-btn-ghost"
                          href={`/admin/payments/${encodeURIComponent(p.id)}`}
                        >
                          FLW transfers
                        </a>
                        {canRetry &&
                        ["held", "pending_settlement", "release_pending"].includes(
                          e
                        ) ? (
                          <button
                            type="button"
                            className="om-admin-btn-ghost"
                            disabled={busy}
                            onClick={() => void retryOne(p)}
                          >
                            Retry payout
                          </button>
                        ) : null}
                        {canCancel &&
                        [
                          "held",
                          "pending_settlement",
                          "release_pending",
                          "pending_payment",
                        ].includes(e) ? (
                          <button
                            type="button"
                            className="om-admin-btn-ghost"
                            onClick={() => void cancelEscrow(p.id)}
                          >
                            Cancel escrow
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
