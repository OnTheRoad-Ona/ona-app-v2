"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { useAdminGate } from "@/components/admin/use-admin-gate";
import { AdminGuideBanner } from "@/components/admin/admin-guide-banner";

type Cooldown = { proId: string; proName: string; until: string | null };

type DispatchJob = {
  id: string;
  flowStatus: string;
  serviceType: string;
  problem: string;
  createdAt: string;
  updatedAt: string;
  motoristId: string;
  motoristName: string;
  proId: string;
  proName: string;
  searchingSince: string | null;
  searchEndsAt: string | null;
  negotiateEndsAt: string | null;
  pairingStage: string | null;
  pairingDeadline: string | null;
  pairingRadiusKm: number | null;
  queuePosition: number | null;
  remainingCandidates: number | null;
  reservationStatus: string | null;
  assignmentStatus: string | null;
  chosenProId: string | null;
  chosenProName: string | null;
  meritScore: number | null;
  activeDeferrals: Cooldown[];
  activeExclusions: Cooldown[];
  historySummary: string[];
};

type Summary = {
  searching: number;
  negotiating: number;
  agreed: number;
  pairing: number;
  activeDeferrals: number;
  activeExclusions: number;
  crossJobExclusions: number;
};

function fmtClock(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour12: false });
}

function fmtLeft(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "now";
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${m}:${String(ss).padStart(2, "0")}`;
}

function StatusBadge({ status }: { status: string }) {
  const pairing =
    status === "waiting_for_selected" ||
    status === "selected_review" ||
    status === "sequential_pairing" ||
    status === "waiting_for_pro" ||
    status === "reserved";
  const tone = pairing
    ? "background:#818cf8;color:#1e1b4b"
    : status === "searching"
      ? "background:#fbbf24;color:#451a03"
      : status === "negotiating"
        ? "background:#fb923c;color:#431407"
        : "background:#34d399;color:#052e16";
  return (
    <span className="om-admin-badge" style={{ ...parseStyle(tone) }}>
      {status}
    </span>
  );
}

function parseStyle(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of s.split(";")) {
    const i = pair.indexOf(":");
    if (i > 0) out[pair.slice(0, i).trim()] = pair.slice(i + 1).trim();
  }
  return out;
}

export default function AdminDispatchPage() {
  const { adminName, ready, api, router } = useAdminGate();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [queue, setQueue] = useState<DispatchJob[]>([]);
  const [availablePros, setAvailablePros] = useState<{ id: string; name: string }[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reassignPro, setReassignPro] = useState<Record<string, string>>({});
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    const res = await api<{ summary: Summary; queue: DispatchJob[]; availablePros: { id: string; name: string }[] }>("/api/admin/dispatch");
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setSummary(res.data.summary);
    setQueue(res.data.queue);
    setAvailablePros(res.data.availablePros);
    setError(null);
    setLastRefresh(new Date().toLocaleTimeString([], { hour12: false }));
  }, [api]);

  useEffect(() => {
    if (!ready) return;
    void load();
    timerRef.current = window.setInterval(() => void load(), 5_000);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [ready, load]);

  const setProOptions = useMemo(() => {
    const m = new Map<string, string>(Object.entries(reassignPro));
    for (const j of queue) {
      if (!m.has(j.id)) m.set(j.id, j.proId || "");
    }
    return m;
  }, [queue, reassignPro]);

  async function runAction(action: string, job: DispatchJob) {
    setMsg(null);
    setError(null);
    setBusyId(job.id);
    const body: Record<string, unknown> = { action, jobId: job.id };
    if (action === "reassign") {
      const proId = setProOptions.get(job.id);
      if (!proId) {
        setError("Pick a pro first");
        setBusyId(null);
        return;
      }
      body.proId = proId;
      const pro = availablePros.find((p) => p.id === proId);
      if (pro) body.proName = pro.name;
    }
    const res = await api<{ job: DispatchJob }>("/api/admin/dispatch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusyId(null);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setMsg(`Done: ${action} → ${res.data.job.flowStatus}`);
    void load();
  }

  return (
    <AdminShell adminName={adminName}>
      <h1 className="om-admin-h1">Dispatch board</h1>
      <p className="om-admin-sub">
        Live request/dispatch monitoring — SSPE pairing (66s per pro), searching, negotiation,
        deferrals (5 min), per-request decline exclusions, and admin controls to reroute,
        reassign, clear cooldowns, or expire.
      </p>

      <AdminGuideBanner pageId="jobs" />

      {error ? <div className="om-admin-error">{error}</div> : null}
      {msg ? <div className="om-admin-success">{msg}</div> : null}

      <div className="om-admin-stat-grid">
        <div className="om-admin-stat-card" data-tone="held">
          <div className="om-admin-stat-label">Searching</div>
          <div className="om-admin-stat-value">{summary?.searching ?? "—"}</div>
          <div className="om-admin-stat-sub">awaiting a pro</div>
        </div>
        <div className="om-admin-stat-card" data-tone="pending">
          <div className="om-admin-stat-label">Pairing</div>
          <div className="om-admin-stat-value">{summary?.pairing ?? "—"}</div>
          <div className="om-admin-stat-sub">66s dispatch</div>
        </div>
        <div className="om-admin-stat-card" data-tone="pending">
          <div className="om-admin-stat-label">Negotiating</div>
          <div className="om-admin-stat-value">{summary?.negotiating ?? "—"}</div>
          <div className="om-admin-stat-sub">pro has the request</div>
        </div>
        <div className="om-admin-stat-card" data-tone="available">
          <div className="om-admin-stat-label">Agreed</div>
          <div className="om-admin-stat-value">{summary?.agreed ?? "—"}</div>
          <div className="om-admin-stat-sub">price agreed</div>
        </div>
        <div className="om-admin-stat-card" data-tone="ledger">
          <div className="om-admin-stat-label">Deferred</div>
          <div className="om-admin-stat-value">{summary?.activeDeferrals ?? "—"}</div>
          <div className="om-admin-stat-sub">pro “Later” (5 min)</div>
        </div>
        <div className="om-admin-stat-card" data-tone="failed">
          <div className="om-admin-stat-label">Excluded</div>
          <div className="om-admin-stat-value">
            {(summary?.activeExclusions ?? 0) + (summary?.crossJobExclusions ?? 0)}
          </div>
          <div className="om-admin-stat-sub">
            declined (per-request) · {summary?.crossJobExclusions ?? 0} cross-job
          </div>
        </div>
      </div>

      <div className="om-admin-panel" style={{ marginTop: 14 }}>
        <div className="om-admin-toolbar">
          <strong>
            Active requests{" "}
            <span className="om-admin-muted">
              · refresh {lastRefresh || "…"} (auto 5s)
            </span>
          </strong>
        </div>
        <div className="om-admin-table-scroll">
          <table className="om-admin-table">
            <thead>
              <tr>
                <th>Request</th>
                <th>Customer → Pro</th>
                <th>Status</th>
                <th>Cooldowns / timers</th>
                <th>Controls</th>
              </tr>
            </thead>
            <tbody>
              {queue.length === 0 ? (
                <tr>
                  <td colSpan={5} className="om-admin-muted">
                    No active requests right now.
                  </td>
                </tr>
              ) : (
                queue.map((j) => (
                  <tr key={j.id}>
                    <td>
                      <div style={{ fontWeight: 700 }}>{j.serviceType}</div>
                      <div className="om-admin-muted">{j.problem}</div>
                      <div className="om-admin-muted" style={{ fontSize: 10 }}>
                        {j.id.slice(0, 8)} · created {fmtClock(j.createdAt)}
                      </div>
                    </td>
                    <td>
                      <div>{j.motoristName}</div>
                      <div className="om-admin-muted">↓</div>
                      <div>{j.proName}</div>
                    </td>
                    <td>
                      <StatusBadge status={j.flowStatus} />
                      {j.pairingStage ? (
                        <div className="om-admin-muted" style={{ marginTop: 4, fontSize: 10, lineHeight: 1.5 }}>
                          stage {j.pairingStage}
                          {j.queuePosition ? ` · pos ${j.queuePosition}` : ""}
                          {j.remainingCandidates != null
                            ? ` · ${j.remainingCandidates} left`
                            : ""}
                          {j.pairingRadiusKm ? ` · ${j.pairingRadiusKm}km` : ""}
                        </div>
                      ) : null}
                      {j.pairingDeadline ? (
                        <div className="om-admin-muted" style={{ marginTop: 2, fontSize: 10 }}>
                          pairs in {fmtLeft(j.pairingDeadline)}
                        </div>
                      ) : null}
                      {j.meritScore != null ? (
                        <div className="om-admin-muted" style={{ marginTop: 2, fontSize: 10 }}>
                          merit {j.meritScore.toFixed(1)}
                        </div>
                      ) : null}
                      {j.reservationStatus === "confirmed" ? (
                        <div className="om-admin-muted" style={{ marginTop: 2, fontSize: 10 }}>
                          confirmed assignment
                        </div>
                      ) : null}
                      {j.searchEndsAt ? (
                        <div className="om-admin-muted" style={{ marginTop: 4, fontSize: 10 }}>
                          search ends {fmtLeft(j.searchEndsAt)}
                        </div>
                      ) : null}
                      {j.negotiateEndsAt ? (
                        <div className="om-admin-muted" style={{ marginTop: 2, fontSize: 10 }}>
                          negotiate ends {fmtLeft(j.negotiateEndsAt)}
                        </div>
                      ) : null}
                    </td>
                    <td>
                      {j.activeDeferrals.map((d) => (
                        <div key={`d-${d.proId}`} style={{ fontSize: 11, color: "#b45309" }}>
                          Deferred · {d.proName} until {fmtClock(d.until || "")} ({fmtLeft(d.until || "")})
                        </div>
                      ))}
                      {j.activeExclusions.map((e) => (
                        <div key={`e-${e.proId}`} style={{ fontSize: 11, color: "#b91c1c" }}>
                          Excluded · {e.proName}{" "}
                          {e.until ? `until ${fmtClock(e.until)} (${fmtLeft(e.until)})` : "per-request"}
                        </div>
                      ))}
                      {j.chosenProName ? (
                        <div style={{ fontSize: 11, color: "#6d28d9" }}>
                          Chosen: {j.chosenProName}
                        </div>
                      ) : null}
                      {j.activeDeferrals.length === 0 &&
                      j.activeExclusions.length === 0 &&
                      !j.chosenProName ? (
                        <span className="om-admin-muted">—</span>
                      ) : null}
                      <div className="om-admin-muted" style={{ marginTop: 4, fontSize: 10, lineHeight: 1.5 }}>
                        {j.historySummary.length ? j.historySummary.join(" · ") : "no events"}
                      </div>
                    </td>
                    <td>
                      <div className="om-admin-row-actions" style={{ flexDirection: "column", alignItems: "stretch", gap: 4 }}>
                        <div style={{ display: "flex", gap: 4 }}>
                          <button
                            type="button"
                            className="om-admin-btn"
                            disabled={busyId === j.id}
                            onClick={() => void runAction("reroute", j)}
                          >
                            {busyId === j.id ? "…" : "Reroute"}
                          </button>
                          <button
                            type="button"
                            className="om-admin-btn"
                            disabled={busyId === j.id}
                            onClick={() => void runAction("clear_cooldowns", j)}
                          >
                            Clear cooldowns
                          </button>
                          <button
                            type="button"
                            className="om-admin-btn"
                            style={{ background: "#dc2626", color: "#fff" }}
                            disabled={busyId === j.id}
                            onClick={() => void runAction("expire", j)}
                          >
                            Expire
                          </button>
                        </div>
                        <div style={{ display: "flex", gap: 4 }}>
                          <select
                            value={setProOptions.get(j.id) || ""}
                            onChange={(e) =>
                              setReassignPro((s) => ({ ...s, [j.id]: e.target.value }))
                            }
                            style={{ flex: 1, minWidth: 0 }}
                          >
                            <option value="">Choose pro…</option>
                            {availablePros.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className="om-admin-btn"
                            disabled={busyId === j.id}
                            onClick={() => void runAction("reassign", j)}
                          >
                            Assign
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AdminShell>
  );
}
