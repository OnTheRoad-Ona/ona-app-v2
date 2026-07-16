"use client";

/**
 * Customer Care desk — primary daily workspace.
 * Search · live board · one-click actions · audit · sensitive unlock.
 */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { SensitiveUnlockBar } from "@/components/admin/sensitive-unlock";
import { useAdminGate } from "@/components/admin/use-admin-gate";

type CareStatus = {
  adminRole: string;
  roleLabel: string;
  fullName: string;
  email: string;
  sensitiveUnlocked: boolean;
  unlockExpiresAt: number | null;
};

type SearchHit = {
  kind: "user" | "job";
  id: string;
  title: string;
  subtitle: string;
};

type BoardJob = {
  id: string;
  flow_status?: string;
  status?: string;
  motorist_name?: string;
  repair_pro_name?: string;
  pickup_address?: string;
  agreed_major?: number;
  service_type?: string;
  escrow_status?: string;
  eta_text?: string;
  updated_at?: string;
};

type Board = {
  jobs: BoardJob[];
  byStatus: Record<string, number>;
  disputedCount: number;
  appealCount: number;
  platformFeePercent: number;
};

type DashboardTotals = {
  users: number;
  motorists: number;
  repairPros: number;
  pendingPros: number;
  openJobs: number;
  completedJobs: number;
  revenueNgn: number;
};

export default function CareDeskPage() {
  const { adminName, ready, api, error: gateError } = useAdminGate();
  const [status, setStatus] = useState<CareStatus | null>(null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [board, setBoard] = useState<Board | null>(null);
  const [dash, setDash] = useState<DashboardTotals | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [jobDetail, setJobDetail] = useState<{
    job: Record<string, unknown>;
    escrow: Record<string, unknown> | null;
  } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const unlocked = !!status?.sensitiveUnlocked;

  const refreshStatus = useCallback(async () => {
    const res = await api<CareStatus>("/api/admin/care/status");
    if (res.ok) setStatus(res.data);
    else if (res.status !== 401) setErr(res.message);
  }, [api]);

  const refreshBoard = useCallback(async () => {
    const res = await api<Board>("/api/admin/care/board");
    if (res.ok) setBoard(res.data);
  }, [api]);

  const refreshDash = useCallback(async () => {
    const res = await api<{ totals: DashboardTotals }>("/api/admin/dashboard");
    if (res.ok) setDash(res.data.totals);
  }, [api]);

  useEffect(() => {
    if (!ready) return;
    void refreshStatus();
    void refreshBoard();
    void refreshDash();
    const t = window.setInterval(() => {
      void refreshBoard();
      void refreshStatus();
      void refreshDash();
    }, 20_000);
    return () => window.clearInterval(t);
  }, [ready, refreshBoard, refreshStatus, refreshDash]);

  useEffect(() => {
    if (!ready || query.trim().length < 2) {
      setHits([]);
      return;
    }
    const t = window.setTimeout(async () => {
      const res = await api<{ hits: SearchHit[] }>(
        `/api/admin/care/search?q=${encodeURIComponent(query.trim())}`
      );
      if (res.ok) setHits(res.data.hits);
    }, 280);
    return () => window.clearTimeout(t);
  }, [query, ready, api]);

  const openJob = async (id: string) => {
    setSelectedJobId(id);
    setMsg(null);
    setErr(null);
    const res = await api<{
      job: Record<string, unknown>;
      escrow: Record<string, unknown> | null;
    }>(`/api/admin/care/job/${id}`);
    if (!res.ok) {
      setErr(res.message);
      setJobDetail(null);
      return;
    }
    setJobDetail(res.data);
  };

  const runAction = async (body: Record<string, unknown>) => {
    if (!unlocked) {
      setErr("Unlock sensitive mode first (password 336699).");
      return;
    }
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/care/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!json.ok) {
        setErr(json.error?.message || "Action failed");
        if (json.error?.code === "sensitive_locked") {
          void refreshStatus();
        }
        return;
      }
      setMsg(json.data?.message || "Done");
      void refreshBoard();
      void refreshDash();
      if (selectedJobId) void openJob(selectedJobId);
    } catch {
      setErr("Network error");
    } finally {
      setBusy(false);
      if (typeof document !== "undefined") {
        (document.activeElement as HTMLElement | null)?.blur?.();
      }
    }
  };

  const job = jobDetail?.job;
  const flow =
    (job?.status as string) ||
    (jobDetail?.job as { flow_status?: string })?.flow_status ||
    "";

  if (!ready) {
    return (
      <AdminShell adminName={adminName}>
        <h1 className="om-admin-h1">Dashboard</h1>
        <p className="om-admin-muted">
          {gateError || "Loading admin session…"}
        </p>
      </AdminShell>
    );
  }

  return (
    <AdminShell
      adminName={status?.fullName || adminName}
      roleLabel={status?.roleLabel}
    >
      <h1 className="om-admin-h1">Dashboard</h1>
      <p className="om-admin-sub">
        Overview + Customer Care tools. Search cases, watch live jobs, one-click
        escrow / freeze / dispute. Platform fee{" "}
        {board?.platformFeePercent ?? 5}% on release.
      </p>

      {/* Always-visible totals dashboard */}
      <div className="om-admin-cards">
        {(
          [
            ["Users", dash?.users, "/admin/users"],
            ["Motorists", dash?.motorists, "/admin/motorists"],
            ["Repair Pros", dash?.repairPros, "/admin/pros"],
            ["Pending Pros", dash?.pendingPros, "/admin/pros"],
            ["Open jobs", dash?.openJobs ?? board?.jobs.length, "/admin/jobs"],
            ["Completed", dash?.completedJobs, "/admin/jobs"],
            [
              "Revenue (₦)",
              dash != null ? dash.revenueNgn.toLocaleString() : undefined,
              "/admin/payments",
            ],
            ["Disputes", board?.disputedCount, "/admin/disputes"],
          ] as const
        ).map(([label, value, href]) => (
          <div className="om-admin-card" key={label}>
            <Link href={href}>
              <div className="label">{label}</div>
              <div className="value">{value ?? "…"}</div>
            </Link>
          </div>
        ))}
      </div>

      <SensitiveUnlockBar
        unlocked={unlocked}
        expiresAt={status?.unlockExpiresAt ?? null}
        onChange={(s) =>
          setStatus((prev) =>
            prev
              ? {
                  ...prev,
                  sensitiveUnlocked: s.unlocked,
                  unlockExpiresAt: s.expiresAt,
                }
              : prev
          )
        }
      />

      {err ? <div className="om-admin-error">{err}</div> : null}
      {msg ? (
        <div
          className="om-admin-panel"
          style={{ background: "var(--om-success-bg)", marginBottom: "1rem" }}
        >
          {msg}
        </div>
      ) : null}

      {/* Search */}
      <div className="om-admin-panel" style={{ marginBottom: "1rem" }}>
        <label className="om-admin-muted" style={{ display: "block", marginBottom: 6 }}>
          Search phone · name · job ID · plate
        </label>
        <input
          className="om-admin-input"
          style={{ width: "100%", maxWidth: 520 }}
          placeholder="e.g. 0803… or ABC-123 or job uuid"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {hits.length > 0 ? (
          <ul style={{ listStyle: "none", padding: 0, margin: "0.75rem 0 0" }}>
            {hits.map((h) => (
              <li key={`${h.kind}-${h.id}`} style={{ marginBottom: 6 }}>
                <button
                  type="button"
                  className="om-admin-btn ghost"
                  style={{ textAlign: "left", width: "100%" }}
                  onClick={() => {
                    if (h.kind === "job") void openJob(h.id);
                    else window.location.href = `/admin/users`; // directory
                  }}
                >
                  <strong>
                    [{h.kind}] {h.title}
                  </strong>
                  <br />
                  <span className="om-admin-muted">{h.subtitle}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {/* Live ops strip */}
      <h2 className="om-admin-section-title">Live ops</h2>
      <div className="om-admin-cards">
        {(
          [
            ["Live board", board?.jobs.length],
            ["Appeals", board?.appealCount],
            ["En route", board?.byStatus?.en_route],
            ["In progress", board?.byStatus?.in_progress],
            ["Paid/booked", board?.byStatus?.paid_booked],
            ["Negotiating", board?.byStatus?.negotiating],
          ] as const
        ).map(([label, value]) => (
          <div className="om-admin-card" key={label}>
            <div className="label">{label}</div>
            <div className="value">{value ?? "…"}</div>
          </div>
        ))}
      </div>

      <div className="om-care-split">
        {/* Live board */}
        <div className="om-admin-panel">
          <div className="om-admin-toolbar">
            <strong>Live job board</strong>
            <button
              type="button"
              className="om-admin-btn ghost"
              onClick={() => void refreshBoard()}
            >
              Refresh
            </button>
          </div>
          <div style={{ maxHeight: 420, overflow: "auto" }}>
            {(board?.jobs ?? []).length === 0 ? (
              <p className="om-admin-muted">No active jobs</p>
            ) : (
              <table className="om-admin-table">
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Parties</th>
                    <th>₦</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {(board?.jobs ?? []).map((j) => (
                    <tr
                      key={j.id}
                      style={
                        selectedJobId === j.id
                          ? { background: "var(--om-accent-soft)" }
                          : undefined
                      }
                    >
                      <td>
                        <code>{j.flow_status || j.status}</code>
                        {j.escrow_status ? (
                          <>
                            <br />
                            <span className="om-admin-muted" style={{ fontSize: 11 }}>
                              escrow:{j.escrow_status}
                            </span>
                          </>
                        ) : null}
                      </td>
                      <td style={{ fontSize: 12 }}>
                        {j.motorist_name || "—"}
                        <br />
                        <span className="om-admin-muted">
                          {j.repair_pro_name || "—"}
                        </span>
                      </td>
                      <td>
                        {j.agreed_major != null
                          ? Number(j.agreed_major).toLocaleString()
                          : "—"}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="om-admin-btn primary"
                          onClick={() => void openJob(j.id)}
                        >
                          Open
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <p style={{ marginTop: "0.75rem" }}>
            <Link href="/admin/jobs">Full jobs list →</Link>
            {" · "}
            <Link href="/admin/disputes">Disputes →</Link>
          </p>
        </div>

        {/* Job actions */}
        <div className="om-admin-panel">
          <strong>Case actions</strong>
          {!jobDetail ? (
            <p className="om-admin-muted" style={{ marginTop: "0.75rem" }}>
              Open a job from search or the live board.
            </p>
          ) : (
            <div style={{ marginTop: "0.75rem" }}>
              <p style={{ margin: "0 0 0.5rem" }}>
                <code>{String(job?.id || selectedJobId).slice(0, 13)}…</code>
                <br />
                Status: <strong>{String(job?.status || flow)}</strong>
                <br />
                Motorist: {String(job?.motoristName || job?.motorist_name || "—")}
                <br />
                Pro: {String(job?.repairProName || job?.repair_pro_name || "—")}
                <br />
                Address:{" "}
                {String(
                  job?.locationLabel || job?.pickup_address || "—"
                )}
              </p>

              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "0.5rem",
                  marginTop: "0.75rem",
                }}
              >
                <button
                  type="button"
                  className="om-admin-btn primary"
                  disabled={busy || !unlocked}
                  onClick={() =>
                    void runAction({
                      type: "release_escrow",
                      jobId: selectedJobId,
                    })
                  }
                >
                  Release escrow
                </button>
                <button
                  type="button"
                  className="om-admin-btn"
                  disabled={busy || !unlocked}
                  onClick={() =>
                    void runAction({
                      type: "refund_escrow",
                      jobId: selectedJobId,
                    })
                  }
                >
                  Refund motorist
                </button>
                <button
                  type="button"
                  className="om-admin-btn"
                  disabled={busy || !unlocked}
                  onClick={() =>
                    void runAction({
                      type: "resolve_dispute",
                      jobId: selectedJobId,
                      outcome: "full_release_pro",
                      kind: "dispute",
                    })
                  }
                >
                  Dispute → pay pro
                </button>
                <button
                  type="button"
                  className="om-admin-btn"
                  disabled={busy || !unlocked}
                  onClick={() =>
                    void runAction({
                      type: "resolve_dispute",
                      jobId: selectedJobId,
                      outcome: "full_refund_motorist",
                      kind: "dispute",
                    })
                  }
                >
                  Dispute → refund
                </button>
                {job?.motoristId || job?.motorist_id ? (
                  <>
                    <button
                      type="button"
                      className="om-admin-btn"
                      disabled={busy || !unlocked}
                      onClick={() =>
                        void runAction({
                          type: "freeze_user",
                          userId: String(job?.motoristId || job?.motorist_id),
                        })
                      }
                    >
                      Freeze motorist
                    </button>
                    <button
                      type="button"
                      className="om-admin-btn"
                      disabled={busy || !unlocked}
                      onClick={() =>
                        void runAction({
                          type: "unfreeze_user",
                          userId: String(job?.motoristId || job?.motorist_id),
                        })
                      }
                    >
                      Unfreeze motorist
                    </button>
                  </>
                ) : null}
                {job?.repairProId || job?.repair_pro_id ? (
                  <button
                    type="button"
                    className="om-admin-btn"
                    disabled={busy || !unlocked}
                    onClick={() =>
                      void runAction({
                        type: "freeze_user",
                        userId: String(job?.repairProId || job?.repair_pro_id),
                      })
                    }
                  >
                    Freeze pro
                  </button>
                ) : null}
              </div>
              <p className="om-admin-muted" style={{ marginTop: "0.75rem", fontSize: 12 }}>
                Every action is written to the audit trail with your staff ID and
                IP. 🔒 buttons need password unlock.
              </p>
              <p style={{ marginTop: "0.5rem" }}>
                <Link href="/admin/audit">View audit trail →</Link>
              </p>
            </div>
          )}
        </div>
      </div>

    </AdminShell>
  );
}
