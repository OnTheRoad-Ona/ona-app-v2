"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { useAdminGate } from "@/components/admin/use-admin-gate";

type Row = {
  user_id: string;
  full_name: string;
  email: string | null;
  business_name: string | null;
  status: string;
  primary_service: string;
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
    fullyVerified: 0,
    partial: 0,
    unverified: 0,
  });
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

  return (
    <AdminShell adminName={adminName}>
      <h1 className="om-admin-h1">Identity verification</h1>
      <p className="om-admin-sub">
        NIN / BVN status for Repair Pros (and verification gate health).
      </p>
      {error ? <div className="om-admin-error">{error}</div> : null}

      <div className="om-admin-cards">
        {[
          ["Pros", totals.total],
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
          <strong>Pro identity status</strong>
        </div>
        <table className="om-admin-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Service</th>
              <th>Status</th>
              <th>NIN</th>
              <th>BVN</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="om-admin-muted">
                  No repair pro profiles yet.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.user_id}>
                  <td>
                    <strong>{r.full_name}</strong>
                    <div className="om-admin-muted">
                      {r.business_name || r.email || r.user_id.slice(0, 8)}
                    </div>
                  </td>
                  <td>{r.primary_service}</td>
                  <td>
                    <span className={`om-admin-badge ${r.status}`}>
                      {r.status}
                    </span>
                  </td>
                  <td>
                    {r.nin_verified ? (
                      <span className="om-admin-badge approved">
                        ✓ {r.nin_last4 ? `…${r.nin_last4}` : "ok"}
                      </span>
                    ) : (
                      <span className="om-admin-badge pending">No</span>
                    )}
                  </td>
                  <td>
                    {r.bvn_verified ? (
                      <span className="om-admin-badge approved">
                        ✓ {r.bvn_last4 ? `…${r.bvn_last4}` : "ok"}
                      </span>
                    ) : (
                      <span className="om-admin-badge pending">No</span>
                    )}
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
