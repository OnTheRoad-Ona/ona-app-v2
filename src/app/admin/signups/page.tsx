"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { useAdminGate } from "@/components/admin/use-admin-gate";

type EventRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  account_type: string | null;
  success: boolean;
  error_message: string | null;
  user_id: string | null;
  created_at: string;
};

export default function AdminSignupsPage() {
  const { adminName, ready, api } = useAdminGate();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [totals, setTotals] = useState({ total: 0, success: 0, failed: 0 });
  const [failedOnly, setFailedOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const q = failedOnly ? "?failed=1" : "";
    const res = await api<{ events: EventRow[]; totals: typeof totals }>(
      `/api/admin/signups${q}`
    );
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setError(null);
    setEvents(res.data.events);
    setTotals(res.data.totals);
  }, [api, failedOnly]);

  useEffect(() => {
    if (!ready) return;
    void load();
  }, [ready, load]);

  return (
    <AdminShell adminName={adminName}>
      <h1 className="om-admin-h1">Signup events</h1>
      <p className="om-admin-sub">
        Live log of every registration attempt — successes write to the database;
        failures show the exact error so you can fix them. Fake local-only
        “signups” never appear here.
      </p>
      {error ? <div className="om-admin-error">{error}</div> : null}

      <div className="om-admin-cards">
        {[
          ["Shown", totals.total],
          ["Succeeded", totals.success],
          ["Failed", totals.failed],
        ].map(([label, value]) => (
          <div className="om-admin-card" key={String(label)}>
            <div className="label">{label}</div>
            <div className="value">{value}</div>
          </div>
        ))}
      </div>

      <div className="om-admin-panel">
        <div className="om-admin-toolbar">
          <label className="om-admin-muted" style={{ display: "flex", gap: 8 }}>
            <input
              type="checkbox"
              checked={failedOnly}
              onChange={(e) => setFailedOnly(e.target.checked)}
            />
            Failed only
          </label>
          <button type="button" className="om-admin-btn" onClick={() => load()}>
            Refresh
          </button>
        </div>
        <table className="om-admin-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Name</th>
              <th>Contact</th>
              <th>Type</th>
              <th>Result</th>
              <th>Error / note</th>
            </tr>
          </thead>
          <tbody>
            {events.length === 0 ? (
              <tr>
                <td colSpan={6} className="om-admin-muted">
                  No signup events yet.
                </td>
              </tr>
            ) : (
              events.map((e) => (
                <tr key={e.id}>
                  <td className="om-admin-muted">
                    {e.created_at
                      ? new Date(e.created_at).toLocaleString()
                      : "—"}
                  </td>
                  <td>{e.full_name || "—"}</td>
                  <td>
                    <div>{e.email || "—"}</div>
                    <div className="om-admin-muted">{e.phone || ""}</div>
                  </td>
                  <td>{e.account_type || "—"}</td>
                  <td>
                    <span
                      className={`om-admin-badge ${
                        e.success ? "approved" : "rejected"
                      }`}
                    >
                      {e.success ? "saved" : "failed"}
                    </span>
                  </td>
                  <td className="om-admin-muted">
                    {e.success
                      ? e.user_id
                        ? `user ${e.user_id.slice(0, 8)}…`
                        : "ok"
                      : e.error_message || "—"}
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
