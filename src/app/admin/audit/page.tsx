"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { useAdminGate } from "@/components/admin/use-admin-gate";
import { AdminGuideBanner } from "@/components/admin/admin-guide-banner";

type Action = {
  id: string;
  admin_id: string;
  action: string;
  target_user_id: string | null;
  meta: Record<string, unknown>;
  created_at: string;
};

type Period = "all" | "year" | "ytd";

const PERIOD_LABELS: Record<Period, string> = {
  all: "All time",
  year: "Past year",
  ytd: "Year to date",
};

export default function AdminAuditPage() {
  const { adminName, ready, api } = useAdminGate();
  const [actions, setActions] = useState<Action[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>("all");
  const [ytdCount, setYtdCount] = useState(0);

  useEffect(() => {
    if (!ready) return;
    (async () => {
      const res = await api<{ actions: Action[]; yearSummary?: { ytdCount: number } }>(`/api/admin/audit?period=${period}`);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setActions(res.data.actions);
      setYtdCount(res.data.yearSummary?.ytdCount || 0);
    })();
  }, [ready, api, period]);

  return (
    <AdminShell adminName={adminName}>
      <h1 className="om-admin-h1">Audit log</h1>
      <p className="om-admin-sub">
        Staff action log: who approved, froze, released escrow, or changed roles. Use for compliance and disputes.
      </p>

      <AdminGuideBanner pageId="audit" />

      <div className="om-admin-panel">
        <div className="om-admin-toolbar" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <strong>{actions.length} event(s)</strong>
          <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
            {(["all", "year", "ytd"] as Period[]).map(p => (
              <button key={p} onClick={() => setPeriod(p)} style={{
                background: period === p ? "var(--accent)" : "transparent",
                color: period === p ? "#fff" : "inherit",
                border: "1px solid var(--border)",
                borderRadius: 6, padding: "4px 10px", fontSize: 11, fontWeight: period === p ? 700 : 400, cursor: "pointer",
              }}>
                {PERIOD_LABELS[p]}
                {p === "ytd" && ytdCount > 0 ? ` (${ytdCount})` : ""}
              </button>
            ))}
          </div>
        </div>
        <table className="om-admin-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Action</th>
              <th>Admin</th>
              <th>Target</th>
              <th>Meta</th>
            </tr>
          </thead>
          <tbody>
            {actions.length === 0 ? (
              <tr>
                <td colSpan={5} className="om-admin-muted">
                  No admin actions recorded yet.
                </td>
              </tr>
            ) : (
              actions.map((a) => (
                <tr key={a.id}>
                  <td>{new Date(a.created_at).toLocaleString()}</td>
                  <td>
                    <strong>{a.action}</strong>
                  </td>
                  <td className="om-admin-muted">{a.admin_id.slice(0, 8)}…</td>
                  <td className="om-admin-muted">
                    {a.target_user_id?.slice(0, 8) || "—"}
                  </td>
                  <td className="om-admin-muted">
                    {Object.keys(a.meta || {}).length
                      ? JSON.stringify(a.meta).slice(0, 80)
                      : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
