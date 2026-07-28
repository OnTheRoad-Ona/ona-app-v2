"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { useAdminGate } from "@/components/admin/use-admin-gate";
import { AdminGuideBanner } from "@/components/admin/admin-guide-banner";

type Detail = {
  user: {
    id: string;
    role: string;
    full_name: string;
    phone: string | null;
    email: string | null;
    city: string | null;
    area: string | null;
    is_active: boolean;
    created_at: string;
    updated_at: string;
    motorist_profiles:
      | {
          vehicle_make: string | null;
          vehicle_model: string | null;
          vehicle_year: string | null;
          plate_number: string | null;
          address_text: string | null;
          default_lat: number | null;
          default_lng: number | null;
          nin_last4: string | null;
          bvn_last4: string | null;
          nin_verified: boolean;
          bvn_verified: boolean;
          identity_verified_at: string | null;
        }
      | Array<{
          vehicle_make: string | null;
          vehicle_model: string | null;
          vehicle_year: string | null;
          plate_number: string | null;
          address_text: string | null;
          default_lat: number | null;
          default_lng: number | null;
          nin_last4: string | null;
          bvn_last4: string | null;
          nin_verified: boolean;
          bvn_verified: boolean;
          identity_verified_at: string | null;
        }>
      | null;
  };
  jobs: Array<{
    id: string;
    service_type: string;
    status: string;
    description: string;
    pickup_address: string | null;
    created_at: string;
    completed_at: string | null;
  }>;
  bookings: Array<{
    id: string;
    status?: string;
    scheduled_at?: string | null;
    created_at: string;
  }>;
  payments: Array<{
    id: string;
    amount_kobo: number;
    status: string;
    currency: string;
    created_at: string;
  }>;
  reviews: Array<{
    id: string;
    rating?: number;
    comment?: string | null;
    created_at: string;
  }>;
};

function one<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null;
  return Array.isArray(v) ? v[0] ?? null : v;
}

export default function AdminMotoristDetailPage() {
  const params = useParams();
  const id = String(params.id || "");
  const { adminName, ready, api, router } = useAdminGate();
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const res = await api<Detail>(`/api/admin/users/${id}`);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setData(res.data);
    setError(null);
  }, [api, id]);

  useEffect(() => {
    if (!ready) return;
    void load();
  }, [ready, load]);

  async function toggleActive() {
    if (!data) return;
    setBusy(true);
    setMsg(null);
    const res = await api(`/api/admin/users/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !data.user.is_active }),
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setMsg(data.user.is_active ? "Deactivated" : "Activated");
    await load();
  }

  async function hardDelete() {
    if (
      !window.confirm(
        `Hard-delete ${data?.user.full_name || "this motorist"} permanently?`
      )
    ) {
      return;
    }
    setBusy(true);
    const res = await api(`/api/admin/users/${id}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    router.replace("/admin/motorists");
  }

  const u = data?.user;
  const mot = one(u?.motorist_profiles);

  return (
    <AdminShell adminName={adminName}>
      <div className="om-admin-toolbar" style={{ marginBottom: 8 }}>
        <Link
          href="/admin/motorists"
          className="om-admin-btn ghost"
          style={{ textDecoration: "none" }}
        >
          ← All customers
        </Link>
      </div>
      <h1 className="om-admin-h1">{u?.full_name || "Customer"}</h1>
      <p className="om-admin-sub">
        Single customer record: profile, identity, vehicle, bank, and job
        history from the live Ona database. Approve ID or freeze the account
        here.
      </p>

      <AdminGuideBanner pageId="customer-detail" />

      {msg ? (
        <div
          className="om-admin-error"
          style={{ background: "#14532d", color: "#bbf7d0", marginBottom: 12 }}
        >
          {msg}
        </div>
      ) : null}
      {error ? <div className="om-admin-error">{error}</div> : null}

      {!data ? (
        <p className="om-admin-muted">Loading…</p>
      ) : (
        <>
          <div className="om-admin-cards">
            <div className="om-admin-card">
              <div className="label">Status</div>
              <div className="value" style={{ fontSize: 18 }}>
                {u?.is_active ? "Active" : "Inactive"}
              </div>
            </div>
            <div className="om-admin-card">
              <div className="label">Jobs</div>
              <div className="value">{data.jobs.length}</div>
            </div>
            <div className="om-admin-card">
              <div className="label">Bookings</div>
              <div className="value">{data.bookings.length}</div>
            </div>
            <div className="om-admin-card">
              <div className="label">Payments</div>
              <div className="value">{data.payments.length}</div>
            </div>
          </div>

          <div className="om-admin-panel" style={{ marginBottom: 16 }}>
            <div className="om-admin-toolbar">
              <strong>Profile</strong>
              <div className="om-admin-row-actions" style={{ marginLeft: "auto" }}>
                <button
                  type="button"
                  className="om-admin-btn"
                  disabled={busy}
                  onClick={() => toggleActive()}
                >
                  {u?.is_active ? "Deactivate" : "Activate"}
                </button>
                <button
                  type="button"
                  className="om-admin-btn ghost"
                  disabled={busy}
                  onClick={() => hardDelete()}
                  style={{ color: "#b91c1c" }}
                >
                  Delete permanently
                </button>
              </div>
            </div>
            <table className="om-admin-table">
              <tbody>
                <tr>
                  <th style={{ width: 160 }}>Email</th>
                  <td>{u?.email || "—"}</td>
                </tr>
                <tr>
                  <th>Phone</th>
                  <td>{u?.phone || "—"}</td>
                </tr>
                <tr>
                  <th>Location</th>
                  <td>
                    {[u?.area, u?.city].filter(Boolean).join(", ") ||
                      mot?.address_text ||
                      "—"}
                  </td>
                </tr>
                <tr>
                  <th>Joined</th>
                  <td>
                    {u?.created_at
                      ? new Date(u.created_at).toLocaleString()
                      : "—"}
                  </td>
                </tr>
                <tr>
                  <th>User ID</th>
                  <td className="om-admin-muted">{u?.id}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="om-admin-panel" style={{ marginBottom: 16 }}>
            <div className="om-admin-toolbar">
              <strong>Vehicle</strong>
            </div>
            <table className="om-admin-table">
              <tbody>
                <tr>
                  <th style={{ width: 160 }}>Make / model / year</th>
                  <td>
                    {[mot?.vehicle_make, mot?.vehicle_model, mot?.vehicle_year]
                      .filter(Boolean)
                      .join(" ") || "—"}
                  </td>
                </tr>
                <tr>
                  <th>Plate</th>
                  <td>{mot?.plate_number || "—"}</td>
                </tr>
                <tr>
                  <th>Map pin</th>
                  <td className="om-admin-muted">
                    {mot?.default_lat != null && mot?.default_lng != null
                      ? `${mot.default_lat.toFixed(5)}, ${mot.default_lng.toFixed(5)}`
                      : "—"}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="om-admin-panel" style={{ marginBottom: 16 }}>
            <div className="om-admin-toolbar">
              <strong>Identity (NIN / BVN)</strong>
            </div>
            <table className="om-admin-table">
              <tbody>
                <tr>
                  <th style={{ width: 160 }}>NIN</th>
                  <td>
                    {mot?.nin_verified ? "Verified" : "Not verified"}
                    {mot?.nin_last4 ? ` · ends …${mot.nin_last4}` : ""}
                  </td>
                </tr>
                <tr>
                  <th>BVN</th>
                  <td>
                    {mot?.bvn_verified ? "Verified" : "Not verified"}
                    {mot?.bvn_last4 ? ` · ends …${mot.bvn_last4}` : ""}
                  </td>
                </tr>
                <tr>
                  <th>Verified at</th>
                  <td>
                    {mot?.identity_verified_at
                      ? new Date(mot.identity_verified_at).toLocaleString()
                      : "—"}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="om-admin-panel" style={{ marginBottom: 16 }}>
            <div className="om-admin-toolbar">
              <strong>Jobs / service requests</strong>
            </div>
            <table className="om-admin-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Service</th>
                  <th>Status</th>
                  <th>Where</th>
                </tr>
              </thead>
              <tbody>
                {data.jobs.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="om-admin-muted">
                      No jobs yet.
                    </td>
                  </tr>
                ) : (
                  data.jobs.map((j) => (
                    <tr key={j.id}>
                      <td className="om-admin-muted">
                        {new Date(j.created_at).toLocaleString()}
                      </td>
                      <td>{j.service_type}</td>
                      <td>
                        <span className="om-admin-badge pending">
                          {j.status}
                        </span>
                      </td>
                      <td>{j.pickup_address || "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="om-admin-panel" style={{ marginBottom: 16 }}>
            <div className="om-admin-toolbar">
              <strong>Bookings</strong>
            </div>
            <table className="om-admin-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Status</th>
                  <th>Scheduled</th>
                </tr>
              </thead>
              <tbody>
                {data.bookings.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="om-admin-muted">
                      No bookings yet.
                    </td>
                  </tr>
                ) : (
                  data.bookings.map((b) => (
                    <tr key={b.id}>
                      <td className="om-admin-muted">
                        {new Date(b.created_at).toLocaleString()}
                      </td>
                      <td>{b.status || "—"}</td>
                      <td>
                        {b.scheduled_at
                          ? new Date(b.scheduled_at).toLocaleString()
                          : "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="om-admin-panel">
            <div className="om-admin-toolbar">
              <strong>Payments</strong>
            </div>
            <table className="om-admin-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.payments.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="om-admin-muted">
                      No payments yet.
                    </td>
                  </tr>
                ) : (
                  data.payments.map((p) => (
                    <tr key={p.id}>
                      <td className="om-admin-muted">
                        {new Date(p.created_at).toLocaleString()}
                      </td>
                      <td>
                        ₦
                        {(Number(p.amount_kobo || 0) / 100).toLocaleString()}
                      </td>
                      <td>{p.status}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </AdminShell>
  );
}
