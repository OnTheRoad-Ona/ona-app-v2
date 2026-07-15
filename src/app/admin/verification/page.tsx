"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { useAdminGate } from "@/components/admin/use-admin-gate";

type Row = {
  kind: "motorist" | "repair_pro";
  user_id: string;
  full_name: string;
  email: string | null;
  label: string | null;
  status: string;
  verified: boolean;
  nin_verified: boolean;
  bvn_verified: boolean;
  nin_last4: string | null;
  bvn_last4: string | null;
};

export default function AdminVerificationPage() {
  const { adminName, ready, api } = useAdminGate();
  const [rows, setRows] = useState<Row[]>([]);
  const [totals, setTotals] = useState({
    total: 0,
    motorists: 0,
    pros: 0,
    fullyVerified: 0,
    partial: 0,
    unverified: 0,
  });
  const [filter, setFilter] = useState<"all" | "motorist" | "repair_pro">(
    "all"
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    (async () => {
      const res = await api<{ rows: Row[]; totals: typeof totals }>(
        "/api/admin/verification"
      );
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setRows(res.data.rows);
      setTotals(res.data.totals);
    })();
  }, [ready, api]);

  const visible =
    filter === "all" ? rows : rows.filter((r) => r.kind === filter);

  return (
    <AdminShell adminName={adminName}>
      <h1 className="om-admin-h1">Identity verification</h1>
      <p className="om-admin-sub">
        NIN / BVN status for Motorists and Repair Pros (live from Supabase).
      </p>
      {error ? <div className="om-admin-error">{error}</div> : null}

      <div className="om-admin-cards">
        {[
          ["People", totals.total],
          ["Motorists", totals.motorists],
          ["Pros", totals.pros],
          ["Fully verified", totals.fullyVerified],
          ["Partial", totals.partial],
          ["Unverified", totals.unverified],
        ].map(([label, value]) => (
          <div className="om-admin-card" key={String(label)}>
            <div className="label">{label}</div>
            <div className="value">{value}</div>
          </div>
        ))}
      </div>

      <div className="om-admin-panel">
        <div className="om-admin-toolbar">
          <strong>Identity status</strong>
          <select
            value={filter}
            onChange={(e) =>
              setFilter(e.target.value as "all" | "motorist" | "repair_pro")
            }
            style={{ marginLeft: "auto" }}
          >
            <option value="all">All people</option>
            <option value="motorist">Motorists only</option>
            <option value="repair_pro">Repair Pros only</option>
          </select>
        </div>
        <table className="om-admin-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Detail</th>
              <th>NIN</th>
              <th>BVN</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={5} className="om-admin-muted">
                  No identity rows yet.
                </td>
              </tr>
            ) : (
              visible.map((r) => (
                <tr key={`${r.kind}-${r.user_id}`}>
                  <td>
                    <strong>{r.full_name}</strong>
                    <div className="om-admin-muted">
                      {r.email || r.user_id.slice(0, 8)}
                    </div>
                  </td>
                  <td>
                    <span className={`om-admin-badge ${r.kind}`}>
                      {r.kind === "motorist" ? "motorist" : "repair_pro"}
                    </span>
                  </td>
                  <td>
                    {r.label || "—"}
                    {r.kind === "repair_pro" ? (
                      <div className="om-admin-muted">{r.status}</div>
                    ) : null}
                  </td>
                  <td>
                    {r.nin_verified ? "✓" : "—"}
                    {r.nin_last4 ? ` …${r.nin_last4}` : ""}
                  </td>
                  <td>
                    {r.bvn_verified ? "✓" : "—"}
                    {r.bvn_last4 ? ` …${r.bvn_last4}` : ""}
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
