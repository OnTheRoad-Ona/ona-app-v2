"use client";

/**
 * Customer review — full multi-level package
 * Account · T1 Phone · T2 ID (number + images) · Trial · Approve / Reject
 */

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { useAdminGate } from "@/components/admin/use-admin-gate";

type LevelT1 = {
  status: string;
  phone: string | null;
  verified: boolean;
  verified_at: string | null;
  label: string;
};

type LevelT2 = {
  status: string;
  label: string;
  review_status: string;
  country_iso: string;
  gov_id_kind: string | null;
  gov_id_number: string | null;
  gov_id_last4: string | null;
  bank_id_number: string | null;
  bank_id_last4: string | null;
  front_url: string | null;
  back_url: string | null;
  has_front: boolean;
  has_back: boolean;
  submitted_at: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  checklist: Record<string, boolean>;
};

type LevelTrial = {
  first_service_at: string | null;
  trial_days: number;
  days_left: number | null;
  expired: boolean;
  label: string;
};

type CustomerReviewRow = {
  user_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  area: string | null;
  avatar_url: string | null;
  is_active: boolean;
  registered_at: string | null;
  address_text: string | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  vehicle_year: string | null;
  plate: string | null;
  levels: {
    t1_phone: LevelT1;
    t2_id: LevelT2;
    trial: LevelTrial;
  };
  identity_review_status: string;
  identity_submitted_at: string | null;
  gov_id_front_url: string | null;
  gov_id_back_url: string | null;
  gov_id_number: string | null;
  bank_id_number: string | null;
  gov_id_kind: string | null;
  has_photo: boolean;
  phone_verified: boolean;
  jobs_count: number;
  created_at: string;
};

type Totals = {
  submitted: number;
  approved: number;
  rejected: number;
  none?: number;
  total: number;
};

const CHECKLIST_KEYS = [
  { id: "photo_clear", label: "ID photo is clear & readable" },
  { id: "name_matches", label: "Name matches account profile" },
  { id: "number_matches", label: "ID number matches document" },
  { id: "not_expired", label: "Document not expired / valid" },
  { id: "not_fraud", label: "No signs of fraud / edit" },
] as const;

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function badgeClass(status: string) {
  if (status === "approved" || status === "verified") return "approved";
  if (status === "pending" || status === "submitted") return "pending";
  if (status === "rejected") return "rejected";
  return "";
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
  const [openId, setOpenId] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [showFullId, setShowFullId] = useState<Record<string, boolean>>({});
  const [checks, setChecks] = useState<Record<string, Record<string, boolean>>>(
    {}
  );
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
    const nextChecks: Record<string, Record<string, boolean>> = {};
    for (const c of res.data.customers) {
      nextChecks[c.user_id] = { ...(c.levels?.t2_id?.checklist || {}) };
    }
    setChecks(nextChecks);
  }, [api, filter]);

  useEffect(() => {
    if (!ready) return;
    void load();
  }, [ready, load]);

  const act = async (
    userId: string,
    action: string,
    extra?: { reason?: string; checklist?: Record<string, boolean> }
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
        reason: extra?.reason,
        checklist: extra?.checklist,
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
      <h1 className="om-admin-h1">Customer review · all levels</h1>
      <p className="om-admin-sub">
        Full care package: account data, Tier 1 phone, Tier 2 government ID
        (type, full number, front/back photos), free-period status. Approve only
        after checklist.
      </p>

      {legacy ? (
        <div className="om-admin-error" style={{ marginBottom: 12 }}>
          Legacy mode — run DB sync for full photo/number columns (
          <code>20260721_028_review_detail_fields.sql</code>).
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
            ["Pending T2", totals.submitted],
            ["Approved", totals.approved],
            ["Rejected", totals.rejected],
            ["Listed", totals.total],
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
              ["submitted", "Pending review"],
              ["approved", "Approved"],
              ["rejected", "Rejected"],
              ["all", "All customers"],
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

        {rows.length === 0 ? (
          <p className="om-admin-muted" style={{ padding: 16 }}>
            {filter === "submitted"
              ? "No customers waiting for ID review. New submits from the app appear here with full numbers and photos."
              : "No rows for this filter."}
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {rows.map((c) => {
              const open = openId === c.user_id;
              const t1 = c.levels?.t1_phone;
              const t2 = c.levels?.t2_id;
              const trial = c.levels?.trial;
              const ck = checks[c.user_id] || {};
              const checklistOk = CHECKLIST_KEYS.every((k) => ck[k.id]);

              return (
                <div
                  key={c.user_id}
                  className="om-admin-panel"
                  style={{
                    margin: 0,
                    border: "1px solid var(--om-border)",
                    padding: 14,
                  }}
                >
                  {/* Summary row */}
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 12,
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                    }}
                  >
                    <div style={{ minWidth: 200, flex: 1 }}>
                      <strong style={{ fontSize: 15 }}>{c.full_name}</strong>
                      <div className="om-admin-muted" style={{ fontSize: 12 }}>
                        {c.email || "—"} · {c.phone || "No phone"}
                      </div>
                      <div className="om-admin-muted" style={{ fontSize: 11 }}>
                        {[c.city, c.area].filter(Boolean).join(", ") || "—"}
                        {c.vehicle_make
                          ? ` · ${[c.vehicle_make, c.vehicle_model, c.plate]
                              .filter(Boolean)
                              .join(" ")}`
                          : ""}
                        {` · ${c.jobs_count} jobs`}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <span
                        className={`om-admin-badge ${badgeClass(t1?.status || "")}`}
                      >
                        T1 {t1?.verified ? "phone ✓" : "phone"}
                      </span>
                      <span
                        className={`om-admin-badge ${badgeClass(t2?.status || c.identity_review_status)}`}
                      >
                        T2 {t2?.status || c.identity_review_status}
                      </span>
                      {trial?.expired ? (
                        <span className="om-admin-badge rejected">
                          Free period ended
                        </span>
                      ) : trial?.first_service_at ? (
                        <span className="om-admin-badge pending">
                          Free {trial.days_left ?? "?"}d left
                        </span>
                      ) : null}
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        className="om-admin-btn ghost"
                        onClick={() =>
                          setOpenId(open ? null : c.user_id)
                        }
                      >
                        {open ? "Hide details" : "Open full review"}
                      </button>
                      {c.identity_review_status !== "approved" ? (
                        <button
                          type="button"
                          className="om-admin-btn om-admin-btn-primary"
                          disabled={
                            busyId === c.user_id ||
                            (open && !checklistOk)
                          }
                          title={
                            open && !checklistOk
                              ? "Complete checklist first"
                              : "Approve Tier 2"
                          }
                          onClick={() => {
                            if (!open) {
                              setOpenId(c.user_id);
                              setFlash(
                                "Open full review and complete checklist before approve."
                              );
                              return;
                            }
                            void act(c.user_id, "approve_t2");
                          }}
                        >
                          {busyId === c.user_id ? "…" : "Approve T2"}
                        </button>
                      ) : (
                        <button type="button" className="om-admin-btn done" disabled>
                          ✓ T2 approved
                        </button>
                      )}
                      {c.identity_review_status === "submitted" ||
                      c.identity_review_status === "approved" ? (
                        <button
                          type="button"
                          className="om-admin-btn ghost"
                          disabled={busyId === c.user_id}
                          onClick={() => {
                            setOpenId(c.user_id);
                            setRejectId(c.user_id);
                          }}
                        >
                          Reject T2
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {/* Full multi-level detail */}
                  {open ? (
                    <div
                      style={{
                        marginTop: 16,
                        display: "grid",
                        gap: 14,
                        gridTemplateColumns:
                          "repeat(auto-fit, minmax(280px, 1fr))",
                      }}
                    >
                      {/* Account */}
                      <section
                        style={{
                          background: "var(--om-bg)",
                          borderRadius: 8,
                          padding: 12,
                        }}
                      >
                        <h3 style={{ margin: "0 0 8px", fontSize: 13 }}>
                          Account
                        </h3>
                        <Detail
                          label="User ID"
                          value={
                            <code style={{ fontSize: 10 }}>{c.user_id}</code>
                          }
                        />
                        <Detail label="Full name" value={c.full_name} />
                        <Detail label="Email" value={c.email} />
                        <Detail label="Phone" value={c.phone} />
                        <Detail
                          label="City / area"
                          value={[c.city, c.area].filter(Boolean).join(", ")}
                        />
                        <Detail label="Address" value={c.address_text} />
                        <Detail
                          label="Registered"
                          value={fmtDate(c.registered_at)}
                        />
                        <Detail
                          label="Active"
                          value={c.is_active ? "Yes" : "No"}
                        />
                        <Detail
                          label="Vehicle"
                          value={[
                            c.vehicle_make,
                            c.vehicle_model,
                            c.vehicle_year,
                            c.plate,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        />
                        <Detail label="Jobs" value={String(c.jobs_count)} />
                      </section>

                      {/* T1 */}
                      <section
                        style={{
                          background: "var(--om-bg)",
                          borderRadius: 8,
                          padding: 12,
                        }}
                      >
                        <h3 style={{ margin: "0 0 8px", fontSize: 13 }}>
                          {t1?.label || "Tier 1 · Phone"}
                        </h3>
                        <Detail
                          label="Status"
                          value={
                            <span
                              className={`om-admin-badge ${badgeClass(t1?.status || "")}`}
                            >
                              {t1?.status}
                            </span>
                          }
                        />
                        <Detail label="Phone number" value={t1?.phone} />
                        <Detail
                          label="Verified at"
                          value={fmtDate(t1?.verified_at)}
                        />
                        <Detail
                          label="Mode"
                          value="Automatic (app OTP) · care can force-verify"
                        />
                        {!t1?.verified ? (
                          <button
                            type="button"
                            className="om-admin-btn om-admin-btn-primary"
                            style={{ marginTop: 10 }}
                            disabled={busyId === c.user_id}
                            onClick={() =>
                              void act(c.user_id, "mark_phone_verified")
                            }
                          >
                            Mark phone verified
                          </button>
                        ) : (
                          <p
                            className="om-admin-muted"
                            style={{ marginTop: 10, fontSize: 12 }}
                          >
                            ✓ Phone level complete
                          </p>
                        )}
                      </section>

                      {/* T2 ID data */}
                      <section
                        style={{
                          background: "var(--om-bg)",
                          borderRadius: 8,
                          padding: 12,
                          gridColumn: "1 / -1",
                        }}
                      >
                        <h3 style={{ margin: "0 0 8px", fontSize: 13 }}>
                          {t2?.label || "Tier 2 · Government ID"}
                        </h3>
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns:
                              "repeat(auto-fit, minmax(200px, 1fr))",
                            gap: 10,
                          }}
                        >
                          <div>
                            <Detail
                              label="Review status"
                              value={
                                <span
                                  className={`om-admin-badge ${badgeClass(t2?.status || "")}`}
                                >
                                  {t2?.review_status || t2?.status}
                                </span>
                              }
                            />
                            <Detail
                              label="Country"
                              value={t2?.country_iso || "—"}
                            />
                            <Detail
                              label="ID type"
                              value={t2?.gov_id_kind || c.gov_id_kind || "—"}
                            />
                            <Detail
                              label="ID number (full)"
                              value={
                                <span>
                                  {showFullId[c.user_id]
                                    ? t2?.gov_id_number ||
                                      c.gov_id_number ||
                                      "—"
                                    : t2?.gov_id_last4
                                      ? `••••${t2.gov_id_last4}`
                                      : "—"}{" "}
                                  {(t2?.gov_id_number || c.gov_id_number) && (
                                    <button
                                      type="button"
                                      className="om-admin-btn ghost"
                                      style={{
                                        padding: "2px 8px",
                                        fontSize: 11,
                                        marginLeft: 6,
                                      }}
                                      onClick={() =>
                                        setShowFullId((s) => ({
                                          ...s,
                                          [c.user_id]: !s[c.user_id],
                                        }))
                                      }
                                    >
                                      {showFullId[c.user_id]
                                        ? "Hide"
                                        : "Reveal"}
                                    </button>
                                  )}
                                </span>
                              }
                            />
                            <Detail
                              label="Secondary / BVN"
                              value={
                                showFullId[c.user_id]
                                  ? t2?.bank_id_number ||
                                    c.bank_id_number ||
                                    "—"
                                  : t2?.bank_id_last4
                                    ? `••••${t2.bank_id_last4}`
                                    : "—"
                              }
                            />
                            <Detail
                              label="Submitted"
                              value={fmtDate(
                                t2?.submitted_at || c.identity_submitted_at
                              )}
                            />
                            <Detail
                              label="Reviewed"
                              value={fmtDate(t2?.reviewed_at)}
                            />
                            {t2?.rejection_reason ? (
                              <Detail
                                label="Rejection"
                                value={t2.rejection_reason}
                              />
                            ) : null}
                          </div>

                          {/* Images */}
                          <div>
                            <p
                              style={{
                                fontSize: 11,
                                fontWeight: 700,
                                margin: "0 0 6px",
                              }}
                            >
                              ID images
                            </p>
                            <div
                              style={{
                                display: "flex",
                                gap: 10,
                                flexWrap: "wrap",
                              }}
                            >
                              <PhotoBox
                                label="Front"
                                url={t2?.front_url || c.gov_id_front_url}
                              />
                              <PhotoBox
                                label="Back"
                                url={t2?.back_url || c.gov_id_back_url}
                              />
                            </div>
                          </div>

                          {/* Checklist */}
                          <div>
                            <p
                              style={{
                                fontSize: 11,
                                fontWeight: 700,
                                margin: "0 0 6px",
                              }}
                            >
                              Approval checklist
                            </p>
                            <ul
                              style={{
                                listStyle: "none",
                                margin: 0,
                                padding: 0,
                              }}
                            >
                              {CHECKLIST_KEYS.map((k) => (
                                <li key={k.id} style={{ marginBottom: 6 }}>
                                  <label
                                    style={{
                                      display: "flex",
                                      gap: 8,
                                      alignItems: "center",
                                      fontSize: 12,
                                      cursor: "pointer",
                                    }}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={Boolean(ck[k.id])}
                                      onChange={(e) => {
                                        const next = {
                                          ...ck,
                                          [k.id]: e.target.checked,
                                        };
                                        setChecks((s) => ({
                                          ...s,
                                          [c.user_id]: next,
                                        }));
                                      }}
                                    />
                                    {k.label}
                                  </label>
                                </li>
                              ))}
                            </ul>
                            <button
                              type="button"
                              className="om-admin-btn ghost"
                              style={{ marginTop: 6 }}
                              onClick={() =>
                                void act(c.user_id, "save_checklist", {
                                  checklist: ck,
                                })
                              }
                            >
                              Save checklist
                            </button>
                          </div>
                        </div>

                        {/* Trial */}
                        <div
                          style={{
                            marginTop: 12,
                            paddingTop: 10,
                            borderTop: "1px solid var(--om-border-soft)",
                          }}
                        >
                          <strong style={{ fontSize: 12 }}>
                            {trial?.label || "Free period"}
                          </strong>
                          <div
                            className="om-admin-muted"
                            style={{ fontSize: 12, marginTop: 4 }}
                          >
                            First request:{" "}
                            {fmtDate(trial?.first_service_at)} · Days left:{" "}
                            {trial?.days_left == null
                              ? "not started"
                              : trial.expired
                                ? "ended"
                                : trial.days_left}
                          </div>
                        </div>

                        {rejectId === c.user_id ? (
                          <div style={{ marginTop: 12 }}>
                            <input
                              className="om-admin-input"
                              placeholder="Rejection reason (required for customer)"
                              value={reason}
                              onChange={(e) => setReason(e.target.value)}
                              style={{ width: "100%", marginBottom: 8 }}
                            />
                            <div style={{ display: "flex", gap: 8 }}>
                              <button
                                type="button"
                                className="om-admin-btn om-admin-btn-primary"
                                disabled={
                                  busyId === c.user_id || !reason.trim()
                                }
                                onClick={() =>
                                  void act(c.user_id, "reject_t2", {
                                    reason: reason.trim(),
                                  })
                                }
                              >
                                Confirm reject T2
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

                        <div
                          style={{
                            marginTop: 12,
                            display: "flex",
                            gap: 8,
                            flexWrap: "wrap",
                          }}
                        >
                          {c.identity_review_status !== "approved" ? (
                            <button
                              type="button"
                              className="om-admin-btn om-admin-btn-primary"
                              disabled={busyId === c.user_id || !checklistOk}
                              onClick={() => void act(c.user_id, "approve_t2")}
                            >
                              {checklistOk
                                ? "Approve Tier 2 (ID + numbers + photos)"
                                : "Complete checklist to approve"}
                            </button>
                          ) : null}
                        </div>
                      </section>
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

function Detail({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div style={{ marginBottom: 6, fontSize: 12 }}>
      <div className="om-admin-muted" style={{ fontSize: 10 }}>
        {label}
      </div>
      <div style={{ wordBreak: "break-word" }}>{value || "—"}</div>
    </div>
  );
}

function PhotoBox({
  label,
  url,
}: {
  label: string;
  url: string | null | undefined;
}) {
  if (!url) {
    return (
      <div
        style={{
          width: 160,
          height: 110,
          borderRadius: 8,
          background: "var(--om-panel-2)",
          border: "1px dashed var(--om-border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 11,
          color: "var(--om-text-muted)",
        }}
      >
        No {label.toLowerCase()}
      </div>
    );
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" style={{ display: "block" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={`ID ${label}`}
        style={{
          width: 160,
          height: 110,
          objectFit: "cover",
          borderRadius: 8,
          border: "1px solid var(--om-border)",
          display: "block",
        }}
      />
      <div
        className="om-admin-muted"
        style={{ fontSize: 10, marginTop: 4, textAlign: "center" }}
      >
        {label} · open full
      </div>
    </a>
  );
}
