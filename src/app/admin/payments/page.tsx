"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";

type Payment = {
  id: string;
  amount_kobo: number;
  currency: string;
  status: string;
  provider: string;
  created_at: string;
  request_id: string;
};

export default function AdminPaymentsPage() {
  const router = useRouter();
  const [adminName, setAdminName] = useState("Admin");
  const [payments, setPayments] = useState<Payment[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/payments");
    const json = await res.json();
    if (!json.ok) {
      if (res.status === 401 || res.status === 403) {
        router.replace("/admin/login");
        return;
      }
      return;
    }
    setPayments(json.data.payments);
  }, [router]);

  useEffect(() => {
    (async () => {
      const me = await fetch("/api/admin/auth/me");
      const meJson = await me.json();
      if (!meJson.ok) {
        router.replace("/admin/login");
        return;
      }
      setAdminName(meJson.data.fullName || meJson.data.email);
      await load();
    })();
  }, [load, router]);

  async function setStatus(id: string, status: string) {
    setMsg(null);
    const res = await fetch("/api/admin/payments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    const json = await res.json();
    if (!json.ok) {
      setMsg(json.error?.message || "Failed");
      return;
    }
    setMsg(`Saved payment → ${status}`);
    await load();
  }

  return (
    <AdminShell adminName={adminName}>
      <h1 className="om-admin-h1">Payments</h1>
      <p className="om-admin-sub">
        Escrow holds, releases, and refunds for live jobs. Track Flutterwave references and platform fee vs pro payout.
      </p>
      {msg ? (
        <div
          className="om-admin-error"
          style={{ background: "#14532d", color: "#bbf7d0", marginBottom: 12 }}
        >
          {msg}
        </div>
      ) : null}
      <div className="om-admin-panel">
        <table className="om-admin-table">
          <thead>
            <tr>
              <th>Amount</th>
              <th>Status</th>
              <th>Provider</th>
              <th>When</th>
              <th>Update (save)</th>
            </tr>
          </thead>
          <tbody>
            {payments.length === 0 ? (
              <tr>
                <td colSpan={5} className="om-admin-muted">
                  No payments yet.
                </td>
              </tr>
            ) : (
              payments.map((p) => (
                <tr key={p.id}>
                  <td>
                    ₦{(Number(p.amount_kobo) / 100).toLocaleString()}{" "}
                    <span className="om-admin-muted">{p.currency}</span>
                  </td>
                  <td>
                    <span className="om-admin-badge">{p.status}</span>
                  </td>
                  <td>{p.provider}</td>
                  <td className="om-admin-muted">
                    {new Date(p.created_at).toLocaleString()}
                  </td>
                  <td>
                    <div className="om-admin-row-actions">
                      {(["pending", "paid", "failed", "refunded"] as const).map(
                        (s) => (
                          <button
                            key={s}
                            type="button"
                            className="om-admin-btn ghost"
                            disabled={p.status === s}
                            onClick={() => setStatus(p.id, s)}
                          >
                            {s}
                          </button>
                        )
                      )}
                    </div>
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
