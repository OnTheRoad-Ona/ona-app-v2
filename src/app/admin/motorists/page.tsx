"use client";

/**
 * Customers hub — directory + ID review (merged, no duplicate pages).
 * Clean table + file thumbs + full-detail drawer.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { useAdminGate } from "@/components/admin/use-admin-gate";
import { AdminGuideBanner } from "@/components/admin/admin-guide-banner";
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

type MotoristRow = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  area: string | null;
  is_active: boolean;
  created_at: string;
  gender?: string | null;
  date_of_birth?: string | null;
  dual_role?: boolean;
  has_switched?: boolean;
  first_role?: string | null;
  current_role?: string | null;
  last_role_switch_at?: string | null;
  role_switch_count?: number;
  verifyLevel: "full" | "partial" | "none";
  /** Queue # among unattended pending T2 only */
  queue_number?: number | null;
  unattended?: boolean;
  care_attended?: boolean;
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
    identity_review_status?: string | null;
    identity_submitted_at?: string | null;
    phone_verified?: boolean;
    gov_id_front_url?: string | null;
    gov_id_back_url?: string | null;
    gov_id_kind?: string | null;
    gov_id_number?: string | null;
    bank_id_number?: string | null;
  } | null;
};

type ReviewRow = {
  user_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  area: string | null;
  avatar_url?: string | null;
  dual_role?: boolean;
  has_switched?: boolean;
  first_role?: string | null;
  current_role?: string | null;
  last_role_switch_at?: string | null;
  role_switch_count?: number;
  address_text?: string | null;
  identity_review_status: string;
  identity_submitted_at: string | null;
  /** Queue # among unattended pending only */
  queue_number?: number | null;
  unattended?: boolean;
  care_attended?: boolean;
  has_bvn?: boolean;
  gov_id_front_url: string | null;
  gov_id_back_url: string | null;
  gov_id_number: string | null;
  bank_id_number: string | null;
  gov_id_kind: string | null;
  nin_last4: string | null;
  bvn_last4: string | null;
  phone_verified: boolean;
  vehicle_make: string | null;
  vehicle_model: string | null;
  vehicle_photo?: string | null;
  plate: string | null;
  vehicles?: Array<{
    id?: string;
    make?: string;
    model?: string;
    year?: string;
    plate?: string;
    photo?: string;
    commonIssues?: string[];
  }> | null;
  vehicle_common_issues?: string[] | null;
  jobs_count: number;
  job_media?: Array<{
    id: string;
    status: string;
    service_type: string | null;
    motorist_photo: string | null;
    repair_pro_photo: string | null;
    photos: unknown;
    evidence: unknown;
    pickup_address: string | null;
    created_at: string;
  }>;
  levels?: {
    t1_phone: { status: string; verified: boolean; phone: string | null };
    t2_id: {
      status: string;
      gov_id_number: string | null;
      gov_id_last4: string | null;
      bank_id_number: string | null;
      front_url: string | null;
      back_url: string | null;
      country_iso: string;
      gov_id_kind: string | null;
      rejection_reason: string | null;
    };
    trial: {
      first_service_at: string | null;
      days_left: number | null;
      expired: boolean;
    };
  };
};

function mediaUrlsFromUnknown(v: unknown): string[] {
  if (!v) return [];
  if (typeof v === "string" && v.length > 8) return [v];
  if (Array.isArray(v)) {
    return v
      .map((x) => {
        if (typeof x === "string") return x;
        if (x && typeof x === "object") {
          const o = x as Record<string, unknown>;
          return String(o.url || o.src || o.photo || o.dataUrl || "");
        }
        return "";
      })
      .filter((u) => u.length > 8);
  }
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    return mediaUrlsFromUnknown(o.url || o.urls || o.items || o.photos);
  }
  return [];
}

type Tab = "directory" | "id_review";

export default function AdminCustomersHubPage() {
  const { adminName, ready, api } = useAdminGate();
  const [tab, setTab] = useState<Tab>("directory");

  useEffect(() => {
    try {
      const t = new URLSearchParams(window.location.search).get("tab");
      if (t === "id_review") setTab("id_review");
    } catch {
      /* */
    }
  }, []);
  const [rows, setRows] = useState<MotoristRow[]>([]);
  const [reviewRows, setReviewRows] = useState<ReviewRow[]>([]);
  const [totals, setTotals] = useState({
    total: 0,
    active: 0,
    fullyVerified: 0,
    partial: 0,
    unverified: 0,
  });
  const [reviewTotals, setReviewTotals] = useState({
    total: 0,
    submitted: 0,
    unattended: 0,
    approved: 0,
    none: 0,
    rejected: 0,
  });
  const [q, setQ] = useState("");
  const [reviewFilter, setReviewFilter] = useState("all");
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showFullId, setShowFullId] = useState(false);

  const loadDirectory = useCallback(async () => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    const res = await api<{ motorists: MotoristRow[]; totals: typeof totals }>(
      `/api/admin/motorists?${params}`
    );
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setError(null);
    setRows(res.data.motorists);
    setTotals(res.data.totals);
  }, [api, q]);

  const loadReview = useCallback(async () => {
    const res = await api<{
      customers: ReviewRow[];
      totals: typeof reviewTotals;
    }>(`/api/admin/customer-review?status=${encodeURIComponent(reviewFilter)}`);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setError(null);
    setReviewRows(res.data.customers);
    setReviewTotals(res.data.totals);
  }, [api, reviewFilter]);

  useEffect(() => {
    if (!ready) return;
    if (tab === "directory") void loadDirectory();
    else void loadReview();
  }, [ready, tab, loadDirectory, loadReview]);

  const selectedReview = useMemo(
    () => reviewRows.find((r) => r.user_id === selectedId) || null,
    [reviewRows, selectedId]
  );
  const selectedDir = useMemo(
    () => rows.find((r) => r.id === selectedId) || null,
    [rows, selectedId]
  );

  const actCustomer = async (
    userId: string,
    action: string,
    body?: Record<string, unknown>
  ) => {
    setBusyId(userId);
    setMsg(null);
    setError(null);
    const res = await api<{ message?: string }>("/api/admin/customer-review", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, action, ...body }),
    });
    setBusyId(null);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    if (action !== "mark_attended") {
      setMsg(res.data.message || "Updated");
    }
    await loadReview();
    if (tab === "directory") await loadDirectory();
  };

  const openCustomer = (userId: string) => {
    setSelectedId(userId);
    setShowFullId(false);
    // Mark attended/read until a new re-submit
    void actCustomer(userId, "mark_attended");
  };

  const toggleActive = async (id: string, is_active: boolean) => {
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
    setMsg(is_active ? "Customer activated" : "Customer deactivated");
    await loadDirectory();
  };

  return (
    <AdminShell adminName={adminName}>
      <h1 className="om-admin-h1">Customers</h1>
      <p className="om-admin-sub">
        Customer accounts from the live app. Review IDs, verification, banks, and account status. Approve or freeze customers here.
      </p>

      <AdminGuideBanner pageId="customers" />

      {error ? <div className="om-admin-error">{error}</div> : null}
      {msg ? <div className="om-admin-success">{msg}</div> : null}

      <AdminTabs
        value={tab}
        onChange={(id) => {
          setTab(id as Tab);
          setSelectedId(null);
        }}
        tabs={[
          { id: "directory", label: "Directory", count: totals.total },
          {
            id: "id_review",
            label: "ID review",
            count: reviewTotals.submitted,
          },
        ]}
      />

      <div className="om-admin-cards">
        {tab === "directory" ? (
          <>
            {(
              [
                ["Registered", totals.total],
                ["Active", totals.active],
                ["T2 full", totals.fullyVerified],
                ["Partial / pending", totals.partial],
                ["No ID", totals.unverified],
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
                ["All", reviewTotals.total],
                ["Unattended", reviewTotals.unattended ?? reviewTotals.submitted],
                ["Pending T2", reviewTotals.submitted],
                ["Approved", reviewTotals.approved],
                ["No ID yet", reviewTotals.none],
                ["Rejected", reviewTotals.rejected],
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
          {tab === "directory" ? (
            <>
              <input
                placeholder="Search name, email, phone…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              <button
                type="button"
                className="om-admin-btn ghost"
                onClick={() => void loadDirectory()}
              >
                Refresh
              </button>
            </>
          ) : (
            <>
              {(
                [
                  ["all", "All"],
                  ["submitted", "Pending T2"],
                  ["none", "No ID"],
                  ["approved", "Approved"],
                  ["rejected", "Rejected"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={`om-admin-btn ${
                    reviewFilter === id ? "" : "ghost"
                  }`}
                  onClick={() => setReviewFilter(id)}
                >
                  {label}
                </button>
              ))}
              <button
                type="button"
                className="om-admin-btn ghost"
                style={{ marginLeft: "auto" }}
                onClick={() => void loadReview()}
              >
                Refresh
              </button>
            </>
          )}
        </div>

        {tab === "directory" ? (
          <AdminTableWrap>
            <table className="om-admin-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Customer</th>
                  <th>Contact</th>
                  <th>Vehicle</th>
                  <th>ID status</th>
                  <th>Files</th>
                  <th>Joined</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="om-admin-muted">
                      No customers found.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => {
                    const m = r.motorist;
                    const front =
                      (m as { gov_id_front_url?: string } | null)
                        ?.gov_id_front_url || null;
                    const idStatus =
                      r.verifyLevel === "full"
                        ? "approved"
                        : r.unattended
                          ? "pending"
                          : r.verifyLevel === "partial"
                            ? "pending"
                            : "none";
                    return (
                      <tr
                        key={r.id}
                        className={
                          selectedId === r.id
                            ? "om-admin-row-selected"
                            : r.unattended
                              ? "om-admin-row-unattended"
                              : ""
                        }
                      >
                        <td>
                          {r.queue_number != null ? (
                            <span
                              className="om-admin-queue-num"
                              title="Unattended queue #"
                            >
                              #{r.queue_number}
                            </span>
                          ) : (
                            <span className="om-admin-empty">—</span>
                          )}
                        </td>
                        <td>
                          <strong>{r.full_name}</strong>
                          {r.dual_role ? (
                            <span
                              className="om-admin-flag-resubmit"
                              style={{
                                background: "#FF6B35",
                                color: "#fff",
                                marginLeft: 6,
                              }}
                              title={
                                r.has_switched
                                  ? `Switched · first ${r.first_role || "—"} · now ${r.current_role || "—"}`
                                  : "Holds Customer + Professional roles"
                              }
                            >
                              Dual Role
                            </span>
                          ) : null}
                          <div className="om-admin-muted">
                            {[r.city, r.area].filter(Boolean).join(", ") || ""}
                          </div>
                        </td>
                        <td>
                          <div>{r.phone || ""}</div>
                          <div className="om-admin-muted">{r.email || ""}</div>
                        </td>
                        <td>
                          {[m?.vehicle_make, m?.vehicle_model, m?.plate_number]
                            .filter(Boolean)
                            .join(" · ") || ""}
                        </td>
                        <td>
                          <StatusBadge status={idStatus}>
                            {r.verifyLevel === "full"
                              ? "Approved"
                              : r.unattended
                                ? "Unattended"
                                : r.verifyLevel === "partial"
                                  ? "Pending"
                                  : "No ID"}
                          </StatusBadge>
                          {m?.nin_last4 || m?.bvn_last4 ? (
                            <div className="om-admin-muted">
                              {m?.nin_last4 ? `ID …${m.nin_last4}` : ""}
                              {m?.bvn_last4 ? ` · BVN …${m.bvn_last4}` : ""}
                            </div>
                          ) : null}
                        </td>
                        <td className="om-admin-td-files">
                          <FileThumbRow
                            items={[{ label: "ID", url: front }]}
                          />
                        </td>
                        <td className="om-admin-muted">
                          {fmtDate(r.created_at)}
                        </td>
                        <td className="om-admin-td-actions">
                          <div className="om-admin-actions">
                            <button
                              type="button"
                              className="om-admin-btn ghost"
                              onClick={() => openCustomer(r.id)}
                            >
                              Open
                            </button>
                            <button
                              type="button"
                              className="om-admin-btn ghost"
                              disabled={busyId === r.id}
                              onClick={() =>
                                void toggleActive(r.id, !r.is_active)
                              }
                            >
                              {r.is_active ? "Deactivate" : "Activate"}
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
                  <th>#</th>
                  <th>Customer</th>
                  <th>T1 Phone</th>
                  <th>T2 ID</th>
                  <th>Files</th>
                  <th>Submitted</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {reviewRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="om-admin-muted">
                      No customers in this filter.
                    </td>
                  </tr>
                ) : (
                  reviewRows.map((c) => (
                    <tr
                      key={c.user_id}
                      className={
                        selectedId === c.user_id
                          ? "om-admin-row-selected"
                          : c.unattended
                            ? "om-admin-row-unattended"
                            : ""
                      }
                    >
                      <td>
                        {c.queue_number != null ? (
                          <span
                            className="om-admin-queue-num"
                            title="Unattended queue (earliest = #1)"
                          >
                            #{c.queue_number}
                          </span>
                        ) : (
                          <span className="om-admin-empty">—</span>
                        )}
                      </td>
                      <td>
                        <strong>{c.full_name}</strong>
                        <div className="om-admin-muted">
                          {c.email || c.phone || ""}
                        </div>
                      </td>
                      <td>
                        <StatusBadge
                          status={
                            c.levels?.t1_phone?.verified
                              ? "verified"
                              : "pending"
                          }
                        >
                          {c.levels?.t1_phone?.verified
                            ? "Verified"
                            : "Unverified"}
                        </StatusBadge>
                      </td>
                      <td>
                        <StatusBadge
                          status={
                            c.identity_review_status === "approved"
                              ? "approved"
                              : c.identity_review_status === "rejected"
                                ? "rejected"
                                : c.unattended
                                  ? "pending"
                                  : c.identity_review_status === "submitted"
                                    ? "attended"
                                    : c.identity_review_status || "none"
                          }
                        >
                          {c.identity_review_status === "approved"
                            ? "Approved"
                            : c.identity_review_status === "rejected"
                              ? "Rejected"
                              : c.unattended
                                ? "Unattended"
                                : c.identity_review_status === "submitted"
                                  ? "Attended"
                                  : c.identity_review_status || "none"}
                        </StatusBadge>
                        <div className="om-admin-muted">
                          {c.gov_id_kind || ""}
                          {c.nin_last4 ? ` · ID …${c.nin_last4}` : ""}
                          {c.bvn_last4 || c.bank_id_number
                            ? ` · BVN …${c.bvn_last4 || "on file"}`
                            : " · BVN missing"}
                        </div>
                      </td>
                      <td className="om-admin-td-files">
                        <FileThumbRow
                          userId={c.user_id}
                          items={[
                            {
                              label: "Front",
                              url: c.gov_id_front_url,
                              kind: "front",
                            },
                            {
                              label: "Back",
                              url: c.gov_id_back_url,
                              kind: "back",
                            },
                          ]}
                        />
                      </td>
                      <td className="om-admin-muted">
                        {fmtDate(c.identity_submitted_at)}
                      </td>
                      <td className="om-admin-td-actions">
                        <div className="om-admin-actions">
                          <button
                            type="button"
                            className="om-admin-btn ghost"
                            onClick={() => openCustomer(c.user_id)}
                          >
                            Open
                          </button>
                          {c.identity_review_status !== "approved" ? (
                            <button
                              type="button"
                              className="om-admin-btn"
                              disabled={busyId === c.user_id}
                              onClick={() =>
                                void actCustomer(c.user_id, "approve_t2")
                              }
                            >
                              Approve T2
                            </button>
                          ) : (
                            <button type="button" className="om-admin-btn done" disabled>
                              ✓ T2
                            </button>
                          )}
                          {c.identity_review_status === "submitted" ||
                          c.identity_review_status === "approved" ? (
                            <button
                              type="button"
                              className="om-admin-btn ghost"
                              disabled={busyId === c.user_id}
                              onClick={() =>
                                void actCustomer(c.user_id, "reject_t2", {
                                  reason: "Rejected by care. Re-submit ID.",
                                })
                              }
                            >
                              Reject
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </AdminTableWrap>
        )}
      </div>

      {/* Detail drawer — directory */}
      <DetailDrawer
        open={Boolean(selectedDir && tab === "directory")}
        title={selectedDir?.full_name || "Customer"}
        subtitle={selectedDir?.email || selectedDir?.phone || undefined}
        onClose={() => setSelectedId(null)}
        footer={
          selectedDir ? (
            <>
              <button
                type="button"
                className="om-admin-btn ghost"
                disabled={busyId === selectedDir.id}
                onClick={() =>
                  void toggleActive(selectedDir.id, !selectedDir.is_active)
                }
              >
                {selectedDir.is_active ? "Deactivate" : "Activate"}
              </button>
              {selectedDir.verifyLevel !== "full" ? (
                <button
                  type="button"
                  className="om-admin-btn"
                  disabled={busyId === selectedDir.id}
                  onClick={() =>
                    void actCustomer(selectedDir.id, "approve_t2")
                  }
                >
                  Approve T2 ID
                </button>
              ) : null}
            </>
          ) : null
        }
      >
        {selectedDir ? (
          <>
            <div className="om-admin-section">
              <h3>Account</h3>
              <DetailGrid>
                <DetailField label="User ID" value={<code style={{ fontSize: 10 }}>{selectedDir.id}</code>} />
                <DetailField
                  label="Active"
                  value={selectedDir.is_active ? "Yes" : "No"}
                />
                <DetailField label="Phone" value={selectedDir.phone} />
                <DetailField label="Email" value={selectedDir.email} />
                <DetailField
                  label="Gender"
                  value={
                    selectedDir.gender === "male"
                      ? "Male"
                      : selectedDir.gender === "female"
                        ? "Female"
                        : selectedDir.gender === "prefer_not_to_say"
                          ? "Prefer not to say"
                          : ""
                  }
                />
                <DetailField
                  label="Date of birth"
                  value={
                    selectedDir.date_of_birth
                      ? String(selectedDir.date_of_birth).slice(0, 10)
                      : ""
                  }
                />
                <DetailField
                  label="City / area"
                  value={[selectedDir.city, selectedDir.area]
                    .filter(Boolean)
                    .join(", ")}
                />
                <DetailField
                  label="Joined"
                  value={fmtDate(selectedDir.created_at)}
                />
              </DetailGrid>
            </div>
            <div className="om-admin-section">
              <h3>Vehicle</h3>
              <DetailGrid>
                <DetailField
                  label="Make / model"
                  value={[
                    selectedDir.motorist?.vehicle_make,
                    selectedDir.motorist?.vehicle_model,
                    selectedDir.motorist?.vehicle_year,
                  ]
                    .filter(Boolean)
                    .join(" ")}
                />
                <DetailField
                  label="Plate"
                  value={selectedDir.motorist?.plate_number}
                />
                <DetailField
                  label="Address"
                  value={selectedDir.motorist?.address_text}
                />
              </DetailGrid>
            </div>
            <div className="om-admin-section">
              <h3>Verification</h3>
              <DetailGrid>
                <DetailField
                  label="Level"
                  value={
                    <StatusBadge status={selectedDir.verifyLevel}>
                      {selectedDir.verifyLevel}
                    </StatusBadge>
                  }
                />
                <DetailField
                  label="NIN last4"
                  value={selectedDir.motorist?.nin_last4}
                />
                <DetailField
                  label="BVN last4"
                  value={selectedDir.motorist?.bvn_last4}
                />
                <DetailField
                  label="Verified at"
                  value={fmtDate(selectedDir.motorist?.identity_verified_at)}
                />
              </DetailGrid>
            </div>
          </>
        ) : null}
      </DetailDrawer>

      {/* Detail drawer — ID review */}
      <DetailDrawer
        open={Boolean(selectedReview && tab === "id_review")}
        title={selectedReview?.full_name || "ID review"}
        subtitle={
          selectedReview
            ? `${selectedReview.identity_review_status} · ${selectedReview.phone || selectedReview.email || ""}`
            : undefined
        }
        onClose={() => setSelectedId(null)}
        width={460}
        footer={
          selectedReview ? (
            <>
              {!selectedReview.phone_verified &&
              !selectedReview.levels?.t1_phone?.verified ? (
                <button
                  type="button"
                  className="om-admin-btn ghost"
                  disabled={busyId === selectedReview.user_id}
                  onClick={() =>
                    void actCustomer(
                      selectedReview.user_id,
                      "mark_phone_verified"
                    )
                  }
                >
                  Mark phone verified
                </button>
              ) : null}
              {selectedReview.identity_review_status !== "approved" ? (
                <button
                  type="button"
                  className="om-admin-btn"
                  disabled={busyId === selectedReview.user_id}
                  onClick={() =>
                    void actCustomer(selectedReview.user_id, "approve_t2")
                  }
                >
                  Approve T2
                </button>
              ) : (
                <button type="button" className="om-admin-btn done" disabled>
                  ✓ Approved
                </button>
              )}
              <button
                type="button"
                className="om-admin-btn ghost"
                disabled={busyId === selectedReview.user_id}
                onClick={() =>
                  void actCustomer(selectedReview.user_id, "reject_t2", {
                    reason: "Rejected by care — re-submit ID",
                  })
                }
              >
                Reject T2
              </button>
              {selectedReview.identity_review_status !== "approved" ? (
                <button
                  type="button"
                  className="om-admin-btn ghost"
                  disabled={busyId === selectedReview.user_id}
                  title="Clear unapproved ID so customer can re-submit from the app"
                  onClick={() => {
                    if (
                      !window.confirm(
                        "Reset Tier 2 ID for this customer? They must re-submit government ID from Verification. Approved IDs cannot be reset this way."
                      )
                    )
                      return;
                    void actCustomer(selectedReview.user_id, "reset_t2", {
                      reason:
                        "Care reset. Please re-submit your government ID from the app.",
                    });
                  }}
                >
                  Reset T2 (re-verify)
                </button>
              ) : null}
            </>
          ) : null
        }
      >
        {selectedReview ? (
          <>
            <div className="om-admin-section">
              <h3>Account</h3>
              <div style={{ marginBottom: 10 }}>
                <FileThumb
                  label="Avatar"
                  url={selectedReview.avatar_url}
                  size="md"
                />
              </div>
              <DetailGrid>
                <DetailField
                  label="Dual Role"
                  value={
                    selectedReview.dual_role
                      ? selectedReview.has_switched
                        ? "Yes · has switched"
                        : "Yes"
                      : "No"
                  }
                />
                <DetailField
                  label="First role"
                  value={selectedReview.first_role || "—"}
                />
                <DetailField
                  label="Current role"
                  value={selectedReview.current_role || "—"}
                />
                <DetailField
                  label="Last switch"
                  value={
                    selectedReview.last_role_switch_at
                      ? fmtDate(selectedReview.last_role_switch_at)
                      : selectedReview.dual_role
                        ? "Not recorded yet"
                        : "—"
                  }
                />
                <DetailField
                  label="Switch count"
                  value={String(selectedReview.role_switch_count ?? 0)}
                />
                <DetailField label="Phone" value={selectedReview.phone} />
                <DetailField label="Email" value={selectedReview.email} />
                <DetailField
                  label="City"
                  value={[selectedReview.city, selectedReview.area]
                    .filter(Boolean)
                    .join(", ")}
                />
                <DetailField
                  label="Address"
                  value={selectedReview.address_text}
                />
                <DetailField
                  label="Jobs"
                  value={String(selectedReview.jobs_count)}
                />
                <DetailField
                  label="User ID"
                  value={
                    <code style={{ fontSize: 10 }}>
                      {selectedReview.user_id}
                    </code>
                  }
                />
              </DetailGrid>
            </div>
            <div className="om-admin-section">
              <h3>Vehicles</h3>
              <DetailGrid>
                <DetailField
                  label="Primary"
                  value={[
                    selectedReview.vehicle_make,
                    selectedReview.vehicle_model,
                    selectedReview.plate,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                />
                <DetailField
                  label="Common issues"
                  value={
                    Array.isArray(selectedReview.vehicle_common_issues)
                      ? selectedReview.vehicle_common_issues.join(", ")
                      : ""
                  }
                />
              </DetailGrid>
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  flexWrap: "wrap",
                  marginTop: 8,
                }}
              >
                <FileThumb
                  label="Primary vehicle"
                  url={selectedReview.vehicle_photo}
                  size="md"
                />
                {(selectedReview.vehicles || []).map((v, i) => (
                  <FileThumb
                    key={v.id || i}
                    label={
                      [v.make, v.model].filter(Boolean).join(" ") ||
                      `Vehicle ${i + 1}`
                    }
                    url={v.photo}
                    size="md"
                  />
                ))}
              </div>
              {(selectedReview.vehicles || []).length > 0 ? (
                <ul className="om-admin-muted" style={{ marginTop: 8 }}>
                  {selectedReview.vehicles!.map((v, i) => (
                    <li key={v.id || i}>
                      {[v.make, v.model, v.year, v.plate]
                        .filter(Boolean)
                        .join(" · ") || `Vehicle ${i + 1}`}
                      {v.commonIssues?.length
                        ? ` — ${v.commonIssues.join(", ")}`
                        : ""}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            <div className="om-admin-section">
              <h3>Tier 1 · Phone</h3>
              <DetailGrid>
                <DetailField
                  label="Status"
                  value={
                    <StatusBadge
                      status={
                        selectedReview.levels?.t1_phone?.verified
                          ? "verified"
                          : "pending"
                      }
                    >
                      {selectedReview.levels?.t1_phone?.verified
                        ? "Verified"
                        : "Unverified"}
                    </StatusBadge>
                  }
                />
                <DetailField
                  label="Number"
                  value={selectedReview.levels?.t1_phone?.phone}
                />
              </DetailGrid>
            </div>
            <div className="om-admin-section">
              <h3>Tier 2 · Government ID</h3>
              <DetailGrid>
                <DetailField
                  label="Status"
                  value={
                    <StatusBadge status={selectedReview.identity_review_status}>
                      {selectedReview.identity_review_status}
                    </StatusBadge>
                  }
                />
                <DetailField
                  label="Type"
                  value={
                    selectedReview.gov_id_kind ||
                    selectedReview.levels?.t2_id?.gov_id_kind
                  }
                />
                <DetailField
                  label="Country"
                  value={selectedReview.levels?.t2_id?.country_iso || "NG"}
                />
                <DetailField
                  label="ID number"
                  value={
                    <>
                      {showFullId
                        ? selectedReview.gov_id_number ||
                          selectedReview.levels?.t2_id?.gov_id_number ||
                          ""
                        : selectedReview.nin_last4
                          ? `••••${selectedReview.nin_last4}`
                          : ""}{" "}
                      <button
                        type="button"
                        className="om-admin-btn ghost"
                        style={{ padding: "2px 8px", fontSize: 11 }}
                        onClick={() => setShowFullId((v) => !v)}
                      >
                        {showFullId ? "Hide" : "Reveal"}
                      </button>
                    </>
                  }
                />
                <DetailField
                  label="BVN / secondary"
                  value={
                    showFullId
                      ? selectedReview.bank_id_number ||
                        selectedReview.levels?.t2_id?.bank_id_number ||
                        ""
                      : selectedReview.bvn_last4
                        ? `••••${selectedReview.bvn_last4}`
                        : ""
                  }
                />
                <DetailField
                  label="Submitted"
                  value={fmtDate(selectedReview.identity_submitted_at)}
                />
              </DetailGrid>
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  flexWrap: "wrap",
                  marginTop: 8,
                }}
              >
                <FileThumb
                  label="Front"
                  url={
                    selectedReview.gov_id_front_url ||
                    selectedReview.levels?.t2_id?.front_url
                  }
                  size="lg"
                  userId={selectedReview.user_id}
                  kind="front"
                />
                <FileThumb
                  label="Back"
                  url={
                    selectedReview.gov_id_back_url ||
                    selectedReview.levels?.t2_id?.back_url
                  }
                  size="lg"
                  userId={selectedReview.user_id}
                  kind="back"
                />
              </div>
            </div>
            <div className="om-admin-section">
              <h3>Free period</h3>
              <DetailGrid>
                <DetailField
                  label="First request"
                  value={fmtDate(
                    selectedReview.levels?.trial?.first_service_at
                  )}
                />
                <DetailField
                  label="Days left"
                  value={
                    selectedReview.levels?.trial?.days_left == null
                      ? "Not started"
                      : selectedReview.levels.trial.expired
                        ? "Ended"
                        : String(selectedReview.levels.trial.days_left)
                  }
                />
              </DetailGrid>
            </div>
            <div className="om-admin-section">
              <h3>Job media (live photos / evidence)</h3>
              {(selectedReview.job_media || []).length === 0 ? (
                <p className="om-admin-muted">No job media yet.</p>
              ) : (
                (selectedReview.job_media || []).map((j) => {
                  const extra = [
                    ...mediaUrlsFromUnknown(j.photos),
                    ...mediaUrlsFromUnknown(j.evidence),
                  ];
                  return (
                    <div key={j.id} style={{ marginBottom: 12 }}>
                      <div className="om-admin-muted" style={{ marginBottom: 4 }}>
                        {j.service_type || "Job"} · {j.status} ·{" "}
                        {fmtDate(j.created_at)}
                        {j.pickup_address ? ` · ${j.pickup_address}` : ""}
                      </div>
                      <div
                        style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
                      >
                        <FileThumb
                          label="Customer live"
                          url={j.motorist_photo}
                          size="md"
                        />
                        <FileThumb
                          label="Pro live"
                          url={j.repair_pro_photo}
                          size="md"
                        />
                        {extra.map((u, i) => (
                          <FileThumb
                            key={i}
                            label={`Media ${i + 1}`}
                            url={u}
                            size="md"
                          />
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        ) : null}
      </DetailDrawer>
    </AdminShell>
  );
}
