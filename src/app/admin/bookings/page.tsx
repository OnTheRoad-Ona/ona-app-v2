"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { useAdminGate } from "@/components/admin/use-admin-gate";

type Booking = {
  id: string;
  request_id: string;
  motorist_id: string;
  repair_pro_id: string;
  starts_at: string | null;
  ends_at: string | null;
  notes: string | null;
  created_at: string;
};

export default function AdminBookingsPage() {
  const { adminName, ready, api } = useAdminGate();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    (async () => {
      const res = await api<{ bookings: Booking[] }>("/api/admin/bookings");
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setBookings(res.data.bookings);
    })();
  }, [ready, api]);

  return (
    <AdminShell adminName={adminName}>
      <h1 className="om-admin-h1">Bookings</h1>
      <p className="om-admin-sub">
        Booking records linked to jobs and escrow. Cross-check status with Live jobs and Payments.
      </p>
      {error ? <div className="om-admin-error">{error}</div> : null}
      <div className="om-admin-panel">
        <div className="om-admin-toolbar">
          <strong>{bookings.length} booking(s)</strong>
        </div>
        <table className="om-admin-table">
          <thead>
            <tr>
              <th>Created</th>
              <th>Request</th>
              <th>Customer</th>
              <th>Pro</th>
              <th>Starts</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {bookings.length === 0 ? (
              <tr>
                <td colSpan={6} className="om-admin-muted">
                  No bookings yet.
                </td>
              </tr>
            ) : (
              bookings.map((b) => (
                <tr key={b.id}>
                  <td>{new Date(b.created_at).toLocaleString()}</td>
                  <td className="om-admin-muted">{b.request_id.slice(0, 8)}…</td>
                  <td className="om-admin-muted">{b.motorist_id.slice(0, 8)}…</td>
                  <td className="om-admin-muted">
                    {b.repair_pro_id.slice(0, 8)}…
                  </td>
                  <td>
                    {b.starts_at
                      ? new Date(b.starts_at).toLocaleString()
                      : "—"}
                  </td>
                  <td>{b.notes || "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
