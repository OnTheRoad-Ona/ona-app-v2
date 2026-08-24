"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminGuideBanner } from "@/components/admin/admin-guide-banner";

type MergeCandidate = {
  id: string;
  primary_user_id: string;
  duplicate_user_id: string;
  primary_name: string;
  primary_email: string | null;
  duplicate_name: string;
  duplicate_email: string | null;
  match_reason: string;
  match_detail: Record<string, unknown>;
  created_at: string;
};

type SyncEvent = {
  id: string;
  user_id: string | null;
  action: string;
  result: string;
  error: string | null;
  created_at: string;
};

type Board = {
  summary: {
    motoristOnly: number;
    proOnly: number;
    dual: number;
    total: number;
    needsSync: number;
    pendingMerges: number;
  };
  merges: MergeCandidate[];
  syncLog: SyncEvent[];
};

function fmt(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString([], { hour12: false });
}

const MATCH_LABELS: Record<string, string> = {
  nin_last4: "NIN (last 4)",
  bvn_last4: "BVN (last 4)",
  drivers_licence: "Driver's licence number",
  passport: "International passport number",
};

const SIGNAL_LABELS: Record<string, string> = {
  nin: "NIN last 4",
  bvn: "BVN last 4",
  drivers_licence: "Driver's licence",
  passport: "International passport",
};

function matchReasonLabel(reason: string): string {
  return MATCH_LABELS[reason] || reason.replace(/_/g, " ");
}

export default function AdminAccountsPage() {
  const router = useRouter();
  const [adminName, setAdminName] = useState("Admin");
  const [data, setData] = useState<Board | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyMerge, setBusyMerge] = useState<string | null>(null);
  const [primaryOverride, setPrimaryOverride] = useState<
    Record<string, "primary" | "duplicate">
  >({});
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/identity");
    const json = await res.json();
    if (!json.ok) {
      if (res.status === 401 || res.status === 403) {
        router.replace("/admin/login");
        return;
      }
      setError(json.error?.message || "Failed to load identity board");
      return;
    }
    setData(json.data);
    setError(null);
    setLastRefresh(new Date().toLocaleTimeString([], { hour12: false }));
  }, [router]);

  useEffect(() => {
    (async () => {
      const me = await fetch("/api/admin/auth/me");
      const meJson = await me.json();
      if (!meJson.ok) {
        router.replace("/admin/login");
        return;
      }
      setAdminName(meJson.data.fullName || meJson.data.email);
      await load();
    })();
  }, [load, router]);

  useEffect(() => {
    timerRef.current = window.setInterval(() => void load(), 30_000);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [load]);

  async function scan() {
    setMsg(null);
    setError(null);
    const res = await fetch("/api/admin/identity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "scan" }),
    });
    const json = await res.json();
    if (!json.ok) {
      setError(json.error?.message || "Scan failed");
      return;
    }
    setMsg(json.data.message);
    await load();
  }

  async function decide(candidate: MergeCandidate, action: "merge" | "reject") {
    setMsg(null);
    setError(null);
    setBusyMerge(candidate.id);
    const body: Record<string, unknown> = { action };
    if (action === "merge") {
      const which = primaryOverride[candidate.id] || "primary";
      body.primaryUserId =
        which === "primary"
          ? candidate.primary_user_id
          : candidate.duplicate_user_id;
    }
    const res = await fetch(`/api/admin/identity/merges/${candidate.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    setBusyMerge(null);
    if (!json.ok) {
      setError(json.error?.message || "Action failed");
      return;
    }
    setMsg(
      action === "merge"
        ? "Accounts merged into one identity history, roles and payout preserved."
        : "Merge candidate rejected.",
    );
    await load();
  }

  const statCards = useMemo(() => {
    const s = data?.summary;
    return [
      {
        label: "Customer only",
        value: s?.motoristOnly ?? "",
        sub: "motorist side only",
        tone: "available",
      },
      {
        label: "Repair Pro only",
        value: s?.proOnly ?? "",
        sub: "pro side only",
        tone: "pending",
      },
      {
        label: "Both roles",
        value: s?.dual ?? "",
        sub: "one identity, two roles",
        tone: "ledger",
      },
      {
        label: "Needs sync",
        value: s?.needsSync ?? "",
        sub: "role registry mismatch",
        tone: "held",
      },
      {
        label: "Pending merges",
        value: s?.pendingMerges ?? "",
        sub: "duplicate identities",
        tone: "failed",
      },
    ];
  }, [data]);

  return (
    <AdminShell adminName={adminName}>
      <h1 className="om-admin-h1">Accounts & identity sync</h1>
      <p className="om-admin-sub">
        One person = one identity with optional Customer + Repair Pro roles.
        Role registry, canonical payout record, merge queue and sync audit live
        here. Refresh {lastRefresh || "…"} (auto 30s).
      </p>

      <AdminGuideBanner pageId="users" />

      {error ? <div className="om-admin-error">{error}</div> : null}
      {msg ? (
        <div
          className="om-admin-error"
          style={{ background: "#14532d", color: "#bbf7d0", marginBottom: 12 }}
        >
          {msg}
        </div>
      ) : null}

      <div className="om-admin-stat-grid">
        {statCards.map((c) => (
          <div className="om-admin-stat-card" data-tone={c.tone} key={c.label}>
            <div className="om-admin-stat-label">{c.label}</div>
            <div className="om-admin-stat-value">{c.value}</div>
            <div className="om-admin-stat-sub">{c.sub}</div>
          </div>
        ))}
      </div>

      <div className="om-admin-panel" style={{ marginTop: 14 }}>
        <div className="om-admin-toolbar">
          <strong>
            Duplicate identities{" "}
            <span className="om-admin-muted">· review before merge</span>
          </strong>
          <button
            type="button"
            className="om-admin-btn"
            onClick={() => void scan()}
          >
            Scan for duplicates
          </button>
        </div>
        <div className="om-admin-table-scroll">
          <table className="om-admin-table">
            <thead>
              <tr>
                <th>Primary identity (keeps)</th>
                <th>Duplicate (merged in)</th>
                <th>Why matched</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {!data || data.merges.length === 0 ? (
                <tr>
                  <td colSpan={4} className="om-admin-muted">
                    No pending merge candidates. Run a scan to find duplicate
                    identities (matched by NIN/BVN last-4 across Customer and
                    Repair Pro accounts).
                  </td>
                </tr>
              ) : (
                data.merges.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <div style={{ fontWeight: 700 }}>{m.primary_name}</div>
                      <div className="om-admin-muted">
                        {m.primary_email || ""}
                      </div>
                      <div className="om-admin-muted" style={{ fontSize: 10 }}>
                        {m.primary_user_id.slice(0, 8)}…
                      </div>
                    </td>
                    <td>
                      <div>{m.duplicate_name}</div>
                      <div className="om-admin-muted">
                        {m.duplicate_email || ""}
                      </div>
                      <div className="om-admin-muted" style={{ fontSize: 10 }}>
                        {m.duplicate_user_id.slice(0, 8)}…
                      </div>
                    </td>
                    <td>
                      <div>{matchReasonLabel(m.match_reason)}</div>
                      <div className="om-admin-muted" style={{ fontSize: 10 }}>
                        {m.match_detail?.matched_signal
                          ? `${SIGNAL_LABELS[String(m.match_detail.matched_signal)] || m.match_detail.matched_signal} · ${String(m.match_detail.matched_value || "")}`
                          : ""}
                      </div>
                      <div className="om-admin-muted" style={{ fontSize: 10 }}>
                        queued {fmt(m.created_at)}
                      </div>
                    </td>
                    <td>
                      <div
                        className="om-admin-row-actions"
                        style={{
                          flexDirection: "column",
                          alignItems: "stretch",
                          gap: 4,
                        }}
                      >
                        <select
                          value={primaryOverride[m.id] || "primary"}
                          onChange={(e) =>
                            setPrimaryOverride((s) => ({
                              ...s,
                              [m.id]: e.target.value as "primary" | "duplicate",
                            }))
                          }
                        >
                          <option value="primary">
                            Primary keeps identity
                          </option>
                          <option value="duplicate">
                            Make the duplicate the primary
                          </option>
                        </select>
                        <div style={{ display: "flex", gap: 4 }}>
                          <button
                            type="button"
                            className="om-admin-btn"
                            disabled={busyMerge === m.id}
                            onClick={() => void decide(m, "merge")}
                          >
                            {busyMerge === m.id ? "…" : "Approve merge"}
                          </button>
                          <button
                            type="button"
                            className="om-admin-btn ghost"
                            disabled={busyMerge === m.id}
                            onClick={() => void decide(m, "reject")}
                          >
                            Reject
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

      <div className="om-admin-panel" style={{ marginTop: 14 }}>
        <div className="om-admin-toolbar">
          <strong>Recent identity sync events</strong>
        </div>
        <div className="om-admin-table-scroll">
          <table className="om-admin-table">
            <thead>
              <tr>
                <th>When</th>
                <th>User</th>
                <th>Action</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {!data || data.syncLog.length === 0 ? (
                <tr>
                  <td colSpan={4} className="om-admin-muted">
                    No sync events yet.
                  </td>
                </tr>
              ) : (
                data.syncLog.map((e) => (
                  <tr key={e.id}>
                    <td className="om-admin-muted">{fmt(e.created_at)}</td>
                    <td>
                      {e.user_id ? (
                        <a
                          href={`/admin/motorists/${e.user_id}`}
                          className="om-admin-muted"
                        >
                          {e.user_id.slice(0, 8)}…
                        </a>
                      ) : (
                        ""
                      )}
                    </td>
                    <td>{e.action}</td>
                    <td>
                      <span
                        className={`om-admin-badge ${
                          e.result === "error" ? "failed" : ""
                        }`}
                      >
                        {e.result}
                      </span>
                      {e.error ? (
                        <div
                          className="om-admin-muted"
                          style={{ fontSize: 10 }}
                        >
                          {e.error}
                        </div>
                      ) : null}
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
