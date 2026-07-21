"use client";

/**
 * Artisan review — DB-backed (repair_pro_profiles).
 * Replaces empty localStorage-only queue so live signups appear.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { useAdminGate } from "@/components/admin/use-admin-gate";

type ProRow = {
  user_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  business_name: string | null;
  primary_service: string | null;
  status: string;
  pipeline_status: string | null;
  needs_action: boolean;
  levels: {
    t1_phone: { status: string; verified: boolean; phone: string | null };
    t2_id: {
      status: string;
      gov_id_kind: string | null;
      gov_id_last4: string | null;
      front_url: string | null;
      review_status: string;
      submitted_at: string | null;
    };
    t3_liveness: { status: string; verified: boolean };
    t4_docs: {
      status: string;
      docs_status: string;
      file_name: string | null;
      file_url: string | null;
    };
    visibility: {
      tier: number;
      is_new_artisan: boolean;
      rating_avg: number;
      rating_count: number;
    };
  };
  created_at?: string;
};

function badgeClass(s: string) {
  if (s === "approved" || s === "verified" || s === "passed") return "approved";
  if (s === "pending" || s === "submitted") return "pending";
  if (s === "rejected" || s === "suspended") return "rejected";
  return "";
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function AdminArtisansPage() {
  const router = useRouter();
  const { adminName, ready, api } = useAdminGate();
  const [filter, setFilter] = useState("all");
  const [rows, setRows] = useState<ProRow[]>([]);
  const [totals, setTotals] = useState({
    total: 0,
    needs_action: 0,
    t2_pending: 0,
    t4_pending: 0,
  });
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    // Always load from DB — never admin browser localStorage
    const res = await api<{
      pros: ProRow[];
      totals: typeof totals;
    }>(`/api/admin/pro-review?filter=${encodeURIComponent(filter)}`);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setError(null);
    setRows(res.data.pros || []);
    setTotals(res.data.totals);
  }, [api, filter]);

  useEffect(() => {
    if (!ready) return;
    void load();
  }, [ready, load]);

  const act = async (
    userId: string,
    action: string,
    extra?: { visibilityTier?: number; reason?: string }
  ) => {
    setBusyId(userId);
    setMsg(null);
    setError(null);
    const res = await api<{ message?: string }>("/api/admin/pro-review", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, action, ...extra }),
    });
    setBusyId(null);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setMsg(res.data.message || "Updated.");
    await load();
  };

  return (
    <AdminShell adminName={adminName} roleLabel="Care">
      <h1 className="om-admin-h1">Artisan review · live database</h1>
      <p className="om-admin-sub">
        Shows every Repair Pro in Supabase (signups from the app). Promote
        visibility T2→T4, approve ID / skill docs. Same data as Pro review.
      </p>

      {error ? <div className="om-admin-error">{error}</div> : null}
      {msg ? (
        <div
          className="om-admin-error"
          style={{
            background: "rgba(16,185,129,0.12)",
            color: "#059669",
            borderColor: "rgba(16,185,129,0.3)",
          }}
        >
          {msg}
        </div>
      ) : null}

      <div className="om-admin-cards">
        {(
          [
            ["All artisans", totals.total],
            ["Needs action", totals.needs_action],
            ["T2 ID pending", totals.t2_pending],
            ["T4 docs pending", totals.t4_pending],
          ] as const
        ).map(([label, v]) => (
          <div className="om-admin-card" key={label}>
            <div className="label">{label}</div>
            <div className="value">{v}</div>
          </div>
        ))}
      </div>

      <div className="om-admin-panel">
        <div className="om-admin-toolbar" style={{ gap: 8, flexWrap: "wrap" }}>
          {(
            [
              ["all", "All registered"],
              ["needs_action", "Needs action"],
              ["t2_pending", "T2 pending"],
              ["t4_pending", "T4 pending"],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              className={`om-admin-btn ${
                filter === v ? "om-admin-btn-primary" : "ghost"
              }`}
              onClick={() => setFilter(v)}
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
          <button
            type="button"
            className="om-admin-btn ghost"
            onClick={() => router.push("/admin/pro-review")}
          >
            Full Pro review →
          </button>
        </div>

        <table className="om-admin-table">
          <thead>
            <tr>
              <th>Artisan</th>
              <th>Trade</th>
              <th>Status</th>
              <th>Tiers</th>
              <th>Visibility</th>
              <th>ID / Docs</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="om-admin-muted">
                  {error
                    ? "Could not load artisans."
                    : "No Repair Pros in this filter. Check “All registered” — signups land in the database immediately."}
                </td>
              </tr>
            ) : (
              rows.map((p) => {
                const L = p.levels;
                const vt = L.visibility.tier;
                return (
                  <tr key={p.user_id}>
                    <td>
                      <strong>{p.full_name}</strong>
                      <div className="om-admin-muted">
                        {p.business_name || "—"}
                      </div>
                      <div className="om-admin-muted" style={{ fontSize: 11 }}>
                        {p.email || p.phone || p.user_id.slice(0, 8)}
                      </div>
                    </td>
                    <td>{p.primary_service || "—"}</td>
                    <td>
                      <span className={`om-admin-badge ${badgeClass(p.status)}`}>
                        {p.status}
                      </span>
                      {p.pipeline_status ? (
                        <div className="om-admin-muted" style={{ fontSize: 10 }}>
                          pipeline: {p.pipeline_status}
                        </div>
                      ) : null}
                    </td>
                    <td style={{ fontSize: 11 }}>
                      <div>
                        <span
                          className={`om-admin-badge ${badgeClass(L.t1_phone.status)}`}
                        >
                          T1
                        </span>{" "}
                        phone
                      </div>
                      <div>
                        <span
                          className={`om-admin-badge ${badgeClass(L.t2_id.status)}`}
                        >
                          T2
                        </span>{" "}
                        {L.t2_id.status}
                      </div>
                      <div>
                        <span
                          className={`om-admin-badge ${badgeClass(L.t3_liveness.status)}`}
                        >
                          T3
                        </span>{" "}
                        {L.t3_liveness.status}
                      </div>
                      <div>
                        <span
                          className={`om-admin-badge ${badgeClass(L.t4_docs.status)}`}
                        >
                          T4
                        </span>{" "}
                        {L.t4_docs.docs_status}
                      </div>
                    </td>
                    <td className="om-admin-muted">
                      <strong>T{vt}</strong>
                      {L.visibility.is_new_artisan ? " · New" : ""}
                      <div>
                        ★ {Number(L.visibility.rating_avg).toFixed(1)} (
                        {L.visibility.rating_count})
                      </div>
                    </td>
                    <td className="om-admin-muted" style={{ fontSize: 11 }}>
                      <div>
                        ID: {L.t2_id.gov_id_kind || "—"}
                        {L.t2_id.gov_id_last4
                          ? ` …${L.t2_id.gov_id_last4}`
                          : ""}
                      </div>
                      <div>
                        Docs: {L.t4_docs.file_name || L.t4_docs.docs_status}
                      </div>
                      {L.t2_id.front_url ? (
                        <a
                          href={L.t2_id.front_url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          ID photo
                        </a>
                      ) : null}
                      {L.t4_docs.file_url ? (
                        <div>
                          <a
                            href={L.t4_docs.file_url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Skill file
                          </a>
                        </div>
                      ) : null}
                      <div>Submitted: {fmtDate(L.t2_id.submitted_at)}</div>
                    </td>
                    <td>
                      <div
                        style={{ display: "flex", gap: 6, flexWrap: "wrap" }}
                      >
                        <button
                          type="button"
                          className="om-admin-btn om-admin-btn-primary"
                          disabled={
                            busyId === p.user_id || L.t2_id.status === "approved"
                          }
                          onClick={() => void act(p.user_id, "pro_t2_approve")}
                          title="Approve government ID · start visibility T2"
                        >
                          Approve T2
                        </button>
                        <button
                          type="button"
                          className="om-admin-btn om-admin-btn-primary"
                          disabled={busyId === p.user_id || vt >= 3 || vt < 2}
                          onClick={() =>
                            void act(p.user_id, "pro_visibility", {
                              visibilityTier: 3,
                            })
                          }
                        >
                          Vis T3
                        </button>
                        <button
                          type="button"
                          className="om-admin-btn om-admin-btn-primary"
                          disabled={
                            busyId === p.user_id ||
                            L.t4_docs.status === "approved"
                          }
                          onClick={() => void act(p.user_id, "pro_t4_approve")}
                        >
                          Approve T4
                        </button>
                        <button
                          type="button"
                          className="om-admin-btn ghost"
                          disabled={busyId === p.user_id || vt >= 4}
                          onClick={() =>
                            void act(p.user_id, "pro_visibility", {
                              visibilityTier: 4,
                            })
                          }
                        >
                          Vis T4
                        </button>
                        <button
                          type="button"
                          className="om-admin-btn ghost"
                          disabled={busyId === p.user_id}
                          onClick={() =>
                            void act(p.user_id, "pro_t2_reject", {
                              reason: "Rejected by care",
                            })
                          }
                        >
                          Reject T2
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
