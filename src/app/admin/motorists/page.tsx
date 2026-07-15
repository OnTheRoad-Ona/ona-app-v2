"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { useAdminGate } from "@/components/admin/use-admin-gate";

type MotoristRow = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  area: string | null;
  is_active: boolean;
  created_at: string;
  verifyLevel: "full" | "partial" | "none";
  motorist: {
    vehicle_make: string | null;
    vehicle_model: string | null;
    vehicle_year: string | null;
    plate_number: string | null;
    address_text: string | null;
    nin_last4: string | null;
    bvn_last4: string | null;
    nin_verified: boolean;
    bvn_verified: boolean;
    identity_verified_at: string | null;
  } | null;
};

type Totals = {
  total: number;
  active: number;
  inactive: number;
  fullyVerified: number;
  partial: number;
  unverified: number;
};

export default function AdminMotoristsPage() {
  const { adminName, ready, api } = useAdminGate();
  const [rows, setRows] = useState<MotoristRow[]>([]);
  const [totals, setTotals] = useState<Totals>({
    total: 0,
    active: 0,
    inactive: 0,
    fullyVerified: 0,
    partial: 0,
    unverified: 0,
  });
  const [q, setQ] = useState("");
  const [active, setActive] = useState("");
  const [verified, setVerified] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (active) params.set("active", active);
    if (verified) params.set("verified", verified);
    const res = await api<{ motorists: MotoristRow[]; totals: Totals }>(
      `/api/admin/motorists?${params}`
    );
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setError(null);
    setRows(res.data.motorists);
    setTotals(res.data.totals);
  }, [api, q, active, verified]);

  useEffect(() => {
    if (!ready) return;
    void load();
  }, [ready, load]);

  async function toggleActive(id: string, is_active: boolean) {
    setMsg(null);
    setBusyId(id);
    const res = await api(`/api/admin/users/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active }),
    });
    setBusyId(null);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setMsg(is_active ? "Motorist activated" : "Motorist deactivated");
    await load();
  }

  async function hardDelete(id: string, name: string) {
    if (
      !window.confirm(
        `Hard-delete motorist "${name}"?\n\nThis removes them from Auth + database. Jobs may be cancelled. This cannot be undone.`
      )
    ) {
      return;
    }
    setMsg(null);
    setBusyId(id);
    const res = await api(`/api/admin/users/${id}`, { method: "DELETE" });
    setBusyId(null);
    if (!res.ok) {
      setError(res.message);
      await load();
      return;
    }
    setMsg(`Deleted ${name}`);
    await load();
  }

  function vehicleLabel(m: MotoristRow) {
    const v = m.motorist;
    if (!v) return "—";
    const parts = [v.vehicle_make, v.vehicle_model, v.vehicle_year].filter(
      Boolean
    );
    return parts.length ? parts.join(" ") : "—";
  }

  function verifyBadge(level: MotoristRow["verifyLevel"]) {
    if (level === "full") return "approved";
    if (level === "partial") return "pending";
    return "rejected";
  }

  return (
    <AdminShell adminName={adminName}>
      <h1 className="om-admin-h1">Motorists</h1>
      <p className="om-admin-sub">
        Car owners who signed up on OgaMecho. Live from Supabase — every Vercel
        signup appears here.
      </p>
      {msg ? (
        <div
          className="om-admin-error"
          style={{ background: "#14532d", color: "#bbf7d0", marginBottom: 12 }}
        >
          {msg}
        </div>
      ) : null}
      {error ? <div className="om-admin-error">{error}</div> : null}

      <div className="om-admin-cards">
        {(
          [
            ["Total", totals.total],
            ["Active", totals.active],
            ["Inactive", totals.inactive],
            ["Fully verified", totals.fullyVerified],
            ["Partial ID", totals.partial],
            ["Unverified", totals.unverified],
          ] as const
        ).map(([label, value]) => (
          <div className="om-admin-card" key={label}>
            <div className="label">{label}</div>
            <div className="value">{value}</div>
          </div>
        ))}
      </div>

      <div className="om-admin-panel">
        <div className="om-admin-toolbar">
          <input
            placeholder="Search name, email, phone, city"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ minWidth: 240 }}
          />
          <select value={active} onChange={(e) => setActive(e.target.value)}>
            <option value="">All status</option>
            <option value="true">Active only</option>
            <option value="false">Inactive only</option>
          </select>
          <select
            value={verified}
            onChange={(e) => setVerified(e.target.value)}
          >
            <option value="">All verification</option>
            <option value="full">Fully verified</option>
            <option value="partial">Partial</option>
            <option value="none">Unverified</option>
          </select>
          <button type="button" className="om-admin-btn" onClick={() => load()}>
            Refresh
          </button>
        </div>

        <table className="om-admin-table">
          <thead>
            <tr>
              <th>Motorist</th>
              <th>Vehicle</th>
              <th>Location</th>
              <th>Identity</th>
              <th>Status</th>
              <th>Joined</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="om-admin-muted">
                  No motorists yet. When someone signs up as Motorist on
                  ogamecho.vercel.app they appear here instantly.
                </td>
              </tr>
            ) : (
              rows.map((m) => (
                <tr key={m.id}>
                  <td>
                    <div>
                      <Link
                        href={`/admin/motorists/${m.id}`}
                        style={{ color: "inherit", fontWeight: 600 }}
                      >
                        {m.full_name || "—"}
                      </Link>
                    </div>
                    <div className="om-admin-muted">{m.email || "—"}</div>
                    <div className="om-admin-muted">{m.phone || ""}</div>
                  </td>
                  <td>
                    <div>{vehicleLabel(m)}</div>
                    <div className="om-admin-muted">
                      {m.motorist?.plate_number || ""}
                    </div>
                  </td>
                  <td>
                    {[m.area, m.city].filter(Boolean).join(", ") ||
                      m.motorist?.address_text ||
                      "—"}
                  </td>
                  <td>
                    <span
                      className={`om-admin-badge ${verifyBadge(m.verifyLevel)}`}
                    >
                      {m.verifyLevel}
                    </span>
                    <div className="om-admin-muted" style={{ marginTop: 4 }}>
                      NIN {m.motorist?.nin_verified ? "✓" : "—"} · BVN{" "}
                      {m.motorist?.bvn_verified ? "✓" : "—"}
                      {m.motorist?.nin_last4
                        ? ` · …${m.motorist.nin_last4}`
                        : ""}
                    </div>
                  </td>
                  <td>
                    <span
                      className={`om-admin-badge ${
                        m.is_active ? "approved" : "suspended"
                      }`}
                    >
                      {m.is_active ? "active" : "inactive"}
                    </span>
                  </td>
                  <td className="om-admin-muted">
                    {m.created_at
                      ? new Date(m.created_at).toLocaleString()
                      : "—"}
                  </td>
                  <td>
                    <div className="om-admin-row-actions">
                      <Link
                        href={`/admin/motorists/${m.id}`}
                        className="om-admin-btn ghost"
                        style={{ textDecoration: "none" }}
                      >
                        View
                      </Link>
                      <button
                        type="button"
                        className="om-admin-btn ghost"
                        disabled={busyId === m.id}
                        onClick={() => toggleActive(m.id, !m.is_active)}
                      >
                        {m.is_active ? "Deactivate" : "Activate"}
                      </button>
                      <button
                        type="button"
                        className="om-admin-btn ghost"
                        disabled={busyId === m.id}
                        onClick={() => hardDelete(m.id, m.full_name || m.id)}
                        style={{ color: "#b91c1c" }}
                      >
                        Delete
                      </button>
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
