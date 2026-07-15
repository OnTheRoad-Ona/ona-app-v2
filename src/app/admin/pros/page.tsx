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

function proMeta(u: UserRow) {
  const raw = u.repair_pro_profiles;
  if (!raw) return null;
  return Array.isArray(raw) ? raw[0] : raw;
}

export default function AdminProsPage() {
  const router = useRouter();
  const [adminName, setAdminName] = useState("Admin");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/users?role=repair_pro");
    const json = await res.json();
    if (!json.ok) {
      if (res.status === 401 || res.status === 403) {
        router.replace("/admin/login");
        return;
      }
      return;
    }
    setUsers(json.data.users);
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

  async function setStatus(
    id: string,
    status: "pending" | "approved" | "suspended" | "rejected"
  ) {
    setMsg(null);
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
    setMsg(`Saved pro status → ${status}`);
    await load();
  }

  return (
    <AdminShell adminName={adminName}>
      <h1 className="om-admin-h1">Repair Pros</h1>
      <p className="om-admin-sub">
        Live technicians from Supabase (same people on the Vercel app). Approve,
        suspend, or reject. &quot;RP&quot; on the app was only a fallback label
        for missing names — real names show here.
      </p>
      {msg ? (
        <div
          className="om-admin-error"
          style={{ background: "#14532d", color: "#bbf7d0", marginBottom: 12 }}
        >
          {msg}
        </div>
      ) : null}
      <div className="om-admin-panel">
        <table className="om-admin-table">
          <thead>
            <tr>
              <th>Pro</th>
              <th>Service</th>
              <th>Online</th>
              <th>Status</th>
              <th>Joined</th>
              <th>Actions (save)</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan={6} className="om-admin-muted">
                  No Repair Pros registered yet. When someone signs up as Repair
                  Pro on ogamecho.vercel.app they appear here.
                </td>
              </tr>
            ) : (
              users.map((u) => {
                const pro = proMeta(u);
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
                      <span
                        className={`om-admin-badge ${pro?.status || "pending"}`}
                      >
                        {pro?.status || "pending"}
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
                        <button
                          type="button"
                          className="om-admin-btn"
                          onClick={() => setStatus(u.id, "approved")}
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          className="om-admin-btn ghost"
                          onClick={() => setStatus(u.id, "suspended")}
                        >
                          Suspend
                        </button>
                        <button
                          type="button"
                          className="om-admin-btn ghost"
                          onClick={() => setStatus(u.id, "rejected")}
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
      </div>
    </AdminShell>
  );
}
