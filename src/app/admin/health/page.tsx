"use client";

/**
 * Ona Control Centre Backend Health Monitoring
 * Protected admin-only page. Auto-refreshes every 60s.
 * INTEGRATION: POST /api/log-error from map onError, API catch, error boundaries.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminGuideBanner } from "@/components/admin/admin-guide-banner";
import { useAdminGate } from "@/components/admin/use-admin-gate";
import { StatusCard } from "@/components/health/StatusCard";
import { IssuesTable } from "@/components/health/IssuesTable";
import type { HealthLevel, HealthSnapshot } from "@/types/health";

const POLL_MS = 60_000;

function overallBadge(level: HealthLevel): string {
  if (level === "healthy") return "om-admin-badge approved";
  if (level === "warning") return "om-admin-badge pending";
  if (level === "critical") return "om-admin-badge rejected";
  return "om-admin-badge";
}

export default function AdminHealthPage() {
  const { adminName, ready, api } = useAdminGate();
  const [snapshot, setSnapshot] = useState<HealthSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState("");
  const [severityFilter, setSeverityFilter] = useState("");
  const [query, setQuery] = useState("");
  const lastCriticalRef = useRef<string>("");

  const load = useCallback(
    async (manual = false) => {
      if (manual) setRunning(true);
      else if (!snapshot) setLoading(true);
      setError(null);
      const res = await api<{ snapshot: HealthSnapshot }>("/api/health");
      setLoading(false);
      setRunning(false);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      const snap = res.data.snapshot;
      setSnapshot(snap);

      // Toast on new critical overall or critical component
      if (snap.overall === "critical") {
        const key = `${snap.checkedAt}-${snap.overall}`;
        if (key !== lastCriticalRef.current) {
          lastCriticalRef.current = key;
          setToast(
            "Critical health status detected. Review components and Recent Issues.",
          );
          window.setTimeout(() => setToast(null), 6000);
        }
      }
    },
    [api, snapshot],
  );

  useEffect(() => {
    if (!ready) return;
    void load(true);
    const id = window.setInterval(() => void load(false), POLL_MS);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  async function toggleResolved(id: string, resolved: boolean) {
    const res = await api("/api/admin/health/logs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, resolved }),
    });
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setSnapshot((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        issues: prev.issues.map((i) => (i.id === id ? { ...i, resolved } : i)),
      };
    });
  }

  const overall = snapshot?.overall || "unknown";

  return (
    <AdminShell adminName={adminName}>
      <div className="om-admin-toolbar" style={{ marginBottom: 4 }}>
        <div>
          <h1 className="om-admin-h1" style={{ marginBottom: 0 }}>
            System health
          </h1>
          <p className="om-admin-sub" style={{ marginBottom: 0 }}>
            Backend health: Supabase, payments, maps, and error signals. Use
            when the live app misbehaves.
          </p>
        </div>
        <button
          type="button"
          className="om-admin-btn"
          disabled={running || loading}
          onClick={() => void load(true)}
          style={{ marginLeft: "auto" }}
        >
          {running ? "Running…" : "Run full health check"}
        </button>
      </div>

      <AdminGuideBanner pageId="health" />

      {toast ? (
        <div
          role="status"
          className="om-admin-error"
          style={{
            background: "#7f1d1d",
            color: "#fecaca",
            marginBottom: 12,
          }}
        >
          {toast}
        </div>
      ) : null}
      {error ? <div className="om-admin-error">{error}</div> : null}

      <div
        className="om-admin-panel"
        style={{
          marginBottom: 16,
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 12,
        }}
      >
        <span className="om-admin-muted">Overall status</span>
        <span className={overallBadge(overall)} style={{ fontSize: 13 }}>
          {overall.toUpperCase()}
        </span>
        <span className="om-admin-muted" style={{ fontSize: 12 }}>
          Last checked:{" "}
          {snapshot?.checkedAt
            ? new Date(snapshot.checkedAt).toLocaleString()
            : ""}
          {snapshot?.live === false
            ? " · some metrics estimated (see card notes)"
            : ""}
        </span>
        <span className="om-admin-muted" style={{ fontSize: 11 }}>
          Auto-refresh every 60s
        </span>
      </div>

      <div
        className="om-admin-cards"
        style={{
          gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
          marginBottom: 18,
        }}
      >
        {(loading && !snapshot
          ? ([null, null, null, null, null] as const)
          : snapshot?.components || []
        ).map((c, idx) => (
          <StatusCard
            key={c && typeof c === "object" && "id" in c ? c.id : `sk-${idx}`}
            component={c && typeof c === "object" && "id" in c ? c : undefined}
            loading={loading && !snapshot}
          />
        ))}
      </div>

      <IssuesTable
        issues={snapshot?.issues || []}
        loading={loading && !snapshot}
        typeFilter={typeFilter}
        severityFilter={severityFilter}
        query={query}
        onTypeFilter={setTypeFilter}
        onSeverityFilter={setSeverityFilter}
        onQuery={setQuery}
        onToggleResolved={(id, resolved) => void toggleResolved(id, resolved)}
      />

      <p className="om-admin-muted" style={{ marginTop: 14, fontSize: 11 }}>
        Log from the app:{" "}
        <code>
          {`fetch('/api/log-error',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'Map Error',severity:'warning',message:'…',source:'maps'})})`}
        </code>
      </p>
    </AdminShell>
  );
}
