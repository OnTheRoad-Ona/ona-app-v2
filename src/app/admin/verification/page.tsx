"use client";

/**
 * Verification overview — links into merged hubs (no duplicate queues).
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AdminShell } from "@/components/admin/admin-shell";
import { useAdminGate } from "@/components/admin/use-admin-gate";

export default function AdminVerificationOverview() {
  const { adminName, ready, api } = useAdminGate();
  const [stats, setStats] = useState({
    customers: 0,
    customerPending: 0,
    pros: 0,
    proPending: 0,
    proT2: 0,
    proT4: 0,
  });
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [c, p] = await Promise.all([
      api<{ totals: { total: number; submitted: number } }>(
        "/api/admin/customer-review?status=all"
      ),
      api<{
        totals: {
          total: number;
          needs_action: number;
          t2_pending: number;
          t4_pending: number;
        };
      }>("/api/admin/pro-review?filter=all"),
    ]);
    if (!c.ok && !p.ok) {
      setError(c.message || p.message);
      return;
    }
    setError(null);
    setStats({
      customers: c.ok ? c.data.totals.total : 0,
      customerPending: c.ok ? c.data.totals.submitted : 0,
      pros: p.ok ? p.data.totals.total : 0,
      proPending: p.ok ? p.data.totals.needs_action : 0,
      proT2: p.ok ? p.data.totals.t2_pending : 0,
      proT4: p.ok ? p.data.totals.t4_pending : 0,
    });
  }, [api]);

  useEffect(() => {
    if (!ready) return;
    void load();
  }, [ready, load]);

  return (
    <AdminShell adminName={adminName}>
      <h1 className="om-admin-h1">Verification overview</h1>
      <p className="om-admin-sub">
        Queues live under Customers and Repair Pros (merged). Use the cards
        below — no duplicate review pages.
      </p>
      {error ? <div className="om-admin-error">{error}</div> : null}

      <div className="om-admin-cards">
        {(
          [
            ["Customers", stats.customers, "/admin/motorists"],
            [
              "Customer T2 pending",
              stats.customerPending,
              "/admin/motorists?tab=id_review",
            ],
            ["Repair Pros", stats.pros, "/admin/pros"],
            ["Pro needs action", stats.proPending, "/admin/pros?tab=review"],
            ["Pro T2 pending", stats.proT2, "/admin/pros?tab=review"],
            ["Pro T4 pending", stats.proT4, "/admin/pros?tab=review"],
          ] as const
        ).map(([label, value, href]) => (
          <div className="om-admin-card" key={label}>
            <div className="label">{label}</div>
            <Link href={href}>
              <div className="value">{value}</div>
            </Link>
          </div>
        ))}
      </div>

      <div className="om-admin-panel" style={{ padding: "1rem 1.1rem" }}>
        <p className="om-admin-muted" style={{ margin: 0 }}>
          <strong>Customers</strong> — directory + ID review (files, approve /
          reject, activate).{" "}
          <Link href="/admin/motorists">Open Customers →</Link>
        </p>
        <p className="om-admin-muted" style={{ margin: "0.75rem 0 0" }}>
          <strong>Repair Pros</strong> — directory + tier review (ID photos,
          skill docs, visibility).{" "}
          <Link href="/admin/pros">Open Repair Pros →</Link>
        </p>
      </div>
    </AdminShell>
  );
}
