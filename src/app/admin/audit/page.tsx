"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { useAdminGate } from "@/components/admin/use-admin-gate";

type Action = {
  id: string;
  admin_id: string;
  action: string;
  target_user_id: string | null;
  meta: Record<string, unknown>;
  created_at: string;
};

export default function AdminAuditPage() {
  const { adminName, ready, api } = useAdminGate();
  const [actions, setActions] = useState<Action[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    (async () => {
      const res = await api<{ actions: Action[] }>("/api/admin/audit");
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setActions(res.data.actions);
    })();
  }, [ready, api]);

  return (
    <AdminShell adminName={adminName}>
      <h1 className="om-admin-h1">Audit log</h1>
      <p className="om-admin-sub">
        Every admin action — roles, pro status, settings, payments.
      </p>
      {error ? <div className="om-admin-error">{error}</div> : null}
      <div className="om-admin-panel">
        <div className="om-admin-toolbar">
          <strong>{actions.length} event(s)</strong>
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
