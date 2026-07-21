"use client";

/**
 * Customer review — Tier 2 government ID queue
 * Same care workflow as Artisan review, for motorists who submitted ID.
 */

import { useCallback, useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { useAdminGate } from "@/components/admin/use-admin-gate";

type CustomerReviewRow = {
  user_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  vehicle: string;
  plate: string | null;
  identity_review_status: string;
  identity_submitted_at: string | null;
  identity_reviewed_at: string | null;
  identity_rejection_reason: string | null;
  nin_last4: string | null;
  bvn_last4: string | null;
  gov_id_kind: string | null;
  gov_id_front_url: string | null;
  has_photo: boolean;
  phone_verified: boolean;
  identity_verified_at: string | null;
  created_at: string;
};

type Totals = {
  submitted: number;
  approved: number;
  rejected: number;
  total: number;
};

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function AdminCustomerReviewPage() {
  const { adminName, ready, api } = useAdminGate();
  const [filter, setFilter] = useState("submitted");
  const [rows, setRows] = useState<CustomerReviewRow[]>([]);
  const [totals, setTotals] = useState<Totals>({
    submitted: 0,
    approved: 0,
    rejected: 0,
    total: 0,
  });
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [legacy, setLegacy] = useState(false);

  const load = useCallback(async () => {
    const res = await api<{
      customers: CustomerReviewRow[];
      totals: Totals;
      legacy?: boolean;
    }>(`/api/admin/customer-review?status=${encodeURIComponent(filter)}`);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setError(null);
    setRows(res.data.customers);
    setTotals(res.data.totals);
    setLegacy(Boolean(res.data.legacy));
  }, [api, filter]);

  useEffect(() => {
    if (!ready) return;
    void load();
  }, [ready, load]);

  const act = async (
    userId: string,
    action: "approve" | "reject",
    rejectReason?: string
  ) => {
    setBusyId(userId);
    setError(null);
    setFlash(null);
    const res = await api<{ message?: string }>("/api/admin/customer-review", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        action,
        reason: rejectReason || undefined,
      }),
    });
    setBusyId(null);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setFlash(res.data.message || "Updated.");
    setRejectId(null);
    setReason("");
    await load();
  };

  return (
    <AdminShell adminName={adminName}>
      <h1 className="om-admin-h1">Customer review</h1>
      <p className="om-admin-sub">
        Tier 2 government ID queue — customers who submitted ID for admin /
        customer care approval. Approve unlocks full booking after the free
        period.
      </p>

      {legacy ? (
        <div className="om-admin-error" style={{ marginBottom: 12 }}>
          Running in legacy mode (apply migration{" "}
          <code>20260721_027_customer_identity_review.sql</code> for full photo
          + status fields). Showing customers with ID digits on file.
        </div>
      ) : null}
      {error ? <div className="om-admin-error">{error}</div> : null}
      {flash ? (
        <div
          className="om-admin-error"
          style={{
            background: "rgba(16,185,129,0.12)",
            color: "#059669",
            borderColor: "rgba(16,185,129,0.3)",
          }}
        >
          {flash}
        </div>
      ) : null}

      <div className="om-admin-cards">
        {(
          [
            ["Pending review", totals.submitted],
            ["Approved", totals.approved],
            ["Rejected", totals.rejected],
            ["In this list", totals.total],
          ] as const
        ).map(([label, value]) => (
          <div className="om-admin-card" key={label}>
            <div className="label">{label}</div>
            <div className="value">{value}</div>
          </div>
        ))}
      </div>

      <div className="om-admin-panel">
        <div className="om-admin-toolbar" style={{ gap: 8, flexWrap: "wrap" }}>
          {(
            [
              ["submitted", "Pending"],
              ["approved", "Approved"],
              ["rejected", "Rejected"],
              ["all", "All"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={`om-admin-btn ${
                filter === value ? "om-admin-btn-primary" : "ghost"
              }`}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            className="om-admin-btn ghost"
            style={{ marginLeft: "auto" }}
            onClick={() => void load()}
          >
            Refresh
          </button>
        </div>

        <table className="om-admin-table">
          <thead>
            <tr>
              <th>Customer</th>
              <th>ID on file</th>
              <th>Photo</th>
              <th>Submitted</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="om-admin-muted">
                  {filter === "submitted"
                    ? "No customers waiting for ID review. When a customer submits ID in the app, they appear here."
                    : "No rows for this filter."}
                </td>
              </tr>
            ) : (
              rows.map((c) => (
                <tr key={c.user_id}>
                  <td>
                    <strong>{c.full_name}</strong>
                    <div className="om-admin-muted">{c.email || "—"}</div>
                    <div className="om-admin-muted">{c.phone || ""}</div>
                    <div className="om-admin-muted" style={{ fontSize: 11 }}>
                      {c.vehicle}
                      {c.plate ? ` · ${c.plate}` : ""}
                    </div>
                  </td>
                  <td className="om-admin-muted" style={{ fontSize: 12 }}>
                    {c.gov_id_kind || "ID"}
                    <br />
                    NIN/ID …{c.nin_last4 || "—"}
                    <br />
                    BVN …{c.bvn_last4 || "—"}
                  </td>
                  <td>
                    {c.gov_id_front_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <a
                        href={c.gov_id_front_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={c.gov_id_front_url}
                          alt="ID front"
                          style={{
                            width: 72,
                            height: 48,
                            objectFit: "cover",
                            borderRadius: 6,
                          }}
                        />
                      </a>
                    ) : c.has_photo ? (
                      <span className="om-admin-muted">Photo on file</span>
                    ) : (
                      <span className="om-admin-muted">—</span>
                    )}
                  </td>
                  <td className="om-admin-muted" style={{ fontSize: 11 }}>
                    {fmtDate(c.identity_submitted_at)}
                  </td>
                  <td>
                    <span
                      className={`om-admin-badge ${
                        c.identity_review_status === "approved"
                          ? "approved"
                          : c.identity_review_status === "submitted"
                            ? "pending"
                            : c.identity_review_status === "rejected"
                              ? "rejected"
                              : ""
                      }`}
                    >
                      {c.identity_review_status}
                    </span>
                    {c.identity_rejection_reason ? (
                      <div className="om-admin-muted" style={{ fontSize: 11 }}>
                        {c.identity_rejection_reason}
                      </div>
                    ) : null}
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {c.identity_review_status !== "approved" ? (
                        <button
                          type="button"
                          className="om-admin-btn om-admin-btn-primary"
                          disabled={busyId === c.user_id}
                          onClick={() => void act(c.user_id, "approve")}
                        >
                          {busyId === c.user_id ? "…" : "Approve T2"}
                        </button>
                      ) : (
                        <button type="button" className="om-admin-btn done" disabled>
                          ✓ Approved
                        </button>
                      )}
                      {c.identity_review_status === "submitted" ||
                      c.identity_review_status === "approved" ? (
                        <button
                          type="button"
                          className="om-admin-btn ghost"
                          disabled={busyId === c.user_id}
                          onClick={() => {
                            setRejectId(c.user_id);
                            setReason("");
                          }}
                        >
                          Reject
                        </button>
                      ) : null}
                    </div>
                    {rejectId === c.user_id ? (
                      <div style={{ marginTop: 8 }}>
                        <input
                          className="om-admin-input"
                          placeholder="Reason (optional)"
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          style={{ width: "100%", marginBottom: 6 }}
                        />
                        <div style={{ display: "flex", gap: 6 }}>
                          <button
                            type="button"
                            className="om-admin-btn om-admin-btn-primary"
                            disabled={busyId === c.user_id}
                            onClick={() => void act(c.user_id, "reject", reason)}
                          >
                            Confirm reject
                          </button>
                          <button
                            type="button"
                            className="om-admin-btn ghost"
                            onClick={() => setRejectId(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : null}
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
