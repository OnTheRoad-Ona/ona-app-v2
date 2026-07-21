"use client";

/**
 * Repair Pros hub — directory + full review (merged Artisan/Pro review).
 * Clean table, file thumbs in row, detail drawer for everything.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { useAdminGate } from "@/components/admin/use-admin-gate";
import {
  AdminTableWrap,
  AdminTabs,
  DetailDrawer,
  DetailField,
  DetailGrid,
  FileThumb,
  FileThumbRow,
  StatusBadge,
  fmtDate,
} from "@/components/admin/admin-ui";

type DirRow = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  role: string;
  is_active: boolean;
  created_at: string;
  repair_pro_profiles: {
    status: string;
    primary_service: string;
    verified: boolean;
    is_online: boolean;
    nin_verified?: boolean;
    bvn_verified?: boolean;
    business_name?: string | null;
    visibility_tier?: number;
    rating_avg?: number;
    rating_count?: number;
  };
};

type ReviewRow = {
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
      gov_id_number: string | null;
      gov_id_last4: string | null;
      bank_id_number: string | null;
      bank_id_last4: string | null;
      front_url: string | null;
      back_url: string | null;
      review_status: string;
      submitted_at: string | null;
    };
    t3_liveness: {
      status: string;
      verified: boolean;
      verified_at: string | null;
      selfie_url: string | null;
    };
    t4_docs: {
      status: string;
      docs_status: string;
      file_name: string | null;
      file_url: string | null;
      submitted_at: string | null;
    };
    visibility: {
      tier: number;
      is_new_artisan: boolean;
      rating_avg: number;
      rating_count: number;
    };
  };
};

type Tab = "directory" | "review";
type ProStatus = "pending" | "approved" | "suspended" | "rejected";

export default function AdminProsHubPage() {
  const { adminName, ready, api } = useAdminGate();
  const searchParams = useSearchParams();
  const initialTab =
    searchParams.get("tab") === "review" ? "review" : "directory";
  const [tab, setTab] = useState<Tab>(initialTab);
  const [dirRows, setDirRows] = useState<DirRow[]>([]);
  const [reviewRows, setReviewRows] = useState<ReviewRow[]>([]);
  const [dirTotals, setDirTotals] = useState({
    total: 0,
    pending: 0,
    approved: 0,
    online: 0,
  });
  const [reviewTotals, setReviewTotals] = useState({
    total: 0,
    needs_action: 0,
    t2_pending: 0,
    t4_pending: 0,
  });
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showFull, setShowFull] = useState(false);

  const loadDir = useCallback(async () => {
    const res = await api<{ users: DirRow[]; totals: typeof dirTotals }>(
      "/api/admin/pros"
    );
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setError(null);
    setDirRows(res.data.users || []);
    if (res.data.totals) setDirTotals(res.data.totals);
  }, [api]);

  const loadReview = useCallback(async () => {
    const res = await api<{
      pros: ReviewRow[];
      totals: typeof reviewTotals;
    }>(`/api/admin/pro-review?filter=${encodeURIComponent(filter)}`);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setError(null);
    setReviewRows(res.data.pros || []);
    setReviewTotals(res.data.totals);
  }, [api, filter]);

  useEffect(() => {
    if (!ready) return;
    if (tab === "directory") void loadDir();
    else void loadReview();
  }, [ready, tab, loadDir, loadReview]);

  const selectedReview = useMemo(
    () => reviewRows.find((r) => r.user_id === selectedId) || null,
    [reviewRows, selectedId]
  );
  const selectedDir = useMemo(
    () => dirRows.find((r) => r.id === selectedId) || null,
    [dirRows, selectedId]
  );

  const setStatus = async (id: string, status: ProStatus) => {
    setBusyId(id);
    setMsg(null);
    setError(null);
    const res = await api(`/api/admin/pros/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setBusyId(null);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setMsg(`Status → ${status}`);
    await loadDir();
    if (tab === "review") await loadReview();
  };

  const actReview = async (
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
    setMsg(res.data.message || "Updated");
    await loadReview();
    await loadDir();
  };

  return (
    <AdminShell adminName={adminName}>
      <h1 className="om-admin-h1">Repair Pros</h1>
      <p className="om-admin-sub">
        Directory + verification review merged. Thumbnails show uploaded ID /
        skill files; open a row for full control.
      </p>

      {error ? <div className="om-admin-error">{error}</div> : null}
      {msg ? <div className="om-admin-success">{msg}</div> : null}

      <AdminTabs
        value={tab}
        onChange={(id) => {
          setTab(id as Tab);
          setSelectedId(null);
        }}
        tabs={[
          { id: "directory", label: "Directory", count: dirTotals.total },
          {
            id: "review",
            label: "Review & tiers",
            count: reviewTotals.needs_action,
          },
        ]}
      />

      <div className="om-admin-cards">
        {tab === "directory" ? (
          <>
            {(
              [
                ["All pros", dirTotals.total],
                ["Pending", dirTotals.pending],
                ["Approved", dirTotals.approved],
                ["Online", dirTotals.online],
              ] as const
            ).map(([l, v]) => (
              <div className="om-admin-card" key={l}>
                <div className="label">{l}</div>
                <div className="value">{v}</div>
              </div>
            ))}
          </>
        ) : (
          <>
            {(
              [
                ["Registered", reviewTotals.total],
                ["Needs action", reviewTotals.needs_action],
                ["T2 pending", reviewTotals.t2_pending],
                ["T4 pending", reviewTotals.t4_pending],
              ] as const
            ).map(([l, v]) => (
              <div className="om-admin-card" key={l}>
                <div className="label">{l}</div>
                <div className="value">{v}</div>
              </div>
            ))}
          </>
        )}
      </div>

      <div className="om-admin-panel">
        <div className="om-admin-toolbar">
          {tab === "review" ? (
            <>
              {(
                [
                  ["all", "All"],
                  ["needs_action", "Needs action"],
                  ["t2_pending", "T2 pending"],
                  ["t4_pending", "T4 pending"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={`om-admin-btn ${filter === id ? "" : "ghost"}`}
                  onClick={() => setFilter(id)}
                >
                  {label}
                </button>
              ))}
            </>
          ) : null}
          <button
            type="button"
            className="om-admin-btn ghost"
            style={{ marginLeft: "auto" }}
            onClick={() =>
              tab === "directory" ? void loadDir() : void loadReview()
            }
          >
            Refresh
          </button>
        </div>

        {tab === "directory" ? (
          <AdminTableWrap>
            <table className="om-admin-table">
              <thead>
                <tr>
                  <th>Pro</th>
                  <th>Trade</th>
                  <th>Online</th>
                  <th>Status</th>
                  <th>Visibility</th>
                  <th>Joined</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {dirRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="om-admin-muted">
                      No Repair Pros registered yet.
                    </td>
                  </tr>
                ) : (
                  dirRows.map((u) => {
                    const p = u.repair_pro_profiles;
                    const status = (p?.status || "pending") as ProStatus;
                    return (
                      <tr
                        key={u.id}
                        className={
                          selectedId === u.id ? "om-admin-row-selected" : ""
                        }
                      >
                        <td>
                          <strong>{u.full_name}</strong>
                          <div className="om-admin-muted">
                            {p?.business_name || "—"}
                          </div>
                          <div className="om-admin-muted">
                            {u.email || u.phone || ""}
                          </div>
                        </td>
                        <td>{p?.primary_service || "—"}</td>
                        <td>
                          <StatusBadge
                            status={p?.is_online ? "online" : "inactive"}
                          >
                            {p?.is_online ? "online" : "offline"}
                          </StatusBadge>
                        </td>
                        <td>
                          <StatusBadge status={status}>{status}</StatusBadge>
                        </td>
                        <td className="om-admin-muted">
                          T{p?.visibility_tier ?? 1}
                          {p?.rating_avg != null
                            ? ` · ★ ${Number(p.rating_avg).toFixed(1)}`
                            : ""}
                        </td>
                        <td className="om-admin-muted">
                          {fmtDate(u.created_at)}
                        </td>
                        <td className="om-admin-td-actions">
                          <div className="om-admin-actions">
                            <button
                              type="button"
                              className="om-admin-btn ghost"
                              onClick={() => {
                                setSelectedId(u.id);
                                setShowFull(false);
                              }}
                            >
                              Open
                            </button>
                            {status !== "approved" ? (
                              <button
                                type="button"
                                className="om-admin-btn"
                                disabled={busyId === u.id}
                                onClick={() => void setStatus(u.id, "approved")}
                              >
                                Approve
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="om-admin-btn done"
                                disabled
                              >
                                ✓ Approved
                              </button>
                            )}
                            <button
                              type="button"
                              className="om-admin-btn ghost"
                              disabled={busyId === u.id}
                              onClick={() => void setStatus(u.id, "suspended")}
                            >
                              Suspend
                            </button>
                            <button
                              type="button"
                              className="om-admin-btn ghost"
                              disabled={busyId === u.id}
                              onClick={() => void setStatus(u.id, "rejected")}
                            >
                              Reject
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </AdminTableWrap>
        ) : (
          <AdminTableWrap>
            <table className="om-admin-table">
              <thead>
                <tr>
                  <th>Pro</th>
                  <th>Trade</th>
                  <th>Tiers</th>
                  <th>Files</th>
                  <th>Visibility</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {reviewRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="om-admin-muted">
                      No pros in this filter.
                    </td>
                  </tr>
                ) : (
                  reviewRows.map((p) => {
                    const L = p.levels;
                    return (
                      <tr
                        key={p.user_id}
                        className={
                          selectedId === p.user_id
                            ? "om-admin-row-selected"
                            : ""
                        }
                      >
                        <td>
                          <strong>{p.full_name}</strong>
                          <div className="om-admin-muted">
                            {p.business_name || "—"}
                          </div>
                          <div className="om-admin-muted">
                            {p.email || p.phone || ""}
                          </div>
                        </td>
                        <td>{p.primary_service || "—"}</td>
                        <td style={{ fontSize: 11, maxWidth: "none" }}>
                          <StatusBadge status={L.t2_id.status}>T2</StatusBadge>{" "}
                          <StatusBadge status={L.t3_liveness.status}>
                            T3
                          </StatusBadge>{" "}
                          <StatusBadge status={L.t4_docs.status}>T4</StatusBadge>
                          <div className="om-admin-muted">
                            {p.status} · {p.pipeline_status || "—"}
                          </div>
                        </td>
                        <td className="om-admin-td-files">
                          <FileThumbRow
                            items={[
                              { label: "ID", url: L.t2_id.front_url },
                              { label: "Back", url: L.t2_id.back_url },
                              { label: "Selfie", url: L.t3_liveness.selfie_url },
                              { label: "Skill", url: L.t4_docs.file_url },
                            ]}
                          />
                        </td>
                        <td className="om-admin-muted">
                          <strong>T{L.visibility.tier}</strong>
                          {L.visibility.is_new_artisan ? " · New" : ""}
                          <div>
                            ★ {Number(L.visibility.rating_avg).toFixed(1)}
                          </div>
                        </td>
                        <td className="om-admin-td-actions">
                          <div className="om-admin-actions">
                            <button
                              type="button"
                              className="om-admin-btn ghost"
                              onClick={() => {
                                setSelectedId(p.user_id);
                                setShowFull(false);
                              }}
                            >
                              Open
                            </button>
                            <button
                              type="button"
                              className="om-admin-btn"
                              disabled={
                                busyId === p.user_id ||
                                L.t2_id.status === "approved"
                              }
                              onClick={() =>
                                void actReview(p.user_id, "pro_t2_approve")
                              }
                            >
                              Approve T2
                            </button>
                            <button
                              type="button"
                              className="om-admin-btn"
                              disabled={
                                busyId === p.user_id ||
                                L.t4_docs.status === "approved"
                              }
                              onClick={() =>
                                void actReview(p.user_id, "pro_t4_approve")
                              }
                            >
                              Approve T4
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </AdminTableWrap>
        )}
      </div>

      {/* Directory drawer */}
      <DetailDrawer
        open={Boolean(selectedDir && tab === "directory")}
        title={selectedDir?.full_name || "Pro"}
        subtitle={selectedDir?.repair_pro_profiles?.primary_service || undefined}
        onClose={() => setSelectedId(null)}
        footer={
          selectedDir ? (
            <>
              <button
                type="button"
                className="om-admin-btn"
                disabled={busyId === selectedDir.id}
                onClick={() => void setStatus(selectedDir.id, "approved")}
              >
                Approve account
              </button>
              <button
                type="button"
                className="om-admin-btn ghost"
                disabled={busyId === selectedDir.id}
                onClick={() => void setStatus(selectedDir.id, "suspended")}
              >
                Suspend
              </button>
              <button
                type="button"
                className="om-admin-btn ghost"
                disabled={busyId === selectedDir.id}
                onClick={() => void setStatus(selectedDir.id, "rejected")}
              >
                Reject
              </button>
              <button
                type="button"
                className="om-admin-btn ghost"
                onClick={() => {
                  setTab("review");
                  setFilter("all");
                }}
              >
                Open review tab
              </button>
            </>
          ) : null
        }
      >
        {selectedDir ? (
          <div className="om-admin-section">
            <h3>Account</h3>
            <DetailGrid>
              <DetailField label="Name" value={selectedDir.full_name} />
              <DetailField label="Email" value={selectedDir.email} />
              <DetailField label="Phone" value={selectedDir.phone} />
              <DetailField
                label="Business"
                value={selectedDir.repair_pro_profiles?.business_name}
              />
              <DetailField
                label="Trade"
                value={selectedDir.repair_pro_profiles?.primary_service}
              />
              <DetailField
                label="Status"
                value={
                  <StatusBadge
                    status={selectedDir.repair_pro_profiles?.status}
                  >
                    {selectedDir.repair_pro_profiles?.status}
                  </StatusBadge>
                }
              />
              <DetailField
                label="Online"
                value={
                  selectedDir.repair_pro_profiles?.is_online ? "Yes" : "No"
                }
              />
              <DetailField
                label="Visibility"
                value={`T${selectedDir.repair_pro_profiles?.visibility_tier ?? 1}`}
              />
              <DetailField
                label="User ID"
                value={
                  <code style={{ fontSize: 10 }}>{selectedDir.id}</code>
                }
              />
              <DetailField
                label="Joined"
                value={fmtDate(selectedDir.created_at)}
              />
            </DetailGrid>
          </div>
        ) : null}
      </DetailDrawer>

      {/* Review drawer */}
      <DetailDrawer
        open={Boolean(selectedReview && tab === "review")}
        title={selectedReview?.full_name || "Review"}
        subtitle={
          selectedReview
            ? `${selectedReview.primary_service || "—"} · ${selectedReview.status}`
            : undefined
        }
        onClose={() => setSelectedId(null)}
        width={480}
        footer={
          selectedReview ? (
            <>
              <button
                type="button"
                className="om-admin-btn"
                disabled={
                  busyId === selectedReview.user_id ||
                  selectedReview.levels.t2_id.status === "approved"
                }
                onClick={() =>
                  void actReview(selectedReview.user_id, "pro_t2_approve")
                }
              >
                Approve T2 ID
              </button>
              <button
                type="button"
                className="om-admin-btn"
                disabled={
                  busyId === selectedReview.user_id ||
                  selectedReview.levels.t4_docs.status === "approved"
                }
                onClick={() =>
                  void actReview(selectedReview.user_id, "pro_t4_approve")
                }
              >
                Approve T4 docs
              </button>
              {([2, 3, 4] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  className="om-admin-btn ghost"
                  disabled={
                    busyId === selectedReview.user_id ||
                    selectedReview.levels.visibility.tier >= t
                  }
                  onClick={() =>
                    void actReview(selectedReview.user_id, "pro_visibility", {
                      visibilityTier: t,
                    })
                  }
                >
                  Vis T{t}
                </button>
              ))}
              <button
                type="button"
                className="om-admin-btn ghost"
                disabled={busyId === selectedReview.user_id}
                onClick={() =>
                  void actReview(selectedReview.user_id, "pro_t2_reject", {
                    reason: "ID rejected by care",
                  })
                }
              >
                Reject T2
              </button>
            </>
          ) : null
        }
      >
        {selectedReview ? (
          <>
            <div className="om-admin-section">
              <h3>Account</h3>
              <DetailGrid>
                <DetailField label="Business" value={selectedReview.business_name} />
                <DetailField label="Trade" value={selectedReview.primary_service} />
                <DetailField label="Email" value={selectedReview.email} />
                <DetailField label="Phone" value={selectedReview.phone} />
                <DetailField label="City" value={selectedReview.city} />
                <DetailField
                  label="Pipeline"
                  value={selectedReview.pipeline_status}
                />
              </DetailGrid>
            </div>
            <div className="om-admin-section">
              <h3>Tier 2 · ID</h3>
              <DetailGrid>
                <DetailField
                  label="Status"
                  value={
                    <StatusBadge status={selectedReview.levels.t2_id.status}>
                      {selectedReview.levels.t2_id.review_status ||
                        selectedReview.levels.t2_id.status}
                    </StatusBadge>
                  }
                />
                <DetailField
                  label="Type"
                  value={selectedReview.levels.t2_id.gov_id_kind}
                />
                <DetailField
                  label="ID number"
                  value={
                    <>
                      {showFull
                        ? selectedReview.levels.t2_id.gov_id_number || "—"
                        : selectedReview.levels.t2_id.gov_id_last4
                          ? `••••${selectedReview.levels.t2_id.gov_id_last4}`
                          : "—"}{" "}
                      <button
                        type="button"
                        className="om-admin-btn ghost"
                        style={{ padding: "2px 8px", fontSize: 11 }}
                        onClick={() => setShowFull((v) => !v)}
                      >
                        {showFull ? "Hide" : "Reveal"}
                      </button>
                    </>
                  }
                />
                <DetailField
                  label="BVN"
                  value={
                    showFull
                      ? selectedReview.levels.t2_id.bank_id_number || "—"
                      : selectedReview.levels.t2_id.bank_id_last4
                        ? `••••${selectedReview.levels.t2_id.bank_id_last4}`
                        : "—"
                  }
                />
                <DetailField
                  label="Submitted"
                  value={fmtDate(selectedReview.levels.t2_id.submitted_at)}
                />
              </DetailGrid>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <FileThumb
                  label="ID front"
                  url={selectedReview.levels.t2_id.front_url}
                  size="lg"
                />
                <FileThumb
                  label="ID back"
                  url={selectedReview.levels.t2_id.back_url}
                  size="lg"
                />
              </div>
            </div>
            <div className="om-admin-section">
              <h3>Tier 3 · Liveness</h3>
              <DetailGrid>
                <DetailField
                  label="Status"
                  value={
                    <StatusBadge
                      status={selectedReview.levels.t3_liveness.status}
                    >
                      {selectedReview.levels.t3_liveness.status}
                    </StatusBadge>
                  }
                />
                <DetailField
                  label="Passed at"
                  value={fmtDate(
                    selectedReview.levels.t3_liveness.verified_at
                  )}
                />
              </DetailGrid>
              <FileThumb
                label="Selfie"
                url={selectedReview.levels.t3_liveness.selfie_url}
                size="md"
              />
            </div>
            <div className="om-admin-section">
              <h3>Tier 4 · Skill docs</h3>
              <DetailGrid>
                <DetailField
                  label="Status"
                  value={
                    <StatusBadge status={selectedReview.levels.t4_docs.status}>
                      {selectedReview.levels.t4_docs.docs_status}
                    </StatusBadge>
                  }
                />
                <DetailField
                  label="File"
                  value={selectedReview.levels.t4_docs.file_name}
                />
                <DetailField
                  label="Submitted"
                  value={fmtDate(selectedReview.levels.t4_docs.submitted_at)}
                />
              </DetailGrid>
              {selectedReview.levels.t4_docs.file_url ? (
                <a
                  className="om-admin-file-link"
                  href={selectedReview.levels.t4_docs.file_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open skill document
                </a>
              ) : (
                <span className="om-admin-muted">No skill file</span>
              )}
            </div>
            <div className="om-admin-section">
              <h3>Visibility</h3>
              <DetailGrid>
                <DetailField
                  label="Tier"
                  value={`T${selectedReview.levels.visibility.tier}`}
                />
                <DetailField
                  label="New badge"
                  value={
                    selectedReview.levels.visibility.is_new_artisan
                      ? "Yes"
                      : "No"
                  }
                />
                <DetailField
                  label="Rating"
                  value={`${Number(selectedReview.levels.visibility.rating_avg).toFixed(1)} (${selectedReview.levels.visibility.rating_count})`}
                />
              </DetailGrid>
            </div>
          </>
        ) : null}
      </DetailDrawer>
    </AdminShell>
  );
}
