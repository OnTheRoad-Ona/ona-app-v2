"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";

type UserRow = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  role: string;
  is_active?: boolean;
  created_at?: string;
  repair_pro_profiles?:
    | {
        status: string;
        primary_service: string;
        verified: boolean;
        is_online?: boolean;
      }
    | Array<{
        status: string;
        primary_service: string;
        verified: boolean;
        is_online?: boolean;
      }>
    | null;
};

type ProStatus = "pending" | "approved" | "suspended" | "rejected";

function proMeta(u: UserRow) {
  const raw = u.repair_pro_profiles;
  if (!raw) return null;
  return Array.isArray(raw) ? raw[0] : raw;
}

function blurActive() {
  if (typeof document !== "undefined") {
    (document.activeElement as HTMLElement | null)?.blur?.();
  }
}

export default function AdminProsPage() {
  const router = useRouter();
  const [adminName, setAdminName] = useState("Admin");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [loadError, setLoadError] = useState<string | null>(null);
  const [totals, setTotals] = useState<{
    total: number;
    pending: number;
    approved: number;
    online: number;
  } | null>(null);

  const load = useCallback(async () => {
    // Load from repair_pro_profiles (not profiles.role only) so dual accounts show
    const res = await fetch("/api/admin/pros");
    const json = await res.json();
    if (!json.ok) {
      if (res.status === 401) {
        router.replace("/admin/login");
        return;
      }
      setLoadError(json.error?.message || "Failed to load Repair Pros");
      return;
    }
    setLoadError(null);
    setUsers(json.data.users || []);
    if (json.data.totals) setTotals(json.data.totals);
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

  async function setStatus(id: string, status: ProStatus) {
    setMsg(null);
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/pros/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const json = await res.json();
      if (!json.ok) {
        setMsg(json.error?.message || "Failed");
        return;
      }
      // Optimistic UI: switch button state immediately so Approve no longer lights up
      setUsers((prev) =>
        prev.map((u) => {
          if (u.id !== id) return u;
          const meta = proMeta(u);
          const nextMeta = {
            status,
            primary_service: meta?.primary_service || "",
            verified: status === "approved",
            is_online: meta?.is_online,
          };
          return { ...u, repair_pro_profiles: nextMeta };
        })
      );
      setMsg(
        status === "approved"
          ? "Approved — button is settled (no longer a call-to-action)"
          : `Saved pro status → ${status}`
      );
      await load();
    } finally {
      setBusyId(null);
      blurActive();
    }
  }

  return (
    <AdminShell adminName={adminName}>
      <h1 className="om-admin-h1">Repair Pros</h1>
      <p className="om-admin-sub">
        All pros from the database (including dual-account users). Approve,
        suspend, or reject. After Approve, the button settles to a quiet state.
      </p>
      {totals ? (
        <div className="om-admin-cards">
          {(
            [
              ["Total", totals.total],
              ["Pending", totals.pending],
              ["Approved", totals.approved],
              ["Online now", totals.online],
            ] as const
          ).map(([label, value]) => (
            <div className="om-admin-card" key={label}>
              <div className="label">{label}</div>
              <div className="value">{value}</div>
            </div>
          ))}
        </div>
      ) : null}
      {loadError ? <div className="om-admin-error">{loadError}</div> : null}
      {msg ? (
        <div
          className="om-admin-error"
          style={{ background: "#14532d", color: "#bbf7d0", marginBottom: 12 }}
        >
          {msg}
        </div>
      ) : null}
      <div className="om-admin-panel">
        <div className="om-admin-toolbar">
          <button type="button" className="om-admin-btn ghost" onClick={() => void load()}>
            Refresh
          </button>
        </div>
        <table className="om-admin-table">
          <thead>
            <tr>
              <th>Pro</th>
              <th>Service</th>
              <th>Online</th>
              <th>Status</th>
              <th>Joined</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan={6} className="om-admin-muted">
                  {loadError
                    ? "Could not load pros — see error above."
                    : "No Repair Pros in the database yet. Sign-ups write to repair_pro_profiles and appear here after refresh."}
                </td>
              </tr>
            ) : (
              users.map((u) => {
                const pro = proMeta(u);
                const status = (pro?.status || "pending") as ProStatus;
                const busy = busyId === u.id;
                return (
                  <tr key={u.id}>
                    <td>
                      <div>{u.full_name || "— (no name)"}</div>
                      <div className="om-admin-muted">{u.email}</div>
                      <div className="om-admin-muted">{u.phone || ""}</div>
                    </td>
                    <td>{pro?.primary_service || "—"}</td>
                    <td>
                      <span
                        className={`om-admin-badge ${
                          pro?.is_online ? "approved" : "suspended"
                        }`}
                      >
                        {pro?.is_online ? "online" : "offline"}
                      </span>
                    </td>
                    <td>
                      <span className={`om-admin-badge ${status}`}>
                        {status}
                      </span>
                      {u.is_active === false ? (
                        <div className="om-admin-muted">account inactive</div>
                      ) : null}
                    </td>
                    <td className="om-admin-muted">
                      {u.created_at
                        ? new Date(u.created_at).toLocaleString()
                        : "—"}
                    </td>
                    <td>
                      <div className="om-admin-row-actions">
                        {/* Current status = settled (not lit CTA). Others = quiet ghost. */}
                        <button
                          type="button"
                          className={
                            status === "approved"
                              ? "om-admin-btn done"
                              : "om-admin-btn ghost"
                          }
                          disabled={busy || status === "approved"}
                          aria-pressed={status === "approved"}
                          onClick={() => void setStatus(u.id, "approved")}
                        >
                          {status === "approved"
                            ? "✓ Approved"
                            : busy
                              ? "…"
                              : "Approve"}
                        </button>
                        <button
                          type="button"
                          className={
                            status === "suspended"
                              ? "om-admin-btn done"
                              : "om-admin-btn ghost"
                          }
                          disabled={busy || status === "suspended"}
                          aria-pressed={status === "suspended"}
                          onClick={() => void setStatus(u.id, "suspended")}
                        >
                          {status === "suspended" ? "✓ Suspended" : "Suspend"}
                        </button>
                        <button
                          type="button"
                          className={
                            status === "rejected"
                              ? "om-admin-btn done"
                              : "om-admin-btn ghost"
                          }
                          disabled={busy || status === "rejected"}
                          aria-pressed={status === "rejected"}
                          onClick={() => void setStatus(u.id, "rejected")}
                        >
                          {status === "rejected" ? "✓ Rejected" : "Reject"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
