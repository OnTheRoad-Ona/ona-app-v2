"use client";

import { useCallback, useEffect, useState } from "react";
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
  docs_status: string | null;
  docs_rating_boost_applied: boolean;
  certification_file_name: string | null;
  certification_file_url: string | null;
  docs_submitted_at: string | null;
  rating_avg: number | null;
  rating_count: number | null;
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
    docsPending: 0,
  });
  const [filter, setFilter] = useState<
    "all" | "motorist" | "repair_pro" | "docs_pending"
  >("all");
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await api<{ rows: Row[]; totals: typeof totals }>(
      "/api/admin/verification"
    );
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setRows(res.data.rows);
    setTotals(res.data.totals);
  }, [api]);

  useEffect(() => {
    if (!ready) return;
    void load();
  }, [ready, load]);

  const docsAction = async (
    userId: string,
    action: "approve" | "reject"
  ) => {
    setBusyId(userId);
    setError(null);
    setFlash(null);
    const res = await api<{
      pro: { rating_avg?: number; docs_status?: string };
      ratingBoostApplied?: boolean;
      previousRating?: number;
      newRating?: number;
    }>("/api/admin/verification", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, docsAction: action }),
    });
    setBusyId(null);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    if (action === "approve") {
      const boost = res.data.ratingBoostApplied
        ? ` (+1 star → ${Number(res.data.newRating).toFixed(1)})`
        : " (boost already applied)";
      setFlash(`Documents approved for pro${boost}.`);
    } else {
      setFlash("Documents rejected.");
    }
    await load();
  };

  const visible = rows.filter((r) => {
    if (filter === "all") return true;
    if (filter === "motorist") return r.kind === "motorist";
    if (filter === "repair_pro") return r.kind === "repair_pro";
    if (filter === "docs_pending")
      return r.kind === "repair_pro" && r.docs_status === "under_review";
    return true;
  });

  return (
    <AdminShell adminName={adminName}>
      <h1 className="om-admin-h1">Identity & document verification</h1>
      <p className="om-admin-sub">
        NIN / BVN status plus Repair Pro certification docs. Approving docs
        unlocks full service radius and applies a one-time +1 star.
      </p>
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
        {[
          ["People", totals.total],
          ["Motorists", totals.motorists],
          ["Pros", totals.pros],
          ["Docs pending", totals.docsPending],
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
          <strong>Identity & docs</strong>
          <select
            value={filter}
            onChange={(e) =>
              setFilter(
                e.target.value as
                  | "all"
                  | "motorist"
                  | "repair_pro"
                  | "docs_pending"
              )
            }
            style={{ marginLeft: "auto" }}
          >
            <option value="all">All people</option>
            <option value="motorist">Motorists only</option>
            <option value="repair_pro">Repair Pros only</option>
            <option value="docs_pending">Docs under review</option>
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
              <th>Documents</th>
              <th>Rating</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={8} className="om-admin-muted">
                  No rows match this filter.
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
                  <td>
                    {r.kind !== "repair_pro" ? (
                      <span className="om-admin-muted">—</span>
                    ) : (
                      <>
                        <span
                          className={
                            r.docs_status === "under_review"
                              ? "om-admin-badge"
                              : r.docs_status === "approved"
                                ? "om-admin-badge motorist"
                                : "om-admin-badge"
                          }
                        >
                          {r.docs_status || "—"}
                        </span>
                        {r.certification_file_name ? (
                          <div className="om-admin-muted">
                            {r.certification_file_url &&
                            r.certification_file_url.startsWith("data:") ? (
                              <a
                                href={r.certification_file_url}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {r.certification_file_name}
                              </a>
                            ) : r.certification_file_url ? (
                              <a
                                href={r.certification_file_url}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {r.certification_file_name}
                              </a>
                            ) : (
                              r.certification_file_name
                            )}
                          </div>
                        ) : (
                          <div className="om-admin-muted">No file</div>
                        )}
                      </>
                    )}
                  </td>
                  <td>
                    {r.kind === "repair_pro" && r.rating_avg != null
                      ? Number(r.rating_avg).toFixed(1)
                      : "—"}
                    {r.docs_rating_boost_applied ? (
                      <div className="om-admin-muted">boost applied</div>
                    ) : null}
                  </td>
                  <td>
                    {r.kind === "repair_pro" &&
                    r.docs_status === "under_review" ? (
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <button
                          type="button"
                          disabled={busyId === r.user_id}
                          onClick={() => void docsAction(r.user_id, "approve")}
                          className="om-admin-btn"
                        >
                          {busyId === r.user_id ? "…" : "Approve docs"}
                        </button>
                        <button
                          type="button"
                          disabled={busyId === r.user_id}
                          onClick={() => void docsAction(r.user_id, "reject")}
                          className="om-admin-btn"
                          style={{ opacity: 0.85 }}
                        >
                          Reject
                        </button>
                      </div>
                    ) : r.kind === "repair_pro" &&
                      r.docs_status === "rejected" ? (
                      <button
                        type="button"
                        disabled={busyId === r.user_id}
                        onClick={() => void docsAction(r.user_id, "approve")}
                        className="om-admin-btn"
                      >
                        Approve docs
                      </button>
                    ) : (
                      <span className="om-admin-muted">—</span>
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
