"use client";

/**
 * Repair Pros hub — directory + full review (merged Artisan/Pro review).
 * Clean table, file thumbs in row, detail drawer for everything.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
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
  gender?: string | null;
  date_of_birth?: string | null;
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
  area?: string | null;
  avatar_url?: string | null;
  business_name: string | null;
  primary_service: string | null;
  services?: string[];
  status: string;
  pipeline_status: string | null;
  bio?: string | null;
  years_experience?: string | null;
  service_radius_km?: number | null;
  guarantor?: unknown;
  tools?: unknown;
  portfolio?: unknown;
  labour_prices?: unknown;
  vehicle_focus?: unknown;
  skills?: unknown;
  skill_proof?: unknown;
  cac_document_url?: string | null;
  job_media?: Array<{
    id: string;
    status: string;
    service_type: string | null;
    motorist_photo: string | null;
    repair_pro_photo: string | null;
    photos: unknown;
    evidence: unknown;
    created_at: string;
  }>;
  needs_action: boolean;
  /** Entry-order queue # among open care items (earliest = 1) */
  queue_number?: number | null;
  needs_resubmit?: boolean;
  rejection_reason?: string | null;
  specialty?: string | null;
  care_gaps?: {
    missing_id_media?: boolean;
    missing_id_number?: boolean;
    missing_skill_doc?: boolean;
    missing_liveness?: boolean;
  };
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

function portfolioUrls(v: unknown): { label: string; url: string }[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((item, i) => {
      if (typeof item === "string") return { label: `Portfolio ${i + 1}`, url: item };
      if (item && typeof item === "object") {
        const o = item as Record<string, unknown>;
        const url = String(o.url || o.src || "");
        const label = String(o.kind || o.name || `Portfolio ${i + 1}`);
        return url ? { label, url } : null;
      }
      return null;
    })
    .filter(Boolean) as { label: string; url: string }[];
}

function mediaUrlsFromUnknown(v: unknown): string[] {
  if (!v) return [];
  if (typeof v === "string" && v.length > 8) return [v];
  if (Array.isArray(v)) {
    return v
      .map((x) => {
        if (typeof x === "string") return x;
        if (x && typeof x === "object") {
          const o = x as Record<string, unknown>;
          return String(o.url || o.src || o.photo || "");
        }
        return "";
      })
      .filter((u) => u.length > 8);
  }
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    return mediaUrlsFromUnknown(o.url || o.src || o.dataUrl || o.photo);
  }
  return [];
}

function humanizeKey(k: string): string {
  return k
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}

/** Human labels for skill / focus maps — never dump raw JSON to care. */
function formatAnswerValue(v: unknown): string {
  if (v == null || v === "" || v === "—" || v === "-") return "";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") {
    if (v.startsWith("data:") || v.length > 200) return "File attached";
    return v;
  }
  if (Array.isArray(v)) {
    if (!v.length) return "";
    return v
      .map((x) => formatAnswerValue(x))
      .filter(Boolean)
      .join(", ");
  }
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (o.name || o.hasFile || o.dataUrl || o.url) {
      return String(o.name || "File uploaded");
    }
    const parts = Object.entries(o)
      .filter(([key]) => !["dataUrl", "mime", "hasFile"].includes(key))
      .map(([key, val]) => {
        const fv = formatAnswerValue(val);
        return fv ? `${humanizeKey(key)}: ${fv}` : "";
      })
      .filter(Boolean);
    return parts.length ? parts.join(" · ") : "";
  }
  return String(v);
}

function skillRows(skills: unknown): { label: string; value: string }[] {
  if (!skills || typeof skills !== "object" || Array.isArray(skills)) return [];
  return Object.entries(skills as Record<string, unknown>)
    .filter(([k]) => k !== "certificationUpload") // shown in media section
    .map(([k, v]) => ({ label: humanizeKey(k), value: formatAnswerValue(v) }));
}

function focusRows(
  focus: unknown,
  trade?: string | null
): { label: string; value: string }[] {
  if (!focus || typeof focus !== "object" || Array.isArray(focus)) return [];
  const o = focus as Record<string, unknown>;
  const vehicleTrades = new Set([
    "mechanic",
    "vulcanizer",
    "towing",
    "battery",
    "panel",
    "ac",
  ]);
  const isVehicle = trade ? vehicleTrades.has(trade) : false;
  const preferred = isVehicle
    ? [
        "servedVehicleType",
        "servedBrand",
        "servedModel",
        "servedCountry",
        "servedLocation",
      ]
    : ["specialty", "trade", "servedCountry", "servedLocation"];
  const rows: { label: string; value: string }[] = [];
  const used = new Set<string>();
  for (const k of preferred) {
    if (o[k] != null && o[k] !== "") {
      const label =
        k === "servedVehicleType"
          ? "Vehicle type"
          : k === "servedBrand"
            ? "Brand"
            : k === "servedModel"
              ? "Model"
              : k === "servedCountry"
                ? "Country"
                : k === "servedLocation"
                  ? "Area"
                  : humanizeKey(k);
      // Skip duplicate specialty-as-vehicle noise for home trades
      if (
        !isVehicle &&
        (k === "servedVehicleType" ||
          k === "servedBrand" ||
          k === "servedModel") &&
        String(o[k]) === String(o.specialty || "")
      ) {
        continue;
      }
      rows.push({ label, value: formatAnswerValue(o[k]) });
      used.add(k);
    }
  }
  for (const [k, v] of Object.entries(o)) {
    if (used.has(k)) continue;
    if (
      !isVehicle &&
      ["servedVehicleType", "servedBrand", "servedModel", "servedMake"].includes(
        k
      )
    ) {
      // Hide polluted vehicle fields on home trades when they equal specialty
      if (String(v) === String(o.specialty || "")) continue;
    }
    rows.push({ label: humanizeKey(k), value: formatAnswerValue(v) });
  }
  return rows;
}

function priceRows(prices: unknown): { label: string; value: string }[] {
  if (!prices || typeof prices !== "object" || Array.isArray(prices)) return [];
  return Object.entries(prices as Record<string, unknown>)
    .filter(([, v]) => v != null && v !== "")
    .map(([k, v]) => ({
      label: humanizeKey(k),
      value:
        typeof v === "number"
          ? `₦${v.toLocaleString()}`
          : formatAnswerValue(v),
    }));
}

function CareCallout({ children }: { children: ReactNode }) {
  return <div className="om-admin-notice">{children}</div>;
}

type Tab = "directory" | "review";
type ProStatus = "pending" | "approved" | "suspended" | "rejected";

export default function AdminProsHubPage() {
  const { adminName, ready, api } = useAdminGate();
  const [tab, setTab] = useState<Tab>("directory");

  useEffect(() => {
    try {
      const t = new URLSearchParams(window.location.search).get("tab");
      if (t === "review") setTab("review");
    } catch {
      /* */
    }
  }, []);
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
        Repair Pro accounts from the live app. Review onboarding, documents, Live status, and payout banks. Approve or suspend pros here.
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
                  ["resubmit", "Re-submit"],
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
                            {p?.business_name || ""}
                          </div>
                          <div className="om-admin-muted">
                            {u.email || u.phone || ""}
                          </div>
                        </td>
                        <td>{p?.primary_service || ""}</td>
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
                  <th>#</th>
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
                    <td colSpan={7} className="om-admin-muted">
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
                          {p.queue_number != null ? (
                            <span
                              className="om-admin-queue-num"
                              title="Entry sequence (earliest open item = #1)"
                            >
                              #{p.queue_number}
                            </span>
                          ) : (
                            <span className="om-admin-empty"> </span>
                          )}
                        </td>
                        <td>
                          <strong>{p.full_name}</strong>
                          {p.needs_resubmit ? (
                            <span className="om-admin-flag-resubmit">
                              Re-submit
                            </span>
                          ) : null}
                          <div className="om-admin-muted">
                            {p.business_name || ""}
                          </div>
                          <div className="om-admin-muted">
                            {p.email || p.phone || ""}
                          </div>
                        </td>
                        <td>{p.primary_service || ""}</td>
                        <td style={{ fontSize: 11, maxWidth: "none" }}>
                          <StatusBadge status={L.t2_id.status}>T2</StatusBadge>{" "}
                          <StatusBadge status={L.t3_liveness.status}>
                            T3
                          </StatusBadge>{" "}
                          <StatusBadge status={L.t4_docs.status}>T4</StatusBadge>
                          <div className="om-admin-muted">
                            {p.status} · {p.pipeline_status || ""}
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
                            {!p.needs_resubmit ? (
                              <button
                                type="button"
                                className="om-admin-btn ghost"
                                disabled={busyId === p.user_id}
                                onClick={() =>
                                  void actReview(
                                    p.user_id,
                                    "pro_request_resubmit",
                                    {
                                      reason:
                                        "Care: please re-submit ID and skill documents.",
                                    }
                                  )
                                }
                              >
                                Flag re-submit
                              </button>
                            ) : null}
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
            ? `${selectedReview.primary_service || ""} · ${selectedReview.status}`
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
              {selectedReview.levels.t2_id.status !== "approved" ? (
                <button
                  type="button"
                  className="om-admin-btn ghost"
                  disabled={busyId === selectedReview.user_id}
                  title="Clear unapproved ID so pro can re-upload from the app"
                  onClick={() => {
                    if (
                      !window.confirm(
                        "Reset Tier 2 ID for this pro? They must re-submit ID from the app. Already-approved tiers are not touched."
                      )
                    )
                      return;
                    void actReview(selectedReview.user_id, "pro_t2_reset", {
                      reason:
                        "Care reset T2. Please re-submit government ID in the app.",
                    });
                  }}
                >
                  Reset T2 (re-verify)
                </button>
              ) : null}
              {selectedReview.levels.t4_docs.status !== "approved" ? (
                <button
                  type="button"
                  className="om-admin-btn ghost"
                  disabled={busyId === selectedReview.user_id}
                  title="Clear unapproved skill docs so pro can re-upload"
                  onClick={() => {
                    if (
                      !window.confirm(
                        "Reset Tier 4 skill docs? They must re-submit skill proof from the app."
                      )
                    )
                      return;
                    void actReview(selectedReview.user_id, "pro_t4_reset", {
                      reason:
                        "Care reset T4. Please re-submit skill documents in the app.",
                    });
                  }}
                >
                  Reset T4 (re-verify)
                </button>
              ) : null}
              <button
                type="button"
                className="om-admin-btn ghost"
                disabled={busyId === selectedReview.user_id}
                title="Reset every verification step that is not yet approved"
                onClick={() => {
                  if (
                    !window.confirm(
                      "Reset all unapproved verification tiers? Approved tiers stay. Pro can start those steps again in the app."
                    )
                  )
                    return;
                  void actReview(
                    selectedReview.user_id,
                    "pro_reset_unapproved",
                    {
                      reason:
                        "Care reset unapproved tiers. Complete verification again in the app.",
                    }
                  );
                }}
              >
                Reset all unapproved
              </button>
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
                <DetailField label="Business" value={selectedReview.business_name} />
                <DetailField label="Trade" value={selectedReview.primary_service} />
                <DetailField
                  label="Services"
                  value={
                    Array.isArray(selectedReview.services)
                      ? selectedReview.services.join(", ")
                      : ""
                  }
                />
                <DetailField label="Email" value={selectedReview.email} />
                <DetailField label="Phone" value={selectedReview.phone} />
                <DetailField
                  label="City / area"
                  value={[selectedReview.city, selectedReview.area]
                    .filter(Boolean)
                    .join(", ")}
                />
                <DetailField label="Bio" value={selectedReview.bio} />
                <DetailField
                  label="Experience"
                  value={selectedReview.years_experience}
                />
                <DetailField
                  label="Radius km"
                  value={
                    selectedReview.service_radius_km != null
                      ? String(selectedReview.service_radius_km)
                      : ""
                  }
                />
                <DetailField
                  label="Pipeline"
                  value={selectedReview.pipeline_status}
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
            {(selectedReview.care_gaps?.missing_id_media ||
              selectedReview.care_gaps?.missing_skill_doc ||
              selectedReview.needs_resubmit) && (
              <div className="om-admin-section">
                <h3>Care action needed</h3>
                {selectedReview.care_gaps?.missing_id_media ? (
                  <CareCallout>
                    No ID photo on the server. Ask this pro to open Verification
                    → re-upload government ID (front photo). Status alone is not
                    enough to approve.
                  </CareCallout>
                ) : null}
                {selectedReview.care_gaps?.missing_skill_doc ? (
                  <CareCallout>
                    Skill document missing. Ask them to submit skill proof from
                    artisan Verification / onboarding.
                  </CareCallout>
                ) : null}
                {selectedReview.needs_resubmit ? (
                  <CareCallout>
                    Flagged for re-submit
                    {selectedReview.rejection_reason
                      ? `: ${selectedReview.rejection_reason}`
                      : "."}
                  </CareCallout>
                ) : null}
              </div>
            )}

            <div className="om-admin-section">
              <h3>Skills & specialty</h3>
              {selectedReview.specialty ? (
                <DetailGrid>
                  <DetailField
                    label="Specialty"
                    value={selectedReview.specialty}
                  />
                </DetailGrid>
              ) : null}
              {skillRows(selectedReview.skills).length === 0 ? (
                <p className="om-admin-muted">No skill answers on file.</p>
              ) : (
                <DetailGrid>
                  {skillRows(selectedReview.skills).map((r) => (
                    <DetailField key={r.label} label={r.label} value={r.value} />
                  ))}
                </DetailGrid>
              )}
            </div>

            <div className="om-admin-section">
              <h3>
                {["mechanic", "vulcanizer", "towing", "battery", "panel", "ac"].includes(
                  String(selectedReview.primary_service || "")
                )
                  ? "Vehicles & area"
                  : "Service focus & area"}
              </h3>
              {focusRows(
                selectedReview.vehicle_focus,
                selectedReview.primary_service
              ).length === 0 ? (
                <p className="om-admin-muted">No focus details on file.</p>
              ) : (
                <DetailGrid>
                  {focusRows(
                    selectedReview.vehicle_focus,
                    selectedReview.primary_service
                  ).map((r) => (
                    <DetailField key={r.label} label={r.label} value={r.value} />
                  ))}
                </DetailGrid>
              )}
            </div>

            <div className="om-admin-section">
              <h3>Labour prices</h3>
              {priceRows(selectedReview.labour_prices).length === 0 ? (
                <p className="om-admin-muted">
                  No labour prices set yet (optional at signup).
                </p>
              ) : (
                <DetailGrid>
                  {priceRows(selectedReview.labour_prices).map((r) => (
                    <DetailField key={r.label} label={r.label} value={r.value} />
                  ))}
                </DetailGrid>
              )}
              {Array.isArray(selectedReview.tools) &&
              (selectedReview.tools as unknown[]).length > 0 ? (
                <DetailGrid>
                  <DetailField
                    label="Tools"
                    value={(selectedReview.tools as string[]).join(", ")}
                  />
                </DetailGrid>
              ) : null}
              {selectedReview.guarantor &&
              typeof selectedReview.guarantor === "object" &&
              Object.keys(selectedReview.guarantor as object).length > 0 ? (
                <DetailGrid>
                  {Object.entries(
                    selectedReview.guarantor as Record<string, unknown>
                  ).map(([k, v]) => (
                    <DetailField
                      key={k}
                      label={humanizeKey(k)}
                      value={formatAnswerValue(v)}
                    />
                  ))}
                </DetailGrid>
              ) : null}
            </div>

            <div className="om-admin-section">
              <h3>Documents & media</h3>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {portfolioUrls(selectedReview.portfolio).map((p) => (
                  <FileThumb
                    key={p.url + p.label}
                    label={p.label}
                    url={p.url}
                    size="md"
                  />
                ))}
                <FileThumb
                  label="Skill cert"
                  url={selectedReview.levels.t4_docs.file_url}
                  size="md"
                />
                <FileThumb
                  label="CAC"
                  url={selectedReview.cac_document_url}
                  size="md"
                />
                {mediaUrlsFromUnknown(selectedReview.skill_proof).map(
                  (u, i) => (
                    <FileThumb
                      key={i}
                      label={`Skill proof ${i + 1}`}
                      url={u}
                      size="md"
                    />
                  )
                )}
              </div>
              {portfolioUrls(selectedReview.portfolio).length === 0 &&
              !selectedReview.levels.t4_docs.file_url &&
              !selectedReview.cac_document_url &&
              mediaUrlsFromUnknown(selectedReview.skill_proof).length === 0 ? (
                <p className="om-admin-muted" style={{ marginTop: 8 }}>
                  No portfolio / cert media on the server yet.
                </p>
              ) : null}
              {selectedReview.levels.t4_docs.file_name &&
              !selectedReview.levels.t4_docs.file_url ? (
                <p className="om-admin-muted" style={{ marginTop: 6 }}>
                  File name on record:{" "}
                  <strong>{selectedReview.levels.t4_docs.file_name}</strong>.
                  image bytes missing (too large or never uploaded). Ask for
                  re-upload.
                </p>
              ) : null}
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
                  value={selectedReview.levels.t2_id.gov_id_kind || ""}
                />
                <DetailField
                  label="ID number"
                  value={
                    <>
                      {showFull
                        ? selectedReview.levels.t2_id.gov_id_number || ""
                        : selectedReview.levels.t2_id.gov_id_last4
                          ? `••••${selectedReview.levels.t2_id.gov_id_last4}`
                          : ""}{" "}
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
                  label="Submitted"
                  value={fmtDate(selectedReview.levels.t2_id.submitted_at)}
                />
              </DetailGrid>
              {!selectedReview.levels.t2_id.front_url &&
              !selectedReview.levels.t2_id.back_url ? (
                <CareCallout>
                  No ID photos. Do not approve T2 until front (and back if
                  needed) are visible below after re-upload.
                </CareCallout>
              ) : null}
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <FileThumb
                  label="ID front"
                  url={selectedReview.levels.t2_id.front_url}
                  size="lg"
                  userId={selectedReview.user_id}
                  kind="pro_front"
                />
                <FileThumb
                  label="ID back"
                  url={selectedReview.levels.t2_id.back_url}
                  size="lg"
                  userId={selectedReview.user_id}
                  kind="pro_back"
                />
              </div>
              {selectedReview.levels.t2_id.front_url ? (
                <a
                  className="om-admin-file-link"
                  href={selectedReview.levels.t2_id.front_url}
                  target="_blank"
                  rel="noreferrer"
                  style={{ display: "inline-block", marginTop: 8, marginRight: 12 }}
                >
                  Open ID front in new tab
                </a>
              ) : null}
              {selectedReview.levels.t2_id.back_url ? (
                <a
                  className="om-admin-file-link"
                  href={selectedReview.levels.t2_id.back_url}
                  target="_blank"
                  rel="noreferrer"
                  style={{ display: "inline-block", marginTop: 8 }}
                >
                  Open ID back in new tab
                </a>
              ) : null}
            </div>

            <div className="om-admin-section">
              <h3>Tier 3 · Liveness + BVN</h3>
              <DetailGrid>
                <DetailField
                  label="Liveness"
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
                <DetailField
                  label="BVN / bank ID"
                  value={
                    showFull
                      ? selectedReview.levels.t2_id.bank_id_number || ""
                      : selectedReview.levels.t2_id.bank_id_last4
                        ? `••••${selectedReview.levels.t2_id.bank_id_last4}`
                        : ""
                  }
                />
              </DetailGrid>
              <FileThumb
                label="Selfie"
                url={selectedReview.levels.t3_liveness.selfie_url}
                size="md"
                userId={selectedReview.user_id}
              />
              {selectedReview.levels.t3_liveness.selfie_url ? (
                <a
                  className="om-admin-file-link"
                  href={selectedReview.levels.t3_liveness.selfie_url}
                  target="_blank"
                  rel="noreferrer"
                  style={{ display: "inline-block", marginTop: 6 }}
                >
                  Open selfie in new tab
                </a>
              ) : (
                <p className="om-admin-muted" style={{ marginTop: 6 }}>
                  No selfie yet (optional until pro completes liveness in app).
                </p>
              )}
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
                  value={selectedReview.levels.t4_docs.file_name || ""}
                />
                <DetailField
                  label="Submitted"
                  value={fmtDate(selectedReview.levels.t4_docs.submitted_at)}
                />
              </DetailGrid>
              {selectedReview.levels.t4_docs.file_url ? (
                <div style={{ marginTop: 8 }}>
                  <FileThumb
                    label="Skill document"
                    url={selectedReview.levels.t4_docs.file_url}
                    size="lg"
                  />
                  <a
                    className="om-admin-file-link"
                    href={selectedReview.levels.t4_docs.file_url}
                    target="_blank"
                    rel="noreferrer"
                    style={{ display: "inline-block", marginTop: 6 }}
                  >
                    Open full size
                  </a>
                </div>
              ) : (
                <CareCallout>
                  No skill file on the server. Pro must use Verification → Submit
                  skill for review (now saves to the queue).
                </CareCallout>
              )}
            </div>
            <div className="om-admin-section">
              <h3>Search visibility (automatic · read-only)</h3>
              <p className="om-admin-muted" style={{ marginBottom: 10 }}>
                Care never sets this manually. Ladder:
                <br />
                <strong>T1</strong>: not in search
                <br />
                <strong>T2</strong>: after you <strong>Approve T2 ID</strong>{" "}
                (limited · ~30% · 1 km · 30-day Go Live window)
                <br />
                <strong>T3</strong>: after pro passes{" "}
                <strong>face liveness + BVN</strong> (wider · ~70% · 3 km · New
                badge off · unlimited Go Live)
                <br />
                <strong>T4</strong>: after you{" "}
                <strong>Approve T4 skill docs</strong>, only if T3 already
                passed (full · 100% · 10 km)
              </p>
              <DetailGrid>
                <DetailField
                  label="Current reach"
                  value={`T${selectedReview.levels.visibility.tier} · ${
                    selectedReview.levels.visibility.tier === 1
                      ? "Hidden (needs T2 ID approval)"
                      : selectedReview.levels.visibility.tier === 2
                        ? "Limited · ~30% · 1 km"
                        : selectedReview.levels.visibility.tier === 3
                          ? "Wider · ~70% · 3 km (liveness + BVN)"
                          : "Full · 100% · 10 km"
                  }`}
                />
                <DetailField
                  label="T3 ready?"
                  value={
                    selectedReview.levels.t3_liveness?.verified &&
                    selectedReview.levels.t2_id?.status === "approved"
                      ? "Yes · liveness done · BVN with T2 package"
                      : selectedReview.levels.t3_liveness?.verified
                        ? "Liveness yes · needs T2/BVN"
                        : "Waiting face liveness (+ BVN)"
                  }
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
                      <div
                        className="om-admin-muted"
                        style={{ marginBottom: 4 }}
                      >
                        {j.service_type || "Job"} · {j.status} ·{" "}
                        {fmtDate(j.created_at)}
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
