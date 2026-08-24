"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminGuideBanner } from "@/components/admin/admin-guide-banner";
import { withSensitivePassword } from "@/components/admin/sensitive-unlock";
import { useAdminGate } from "@/components/admin/use-admin-gate";
import type { JobRecord } from "@/lib/jobs/types";

export default function AdminDisputesPage() {
  const { adminName, ready, api } = useAdminGate();
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [totals, setTotals] = useState({ disputed: 0, underAppeal: 0 });
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [splitPct, setSplitPct] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    const res = await api<{
      jobs: JobRecord[];
      totals: { disputed: number; underAppeal: number };
    }>("/api/admin/disputes");
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setJobs(res.data.jobs);
    setTotals(res.data.totals);
  }, [api]);

  useEffect(() => {
    if (!ready) return;
    void load();
  }, [ready, load]);

  const resolve = async (
    jobId: string,
    kind: "dispute" | "appeal",
    outcome: "full_release_pro" | "full_refund_motorist" | "partial_split",
  ) => {
    setError(null);
    setFlash(null);
    await withSensitivePassword(
      {
        title: "Password required",
        detail: `Enter password to finalise this ${kind} decision.`,
      },
      async () => {
        setBusyId(jobId);
        try {
          const res = await api<{ job: JobRecord }>("/api/admin/disputes", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jobId,
              kind,
              outcome,
              proPercent: splitPct[jobId] ?? 70,
            }),
          });
          if (!res.ok) {
            setError(res.message);
            return;
          }
          setFlash(`Resolved ${jobId.slice(0, 8)}… → ${outcome}`);
          await load();
        } finally {
          setBusyId(null);
        }
      },
    );
  };

  return (
    <AdminShell adminName={adminName}>
      <h1 className="om-admin-h1">Disputes & appeals</h1>
      <p className="om-admin-sub">
        Jobs in dispute or appeal. Review evidence, lock funds in escrow, and
        resolve or escalate for Customer Care.
      </p>

      <AdminGuideBanner pageId="disputes" />

      {error ? <div className="om-admin-error">{error}</div> : null}
      {flash ? (
        <div
          className="om-admin-error"
          style={{
            background: "rgba(16,185,129,0.12)",
            color: "#059669",
          }}
        >
          {flash}
        </div>
      ) : null}

      <div className="om-admin-cards">
        <div className="om-admin-card">
          <div className="label">Disputed</div>
          <div className="value">{totals.disputed}</div>
        </div>
        <div className="om-admin-card">
          <div className="label">Under appeal</div>
          <div className="value">{totals.underAppeal}</div>
        </div>
        <div className="om-admin-card">
          <div className="label">Open queue</div>
          <div className="value">{jobs.length}</div>
        </div>
      </div>

      <div className="om-admin-panel">
        <div className="om-admin-toolbar">
          <strong>Active cases</strong>
        </div>
        <table className="om-admin-table">
          <thead>
            <tr>
              <th>Job</th>
              <th>Parties</th>
              <th>Status</th>
              <th>Reason</th>
              <th>Evidence</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {jobs.length === 0 ? (
              <tr>
                <td colSpan={6} className="om-admin-muted">
                  No open disputes. Cases appear when motorist or pro opens a
                  dispute after payment.
                </td>
              </tr>
            ) : (
              jobs.map((j) => (
                <tr key={j.id}>
                  <td>
                    <strong>{j.id.slice(0, 12)}…</strong>
                    <div className="om-admin-muted">
                      {j.agreedMajor != null
                        ? `${j.currency} ${j.agreedMajor}`
                        : ""}{" "}
                      · {j.serviceType}
                    </div>
                  </td>
                  <td>
                    <div>{j.motoristName}</div>
                    <div className="om-admin-muted">{j.repairProName}</div>
                  </td>
                  <td>
                    <span className="om-admin-badge">{j.status}</span>
                    {j.evidence?.priority === "auto_priority" ? (
                      <div className="om-admin-muted">AI priority</div>
                    ) : null}
                    {j.evidence?.priority === "request_more" ? (
                      <div className="om-admin-muted">Need more evidence</div>
                    ) : null}
                  </td>
                  <td>
                    {j.dispute?.reason || ""}
                    <div className="om-admin-muted">
                      {(j.dispute?.description || "").slice(0, 80)}
                    </div>
                  </td>
                  <td>
                    {j.evidence ? (
                      <>
                        <strong>{j.evidence.composite}</strong>/100
                        <div className="om-admin-muted">
                          P{j.evidence.photoScore} V{j.evidence.voiceScore} L
                          {j.evidence.locationScore} T
                          {j.evidence.timestampScore}
                        </div>
                      </>
                    ) : (
                      ""
                    )}
                  </td>
                  <td>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                        minWidth: 160,
                      }}
                    >
                      <label className="om-admin-muted">
                        Split % to pro
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={splitPct[j.id] ?? 70}
                          onChange={(e) =>
                            setSplitPct((p) => ({
                              ...p,
                              [j.id]: Number(e.target.value),
                            }))
                          }
                          style={{ width: 64, marginLeft: 6 }}
                        />
                      </label>
                      {j.status === "disputed" && (
                        <>
                          <button
                            type="button"
                            className="om-admin-btn"
                            disabled={busyId === j.id}
                            onClick={() =>
                              void resolve(j.id, "dispute", "full_release_pro")
                            }
                          >
                            Full → Pro
                          </button>
                          <button
                            type="button"
                            className="om-admin-btn"
                            disabled={busyId === j.id}
                            onClick={() =>
                              void resolve(
                                j.id,
                                "dispute",
                                "full_refund_motorist",
                              )
                            }
                          >
                            Full refund
                          </button>
                          <button
                            type="button"
                            className="om-admin-btn"
                            disabled={busyId === j.id}
                            onClick={() =>
                              void resolve(j.id, "dispute", "partial_split")
                            }
                          >
                            Partial split
                          </button>
                        </>
                      )}
                      {j.status === "under_appeal" && (
                        <>
                          <button
                            type="button"
                            className="om-admin-btn"
                            disabled={busyId === j.id}
                            onClick={() =>
                              void resolve(j.id, "appeal", "full_release_pro")
                            }
                          >
                            Uphold / Pro
                          </button>
                          <button
                            type="button"
                            className="om-admin-btn"
                            disabled={busyId === j.id}
                            onClick={() =>
                              void resolve(
                                j.id,
                                "appeal",
                                "full_refund_motorist",
                              )
                            }
                          >
                            Reverse / refund
                          </button>
                          <button
                            type="button"
                            className="om-admin-btn"
                            disabled={busyId === j.id}
                            onClick={() =>
                              void resolve(j.id, "appeal", "partial_split")
                            }
                          >
                            New split
                          </button>
                        </>
                      )}
                    </div>
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
