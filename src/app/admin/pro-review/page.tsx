"use client";

/**
 * Repair Pro review — all levels from DB
 * T1 phone · T2 ID numbers/photos · T3 liveness · T4 skill docs · visibility
 */

import { useCallback, useEffect, useState, type ReactNode } from "react";
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
  bio: string | null;
  years_experience: string | null;
  needs_action: boolean;
  rejection_reason: string | null;
  levels: {
    t1_phone: {
      label: string;
      status: string;
      verified: boolean;
      phone: string | null;
    };
    t2_id: {
      label: string;
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
      label: string;
      status: string;
      verified: boolean;
      verified_at: string | null;
      selfie_url: string | null;
    };
    t4_docs: {
      label: string;
      status: string;
      docs_status: string;
      file_name: string | null;
      file_url: string | null;
      submitted_at: string | null;
    };
    visibility: {
      label: string;
      tier: number;
      is_new_artisan: boolean;
      rating_avg: number;
      rating_count: number;
    };
  };
};

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function badgeClass(s: string) {
  if (s === "approved" || s === "verified" || s === "passed") return "approved";
  if (s === "pending" || s === "submitted") return "pending";
  if (s === "rejected") return "rejected";
  return "";
}

export default function AdminProReviewPage() {
  const { adminName, ready, api } = useAdminGate();
  const [filter, setFilter] = useState("needs_action");
  const [rows, setRows] = useState<ProRow[]>([]);
  const [totals, setTotals] = useState({
    total: 0,
    needs_action: 0,
    t2_pending: 0,
    t4_pending: 0,
  });
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [showFull, setShowFull] = useState<Record<string, boolean>>({});
  const [legacy, setLegacy] = useState(false);

  const load = useCallback(async () => {
    const res = await api<{
      pros: ProRow[];
      totals: typeof totals;
      legacy?: boolean;
    }>(`/api/admin/pro-review?filter=${encodeURIComponent(filter)}`);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setError(null);
    setRows(res.data.pros);
    setTotals(res.data.totals);
    setLegacy(Boolean(res.data.legacy));
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
    setError(null);
    setFlash(null);
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
    setFlash(res.data.message || "Updated.");
    await load();
  };

  return (
    <AdminShell adminName={adminName}>
      <h1 className="om-admin-h1">Repair Pro review · all levels</h1>
      <p className="om-admin-sub">
        Database queue: T1 phone, T2 ID numbers & photos, T3 liveness, T4 skill
        docs, visibility ladder. Use alongside Artisan review for local drafts.
      </p>

      {legacy ? (
        <div className="om-admin-error" style={{ marginBottom: 12 }}>
          Some detail columns missing — run latest DB sync for full ID photos.
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
            ["Needs action", totals.needs_action],
            ["T2 ID pending", totals.t2_pending],
            ["T4 docs pending", totals.t4_pending],
            ["All pros", totals.total],
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
              ["needs_action", "Needs action"],
              ["t2_pending", "T2 pending"],
              ["t4_pending", "T4 pending"],
              ["all", "All"],
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
        </div>

        {rows.length === 0 ? (
          <p className="om-admin-muted" style={{ padding: 16 }}>
            No Repair Pros in this filter.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {rows.map((pr) => {
              const open = openId === pr.user_id;
              const L = pr.levels;
              return (
                <div
                  key={pr.user_id}
                  className="om-admin-panel"
                  style={{
                    margin: 0,
                    border: "1px solid var(--om-border)",
                    padding: 14,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 10,
                      justifyContent: "space-between",
                    }}
                  >
                    <div>
                      <strong>{pr.full_name}</strong>
                      <div className="om-admin-muted" style={{ fontSize: 12 }}>
                        {pr.business_name || pr.primary_service || "—"} ·{" "}
                        {pr.email || pr.phone || ""}
                      </div>
                      <div className="om-admin-muted" style={{ fontSize: 11 }}>
                        Status {pr.status}
                        {pr.pipeline_status
                          ? ` · pipeline ${pr.pipeline_status}`
                          : ""}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <span
                        className={`om-admin-badge ${badgeClass(L.t1_phone.status)}`}
                      >
                        T1
                      </span>
                      <span
                        className={`om-admin-badge ${badgeClass(L.t2_id.status)}`}
                      >
                        T2 {L.t2_id.status}
                      </span>
                      <span
                        className={`om-admin-badge ${badgeClass(L.t3_liveness.status)}`}
                      >
                        T3 {L.t3_liveness.status}
                      </span>
                      <span
                        className={`om-admin-badge ${badgeClass(L.t4_docs.status)}`}
                      >
                        T4 {L.t4_docs.status}
                      </span>
                      <span className="om-admin-badge">
                        Vis T{L.visibility.tier}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        className="om-admin-btn ghost"
                        onClick={() => setOpenId(open ? null : pr.user_id)}
                      >
                        {open ? "Hide" : "Open full review"}
                      </button>
                      {L.t2_id.status !== "approved" ? (
                        <button
                          type="button"
                          className="om-admin-btn om-admin-btn-primary"
                          disabled={busyId === pr.user_id}
                          onClick={() => void act(pr.user_id, "pro_t2_approve")}
                        >
                          Approve T2
                        </button>
                      ) : null}
                      {L.t4_docs.status === "pending" ? (
                        <button
                          type="button"
                          className="om-admin-btn om-admin-btn-primary"
                          disabled={busyId === pr.user_id}
                          onClick={() => void act(pr.user_id, "pro_t4_approve")}
                        >
                          Approve T4
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {open ? (
                    <div
                      style={{
                        marginTop: 14,
                        display: "grid",
                        gap: 12,
                        gridTemplateColumns:
                          "repeat(auto-fit, minmax(260px, 1fr))",
                      }}
                    >
                      <Section title="Account">
                        <Row label="Name" value={pr.full_name} />
                        <Row label="Business" value={pr.business_name} />
                        <Row label="Trade" value={pr.primary_service} />
                        <Row label="Email" value={pr.email} />
                        <Row label="Phone" value={pr.phone} />
                        <Row label="City" value={pr.city} />
                        <Row label="Bio" value={pr.bio} />
                        <Row label="Experience" value={pr.years_experience} />
                        <Row
                          label="User ID"
                          value={
                            <code style={{ fontSize: 10 }}>{pr.user_id}</code>
                          }
                        />
                      </Section>

                      <Section title={L.t1_phone.label}>
                        <Row
                          label="Status"
                          value={
                            <span
                              className={`om-admin-badge ${badgeClass(L.t1_phone.status)}`}
                            >
                              {L.t1_phone.status}
                            </span>
                          }
                        />
                        <Row label="Phone" value={L.t1_phone.phone} />
                      </Section>

                      <Section title={L.t2_id.label}>
                        <Row
                          label="Status"
                          value={
                            <span
                              className={`om-admin-badge ${badgeClass(L.t2_id.status)}`}
                            >
                              {L.t2_id.review_status || L.t2_id.status}
                            </span>
                          }
                        />
                        <Row label="ID type" value={L.t2_id.gov_id_kind} />
                        <Row
                          label="ID number"
                          value={
                            showFull[pr.user_id]
                              ? L.t2_id.gov_id_number || "—"
                              : L.t2_id.gov_id_last4
                                ? `••••${L.t2_id.gov_id_last4}`
                                : "—"
                          }
                        />
                        <Row
                          label="BVN / bank ID"
                          value={
                            showFull[pr.user_id]
                              ? L.t2_id.bank_id_number || "—"
                              : L.t2_id.bank_id_last4
                                ? `••••${L.t2_id.bank_id_last4}`
                                : "—"
                          }
                        />
                        <button
                          type="button"
                          className="om-admin-btn ghost"
                          style={{ marginBottom: 8 }}
                          onClick={() =>
                            setShowFull((s) => ({
                              ...s,
                              [pr.user_id]: !s[pr.user_id],
                            }))
                          }
                        >
                          {showFull[pr.user_id] ? "Hide numbers" : "Reveal numbers"}
                        </button>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <Thumb label="ID front" url={L.t2_id.front_url} />
                          <Thumb label="ID back" url={L.t2_id.back_url} />
                        </div>
                        <Row
                          label="Submitted"
                          value={fmtDate(L.t2_id.submitted_at)}
                        />
                        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                          <button
                            type="button"
                            className="om-admin-btn om-admin-btn-primary"
                            disabled={
                              busyId === pr.user_id ||
                              L.t2_id.status === "approved"
                            }
                            onClick={() =>
                              void act(pr.user_id, "pro_t2_approve")
                            }
                          >
                            Approve T2
                          </button>
                          <button
                            type="button"
                            className="om-admin-btn ghost"
                            disabled={busyId === pr.user_id}
                            onClick={() =>
                              void act(pr.user_id, "pro_t2_reject", {
                                reason: "ID rejected by care",
                              })
                            }
                          >
                            Reject T2
                          </button>
                        </div>
                      </Section>

                      <Section title={L.t3_liveness.label}>
                        <Row
                          label="Status"
                          value={
                            <span
                              className={`om-admin-badge ${badgeClass(L.t3_liveness.status)}`}
                            >
                              {L.t3_liveness.status}
                            </span>
                          }
                        />
                        <Row
                          label="Passed at"
                          value={fmtDate(L.t3_liveness.verified_at)}
                        />
                        <Thumb
                          label="Selfie"
                          url={L.t3_liveness.selfie_url}
                        />
                        <p className="om-admin-muted" style={{ fontSize: 11 }}>
                          Automatic (MediaPipe) — no manual approve required
                        </p>
                      </Section>

                      <Section title={L.t4_docs.label}>
                        <Row
                          label="Status"
                          value={
                            <span
                              className={`om-admin-badge ${badgeClass(L.t4_docs.status)}`}
                            >
                              {L.t4_docs.docs_status}
                            </span>
                          }
                        />
                        <Row label="File" value={L.t4_docs.file_name} />
                        {L.t4_docs.file_url ? (
                          <a
                            href={L.t4_docs.file_url}
                            target="_blank"
                            rel="noreferrer"
                            style={{ fontSize: 12 }}
                          >
                            Open skill document
                          </a>
                        ) : null}
                        <Row
                          label="Submitted"
                          value={fmtDate(L.t4_docs.submitted_at)}
                        />
                        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                          <button
                            type="button"
                            className="om-admin-btn om-admin-btn-primary"
                            disabled={
                              busyId === pr.user_id ||
                              L.t4_docs.status === "approved"
                            }
                            onClick={() =>
                              void act(pr.user_id, "pro_t4_approve")
                            }
                          >
                            Approve T4 docs
                          </button>
                          <button
                            type="button"
                            className="om-admin-btn ghost"
                            disabled={busyId === pr.user_id}
                            onClick={() =>
                              void act(pr.user_id, "pro_t4_reject")
                            }
                          >
                            Reject T4
                          </button>
                        </div>
                      </Section>

                      <Section title={L.visibility.label}>
                        <Row
                          label="Visibility tier"
                          value={`T${L.visibility.tier}`}
                        />
                        <Row
                          label="New badge"
                          value={L.visibility.is_new_artisan ? "Yes" : "No"}
                        />
                        <Row
                          label="Rating"
                          value={`${L.visibility.rating_avg.toFixed(1)} (${L.visibility.rating_count})`}
                        />
                        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                          {([2, 3, 4] as const).map((t) => (
                            <button
                              key={t}
                              type="button"
                              className="om-admin-btn ghost"
                              disabled={
                                busyId === pr.user_id ||
                                L.visibility.tier >= t
                              }
                              onClick={() =>
                                void act(pr.user_id, "pro_visibility", {
                                  visibilityTier: t,
                                })
                              }
                            >
                              Set Vis T{t}
                            </button>
                          ))}
                        </div>
                      </Section>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AdminShell>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      style={{
        background: "var(--om-bg)",
        borderRadius: 8,
        padding: 12,
      }}
    >
      <h3 style={{ margin: "0 0 8px", fontSize: 13 }}>{title}</h3>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div style={{ marginBottom: 6, fontSize: 12 }}>
      <div className="om-admin-muted" style={{ fontSize: 10 }}>
        {label}
      </div>
      <div style={{ wordBreak: "break-word" }}>{value || "—"}</div>
    </div>
  );
}

function Thumb({
  label,
  url,
}: {
  label: string;
  url: string | null | undefined;
}) {
  if (!url) {
    return (
      <div
        className="om-admin-muted"
        style={{
          width: 120,
          height: 80,
          border: "1px dashed var(--om-border)",
          borderRadius: 8,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 10,
        }}
      >
        No {label}
      </div>
    );
  }
  return (
    <a href={url} target="_blank" rel="noreferrer">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={label}
        style={{
          width: 120,
          height: 80,
          objectFit: "cover",
          borderRadius: 8,
          border: "1px solid var(--om-border)",
        }}
      />
      <div className="om-admin-muted" style={{ fontSize: 10 }}>
        {label}
      </div>
    </a>
  );
}
