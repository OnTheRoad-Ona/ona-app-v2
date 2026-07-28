"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { useAdminGate } from "@/components/admin/use-admin-gate";
import { AdminGuideBanner } from "@/components/admin/admin-guide-banner";
import { withSensitivePassword } from "@/components/admin/sensitive-unlock";
import {
  adminRoleLabel,
  canCancelEscrowUi,
  canForcePayoutUi,
  canManualStandalonePayoutUi,
  normalizeAdminRoleUi,
} from "@/lib/admin-role-ui";

type Payment = Record<string, unknown>;
type Ops = {
  flw: { available: number | null; ledger: number | null; refreshedAt: string };
  ona: {
    escrowHeldMinor: number; pendingSettlementMinor: number;
    pendingSettlementCount: number; releasedCount: number;
    failedCount: number; disputedCount: number; refundedCount: number;
    totalCommissionEarnedMinor: number; commissionEarnedCount: number;
    exhaustedCount: number; suspendedCount: number;
  };
};
type FilterKey = "all" | "held" | "pending" | "released" | "failed" | "refunded" | "disputed" | "cancelled";
type TabKey = "payments" | "disputes" | "audit" | "failed" | "commission";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" }, { key: "held", label: "Held" },
  { key: "pending", label: "Pending" }, { key: "released", label: "Paid" },
  { key: "failed", label: "Failed" }, { key: "refunded", label: "Refunded" },
  { key: "disputed", label: "Disputed" }, { key: "cancelled", label: "Cancelled" },
];

const DISPUTE_OUTCOMES = ["full_release_pro", "full_refund_motorist", "partial_split"] as const;

function naira(k: number) { return `₦${(k / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`; }

function effectiveOf(p: Payment): string {
  const esc = String(p.escrow_status || p.status || "").toLowerCase().trim();
  const meta = (p.meta || {}) as Record<string, unknown>;
  const payout = String(meta.payoutStatus || "").toLowerCase();
  if (p._disputed) return "disputed";
  if (esc === "released" || p.released_at) return "released";
  if (esc === "refunded") return "refunded";
  if (payout === "suspended_admin" || meta.payoutSuspended === true) return "suspended";
  if (esc === "failed" || payout === "failed" || meta.payoutFailedAt) return "failed";
  if (esc === "disputed") return "disputed";
  if (esc === "cancelled" || p.status === "cancelled") return "cancelled";
  if (esc === "pending_settlement" || esc === "release_pending") return "pending";
  if (esc === "held" || esc === "pending_payment" || String(p.status).toLowerCase() === "paid") return "held";
  return esc || "unknown";
}

function badgeStyle(type: string): React.CSSProperties {
  const m: Record<string, [string, string]> = {
    released: ["var(--om-success)", "var(--om-success-bg)"],
    held: ["#9a3412", "#fed7aa"],
    pending: ["#92400e", "#fde68a"],
    failed: ["var(--om-danger)", "var(--om-danger-bg)"],
    refunded: ["var(--om-text-muted)", "var(--om-panel)"],
    disputed: ["#854d0e", "#fef08a"],
    cancelled: ["var(--om-text-muted)", "var(--om-panel)"],
  };
  const [fg, bg] = m[type] || ["var(--om-text-muted)", "var(--om-panel)"];
  return { display: "inline-block", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600, background: bg, color: fg };
}

export default function PaymentControlCenter() {
  const { adminName, adminRole, ready, api } = useAdminGate();
  const role = normalizeAdminRoleUi(adminRole);
  const canCancel = canCancelEscrowUi(role);
  const canForce = canForcePayoutUi(role);
  const canManual = canManualStandalonePayoutUi(role);
  const roleLbl = adminRoleLabel(role);

  const [tab, setTab] = useState<TabKey>("payments");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [payments, setPayments] = useState<Payment[]>([]);
  const [filterCounts, setFilterCounts] = useState<Record<string, number>>({});
  const [ops, setOps] = useState<Ops | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [modal, setModal] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => Promise<void>) | null>(null);

  const [disputes, setDisputes] = useState<Record<string, unknown>[]>([]);
  const [disputeOutcome, setDisputeOutcome] = useState<string>("full_release_pro");
  const [disputeNote, setDisputeNote] = useState("");
  const [splitPct, setSplitPct] = useState<Record<string, number>>({});
  const [disputeDetailId, setDisputeDetailId] = useState<string | null>(null);

  const [auditLog, setAuditLog] = useState<Record<string, unknown>[]>([]);

  const [failedPayouts, setFailedPayouts] = useState<Record<string, unknown>[]>([]);
  const [failedPayoutsTotal, setFailedPayoutsTotal] = useState(0);

  const [commReport, setCommReport] = useState<Record<string, unknown> | null>(null);
  const [commPeriod, setCommPeriod] = useState("day");

  const load = useCallback(async () => {
    const res = await api<{ payments: Payment[]; filterCounts?: Record<string, number>; ops?: Ops | null; opsError?: string | null; access?: { canCancelEscrow?: boolean; canRetryPayout?: boolean } }>("/api/admin/payments");
    setLoading(false);
    if (!res.ok) { setError(res.message); return; }
    setPayments(Array.isArray(res.data.payments) ? res.data.payments : []);
    setFilterCounts(res.data.filterCounts || {});
    setOps(res.data.ops || null);
    setError(null);
  }, [api]);

  const loadDisputes = useCallback(async () => {
    const res = await api<{ jobs: Record<string, unknown>[] }>("/api/admin/disputes");
    if (res.ok) setDisputes(Array.isArray(res.data.jobs) ? res.data.jobs : []);
  }, [api]);

  const loadAudit = useCallback(async () => {
    const res = await api<{ actions: Record<string, unknown>[] }>("/api/admin/audit");
    if (res.ok) setAuditLog(Array.isArray(res.data.actions) ? res.data.actions : []);
  }, [api]);

  const loadFailedPayouts = useCallback(async () => {
    const res = await api<{ failed: Record<string, unknown>[]; totalCount: number }>("/api/admin/failed-payouts");
    if (res.ok) { setFailedPayouts(Array.isArray(res.data.failed) ? res.data.failed : []); setFailedPayoutsTotal(res.data.totalCount); }
  }, [api]);

  const loadCommission = useCallback(async (period: string) => {
    const to = new Date().toISOString();
    const from = new Date(Date.now() - 90 * 86400000).toISOString();
    const res = await api<Record<string, unknown>>(`/api/admin/commission?period=${period}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
    if (res.ok) setCommReport(res.data);
  }, [api]);

  useEffect(() => { if (!ready) return; void load(); const t = setInterval(() => void load(), 30_000); return () => clearInterval(t); }, [ready, load]);
  useEffect(() => { if (!ready || tab !== "disputes") return; void loadDisputes(); }, [ready, tab, loadDisputes]);
  useEffect(() => { if (!ready || tab !== "audit") return; void loadAudit(); }, [ready, tab, loadAudit]);
  useEffect(() => { if (!ready || tab !== "failed") return; void loadFailedPayouts(); }, [ready, tab, loadFailedPayouts]);
  useEffect(() => { if (!ready || tab !== "commission") return; void loadCommission(commPeriod); }, [ready, tab, loadCommission, commPeriod]);

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    const res = await api<Record<string, unknown>>(`/api/admin/payments/${encodeURIComponent(id)}`);
    setDetailLoading(false);
    if (res.ok) setDetail(res.data);
  }, [api]);

  useEffect(() => { if (selectedId) { void loadDetail(selectedId); setReason(""); } else setDetail(null); }, [selectedId, loadDetail]);

  async function withPassword(action: () => Promise<void>) {
    if (!password.trim()) { setShowPassword(true); setPendingAction(() => action); return; }
    setShowPassword(false); setPendingAction(null); setBusy(true); setError(null);
    const unlock = await api<{ expiresAt?: string }>("/api/admin/care/unlock", { method: "POST", body: JSON.stringify({ password: password.trim() }) });
    if (!unlock.ok) { setError(unlock.message || "Invalid code"); setBusy(false); setPassword(""); return; }
    try { await action(); } catch { setError("Action failed"); }
    setBusy(false);
  }

  async function runAction(body: Record<string, unknown>, okMsg: string) {
    await withPassword(async () => {
      const res = await api<{ message?: string; result?: { ok?: boolean; message?: string } }>("/api/admin/payments", { method: "PATCH", body: JSON.stringify(body) });
      if (!res.ok) { setError(res.message); return; }
      const r = res.data.result;
      if (r && r.ok === false) setError(r.message || "Action failed");
      else setMsg(res.data.message || okMsg);
      await load(); if (selectedId) await loadDetail(selectedId);
      setModal(null);
    });
  }

  const filtered = useMemo(() => {
    return payments.filter(p => {
      const e = effectiveOf(p);
      if (filter === "all") return true;
      if (filter === "held") return e === "held" || e === "pending_payment";
      if (filter === "pending") return e === "pending" || e === "release_pending" || e === "pending_settlement";
      if (filter === "released") return e === "released";
      if (filter === "failed") return e === "failed";
      if (filter === "refunded") return e === "refunded";
      if (filter === "disputed") return e === "disputed";
      if (filter === "cancelled") return e === "cancelled" || String(p.status).toLowerCase() === "cancelled";
      return true;
    });
  }, [payments, filter]);

  const counts = useMemo(() => {
    if (filterCounts.all != null) return filterCounts;
    const c: Record<string, number> = { all: payments.length, held: 0, pending: 0, released: 0, failed: 0, refunded: 0, disputed: 0, cancelled: 0 };
    for (const p of payments) {
      const e = effectiveOf(p);
      if (e === "disputed") c.disputed += 1;
      else if (e === "held" || e === "pending_payment") c.held += 1;
      else if (e === "pending" || e === "release_pending" || e === "pending_settlement") c.pending += 1;
      else if (e === "released") c.released += 1;
      else if (e === "failed") c.failed += 1;
      else if (e === "refunded") c.refunded += 1;
      else if (e === "cancelled" || String(p.status).toLowerCase() === "cancelled") c.cancelled += 1;
    }
    return c;
  }, [filterCounts, payments]);

  const esc = String(detail?.payment ? (detail.payment as Record<string, unknown>).escrow_status : "").toLowerCase();
  const meta = (detail?.payment ? (detail.payment as Record<string, unknown>).meta || {} : {}) as Record<string, unknown>;
  const alreadyPaid = esc === "released" || meta.proTransferOk === true || meta.payoutStatus === "success";

  const p = detail?.payment as Record<string, unknown> | undefined;
  const parties = detail?.parties as { customer?: { name?: string; phone?: string; email?: string }; pro?: { name?: string; phone?: string; bank?: { bankName?: string; accountName?: string; accountLast4?: string } } } | undefined;
  const ledger = (detail?.ledger || []) as { id: string; transferRef: string; status: string; amountMinor: number; createdAt: string }[];
  const flwTransfers = (detail?.flwTransfers || []) as { id?: string; reference?: string; status?: string; amount?: number; bank_name?: string; account_number?: string; created_at?: string }[];

  const s: Record<string, React.CSSProperties> = {
    card: { background: "var(--om-panel-2)", border: "1px solid var(--om-border-soft)", borderRadius: 8, padding: "14px 16px", cursor: "pointer", transition: "box-shadow 0.1s", color: "var(--om-text)" },
    cardLabel: { fontSize: 11, color: "var(--om-text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 2 },
    cardVal: { fontSize: 20, fontWeight: 700, color: "var(--om-text)" },
    cardSub: { fontSize: 11, color: "var(--om-text-faint)", marginTop: 2 },
    panel: { background: "var(--om-panel-2)", border: "1px solid var(--om-border-soft)", borderRadius: 8, padding: 16, marginBottom: 16, color: "var(--om-text)" },
    table: { width: "100%", borderCollapse: "collapse" as const, fontSize: 12 },
    th: { textAlign: "left" as const, padding: "8px 10px", borderBottom: "2px solid var(--om-border)", color: "var(--om-text-muted)", fontSize: 10, textTransform: "uppercase" as const, letterSpacing: "0.5px", whiteSpace: "nowrap" as const },
    td: { padding: "8px 10px", borderBottom: "1px solid var(--om-border-soft)", fontSize: 12, verticalAlign: "top" as const, color: "var(--om-text)" },
    btn: { padding: "5px 12px", borderRadius: 6, border: "1px solid var(--om-border)", background: "var(--om-panel-2)", cursor: "pointer", fontSize: 11, fontWeight: 500, whiteSpace: "nowrap" as const, color: "var(--om-text)" },
    btnP: { padding: "5px 12px", borderRadius: 6, border: "none", background: "var(--om-accent)", color: "#fff", cursor: "pointer", fontSize: 11, fontWeight: 600 },
    btnD: { padding: "5px 12px", borderRadius: 6, border: "1px solid var(--om-danger)", background: "var(--om-panel-2)", color: "var(--om-danger)", cursor: "pointer", fontSize: 11, fontWeight: 500 },
    muted: { fontSize: 11, color: "var(--om-text-muted)" },
    link: { color: "var(--om-accent)", cursor: "pointer", fontSize: 11 },
    inp: { padding: "6px 10px", borderRadius: 6, border: "1px solid var(--om-border)", background: "var(--om-input)", color: "var(--om-text)", fontSize: 13, width: "100%", boxSizing: "border-box" as const },
    ta: { padding: "6px 10px", borderRadius: 6, border: "1px solid var(--om-border)", background: "var(--om-input)", color: "var(--om-text)", fontSize: 13, width: "100%", boxSizing: "border-box" as const, fontFamily: "inherit" },
    err: { padding: "8px 14px", borderRadius: 6, background: "var(--om-danger-bg)", color: "var(--om-danger)", border: "1px solid var(--om-danger)", fontSize: 13, marginBottom: 12 },
    ok: { padding: "8px 14px", borderRadius: 6, background: "var(--om-success-bg)", color: "var(--om-success)", border: "1px solid var(--om-success)", fontSize: 13, marginBottom: 12 },
  };

  const summaryCards = [
    { label: "Total payments", val: ops ? `₦${((ops.ona.escrowHeldMinor + ops.ona.pendingSettlementMinor) / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}` : "—", sub: `${payments.length} transactions` },
    { label: "FLW Available", val: ops ? `₦${(ops.flw.available ?? 0).toLocaleString("en-NG", { minimumFractionDigits: 2 })}` : "—", sub: "Payout balance" },
    { label: "FLW Ledger", val: ops ? `₦${(ops.flw.ledger ?? 0).toLocaleString("en-NG", { minimumFractionDigits: 2 })}` : "—", sub: "Settling" },
    { label: "Escrow held", val: ops ? naira(ops.ona.escrowHeldMinor) : "—", sub: "Customer paid" },
    { label: "Pending settlement", val: ops ? naira(ops.ona.pendingSettlementMinor) : "—", sub: `${ops?.ona.pendingSettlementCount ?? 0} jobs` },
    { label: "Commission earned", val: ops ? naira(ops.ona.totalCommissionEarnedMinor) : "—", sub: `${ops?.ona.commissionEarnedCount ?? 0} paid jobs` },
    { label: "Paid to pros", val: String(ops?.ona.releasedCount ?? "—"), sub: "Released" },
    { label: "Failed", val: String(ops?.ona.failedCount ?? "—"), sub: `${ops?.ona.exhaustedCount ?? 0} exhausted` },
    { label: "Suspended", val: String(ops?.ona.suspendedCount ?? "—"), sub: "Admin stopped" },
    { label: "Refunded", val: String(ops?.ona.refundedCount ?? "—"), sub: "Customer refunded" },
    { label: "Disputed", val: String(ops?.ona.disputedCount ?? "—"), sub: "In dispute" },
  ];

  return (
    <AdminShell adminName={adminName} adminRole={adminRole}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Payment Control Center</h1>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={s.muted}>{adminName} · {roleLbl}</span>
          <button style={s.btn} onClick={() => { void load(); setMsg("Refreshed"); setTimeout(() => setMsg(null), 2000); }}>Refresh</button>
        </div>
      </div>
      <p style={{ ...s.muted, marginBottom: 16, lineHeight: 1.5 }}>
        Financial control room: monitor, control, release, refund, cancel, dispute, and audit every transaction.
        Sensitive actions require temporary access code. <strong>All actions are logged.</strong>
      </p>

      <AdminGuideBanner pageId="payments-control" />

      {error ? <div style={s.err}>{error}</div> : null}
      {msg ? <div style={s.ok}>{msg}</div> : null}

      {showPassword && (
        <div style={{ ...s.panel, background: "var(--om-warn-bg)", borderColor: "var(--om-warn)", marginBottom: 12 }}>
          <p style={{ fontSize: 12, fontWeight: 600, margin: "0 0 8px", color: "var(--om-text)" }}>Sensitive action requires temporary access code</p>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input style={{ ...s.inp, width: 200 }} type="password" placeholder="Enter code" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && pendingAction) void withPassword(pendingAction); }} autoFocus />
            <button style={s.btnP} disabled={busy} onClick={() => { if (pendingAction) void withPassword(pendingAction); }}>Confirm</button>
            <button style={s.btn} onClick={() => { setShowPassword(false); setPendingAction(null); }}>Cancel</button>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {(["payments", "disputes", "audit", "failed", "commission"] as TabKey[]).map(t => (
          <button key={t} style={{ ...s.btn, fontWeight: tab === t ? 700 : 400, background: tab === t ? "var(--om-nav-active)" : "var(--om-panel-2)", borderColor: tab === t ? "var(--om-role)" : "var(--om-border)" }} onClick={() => { setTab(t); setSelectedId(null); }}>
            {t === "payments" ? "Payments" : t === "disputes" ? "Disputes" : t === "audit" ? "Audit" : t === "failed" ? "Failed Payouts" : "Commission"}
          </button>
        ))}
      </div>

      {tab === "payments" && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10, marginBottom: 16 }}>
            {summaryCards.map(c => (
              <div key={c.label} style={s.card} onClick={() => { const k = c.label.toLowerCase().includes("held") ? "held" : c.label.toLowerCase().includes("pending") ? "pending" : c.label.toLowerCase().includes("paid") || c.label.toLowerCase().includes("released") ? "released" : c.label.toLowerCase().includes("fail") ? "failed" : c.label.toLowerCase().includes("refund") ? "refunded" : c.label.toLowerCase().includes("dispute") ? "disputed" : "all"; setFilter(k as FilterKey); }}>
                <div style={s.cardLabel}>{c.label}</div>
                <div style={s.cardVal}>{c.val}</div>
                <div style={s.cardSub}>{c.sub}</div>
              </div>
            ))}
          </div>

          <div style={s.panel}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12, alignItems: "center" }}>
              <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0, flex: 1 }}>All Transactions</h2>
              {FILTERS.map(({ key, label }) => {
                const n = counts[key] ?? 0; const active = filter === key;
                return (
                  <button key={key} style={{ ...s.link, fontWeight: active ? 700 : 400, textDecoration: active ? "underline" : "none", opacity: key !== "all" && n === 0 ? 0.45 : 1 }} onClick={() => setFilter(key)}>
                    {label} ({n})
                  </button>
                );
              })}
            </div>

            <div style={{ maxHeight: 420, overflowY: "auto", marginBottom: selectedId ? 12 : 0 }}>
              <table style={s.table}>
                <thead><tr>
                  <th style={s.th}>ID</th>
                  <th style={s.th}>Amount</th>
                  <th style={s.th}>Status</th>
                  <th style={s.th}>Customer</th>
                  <th style={s.th}>Pro</th>
                  <th style={s.th}>Service</th>
                  <th style={s.th}>Commission</th>
                  <th style={s.th}>Pro Share</th>
                  <th style={s.th}>Payout</th>
                  <th style={s.th}>Date</th>
                  <th style={s.th}>Actions</th>
                </tr></thead>
                <tbody>
                  {loading && payments.length === 0 ? <tr><td colSpan={11} style={{ ...s.td, ...s.muted }}>Loading...</td></tr>
                  : filtered.length === 0 ? <tr><td colSpan={11} style={{ ...s.td, ...s.muted }}>No payments in <strong>{filter}</strong>.</td></tr>
                  : filtered.map(pm => {
                    const e = effectiveOf(pm);
                    const amt = Number(pm.amount_kobo || 0);
                    const fee = Number(pm.platform_fee_kobo || 0);
                    const proShare = Number(pm.pro_payout_kobo || 0);
                    const sel = selectedId === String(pm.id);
                    return (
                      <tr key={String(pm.id)} style={{ background: sel ? "var(--om-nav-hover)" : undefined, cursor: "pointer" }} onClick={() => setSelectedId(sel ? null : String(pm.id))}>
                        <td style={{ ...s.td, ...s.muted, maxWidth: 60, overflow: "hidden", textOverflow: "ellipsis" }}>{String(pm.id).slice(0, 8)}</td>
                        <td style={s.td}><strong>{naira(amt)}</strong></td>
                        <td style={s.td}><span style={badgeStyle(e)}>{String(pm.display_status || e)}</span></td>
                        <td style={{ ...s.td, ...s.muted, maxWidth: 80, overflow: "hidden", textOverflow: "ellipsis" }}>{String(pm.motorist_name || pm.motoristId || "").slice(0, 12) || "—"}</td>
                        <td style={{ ...s.td, ...s.muted, maxWidth: 80, overflow: "hidden", textOverflow: "ellipsis" }}>{String(pm.repair_pro_name || pm.repairProId || "").slice(0, 12) || "—"}</td>
                        <td style={{ ...s.td, ...s.muted, fontSize: 10 }}>{String(pm.service_type || "—").slice(0, 10)}</td>
                        <td style={s.td}>{fee ? naira(fee) : "—"}</td>
                        <td style={s.td}>{proShare ? naira(proShare) : "—"}</td>
                        <td style={s.td}>{String(pm.payout_status || (e === "released" ? "success" : "—")).slice(0, 8)}</td>
                        <td style={{ ...s.td, ...s.muted, fontSize: 10 }}>{pm.paid_at ? new Date(String(pm.paid_at)).toLocaleDateString() : pm.created_at ? new Date(String(pm.created_at)).toLocaleDateString() : "—"}</td>
                        <td style={s.td}>
                          <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                            <span style={s.link}>{sel ? "▼" : "▶"}</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {selectedId && (
              <div style={{ borderTop: "1px solid var(--om-border-soft)", paddingTop: 12, marginTop: 4 }}>
                {detailLoading ? <p style={s.muted}>Loading detail...</p> : !detail ? <p style={s.muted}>Loading...</p> : (
                  <>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12, fontSize: 12 }}>
                      <div style={{ background: "var(--om-bg-elevated)", padding: 12, borderRadius: 6 }}>
                        <div style={{ fontWeight: 600, fontSize: 11, color: "var(--om-text-muted)", marginBottom: 4 }}>CUSTOMER (PAYER)</div>
                        <div style={{ fontWeight: 700, color: "var(--om-text)" }}>{parties?.customer?.name || "—"}</div>
                        <div style={s.muted}>{parties?.customer?.phone || ""}{parties?.customer?.email ? ` · ${parties.customer.email}` : ""}</div>
                        <div style={{ marginTop: 4 }}>Paid <strong>{naira(Number(p?.amount_kobo || 0))}</strong></div>
                      </div>
                      <div style={{ background: "var(--om-bg-elevated)", padding: 12, borderRadius: 6 }}>
                        <div style={{ fontWeight: 600, fontSize: 11, color: "var(--om-text-muted)", marginBottom: 4 }}>REPAIR PRO (PAYEE)</div>
                        <div style={{ fontWeight: 700, color: "var(--om-text)" }}>{parties?.pro?.name || "—"}</div>
                        <div style={s.muted}>{parties?.pro?.bank?.bankName || ""} · {parties?.pro?.bank?.accountName || "—"} · ****{parties?.pro?.bank?.accountLast4 || "????"}</div>
                        <div style={{ marginTop: 4 }}>Pro share <strong>{p?.pro_payout_kobo != null ? naira(Number(p.pro_payout_kobo)) : "—"}</strong></div>
                      </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: "4px 12px", fontSize: 12, background: "var(--om-bg-elevated)", padding: 12, borderRadius: 6, marginBottom: 12 }}>
                      <span style={s.muted}>Escrow status</span><span style={{ color: "var(--om-text)" }}><span style={badgeStyle(esc)}>{esc}</span> · {String(p?.status)}</span>
                      <span style={s.muted}>Payment ID</span><span style={{ wordBreak: "break-all", fontSize: 10, color: "var(--om-text)" }}>{String(p?.id)}</span>
                      <span style={s.muted}>Job / request</span><span style={{ wordBreak: "break-all", fontSize: 10, color: "var(--om-text)" }}>{String(p?.request_id || "—")}</span>
                      <span style={s.muted}>FLW ref</span><span style={{ fontSize: 10, color: "var(--om-text)" }}>{String(p?.provider_ref || "—")}</span>
                      <span style={s.muted}>Payout ref</span><span style={{ fontSize: 10, color: "var(--om-text)" }}>{String(detail?.idempotent_transfer_ref || meta.idempotentTransferRef || "—")}</span>
                      <span style={s.muted}>Last error</span><span style={{ color: "var(--om-danger)" }}>{String(meta.lastReleaseError || "—")}</span>
                      <span style={s.muted}>Retries</span><span>{meta.payoutRetryCount != null ? String(meta.payoutRetryCount) : "—"}{meta.nextRetryAt ? ` · next ${new Date(String(meta.nextRetryAt)).toLocaleString()}` : ""}</span>
                      <span style={s.muted}>Ona commission</span><span>{p?.platform_fee_kobo != null ? naira(Number(p.platform_fee_kobo)) : "—"}</span>
                      <span style={s.muted}>Pro payout</span><span>{p?.pro_payout_kobo != null ? naira(Number(p.pro_payout_kobo)) : "—"}</span>
                      {detail?.doublePayRisk ? <span style={{ color: "var(--om-danger)", gridColumn: "1 / -1", fontWeight: 600 }}>{String(detail.doublePayRisk)}</span> : null}
                    </div>

                    {alreadyPaid && <div style={s.ok}>Pro payout already completed. Do not force a second transfer.</div>}

                    {!detail?.parties && <p style={{ ...s.muted, fontSize: 11 }}>Full party details require view_payment_full permission.</p>}

                    <div style={{ marginBottom: 8 }}>
                      <p style={{ fontSize: 11, color: "var(--om-text-muted)", margin: "0 0 4px" }}>Reason note (required for sensitive actions):</p>
                      <textarea style={s.ta} rows={2} placeholder="e.g. Force payout, customer refund..." value={reason} onChange={e => setReason(e.target.value)} />
                    </div>

                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      <button style={s.btn} onClick={() => void loadDetail(selectedId)} disabled={busy}>Refresh</button>

                      {canCancel && !alreadyPaid && esc !== "refunded" && (
                        <button style={s.btn} onClick={() => { setModal("stop"); }} disabled={busy}>Stop processing</button>
                      )}

                      {canForce && !alreadyPaid && esc !== "refunded" && (
                        <button style={s.btnP} onClick={() => { if (reason.trim().length < 8) { setError("Reason min 8 chars"); return; } setModal("force"); }} disabled={busy}>Force payout</button>
                      )}

                      {canCancel && !alreadyPaid && esc !== "refunded" && (
                        <button style={s.btn} onClick={() => { if (reason.trim().length < 8) { setError("Reason min 8 chars"); return; } setModal("retry"); }} disabled={busy}>Retry payout</button>
                      )}

                      {canCancel && (
                        <button style={s.btnD} onClick={() => { if (reason.trim().length < 8) { setError("Reason min 8 chars"); return; } setModal("refund"); }} disabled={busy || esc === "released" || esc === "refunded"}>Refund customer</button>
                      )}

                      {canManual && (
                        <button style={s.btn} onClick={() => setModal("manual")} disabled={busy}>Manual payout</button>
                      )}
                    </div>

                    {!canForce && !canCancel && <p style={{ ...s.muted, marginTop: 8, color: "var(--om-text-muted)" }}>Read-only view. Force/refund requires L3+.</p>}

                    {ledger.length > 0 && (
                      <div style={{ marginTop: 12 }}>
                        <h3 style={{ fontSize: 12, fontWeight: 600, margin: "0 0 6px" }}>Transfer Ledger</h3>
                        <table style={{ ...s.table, fontSize: 11 }}>
                          <thead><tr><th style={s.th}>Ref</th><th style={s.th}>Status</th><th style={s.th}>Amount</th><th style={s.th}>When</th></tr></thead>
                          <tbody>{ledger.map(r => (
                            <tr key={r.id}>
                              <td style={{ ...s.td, wordBreak: "break-all", maxWidth: 100 }}>{r.transferRef}</td>
                              <td style={s.td}><span style={badgeStyle(r.status)}>{r.status}</span></td>
                              <td style={s.td}>{naira(r.amountMinor)}</td>
                              <td style={{ ...s.td, ...s.muted, fontSize: 10 }}>{r.createdAt ? new Date(r.createdAt).toLocaleString() : "—"}</td>
                            </tr>
                          ))}</tbody>
                        </table>
                      </div>
                    )}

                    {flwTransfers.length > 0 && (
                      <div style={{ marginTop: 12 }}>
                        <h3 style={{ fontSize: 12, fontWeight: 600, margin: "0 0 6px" }}>Flutterwave Transfers</h3>
                        <table style={{ ...s.table, fontSize: 11 }}>
                          <thead><tr><th style={s.th}>Status</th><th style={s.th}>Amount</th><th style={s.th}>Account</th><th style={s.th}>When</th></tr></thead>
                          <tbody>{flwTransfers.map((t, i) => (
                            <tr key={String(t.id || t.reference || i)}>
                              <td style={s.td}><span style={badgeStyle(String(t.status || "").toLowerCase())}>{String(t.status || "—")}</span></td>
                              <td style={s.td}>{t.amount != null ? naira(Math.round(t.amount * 100)) : "—"}</td>
                              <td style={{ ...s.td, fontSize: 10 }}>{t.bank_name || ""} {t.account_number || ""}</td>
                              <td style={{ ...s.td, ...s.muted, fontSize: 10 }}>{t.created_at ? new Date(t.created_at).toLocaleString() : "—"}</td>
                            </tr>
                          ))}</tbody>
                        </table>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {modal && (
            <div style={{ position: "fixed", inset: 0, background: "rgba(15,17,23,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
              <div style={{ background: "var(--om-panel-2)", borderRadius: 12, padding: 24, maxWidth: 480, width: "90%", boxShadow: "var(--om-shadow)", color: "var(--om-text)" }}>
                {modal === "force" && (
                  <>
                    <h3 style={{ margin: "0 0 8px" }}>Force Payout</h3>
                    <p style={s.muted}>Bypasses standard flow. Same transfer ref — no double pay. Requires L4+.</p>
                    <p style={{ fontSize: 13, margin: "12px 0" }}>Reason: <strong>{reason}</strong></p>
                    <p style={{ fontSize: 13, margin: "12px 0" }}>Amount: <strong>{p ? naira(Number(p.pro_payout_kobo || 0)) : "—"}</strong></p>
                    <p style={{ fontSize: 13 }}>To: <strong>{parties?.pro?.name || "—"}</strong> · {parties?.pro?.bank?.bankName || ""} ****{parties?.pro?.bank?.accountLast4 || "????"}</p>
                    <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
                      <button style={s.btn} onClick={() => setModal(null)}>Cancel</button>
                      <button style={s.btnP} onClick={() => { void runAction({ id: selectedId, action: "force_release", jobId: p?.request_id || selectedId, reason: reason.trim() }, "Force payout submitted"); }}>Confirm Force Payout</button>
                    </div>
                  </>
                )}
                {modal === "refund" && (
                  <>
                    <h3 style={{ margin: "0 0 8px" }}>Refund Customer</h3>
                    <p style={s.muted}>Cancel escrow and mark refunded. Funds returned to customer.</p>
                    <p style={{ fontSize: 13, margin: "12px 0" }}>Reason: <strong>{reason}</strong></p>
                    <p style={{ fontSize: 13 }}>Amount: <strong>{p ? naira(Number(p.amount_kobo || 0)) : "—"}</strong></p>
                    <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
                      <button style={s.btn} onClick={() => setModal(null)}>Cancel</button>
                      <button style={s.btnD} onClick={() => { void runAction({ id: selectedId, action: "cancel_escrow", reason: reason.trim(), jobId: p?.request_id || undefined, status: "refunded" }, "Escrow cancelled / refunded"); }}>Confirm Refund</button>
                    </div>
                  </>
                )}
                {modal === "retry" && (
                  <>
                    <h3 style={{ margin: "0 0 8px" }}>Retry Payout</h3>
                    <p style={s.muted}>Idempotent retry. Respects 10-min spacing unless already due.</p>
                    <p style={{ fontSize: 13, margin: "12px 0" }}>Reason: <strong>{reason}</strong></p>
                    <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
                      <button style={s.btn} onClick={() => setModal(null)}>Cancel</button>
                      <button style={s.btn} onClick={() => { void runAction({ id: selectedId, action: "retry_payout", jobId: p?.request_id || selectedId, reason: reason.trim() }, "Retry submitted"); }}>Confirm Retry</button>
                    </div>
                  </>
                )}
                {modal === "stop" && (
                  <>
                    <h3 style={{ margin: "0 0 8px" }}>Stop Processing</h3>
                    <p style={s.muted}>Stops auto-retry. Funds stay held in escrow (not a refund).</p>
                    <p style={{ fontSize: 13, margin: "12px 0" }}>Reason: <strong>{reason}</strong></p>
                    <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
                      <button style={s.btn} onClick={() => setModal(null)}>Cancel</button>
                      <button style={s.btn} onClick={() => { void runAction({ id: selectedId, action: "cancel_processing", reason: reason.trim(), jobId: p?.request_id || undefined }, "Processing stopped"); }}>Confirm Stop</button>
                    </div>
                  </>
                )}
                {modal === "manual" && (
                  <ManualPayoutForm api={api} onDone={() => { setModal(null); void load(); }} s={s} btn={s.btn} btnP={s.btnP} btnD={s.btnD} muted={s.muted} inp={s.inp} />
                )}
              </div>
            </div>
          )}
        </>
      )}

      {tab === "disputes" && (
        <div style={s.panel}>
          <h2 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 12px" }}>Dispute Management</h2>
          {disputes.length === 0 ? <p style={s.muted}>No disputed transactions.</p> : (
            <>
              <div style={{ maxHeight: disputeDetailId ? 240 : 500, overflowY: "auto", marginBottom: 8 }}>
                <table style={s.table}>
                  <thead><tr>
                    <th style={s.th}>Job</th>
                    <th style={s.th}>Parties</th>
                    <th style={s.th}>Status</th>
                    <th style={s.th}>Reason</th>
                    <th style={s.th}>Evidence</th>
                    <th style={s.th}>Amount</th>
                    <th style={s.th}>Actions</th>
                  </tr></thead>
                  <tbody>{disputes.map(j => {
                    const d = (j.dispute || {}) as Record<string, unknown>;
                    const ev = (j.evidence || {}) as Record<string, unknown>;
                    const sel = disputeDetailId === String(j.id);
                    return (
                      <tr key={String(j.id)} style={{ background: sel ? "var(--om-warn-bg)" : undefined, cursor: "pointer" }} onClick={() => setDisputeDetailId(sel ? null : String(j.id))}>
                        <td style={s.td}>
                          <strong>{String(j.id).slice(0, 9)}</strong>
                        </td>
                        <td style={{ ...s.td, fontSize: 11 }}>
                          <div>{String(j.motorist_name || "—").slice(0, 14)}</div>
                          <div style={s.muted}>{String(j.repair_pro_name || "—").slice(0, 14)}</div>
                        </td>
                        <td style={s.td}>
                          <span style={badgeStyle(String(j.status || ""))}>{String(j.status || "—")}</span>
                          {ev.priority === "auto_priority" ? <div style={{ ...s.muted, fontSize: 9 }}>AI priority</div> : null}
                          {ev.priority === "request_more" ? <div style={{ ...s.muted, fontSize: 9 }}>Need evidence</div> : null}
                        </td>
                        <td style={{ ...s.td, ...s.muted, fontSize: 11, maxWidth: 100 }}>
                          {String(d.reason || "—")}
                          {d.description ? <div style={{ fontSize: 9, color: "var(--om-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 100 }}>{(d.description as string).slice(0, 40)}</div> : null}
                        </td>
                        <td style={s.td}>
                          {ev.composite != null ? (
                            <span style={{ fontWeight: 600 }}>{Number(ev.composite)}<span style={s.muted}>/100</span></span>
                          ) : <span style={s.muted}>—</span>}
                          {ev.photoScore != null ? <div style={{ ...s.muted, fontSize: 9 }}>P{Number(ev.photoScore)} V{Number(ev.voiceScore)} L{Number(ev.locationScore)} T{Number(ev.timestampScore)}</div> : null}
                        </td>
                        <td style={s.td}>{j.agreed_major != null ? `₦${Number(j.agreed_major).toLocaleString("en-NG")}` : "—"}</td>
                        <td style={s.td}>
                          <div style={{ display: "flex", gap: 3, flexWrap: "wrap", alignItems: "center" }}>
                            <select style={{ fontSize: 10, padding: "2px 4px", borderRadius: 4, border: "1px solid var(--om-border)", background: "var(--om-input)", color: "var(--om-text)", maxWidth: 90 }} value={disputeOutcome} onChange={e => {
                              setDisputeOutcome(e.target.value);
                            }}>
                              {DISPUTE_OUTCOMES.map(o => <option key={o} value={o}>{o.replace(/_/g, " ").replace("pro", "→ Pro").replace("motorist", "→ Cust")}</option>)}
                            </select>
                            {disputeOutcome === "partial_split" && (
                              <input type="number" min={0} max={100} value={splitPct[String(j.id)] ?? 70} onChange={e => setSplitPct(p => ({ ...p, [String(j.id)]: Number(e.target.value) }))} style={{ width: 44, fontSize: 10, padding: "2px 4px", borderRadius: 4, border: "1px solid var(--om-border)", background: "var(--om-input)", color: "var(--om-text)" }} title="Pro %" />
                            )}
                            <input style={{ ...s.inp, width: 80, fontSize: 10, padding: "2px 4px" }} placeholder="Note" value={disputeNote} onChange={e => setDisputeNote(e.target.value)} />
                            <button style={{ ...s.btn, fontSize: 9, padding: "2px 6px" }} onClick={async (evt) => {
                              evt.stopPropagation();
                              const kind = j.status === "under_appeal" ? "appeal" : "dispute";
                              const pct = splitPct[String(j.id)] ?? 70;
                              async function doResolve() {
                                setBusy(true);
                                const res = await api("/api/admin/disputes", { method: "PATCH", body: JSON.stringify({ jobId: j.id, kind, outcome: disputeOutcome, proPercent: pct, note: disputeNote }) });
                                setBusy(false);
                                if (!res.ok) { setError(res.message); return; }
                                setMsg("Dispute resolved"); void loadDisputes(); setDisputeDetailId(null);
                              }
                              setPassword(""); setShowPassword(true); setPendingAction(() => doResolve);
                            }} disabled={busy}>Resolve</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}</tbody>
                </table>
              </div>

              {disputeDetailId && (() => {
                const j = disputes.find(d => String(d.id) === disputeDetailId);
                if (!j) return null;
                const d = (j.dispute || {}) as Record<string, unknown>;
                const ev = (j.evidence || {}) as Record<string, unknown>;
                const decision = (d.decision || {}) as Record<string, unknown>;
                const appeal = (d.appeal || {}) as Record<string, unknown>;
                return (
                  <div style={{ borderTop: "1px solid var(--om-border-soft)", paddingTop: 12, marginTop: 4, fontSize: 12 }}>
                    <h3 style={{ fontSize: 13, fontWeight: 600, margin: "0 0 8px", color: "var(--om-text)" }}>Dispute Detail — {String(j.id).slice(0, 12)}</h3>
                    <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: "4px 12px", background: "var(--om-bg-elevated)", padding: 12, borderRadius: 6, marginBottom: 8 }}>
                      <span style={s.muted}>Opened by</span><span style={{ color: "var(--om-text)" }}>{String(d.openedBy || "—")}</span>
                      <span style={s.muted}>Opened at</span><span>{d.openedAt ? new Date(String(d.openedAt)).toLocaleString() : "—"}</span>
                      <span style={s.muted}>Reason</span><span>{String(d.reason || "—")}</span>
                      {d.description ? <><span style={s.muted}>Description</span><span>{String(d.description)}</span></> : null}
                      <span style={s.muted}>Status</span><span><span style={badgeStyle(String(j.status || ""))}>{String(d.status || j.status || "—")}</span></span>
                      {ev.composite != null && (
                        <>
                          <span style={s.muted}>Evidence</span>
                          <span><strong>{Number(ev.composite)}</strong>/100 &nbsp; P{Number(ev.photoScore)} V{Number(ev.voiceScore)} L{Number(ev.locationScore)} T{Number(ev.timestampScore)}</span>
                        </>
                      )}
                      {(ev.flags as string[] || []).length > 0 && (
                        <><span style={s.muted}>Flags</span><span style={s.muted}>{String((ev.flags as string[]).join(", "))}</span></>
                      )}
                      {(d.media as unknown[]) && Array.isArray(d.media) && (d.media as unknown[]).length > 0 && (
                        <><span style={s.muted}>Media</span><span>{String((d.media as unknown[]).length)} file(s)</span></>
                      )}
                    </div>

                    {Object.keys(decision).length > 0 && (
                      <div style={{ background: "var(--om-success-bg)", padding: 12, borderRadius: 6, marginBottom: 8 }}>
                        <div style={{ fontWeight: 600, fontSize: 11, color: "var(--om-success)", marginBottom: 4 }}>FIRST DECISION</div>
                        <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: "4px 12px" }}>
                          <span style={s.muted}>Outcome</span><span><strong>{String(decision.outcome || "—")}</strong></span>
                          {decision.proPercent != null && <span style={s.muted}>Split</span>}<span>{decision.proPercent != null ? `Pro ${Number(decision.proPercent)}% / Cust ${Number(decision.motoristPercent || 0)}%` : ""}</span>
                          {decision.note ? <><span style={s.muted}>Note</span><span>{String(decision.note)}</span></> : null}
                          <span style={s.muted}>Decided at</span><span>{decision.decidedAt ? new Date(String(decision.decidedAt)).toLocaleString() : "—"}</span>
                        </div>
                      </div>
                    )}

                    {Object.keys(appeal).length > 0 && (
                      <div style={{ background: "var(--om-danger-bg)", padding: 12, borderRadius: 6, marginBottom: 8 }}>
                        <div style={{ fontWeight: 600, fontSize: 11, color: "var(--om-danger)", marginBottom: 4 }}>APPEAL</div>
                        <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: "4px 12px" }}>
                          <span style={s.muted}>By</span><span style={{ color: "var(--om-text)" }}>{String(appeal.openedBy || "—")}</span>
                          <span style={s.muted}>Reason</span><span style={{ color: "var(--om-text)" }}>{String(appeal.reason || "—")}</span>
                          <span style={s.muted}>Opened at</span><span style={{ color: "var(--om-text)" }}>{appeal.openedAt ? new Date(String(appeal.openedAt)).toLocaleString() : "—"}</span>
                          {(appeal.media as unknown[]) && Array.isArray(appeal.media) && (appeal.media as unknown[]).length > 0 ? <><span style={s.muted}>Media</span><span style={{ color: "var(--om-text)" }}>{String((appeal.media as unknown[]).length)} file(s)</span></> : null}
                        </div>
                        {(appeal.decision || {}) && Object.keys(appeal.decision || {}).length > 0 && (
                          <div style={{ marginTop: 6, padding: 8, background: "var(--om-danger-bg)", borderRadius: 4 }}>
                            <div style={{ fontWeight: 600, fontSize: 10, color: "var(--om-danger)" }}>APPEAL DECISION (FINAL)</div>
                            <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: "2px 12px", fontSize: 11 }}>
                              <span style={s.muted}>Outcome</span><span><strong>{String((appeal.decision as Record<string, unknown>).outcome || "—")}</strong></span>
                              <span style={s.muted}>Note</span><span>{String((appeal.decision as Record<string, unknown>).note || "—")}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    <p style={{ ...s.muted, fontSize: 10 }}>Click the row to dismiss this detail panel.</p>
                  </div>
                );
              })()}
            </>
          )}
        </div>
      )}

      {tab === "audit" && (
        <div style={s.panel}>
          <h2 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 12px" }}>Audit Trail</h2>
          {auditLog.length === 0 ? <p style={s.muted}>No audit records found.</p> : (
            <div style={{ maxHeight: 500, overflowY: "auto" }}>
              <table style={s.table}>
                <thead><tr>
                  <th style={s.th}>Time</th>
                  <th style={s.th}>Admin</th>
                  <th style={s.th}>Action</th>
                  <th style={s.th}>Target</th>
                  <th style={s.th}>Details</th>
                  <th style={s.th}>Result</th>
                </tr></thead>
                <tbody>{auditLog.map((a, i) => {
                  const actMeta = (a.meta || {}) as Record<string, unknown>;
                  return (
                    <tr key={String(a.id || i)}>
                      <td style={{ ...s.td, ...s.muted, fontSize: 10, whiteSpace: "nowrap" }}>{a.created_at ? new Date(String(a.created_at)).toLocaleString() : "—"}</td>
                      <td style={{ ...s.td, fontSize: 11 }}>{String(a.admin_id || "").slice(0, 8) || String(a.admin_name || "—")}</td>
                      <td style={s.td}><span style={badgeStyle("held")}>{String(a.action || "—")}</span></td>
                      <td style={{ ...s.td, ...s.muted, fontSize: 10 }}>{String(a.target_user_id || a.target_id || "").slice(0, 8) || "—"}</td>
                      <td style={{ ...s.td, ...s.muted, fontSize: 10, maxWidth: 200 }}>{String(actMeta.reason || actMeta.note || a.details || "—").slice(0, 60)}</td>
                      <td style={s.td}>{a.error ? <span style={{ color: "var(--om-danger)" }}>Failed</span> : <span style={{ color: "var(--om-success)" }}>Success</span>}</td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "failed" && (
        <div style={s.panel}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Failed Payouts ({failedPayoutsTotal})</h2>
            <div style={{ display: "flex", gap: 6 }}>
              <button style={s.btn} onClick={() => void loadFailedPayouts()} disabled={busy}>Refresh</button>
              <button style={{ ...s.btnP, fontSize: 10 }} onClick={async () => {
                setBusy(true);
                const res = await api("/api/admin/payments", { method: "PATCH", body: JSON.stringify({ action: "retry_all_due" }) });
                setBusy(false);
                if (!res.ok) { setError(res.message); return; }
                setMsg("Retry queue processed"); void loadFailedPayouts();
              }} disabled={busy}>Retry All Due</button>
            </div>
          </div>
          {failedPayouts.length === 0 ? <p style={s.muted}>No failed payouts. All clear.</p> : (
            <div style={{ maxHeight: 520, overflowY: "auto" }}>
              <table style={s.table}>
                <thead><tr>
                  <th style={s.th}>Request</th>
                  <th style={s.th}>Amount</th>
                  <th style={s.th}>Retries</th>
                  <th style={s.th}>Status</th>
                  <th style={s.th}>Last Error</th>
                  <th style={s.th}>Next Retry</th>
                  <th style={s.th}>Actions</th>
                </tr></thead>
                <tbody>{failedPayouts.map(fp => {
                  const isExhausted = fp.exhausted === true;
                  const isSuspended = fp.payoutSuspended === true;
                  return (
                    <tr key={String(fp.id)}>
                      <td style={{ ...s.td, ...s.muted, fontSize: 10 }}>{String(fp.requestId || "").slice(0, 12) || String(fp.id).slice(0, 12)}</td>
                      <td style={s.td}>{naira(Number(fp.amountMinor || 0))}</td>
                      <td style={s.td}>{String(fp.retryCount ?? "—")}</td>
                      <td style={s.td}>
                        {isExhausted ? <span style={badgeStyle("failed")}>Exhausted</span>
                        : isSuspended ? <span style={badgeStyle("cancelled")}>Suspended</span>
                        : <span style={badgeStyle("failed")}>Failed</span>}
                      </td>
                      <td style={{ ...s.td, ...s.muted, fontSize: 10, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis" }}>{String(fp.lastError || "—")}</td>
                      <td style={{ ...s.td, ...s.muted, fontSize: 10 }}>{fp.nextRetryAt ? new Date(String(fp.nextRetryAt)).toLocaleString() : "—"}</td>
                      <td style={s.td}>
                        <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                          <button style={{ ...s.btn, fontSize: 9, padding: "2px 6px" }} onClick={async () => {
                            setPassword(""); setShowPassword(true); setPendingAction(() => async () => {
                              setBusy(true);
                              const res = await api("/api/admin/failed-payouts", { method: "PATCH", body: JSON.stringify({ jobId: fp.requestId, action: "retry" }) });
                              setBusy(false);
                              if (!res.ok) { setError(res.message); return; }
                              setMsg("Retry attempted"); void loadFailedPayouts();
                            });
                          }} disabled={busy}>Retry</button>
                          <button style={{ ...s.btn, fontSize: 9, padding: "2px 6px" }} onClick={async () => {
                            setPassword(""); setShowPassword(true); setPendingAction(() => async () => {
                              setBusy(true);
                              const res = await api("/api/admin/failed-payouts", { method: "PATCH", body: JSON.stringify({ jobId: fp.requestId, action: "resolve", note: "Acknowledged by admin" }) });
                              setBusy(false);
                              if (!res.ok) { setError(res.message); return; }
                              setMsg("Resolved"); void loadFailedPayouts();
                            });
                          }} disabled={busy}>Resolve</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "commission" && (
        <div style={s.panel}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Commission Report</h2>
            <div style={{ display: "flex", gap: 6 }}>
              {(["day", "week", "month"] as const).map(p => (
                <button key={p} style={{ ...s.btn, fontWeight: commPeriod === p ? 700 : 400, fontSize: 10 }} onClick={() => { setCommPeriod(p); }}>{p === "day" ? "Daily" : p === "week" ? "Weekly" : "Monthly"}</button>
              ))}
            </div>
          </div>

          {commReport ? (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10, marginBottom: 16 }}>
                <div style={s.card}>
                  <div style={s.cardLabel}>Total Commission</div>
                  <div style={s.cardVal}>{naira(Number((commReport as Record<string, unknown>).totalCommissionMinor || 0))}</div>
                  <div style={s.cardSub}>{String((commReport as Record<string, unknown>).transactionCount || 0)} transactions</div>
                </div>
                <div style={s.card}>
                  <div style={s.cardLabel}>Total Revenue</div>
                  <div style={s.cardVal}>{naira(Number((commReport as Record<string, unknown>).totalRevenueMinor || 0))}</div>
                  <div style={s.cardSub}>Customer payments</div>
                </div>
                <div style={s.card}>
                  <div style={s.cardLabel}>Total Payout</div>
                  <div style={s.cardVal}>{naira(Number((commReport as Record<string, unknown>).totalPayoutMinor || 0))}</div>
                  <div style={s.cardSub}>Sent to pros</div>
                </div>
              </div>

              <div style={{ maxHeight: 400, overflowY: "auto" }}>
                <table style={s.table}>
                  <thead><tr>
                    <th style={s.th}>Period</th>
                    <th style={s.th}>Transactions</th>
                    <th style={s.th}>Revenue</th>
                    <th style={s.th}>Commission</th>
                    <th style={s.th}>Paid to Pro</th>
                  </tr></thead>
                  <tbody>
                    {((commReport as Record<string, unknown>).breakdown as Record<string, unknown>[] || []).length === 0 ? (
                      <tr><td colSpan={5} style={{ ...s.td, ...s.muted }}>No data for this period.</td></tr>
                    ) : ((commReport as Record<string, unknown>).breakdown as Record<string, unknown>[]).map((b, i) => (
                      <tr key={String(b.date || i)}>
                        <td style={{ ...s.td, ...s.muted, fontSize: 10 }}>{String(b.date || "").slice(0, 10)}</td>
                        <td style={s.td}>{String(b.count || 0)}</td>
                        <td style={s.td}>{naira(Number(b.revenueMinor || 0))}</td>
                        <td style={s.td}><strong>{naira(Number(b.commissionMinor || 0))}</strong></td>
                        <td style={s.td}>{naira(Number(b.payoutMinor || 0))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : <p style={s.muted}>Loading...</p>}
        </div>
      )}
    </AdminShell>
  );
}

function ManualPayoutForm({ api, onDone, s, btn, btnP, btnD, muted, inp }: {
  api: ReturnType<typeof useAdminGate>["api"];
  onDone: () => void;
  s: Record<string, React.CSSProperties>;
  btn: React.CSSProperties; btnP: React.CSSProperties; btnD: React.CSSProperties;
  muted: React.CSSProperties; inp: React.CSSProperties;
}) {
  const [amount, setAmount] = useState("");
  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!amount || !bankCode || accountNumber.length < 10 || !accountName || reason.length < 8) {
      setErr("All fields required: amount, bank code, 10-digit account, name, reason (8+ chars)");
      return;
    }
    setBusy(true);
    const res = await api("/api/admin/payments", {
      method: "PATCH",
      body: JSON.stringify({ action: "manual_standalone", amountMajor: Number(amount), bankCode, accountNumber: accountNumber.replace(/\D/g, ""), accountName, reason: reason.trim() }),
    });
    setBusy(false);
    if (!res.ok) { setErr(res.message); return; }
    onDone();
  }

  return (
    <>
      <h3 style={{ margin: "0 0 8px" }}>Manual Standalone Payout</h3>
      <p style={muted}>Not tied to a job. Unique ref prevents double pay. L4+.</p>
      {err ? <div style={{ color: "var(--om-danger)", fontSize: 12, marginBottom: 8 }}>{err}</div> : null}
      <div style={{ display: "grid", gap: 8 }}>
        <input style={inp} placeholder="Amount (₦)" type="number" value={amount} onChange={e => setAmount(e.target.value)} />
        <input style={inp} placeholder="Bank code (e.g. 058)" value={bankCode} onChange={e => setBankCode(e.target.value)} />
        <input style={inp} placeholder="Account number (10 digits)" value={accountNumber} onChange={e => setAccountNumber(e.target.value.replace(/\D/g, "").slice(0, 10))} />
        <input style={inp} placeholder="Account name" value={accountName} onChange={e => setAccountName(e.target.value)} />
        <input style={inp} placeholder="Reason (min 8 chars)" value={reason} onChange={e => setReason(e.target.value)} />
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
        <button style={btn} onClick={onDone}>Cancel</button>
        <button style={btnP} onClick={submit} disabled={busy}>Submit Payout</button>
      </div>
    </>
  );
}
