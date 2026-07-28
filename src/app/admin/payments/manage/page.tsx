"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminGuideBanner } from "@/components/admin/admin-guide-banner";

type Payment = {
  id: string;
  request_id?: string | null;
  amount_kobo: number;
  currency: string;
  status: string;
  escrow_status?: string | null;
  effective_status?: string | null;
  display_status?: string | null;
  provider?: string;
  provider_ref?: string | null;
  created_at: string;
  paid_at?: string | null;
  released_at?: string | null;
  refunded_at?: string | null;
  payout_status?: string | null;
  payout_suspended?: boolean | null;
  next_retry_at?: string | null;
  retry_count?: number | null;
  last_release_error?: string | null;
  last_available_ngn?: number | null;
  last_ledger_ngn?: number | null;
  meta?: Record<string, unknown> | null;
  platform_fee_kobo?: number | null;
  pro_payout_kobo?: number | null;
};

type Detail = {
  payment: Record<string, unknown>;
  job: Record<string, unknown> | null;
  parties?: {
    customer: { id: string | null; name: string; phone: string | null; email: string | null };
    pro: {
      id: string | null; name: string; phone: string | null; email: string | null;
      bank: { bankCode: string | null; bankName: string | null; accountName: string | null; accountLast4: string | null; accountNumber: string | null } | null;
    };
  };
  ledger: { id: string; transferRef: string; status: string; amountMinor: number; createdAt: string }[];
  flwTransfers: { id: string | null; reference: string | null; status: string | null; amount: number | null; created_at: string | null; bank_name: string | null; account_number: string | null }[];
  doublePayRisk: string | null;
  flwLookup: { found?: boolean; status?: string; reference?: string };
};

type Ops = {
  flw: { available: number | null; ledger: number | null; refreshedAt: string };
  ona: { escrowHeldMinor: number; pendingSettlementMinor: number; pendingSettlementCount: number; releasedCount: number; failedCount: number; disputedCount: number; refundedCount: number };
};

type FilterKey = "all" | "held" | "pending_settlement" | "suspended" | "released" | "failed" | "refunded";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "held", label: "Held" },
  { key: "pending_settlement", label: "Pending" },
  { key: "suspended", label: "Suspended" },
  { key: "released", label: "Paid" },
  { key: "failed", label: "Failed" },
  { key: "refunded", label: "Refunded" },
];

function naira(k: number) {
  return `₦${(k / 100).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function effectiveOf(p: Payment): string {
  if (p.effective_status) return String(p.effective_status).toLowerCase();
  const esc = String(p.escrow_status || p.status || "").toLowerCase();
  if (esc === "released" || p.released_at) return "released";
  if (esc === "refunded") return "refunded";
  const paySt = String(p.payout_status || "").toLowerCase();
  if (paySt === "suspended_admin" || p.payout_suspended === true) return "suspended";
  if (esc === "failed" || paySt === "failed") return "failed";
  if (esc === "pending_settlement" || esc === "release_pending") return "pending_settlement";
  if (esc === "held" || esc === "pending_payment") return "held";
  if (String(p.status).toLowerCase() === "paid") return "held";
  return esc || "unknown";
}

async function apiCall<T>(path: string, init?: RequestInit): Promise<{ ok: true; data: T } | { ok: false; message: string }> {
  try {
    const res = await fetch(path, { credentials: "include", ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
    const json = await res.json();
    if (!json.ok) return { ok: false, message: json.error?.message || "Request failed" };
    return { ok: true, data: json.data as T };
  } catch { return { ok: false, message: "Network error" }; }
}

export default function PaymentManagementPage() {
  const router = useRouter();
  const [authed, setAuthed] = useState(false);
  const [adminName, setAdminName] = useState("");
  const [adminRole, setAdminRole] = useState("");
  const [payments, setPayments] = useState<Payment[]>([]);
  const [filterCounts, setFilterCounts] = useState<Record<string, number>>({});
  const [ops, setOps] = useState<Ops | null>(null);
  const [opsError, setOpsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [note, setNote] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => Promise<void>) | null>(null);
  const [canCancel, setCanCancel] = useState(false);
  const [canForce, setCanForce] = useState(false);
  const [canRetry, setCanRetry] = useState(false);

  useEffect(() => {
    (async () => {
      const me = await apiCall<{ fullName?: string; email?: string; adminRole?: string }>("/api/admin/auth/me");
      if (!me.ok) { router.replace("/admin/login"); return; }
      setAdminName(me.data.fullName || me.data.email || "Admin");
      setAdminRole(String(me.data.adminRole || ""));
      setAuthed(true);
    })();
  }, [router]);

  const loadPayments = useCallback(async () => {
    const res = await apiCall<{ payments: Payment[]; filterCounts?: Record<string, number>; ops?: Ops | null; opsError?: string | null; access?: { canCancelEscrow?: boolean; canRetryPayout?: boolean } }>("/api/admin/payments");
    setLoading(false);
    if (!res.ok) { setError(res.message); return; }
    setPayments(Array.isArray(res.data.payments) ? res.data.payments : []);
    setFilterCounts(res.data.filterCounts || {});
    setOps(res.data.ops || null);
    setOpsError(res.data.opsError || null);
    setCanCancel(Boolean(res.data.access?.canCancelEscrow));
    setCanRetry(Boolean(res.data.access?.canRetryPayout));
    setCanForce(Boolean(res.data.access?.canRetryPayout));
    setError(null);
  }, []);

  useEffect(() => { if (authed) { void loadPayments(); const t = setInterval(() => void loadPayments(), 30_000); return () => clearInterval(t); } }, [authed, loadPayments]);

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true); setError(null);
    const res = await apiCall<Detail>(`/api/admin/payments/${encodeURIComponent(id)}`);
    setDetailLoading(false);
    if (!res.ok) { setError(res.message); return; }
    setDetail(res.data);
  }, []);

  useEffect(() => { if (selectedId) { void loadDetail(selectedId); setNote(""); } else { setDetail(null); } }, [selectedId, loadDetail]);

  async function withPassword(action: () => Promise<void>) {
    if (!password.trim()) { setShowPassword(true); setPendingAction(() => action); return; }
    setShowPassword(false); setPendingAction(null); setBusy(true); setMsg(null); setError(null);
    const unlock = await apiCall<{ expiresAt?: string }>("/api/admin/care/unlock", { method: "POST", body: JSON.stringify({ password: password.trim() }) });
    if (!unlock.ok) { setError(unlock.message || "Invalid password"); setBusy(false); setPassword(""); return; }
    try { await action(); } catch { setError("Action failed"); }
    setBusy(false);
  }

  async function runAction(body: Record<string, unknown>, okMsg: string) {
    await withPassword(async () => {
      const res = await apiCall<{ message?: string; result?: { ok?: boolean; message?: string } }>("/api/admin/payments", { method: "PATCH", body: JSON.stringify(body) });
      if (!res.ok) { setError(res.message); return; }
      const r = res.data.result;
      if (r && r.ok === false) { setError(r.message || "Action failed"); }
      else { setMsg(res.data.message || okMsg); }
      await loadPayments(); if (selectedId) await loadDetail(selectedId);
    });
  }

  const filtered = useMemo(() => payments.filter(p => { const e = effectiveOf(p); if (filter === "all") return true; if (filter === "held") return e === "held" || e === "pending_payment"; if (filter === "pending_settlement") return e === "pending_settlement" || e === "release_pending"; if (filter === "suspended") return e === "suspended"; if (filter === "released") return e === "released"; if (filter === "failed") return e === "failed"; if (filter === "refunded") return e === "refunded"; return true; }), [payments, filter]);

  const counts = useMemo(() => { if (filterCounts.all != null) return filterCounts; const c: Record<string, number> = { all: payments.length, held: 0, pending_settlement: 0, suspended: 0, released: 0, failed: 0, refunded: 0 }; for (const p of payments) { const e = effectiveOf(p); if (e === "held" || e === "pending_payment") c.held += 1; else if (e === "suspended") c.suspended += 1; else if (e === "pending_settlement" || e === "release_pending") c.pending_settlement += 1; else if (e === "released") c.released += 1; else if (e === "failed") c.failed += 1; else if (e === "refunded") c.refunded += 1; } return c; }, [filterCounts, payments]);

  const esc = String(detail?.payment?.escrow_status || "").toLowerCase();
  const meta = (detail?.payment?.meta || {}) as Record<string, unknown>;
  const alreadyPaid = esc === "released" || meta.proTransferOk === true || meta.payoutStatus === "success" || detail?.flwLookup?.found === true;

  if (!authed) return <div style={{ padding: 40, fontFamily: "system-ui, sans-serif" }}><p>Authenticating...</p></div>;

  const styles = {
    container: { maxWidth: 1400, margin: "0 auto", padding: 24, fontFamily: "system-ui, sans-serif" },
    header: { fontSize: 24, fontWeight: 700, marginBottom: 4 },
    sub: { fontSize: 13, color: "#6b7280", marginTop: 0, marginBottom: 16, lineHeight: 1.5 },
    grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12, marginBottom: 16 },
    card: (tone?: string) => ({
      padding: "12px 16px", borderRadius: 8, border: "1px solid #e5e7eb", background: tone === "available" ? "#f0fdf4" : tone === "ledger" ? "#faf5ff" : tone === "held" ? "#fff7ed" : tone === "pending" ? "#fffbeb" : tone === "released" ? "#ecfdf5" : tone === "failed" ? "#fef2f2" : tone === "refunded" ? "#f8fafc" : "#fff",
    }),
    cardLabel: { fontSize: 11, color: "#6b7280", textTransform: "uppercase" as const, letterSpacing: "0.5px" },
    cardVal: { fontSize: 20, fontWeight: 700, marginTop: 4 },
    cardSub: { fontSize: 11, color: "#9ca3af", marginTop: 2 },
    table: { width: "100%", borderCollapse: "collapse" as const, fontSize: 13 },
    th: { textAlign: "left" as const, padding: "8px 12px", borderBottom: "2px solid #e5e7eb", color: "#6b7280", fontSize: 11, textTransform: "uppercase" as const, letterSpacing: "0.5px" },
    td: { padding: "10px 12px", borderBottom: "1px solid #f3f4f6", verticalAlign: "top" as const },
    badge: (type: string) => ({
      display: "inline-block", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600,
      background: type === "released" ? "#d1fae5" : type === "held" ? "#fed7aa" : type === "pending_settlement" || type === "pending" ? "#fde68a" : type === "failed" ? "#fecaca" : type === "refunded" ? "#e2e8f0" : type === "suspended" ? "#e0e7ff" : "#f3f4f6",
      color: type === "released" ? "#065f46" : type === "held" ? "#9a3412" : type === "pending_settlement" || type === "pending" ? "#92400e" : type === "failed" ? "#991b1b" : type === "refunded" ? "#475569" : type === "suspended" ? "#3730a3" : "#374151",
    }),
    btn: { padding: "6px 14px", borderRadius: 6, border: "1px solid #d1d5db", background: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 500, lineHeight: 1.4 },
    btnPrimary: { padding: "6px 14px", borderRadius: 6, border: "none", background: "#2563eb", color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600 },
    btnDanger: { padding: "6px 14px", borderRadius: 6, border: "1px solid #fca5a5", background: "#fff", color: "#b91c1c", cursor: "pointer", fontSize: 12, fontWeight: 500 },
    input: { padding: "6px 10px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 13, width: "100%", boxSizing: "border-box" as const },
    textarea: { padding: "6px 10px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 13, width: "100%", boxSizing: "border-box" as const, fontFamily: "inherit" },
    panel: { border: "1px solid #e5e7eb", borderRadius: 8, padding: 16, marginBottom: 16, background: "#fff" },
    error: { padding: "8px 14px", borderRadius: 6, background: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca", fontSize: 13, marginBottom: 12 },
    success: { padding: "8px 14px", borderRadius: 6, background: "#f0fdf4", color: "#065f46", border: "1px solid #bbf7d0", fontSize: 13, marginBottom: 12 },
    muted: { fontSize: 12, color: "#9ca3af" },
    link: { color: "#2563eb", cursor: "pointer", textDecoration: "none", fontSize: 12 },
    flex: { display: "flex", flexWrap: "wrap" as const, gap: 8, alignItems: "center" },
  };

  return (
    <div style={styles.container}>
      <div style={{ ...styles.flex, justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={styles.header}>Payment Management</h1>
          <p style={styles.sub}>Full control: payments, force payout, refund, cancel — {adminName} ({adminRole})</p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button style={styles.btn} onClick={() => { void loadPayments(); setMsg("Refreshed"); setTimeout(() => setMsg(null), 2000); }}>Refresh</button>
          <button style={{ ...styles.btn, color: "#6b7280" }} onClick={() => router.push("/admin")}>Back to Admin</button>
        </div>
      </div>

      <AdminGuideBanner pageId="payments-manage" />

      {error ? <div style={styles.error}>{error}</div> : null}
      {msg ? <div style={styles.success}>{msg}</div> : null}

      {showPassword && (
        <div style={{ ...styles.panel, background: "#fffbeb", borderColor: "#fde68a", marginBottom: 16 }}>
          <p style={{ fontSize: 13, fontWeight: 600, marginTop: 0 }}>Sensitive action requires temporary access code</p>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input style={{ ...styles.input, width: 200 }} type="password" placeholder="Enter access code" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && pendingAction) { void withPassword(pendingAction); } }} autoFocus />
            <button style={styles.btnPrimary} disabled={busy} onClick={() => { if (pendingAction) void withPassword(pendingAction); }}>Confirm</button>
            <button style={styles.btn} onClick={() => { setShowPassword(false); setPendingAction(null); }}>Cancel</button>
          </div>
        </div>
      )}

      <div style={styles.grid}>
        <div style={styles.card("available")}>
          <div style={styles.cardLabel}>FLW Available</div>
          <div style={styles.cardVal}>{ops ? `₦${(ops.flw.available ?? 0).toLocaleString("en-NG", { minimumFractionDigits: 2 })}` : "—"}</div>
          <div style={styles.cardSub}>Payout balance</div>
        </div>
        <div style={styles.card("ledger")}>
          <div style={styles.cardLabel}>FLW Ledger</div>
          <div style={styles.cardVal}>{ops ? `₦${(ops.flw.ledger ?? 0).toLocaleString("en-NG", { minimumFractionDigits: 2 })}` : "—"}</div>
          <div style={styles.cardSub}>Settling collections</div>
        </div>
        <div style={styles.card("held")}>
          <div style={styles.cardLabel}>Escrow held</div>
          <div style={styles.cardVal}>{ops ? naira(ops.ona.escrowHeldMinor) : "—"}</div>
          <div style={styles.cardSub}>Paid, not released</div>
        </div>
        <div style={styles.card("pending")}>
          <div style={styles.cardLabel}>Pending settlement</div>
          <div style={styles.cardVal}>{ops ? naira(ops.ona.pendingSettlementMinor) : "—"}</div>
          <div style={styles.cardSub}>{ops ? `${ops.ona.pendingSettlementCount} jobs` : ""}</div>
        </div>
        <div style={styles.card("released")}>
          <div style={styles.cardLabel}>Paid to pros</div>
          <div style={styles.cardVal}>{ops ? String(ops.ona.releasedCount) : "—"}</div>
          <div style={styles.cardSub}>87.5% to pro</div>
        </div>
        <div style={styles.card("failed")}>
          <div style={styles.cardLabel}>Failed</div>
          <div style={styles.cardVal}>{ops ? String(ops.ona.failedCount) : "—"}</div>
          <div style={styles.cardSub}>Needs admin</div>
        </div>
        <div style={styles.card("refunded")}>
          <div style={styles.cardLabel}>Refunded</div>
          <div style={styles.cardVal}>{ops ? String(ops.ona.refundedCount) : "—"}</div>
          <div style={styles.cardSub}>Customer refunded</div>
        </div>
      </div>

      {opsError ? <p style={{ ...styles.error, marginBottom: 16 }}>Balances unavailable: {opsError}</p> : null}

      <div style={{ display: "flex", gap: selectedId ? 16 : 0 }}>
        <div style={{ flex: selectedId ? "0 0 50%" : 1, minWidth: selectedId ? 400 : 0 }}>
          <div style={styles.panel}>
            <div style={{ ...styles.flex, marginBottom: 12 }}>
              <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0, flex: 1 }}>Payments</h2>
              {FILTERS.map(({ key, label }) => {
                const n = counts[key] ?? 0; const active = filter === key;
                return (
                  <button key={key} style={{ ...styles.link, fontWeight: active ? 700 : 400, textDecoration: active ? "underline" : "none", opacity: key !== "all" && n === 0 ? 0.5 : 1 }} onClick={() => setFilter(key)}>
                    {label} ({n})
                  </button>
                );
              })}
            </div>
            {loading && payments.length === 0 ? <p style={styles.muted}>Loading payments...</p> : filtered.length === 0 ? <p style={styles.muted}>No payments in <strong>{filter}</strong>.</p> : (
              <div style={{ maxHeight: 600, overflowY: "auto" }}>
                <table style={styles.table}>
                  <thead><tr>
                    <th style={styles.th}>Amount</th>
                    <th style={styles.th}>Status</th>
                    <th style={styles.th}>Customer</th>
                    <th style={styles.th}>When</th>
                    <th style={styles.th}>Action</th>
                  </tr></thead>
                  <tbody>
                    {filtered.map(p => {
                      const e = effectiveOf(p);
                      return (
                        <tr key={p.id} style={{ background: selectedId === p.id ? "#eff6ff" : undefined, cursor: "pointer" }} onClick={() => setSelectedId(selectedId === p.id ? null : p.id)}>
                          <td style={styles.td}><strong>{naira(p.amount_kobo)}</strong></td>
                          <td style={styles.td}><span style={styles.badge(e)}>{p.display_status || e}</span></td>
                          <td style={{ ...styles.td, ...styles.muted }}>{p.provider_ref ? String(p.provider_ref).slice(0, 16) : "—"}</td>
                          <td style={{ ...styles.td, ...styles.muted, fontSize: 11 }}>{p.paid_at ? new Date(p.paid_at).toLocaleDateString() : new Date(p.created_at).toLocaleDateString()}</td>
                          <td style={styles.td}>
                            <span style={styles.link}>{selectedId === p.id ? "▼ close" : "▶ select"}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {selectedId && (
          <div style={{ flex: "0 0 50%", minWidth: 400 }}>
            <div style={styles.panel}>
              <div style={{ ...styles.flex, justifyContent: "space-between", marginBottom: 8 }}>
                <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Payment Control</h2>
                <button style={{ ...styles.btn, fontSize: 11 }} onClick={() => { setSelectedId(null); setDetail(null); }}>Close</button>
              </div>
              {detailLoading ? <p style={styles.muted}>Loading detail...</p> : !detail ? <p style={styles.muted}>Select a payment</p> : (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12, fontSize: 13 }}>
                    <div>
                      <p style={{ fontSize: 12, fontWeight: 600, margin: "0 0 4px" }}>Customer (payer)</p>
                      <p style={{ margin: 0, fontWeight: 700 }}>{detail.parties?.customer?.name || "—"}</p>
                      <p style={styles.muted}>{detail.parties?.customer?.phone || ""}{detail.parties?.customer?.email ? ` · ${detail.parties.customer.email}` : ""}</p>
                      <p style={{ fontSize: 12, marginTop: 6 }}>Paid <strong>{naira(Number(detail.payment.amount_kobo) || 0)}</strong></p>
                    </div>
                    <div>
                      <p style={{ fontSize: 12, fontWeight: 600, margin: "0 0 4px" }}>Repair Pro (payee)</p>
                      <p style={{ margin: 0, fontWeight: 700 }}>{detail.parties?.pro?.name || "—"}</p>
                      <p style={styles.muted}>{detail.parties?.pro?.bank?.bankName || ""} · {detail.parties?.pro?.bank?.accountName || "—"} · ****{detail.parties?.pro?.bank?.accountLast4 || "????"}</p>
                      <p style={{ fontSize: 12, marginTop: 6 }}>Pro share <strong>{detail.payment.pro_payout_kobo != null ? naira(Number(detail.payment.pro_payout_kobo)) : "—"}</strong></p>
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 16px", fontSize: 12, marginBottom: 12, background: "#f9fafb", padding: 12, borderRadius: 6 }}>
                    <span style={styles.muted}>Status</span><span><span style={styles.badge(esc)}>{esc}</span> · {String(detail.payment.status)}</span>
                    <span style={styles.muted}>Payment ID</span><span style={{ wordBreak: "break-all" }}>{String(detail.payment.id)}</span>
                    <span style={styles.muted}>Job / request</span><span style={{ wordBreak: "break-all" }}>{String(detail.payment.request_id || "—")}</span>
                    <span style={styles.muted}>FLW transfer</span><span>{detail.flwLookup?.found ? `Found · ${detail.flwLookup.status || ""}` : detail.flwTransfers.filter(t => /success/i.test(String(t.status || ""))).length ? "Found on FLW" : "No successful transfer"}</span>
                    <span style={styles.muted}>Last error</span><span style={{ color: "#b91c1c" }}>{String(meta.lastReleaseError || "—")}</span>
                    <span style={styles.muted}>Retries</span><span>{meta.payoutRetryCount != null ? String(meta.payoutRetryCount) : "—"}{meta.nextRetryAt ? ` · next ${new Date(String(meta.nextRetryAt)).toLocaleString()}` : ""}</span>
                    {detail.doublePayRisk ? <span style={{ color: "#b91c1c", gridColumn: "1 / -1", fontWeight: 600 }}>{detail.doublePayRisk}</span> : null}
                  </div>

                  <p style={{ fontSize: 12, color: "#6b7280", margin: "0 0 6px" }}>Reason note (required for sensitive actions):</p>
                  <textarea style={styles.textarea} rows={2} placeholder="e.g. Force payout, customer refund..." value={note} onChange={e => setNote(e.target.value)} />

                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                    <button style={styles.btn} onClick={() => { void loadDetail(selectedId); }} disabled={busy}>Refresh</button>
                    {canCancel ? (
                      <button style={styles.btnDanger} disabled={busy || alreadyPaid || esc === "refunded"} onClick={() => { const r = note.trim(); if (r.length < 8) { setError("Note min 8 chars"); return; } void runAction({ id: selectedId, action: "cancel_escrow", reason: r, jobId: detail.payment.request_id || undefined, status: "refunded" }, "Escrow cancelled / refunded"); }}>Refund customer</button>
                    ) : null}
                    {canCancel ? (
                      <button style={styles.btn} disabled={busy || alreadyPaid || esc === "refunded"} onClick={() => { const r = note.trim(); if (r.length < 8) { setError("Note min 8 chars"); return; } void runAction({ id: selectedId, action: "cancel_processing", reason: r, jobId: detail.payment.request_id || undefined }, "Processing stopped"); }}>Stop processing</button>
                    ) : null}
                    {canForce ? (
                      <button style={styles.btnPrimary} disabled={busy || alreadyPaid || esc === "refunded"} onClick={() => { const r = note.trim(); if (r.length < 8) { setError("Note min 8 chars"); return; } if (!window.confirm("Force payout? Same ref — no double pay.")) return; void runAction({ id: selectedId, action: "force_release", jobId: detail.payment.request_id || selectedId, reason: r }, "Force payout submitted"); }}>Force payout to pro</button>
                    ) : null}
                    {canRetry ? (
                      <button style={styles.btn} disabled={busy} onClick={() => { void runAction({ id: selectedId, action: "retry_payout", jobId: detail.payment.request_id || selectedId }, "Retry submitted"); }}>Retry payout</button>
                    ) : null}
                  </div>
                  {!canForce && !canCancel ? <p style={{ ...styles.muted, marginTop: 8 }}>Read-only view. Force/refund requires L3+.</p> : null}

                  <div style={{ marginTop: 16 }}>
                    <h3 style={{ fontSize: 13, fontWeight: 600, margin: "0 0 8px" }}>Transfer ledger</h3>
                    {!detail.ledger?.length ? <p style={styles.muted}>No ledger rows.</p> : (
                      <table style={{ ...styles.table, fontSize: 12 }}>
                        <thead><tr><th style={styles.th}>Ref</th><th style={styles.th}>Status</th><th style={styles.th}>Amount</th><th style={styles.th}>When</th></tr></thead>
                        <tbody>{detail.ledger.map(r => (
                          <tr key={r.id}>
                            <td style={{ ...styles.td, wordBreak: "break-all", maxWidth: 120 }}>{r.transferRef}</td>
                            <td style={styles.td}><span style={styles.badge(r.status)}>{r.status}</span></td>
                            <td style={styles.td}>{naira(r.amountMinor)}</td>
                            <td style={{ ...styles.td, ...styles.muted, fontSize: 11 }}>{r.createdAt ? new Date(r.createdAt).toLocaleString() : "—"}</td>
                          </tr>
                        ))}</tbody>
                      </table>
                    )}
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <h3 style={{ fontSize: 13, fontWeight: 600, margin: "0 0 8px" }}>FLW transfers</h3>
                    {!detail.flwTransfers?.length ? <p style={styles.muted}>No FLW transfers matched.</p> : (
                      <table style={{ ...styles.table, fontSize: 12 }}>
                        <thead><tr><th style={styles.th}>Status</th><th style={styles.th}>Amount</th><th style={styles.th}>Account</th><th style={styles.th}>When</th></tr></thead>
                        <tbody>{detail.flwTransfers.map((t, i) => (
                          <tr key={String(t.id || t.reference || i)}>
                            <td style={styles.td}><span style={styles.badge(String(t.status || "").toLowerCase())}>{t.status || "—"}</span></td>
                            <td style={styles.td}>{t.amount != null ? `₦${Number(t.amount).toLocaleString("en-NG", { minimumFractionDigits: 2 })}` : "—"}</td>
                            <td style={{ ...styles.td, fontSize: 11 }}>{t.bank_name || ""} {t.account_number || ""}</td>
                            <td style={{ ...styles.td, ...styles.muted, fontSize: 11 }}>{t.created_at ? new Date(t.created_at).toLocaleString() : "—"}</td>
                          </tr>
                        ))}</tbody>
                      </table>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
