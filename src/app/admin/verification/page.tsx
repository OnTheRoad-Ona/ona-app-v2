"use client";

/**
 * Verification hub — manual review for:
 * · Customers: Tier 1 phone (auto) · Tier 2 ID (manual)
 * · Repair Pros: T1 phone auto · T2 ID/BVN manual · T3 liveness auto · T4 skill docs manual
 *   + visibility ladder T2–T4
 */

import { useCallback, useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { useAdminGate } from "@/components/admin/use-admin-gate";

type TierStatus = "auto" | "none" | "pending" | "approved" | "rejected";

type CustomerRow = {
  kind: "customer";
  user_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  label: string;
  t1_phone: "auto";
  t1_label: string;
  t2_status: TierStatus;
  t2_label: string;
  nin_last4: string | null;
  bvn_last4: string | null;
  nin_verified: boolean;
  bvn_verified: boolean;
  identity_verified_at: string | null;
  needs_action: boolean;
};

type ProRow = {
  kind: "repair_pro";
  user_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  label: string;
  status: string;
  t1_status: "auto";
  t1_label: string;
  t2_status: TierStatus;
  t2_label: string;
  nin_last4: string | null;
  bvn_last4: string | null;
  nin_verified: boolean;
  bvn_verified: boolean;
  t3_status: "auto";
  t3_label: string;
  t4_status: TierStatus;
  t4_label: string;
  docs_status: string;
  certification_file_name: string | null;
  certification_file_url: string | null;
  docs_rating_boost_applied: boolean;
  rating_avg: number;
  rating_count: number;
  visibility_tier: 1 | 2 | 3 | 4;
  is_new_artisan: boolean;
  needs_action: boolean;
};

type Totals = {
  customers: number;
  customerT2Pending: number;
  customerT2Approved: number;
  pros: number;
  proT2Pending: number;
  proT4Pending: number;
  proNeedsAction: number;
};

type Tab = "customers" | "repair_pros";

function badge(status: TierStatus | string) {
  if (status === "approved" || status === "auto") return "approved";
  if (status === "pending") return "pending";
  if (status === "rejected") return "rejected";
  return "";
}

export default function AdminVerificationPage() {
  const { adminName, ready, api } = useAdminGate();
  const [tab, setTab] = useState<Tab>("customers");
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [repairPros, setRepairPros] = useState<ProRow[]>([]);
  const [totals, setTotals] = useState<Totals>({
    customers: 0,
    customerT2Pending: 0,
    customerT2Approved: 0,
    pros: 0,
    proT2Pending: 0,
    proT4Pending: 0,
    proNeedsAction: 0,
  });
  const [pendingOnly, setPendingOnly] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await api<{
      customers: CustomerRow[];
      repairPros: ProRow[];
      totals: Totals;
    }>("/api/admin/verification");
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setError(null);
    setCustomers(res.data.customers);
    setRepairPros(res.data.repairPros);
    setTotals(res.data.totals);
  }, [api]);

  useEffect(() => {
    if (!ready) return;
    void load();
  }, [ready, load]);

  const act = async (
    body: Record<string, unknown>,
    busyKey: string
  ) => {
    setBusyId(busyKey);
    setError(null);
    setFlash(null);
    const res = await api<{ message?: string }>("/api/admin/verification", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusyId(null);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setFlash(res.data.message || "Updated.");
    await load();
  };

  const customerRows = pendingOnly
    ? customers.filter((c) => c.needs_action)
    : customers;
  const proRows = pendingOnly
    ? repairPros.filter((p) => p.needs_action)
    : repairPros;

  return (
    <AdminShell adminName={adminName}>
      <h1 className="om-admin-h1">Verification hub</h1>
      <p className="om-admin-sub">
        Manual review for Customer Tier 2 (ID) and Repair Pro Tier 2 (ID/BVN) +
        Tier 4 (skill docs). Tier 1 phone and Pro Tier 3 liveness are automatic.
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
        {(
          [
            ["Customers", totals.customers],
            ["Customer T2 pending", totals.customerT2Pending],
            ["Customer T2 approved", totals.customerT2Approved],
            ["Repair Pros", totals.pros],
            ["Pro T2 pending", totals.proT2Pending],
            ["Pro T4 pending", totals.proT4Pending],
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
          <button
            type="button"
            className={`om-admin-btn ${tab === "customers" ? "om-admin-btn-primary" : "ghost"}`}
            onClick={() => setTab("customers")}
          >
            Customers · T1–T2
          </button>
          <button
            type="button"
            className={`om-admin-btn ${tab === "repair_pros" ? "om-admin-btn-primary" : "ghost"}`}
            onClick={() => setTab("repair_pros")}
          >
            Repair Pros · T1–T4
          </button>
          <label
            style={{
              marginLeft: "auto",
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
            }}
          >
            <input
              type="checkbox"
              checked={pendingOnly}
              onChange={(e) => setPendingOnly(e.target.checked)}
            />
            Needs action only
          </label>
          <button type="button" className="om-admin-btn ghost" onClick={() => void load()}>
            Refresh
          </button>
        </div>

        {tab === "customers" ? (
          <>
            <p className="om-admin-muted" style={{ margin: "8px 0 12px", fontSize: 12 }}>
              <strong>T1 Phone</strong> — automatic (app OTP).{" "}
              <strong>T2 Government ID</strong> — customer upload; Approve
              unlocks full booking after free period. Prefer{" "}
              <a href="/admin/customer-review">Customer review</a> for the full
              queue + ID photo.
            </p>
            <table className="om-admin-table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Detail</th>
                  <th>T1 Phone</th>
                  <th>T2 ID</th>
                  <th>IDs on file</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {customerRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="om-admin-muted">
                      {pendingOnly
                        ? "No customers waiting for Tier 2 ID review."
                        : "No customers yet."}
                    </td>
                  </tr>
                ) : (
                  customerRows.map((c) => (
                    <tr key={c.user_id}>
                      <td>
                        <strong>{c.full_name}</strong>
                        <div className="om-admin-muted">{c.email || "—"}</div>
                        <div className="om-admin-muted">{c.phone || ""}</div>
                      </td>
                      <td>{c.label}</td>
                      <td>
                        <span className={`om-admin-badge ${badge("auto")}`}>
                          {c.t1_label}
                        </span>
                      </td>
                      <td>
                        <span className={`om-admin-badge ${badge(c.t2_status)}`}>
                          {c.t2_label}
                        </span>
                      </td>
                      <td className="om-admin-muted" style={{ fontSize: 11 }}>
                        NIN {c.nin_verified ? "✓" : "—"}
                        {c.nin_last4 ? ` …${c.nin_last4}` : ""}
                        <br />
                        BVN {c.bvn_verified ? "✓" : "—"}
                        {c.bvn_last4 ? ` …${c.bvn_last4}` : ""}
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {c.t2_status !== "approved" ? (
                            <button
                              type="button"
                              className="om-admin-btn om-admin-btn-primary"
                              disabled={busyId === c.user_id}
                              onClick={() =>
                                void act(
                                  {
                                    userId: c.user_id,
                                    subject: "customer",
                                    action: "customer_t2_approve",
                                  },
                                  c.user_id
                                )
                              }
                            >
                              {busyId === c.user_id ? "…" : "Approve T2 ID"}
                            </button>
                          ) : (
                            <button type="button" className="om-admin-btn done" disabled>
                              ✓ T2 approved
                            </button>
                          )}
                          {c.t2_status === "pending" || c.t2_status === "approved" ? (
                            <button
                              type="button"
                              className="om-admin-btn ghost"
                              disabled={busyId === c.user_id}
                              onClick={() =>
                                void act(
                                  {
                                    userId: c.user_id,
                                    subject: "customer",
                                    action: "customer_t2_reject",
                                  },
                                  c.user_id
                                )
                              }
                            >
                              Reject T2
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </>
        ) : (
          <>
            <p className="om-admin-muted" style={{ margin: "8px 0 12px", fontSize: 12 }}>
              <strong>T1 Phone</strong> auto · <strong>T2 ID/BVN</strong> manual
              (starts visibility ladder) · <strong>T3 Liveness</strong> auto ·{" "}
              <strong>T4 Skill docs</strong> manual (+1★ once). Visibility T2–T4
              controls Go Live / search weight.
            </p>
            <table className="om-admin-table">
              <thead>
                <tr>
                  <th>Repair Pro</th>
                  <th>Tiers</th>
                  <th>Visibility</th>
                  <th>T4 file</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {proRows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="om-admin-muted">
                      {pendingOnly
                        ? "No pros waiting on T2 ID or T4 skill docs."
                        : "No repair pros yet."}
                    </td>
                  </tr>
                ) : (
                  proRows.map((p) => (
                    <tr key={p.user_id}>
                      <td>
                        <strong>{p.full_name}</strong>
                        <div className="om-admin-muted">{p.label}</div>
                        <div className="om-admin-muted">
                          {p.email || p.phone || p.user_id.slice(0, 8)}
                        </div>
                        <div className="om-admin-muted">Status: {p.status}</div>
                      </td>
                      <td style={{ fontSize: 11, lineHeight: 1.5 }}>
                        <div>
                          <span className={`om-admin-badge ${badge(p.t1_status)}`}>
                            T1
                          </span>{" "}
                          {p.t1_label}
                        </div>
                        <div>
                          <span className={`om-admin-badge ${badge(p.t2_status)}`}>
                            T2
                          </span>{" "}
                          {p.t2_label}
                          {p.nin_last4 || p.bvn_last4 ? (
                            <span className="om-admin-muted">
                              {" "}
                              · NIN{p.nin_verified ? "✓" : "—"}
                              {p.nin_last4 ? `…${p.nin_last4}` : ""} · BVN
                              {p.bvn_verified ? "✓" : "—"}
                              {p.bvn_last4 ? `…${p.bvn_last4}` : ""}
                            </span>
                          ) : null}
                        </div>
                        <div>
                          <span className={`om-admin-badge ${badge(p.t3_status)}`}>
                            T3
                          </span>{" "}
                          {p.t3_label}
                        </div>
                        <div>
                          <span className={`om-admin-badge ${badge(p.t4_status)}`}>
                            T4
                          </span>{" "}
                          {p.t4_label}
                        </div>
                      </td>
                      <td>
                        <strong>T{p.visibility_tier}</strong>
                        {p.is_new_artisan ? (
                          <div className="om-admin-muted">New badge</div>
                        ) : null}
                        <div className="om-admin-muted">
                          ★ {Number(p.rating_avg).toFixed(1)}
                          {p.docs_rating_boost_applied ? " · boost" : ""}
                        </div>
                      </td>
                      <td className="om-admin-muted" style={{ fontSize: 11 }}>
                        {p.certification_file_url ? (
                          <a
                            href={p.certification_file_url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {p.certification_file_name || "Open file"}
                          </a>
                        ) : (
                          p.certification_file_name || "—"
                        )}
                      </td>
                      <td>
                        <div
                          style={{
                            display: "flex",
                            gap: 6,
                            flexWrap: "wrap",
                            maxWidth: 280,
                          }}
                        >
                          {p.t2_status !== "approved" ? (
                            <button
                              type="button"
                              className="om-admin-btn om-admin-btn-primary"
                              disabled={busyId === p.user_id}
                              onClick={() =>
                                void act(
                                  {
                                    userId: p.user_id,
                                    subject: "repair_pro",
                                    action: "pro_t2_approve",
                                  },
                                  p.user_id
                                )
                              }
                            >
                              Approve T2 ID
                            </button>
                          ) : null}
                          {p.t2_status === "pending" || p.t2_status === "approved" ? (
                            <button
                              type="button"
                              className="om-admin-btn ghost"
                              disabled={busyId === p.user_id}
                              onClick={() =>
                                void act(
                                  {
                                    userId: p.user_id,
                                    subject: "repair_pro",
                                    action: "pro_t2_reject",
                                  },
                                  p.user_id
                                )
                              }
                            >
                              Reject T2
                            </button>
                          ) : null}
                          {p.t4_status === "pending" ||
                          p.t4_status === "rejected" ? (
                            <button
                              type="button"
                              className="om-admin-btn om-admin-btn-primary"
                              disabled={busyId === p.user_id}
                              onClick={() =>
                                void act(
                                  {
                                    userId: p.user_id,
                                    subject: "repair_pro",
                                    action: "pro_t4_approve",
                                  },
                                  p.user_id
                                )
                              }
                            >
                              Approve T4 docs
                            </button>
                          ) : null}
                          {p.t4_status === "pending" ? (
                            <button
                              type="button"
                              className="om-admin-btn ghost"
                              disabled={busyId === p.user_id}
                              onClick={() =>
                                void act(
                                  {
                                    userId: p.user_id,
                                    subject: "repair_pro",
                                    action: "pro_t4_reject",
                                  },
                                  p.user_id
                                )
                              }
                            >
                              Reject T4
                            </button>
                          ) : null}
                          {p.t4_status === "approved" ? (
                            <button type="button" className="om-admin-btn done" disabled>
                              ✓ T4 approved
                            </button>
                          ) : null}
                          {/* Visibility ladder */}
                          {([2, 3, 4] as const).map((t) => (
                            <button
                              key={t}
                              type="button"
                              className="om-admin-btn ghost"
                              disabled={
                                busyId === p.user_id || p.visibility_tier >= t
                              }
                              title={`Set visibility Tier ${t}`}
                              onClick={() =>
                                void act(
                                  {
                                    userId: p.user_id,
                                    subject: "repair_pro",
                                    action: "pro_visibility",
                                    visibilityTier: t,
                                  },
                                  p.user_id
                                )
                              }
                            >
                              Vis T{t}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </>
        )}
      </div>
    </AdminShell>
  );
}
