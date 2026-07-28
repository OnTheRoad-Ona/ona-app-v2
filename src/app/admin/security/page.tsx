"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { useAdminGate } from "@/components/admin/use-admin-gate";
import { AdminGuideBanner } from "@/components/admin/admin-guide-banner";
import { cn } from "@/lib/utils";

type Tab = "overview" | "contact-changes" | "fraud" | "audit";

const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "contact-changes", label: "Contact Changes" },
  { key: "fraud", label: "Fraud Review" },
  { key: "audit", label: "Audit Trail" },
];

export default function AdminSecurityPage() {
  const gate = useAdminGate();
  const [tab, setTab] = useState<Tab>("overview");
  const [data, setData] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const fetchSection = useCallback(async (section: Tab, params?: string) => {
    setLoading(true);
    try {
      const url = `/api/admin/security?section=${section}${params ? `&${params}` : ""}`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.ok) setData((prev) => ({ ...prev, [section]: json.data }));
    } catch { /* */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!gate.ready) return;
    void fetchSection("overview");
  }, [gate.ready, fetchSection]);

  const onAction = useCallback(async (action: string, body: Record<string, any>) => {
    setActionMsg(null);
    try {
      const res = await fetch("/api/admin/security", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...body }),
      });
      const json = await res.json();
      if (json.ok) {
        setActionMsg(`${action} succeeded`);
        void fetchSection(tab);
      } else {
        setActionMsg(json.error || "Action failed");
      }
    } catch { setActionMsg("Network error"); }
    setTimeout(() => setActionMsg(null), 3000);
  }, [tab, fetchSection]);

  if (!gate.ready) return <AdminShell><div className="p-6 text-[var(--om-text-muted)]">Loading...</div></AdminShell>;
  if (gate.error) return <AdminShell><div className="p-6 text-red-500">{gate.error}</div></AdminShell>;

  const stats = data.overview?.stats || {};
  const requests = data["contact-changes"]?.requests || [];
  const flags = data.fraud?.flags || [];
  const actions = data.audit?.actions || [];

  const card = "rounded-xl border border-[var(--om-border)] bg-[var(--om-panel)] p-4";
  const badge = (cls: string) => `inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${cls}`;

  const renderOverview = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Total Contact Changes", stats.totalChangeRequests ?? "—", "bg-blue-50 text-blue-700"],
          ["Pending Changes", stats.pendingChangeRequests ?? 0, "bg-yellow-50 text-yellow-700"],
          ["Open Fraud Flags", stats.openFraudFlags ?? 0, "bg-red-50 text-red-700"],
          ["Audit Events Today", stats.auditEventsToday ?? 0, "bg-purple-50 text-purple-700"],
          ["Active Sessions", stats.activeSessions ?? "—", "bg-green-50 text-green-700"],
        ].map(([label, value, cls]) => (
          <div key={String(label)} className={cn(card)}>
            <p className="text-[11px] font-semibold text-[var(--om-text-muted)]">{String(label)}</p>
            <p className={cn("mt-1 text-[22px] font-bold", cls)}>{String(value)}</p>
          </div>
        ))}
      </div>
    </div>
  );

  const renderContactChanges = () => (
    <div className="space-y-3">
      <div className="flex gap-2">
        {["all", "pending", "approved", "rejected", "under_review"].map((s) => (
          <button key={s} type="button" onClick={() => void fetchSection("contact-changes", `status=${s}`)}
            className="rounded-lg border border-[var(--om-border)] bg-[var(--om-bg-elevated)] px-3 py-1.5 text-[11px] font-semibold text-[var(--om-text)] hover:bg-[var(--om-nav-hover)]"
          >{s.replace("_", " ")}</button>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[12px]">
          <thead>
            <tr className="border-b border-[var(--om-border)] text-[11px] font-semibold text-[var(--om-text-muted)]">
              <th className="p-2">User</th>
              <th className="p-2">Type</th>
              <th className="p-2">Old</th>
              <th className="p-2">New</th>
              <th className="p-2">Status</th>
              <th className="p-2">Risk</th>
              <th className="p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((r: any) => (
              <tr key={r.id} className="border-b border-[var(--om-border-soft)]">
                <td className="p-2 font-medium">{r.userId?.slice(0, 8)}</td>
                <td className="p-2">{r.changeType}</td>
                <td className="p-2 text-[var(--om-text-muted)]">{r.oldValue}</td>
                <td className="p-2 text-[var(--om-text-muted)]">{r.newValue}</td>
                <td className="p-2"><span className={badge(
                  r.status === "approved" ? "bg-green-50 text-green-700" :
                  r.status === "rejected" ? "bg-red-50 text-red-700" :
                  r.status === "under_review" ? "bg-yellow-50 text-yellow-700" :
                  "bg-blue-50 text-blue-700"
                )}>{r.status}</span></td>
                <td className="p-2">{r.riskScore}</td>
                <td className="p-2">
                  <div className="flex gap-1">
                    <button type="button" onClick={() => onAction("approve-contact-change", { id: r.id, reason: "Admin approved" })}
                      className="rounded bg-green-500 px-2 py-1 text-[10px] font-bold text-white">Approve</button>
                    <button type="button" onClick={() => onAction("reject-contact-change", { id: r.id, reason: "Admin rejected" })}
                      className="rounded bg-red-500 px-2 py-1 text-[10px] font-bold text-white">Reject</button>
                    <button type="button" onClick={() => onAction("hold-contact-change", { id: r.id, reason: "Under review" })}
                      className="rounded bg-yellow-500 px-2 py-1 text-[10px] font-bold text-white">Hold</button>
                  </div>
                </td>
              </tr>
            ))}
            {requests.length === 0 && <tr><td colSpan={7} className="p-4 text-center text-[var(--om-text-muted)]">No requests</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderFraud = () => (
    <div className="space-y-3">
      <table className="w-full text-left text-[12px]">
        <thead>
          <tr className="border-b border-[var(--om-border)] text-[11px] font-semibold text-[var(--om-text-muted)]">
            <th className="p-2">User</th>
            <th className="p-2">Type</th>
            <th className="p-2">Risk</th>
            <th className="p-2">Description</th>
            <th className="p-2">Status</th>
            <th className="p-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {flags.map((f: any) => (
            <tr key={f.id} className="border-b border-[var(--om-border-soft)]">
              <td className="p-2 font-medium">{f.userId?.slice(0, 8)}</td>
              <td className="p-2 capitalize">{f.flagType?.replace("_", " ")}</td>
              <td className="p-2"><span className={badge(
                f.riskLevel === "critical" ? "bg-red-50 text-red-700" :
                f.riskLevel === "high" ? "bg-orange-50 text-orange-700" :
                "bg-yellow-50 text-yellow-700"
              )}>{f.riskLevel}</span></td>
              <td className="p-2 text-[var(--om-text-muted)]">{f.description}</td>
              <td className="p-2">{f.status}</td>
              <td className="p-2">
                <div className="flex gap-1">
                  <button type="button" onClick={() => onAction("resolve-fraud", { id: f.id })}
                    className="rounded bg-green-500 px-2 py-1 text-[10px] font-bold text-white">Resolve</button>
                  <button type="button" onClick={() => onAction("block-fraud", { id: f.id })}
                    className="rounded bg-red-500 px-2 py-1 text-[10px] font-bold text-white">Block</button>
                </div>
              </td>
            </tr>
          ))}
          {flags.length === 0 && <tr><td colSpan={6} className="p-4 text-center text-[var(--om-text-muted)]">No fraud flags</td></tr>}
        </tbody>
      </table>
    </div>
  );

  const renderAudit = () => (
    <div className="space-y-3">
      <div className="flex gap-2 flex-wrap">
        <button type="button" onClick={() => void fetchSection("audit")}
          className="rounded-lg border border-[var(--om-border)] bg-[var(--om-bg-elevated)] px-3 py-1.5 text-[11px] font-semibold">All</button>
        <button type="button" onClick={() => void fetchSection("audit", "actionType=approve-contact-change")}
          className="rounded-lg border border-[var(--om-border)] bg-[var(--om-bg-elevated)] px-3 py-1.5 text-[11px] font-semibold">Contact</button>
        <button type="button" onClick={() => void fetchSection("audit", "actionType=approve-referral")}
          className="rounded-lg border border-[var(--om-border)] bg-[var(--om-bg-elevated)] px-3 py-1.5 text-[11px] font-semibold">Referral</button>
        <button type="button" onClick={() => void fetchSection("audit", "actionType=approve-cashout")}
          className="rounded-lg border border-[var(--om-border)] bg-[var(--om-bg-elevated)] px-3 py-1.5 text-[11px] font-semibold">Cashout</button>
      </div>
      <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
        <table className="w-full text-left text-[11px]">
          <thead className="sticky top-0 bg-[var(--om-panel)]">
            <tr className="border-b border-[var(--om-border)] font-semibold text-[var(--om-text-muted)]">
              <th className="p-2">Admin</th>
              <th className="p-2">Action</th>
              <th className="p-2">Target</th>
              <th className="p-2">Reason</th>
              <th className="p-2">Status</th>
              <th className="p-2">Time</th>
            </tr>
          </thead>
          <tbody>
            {actions.map((a: any) => (
              <tr key={a.id} className="border-b border-[var(--om-border-soft)]">
                <td className="p-2 font-medium">{a.adminName || a.adminId?.slice(0, 8)}</td>
                <td className="p-2">{a.actionType}</td>
                <td className="p-2 text-[var(--om-text-muted)]">{a.targetType}:{a.targetId?.slice(0, 8)}</td>
                <td className="p-2 text-[var(--om-text-muted)]">{a.reason || "—"}</td>
                <td className="p-2"><span className={badge(a.status === "completed" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700")}>{a.status}</span></td>
                <td className="p-2 text-[var(--om-text-muted)]">{new Date(a.createdAt).toLocaleString()}</td>
              </tr>
            ))}
            {actions.length === 0 && <tr><td colSpan={6} className="p-4 text-center text-[var(--om-text-muted)]">No audit entries</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <AdminShell>
      <div className="p-6">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-[18px] font-bold text-[var(--om-text)]">Security Control</h1>
          {actionMsg && (
            <span className={cn("rounded-lg px-3 py-1 text-[11px] font-semibold", actionMsg.includes("succeeded") ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700")}>
              {actionMsg}
            </span>
          )}
        </div>

        <AdminGuideBanner pageId="security" />

        {/* Tabs */}
        <div className="mb-6 flex flex-wrap gap-1">
          {TABS.map((t) => (
            <button key={t.key} type="button" onClick={() => { setTab(t.key); void fetchSection(t.key); }}
              className={cn(
                "rounded-lg px-4 py-2 text-[12px] font-semibold transition-colors",
                tab === t.key ? "bg-[var(--om-accent)] text-white" : "bg-[var(--om-nav)] text-[var(--om-text)] hover:bg-[var(--om-nav-hover)]"
              )}
            >{t.label}</button>
          ))}
        </div>

        {loading && <p className="text-[13px] text-[var(--om-text-muted)]">Loading...</p>}

        {tab === "overview" && renderOverview()}
        {tab === "contact-changes" && renderContactChanges()}
        {tab === "fraud" && renderFraud()}
        {tab === "audit" && renderAudit()}
      </div>
    </AdminShell>
  );
}
