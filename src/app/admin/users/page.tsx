"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";

type UserRow = {
  id: string;
  role: "admin" | "motorist" | "repair_pro";
  full_name: string;
  phone: string | null;
  email: string | null;
  city: string | null;
  is_active: boolean;
  created_at: string;
  repair_pro_profiles?:
    | { status: string; primary_service: string; verified: boolean }
    | { status: string; primary_service: string; verified: boolean }[]
    | null;
};

export default function AdminUsersPage() {
  const router = useRouter();
  const [adminName, setAdminName] = useState("Admin");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (role) params.set("role", role);
    const res = await fetch(`/api/admin/users?${params}`);
    const json = await res.json();
    if (!json.ok) {
      if (res.status === 401 || res.status === 403) {
        router.replace("/admin/login");
        return;
      }
      setError(json.error?.message || "Failed");
      return;
    }
    setUsers(json.data.users);
  }, [q, role, router]);

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

  async function assignRole(id: string, nextRole: string) {
    setMsg(null);
    setError(null);
    const res = await fetch(`/api/admin/users/${id}/role`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: nextRole }),
    });
    const json = await res.json();
    if (!json.ok) {
      setError(json.error?.message || "Save failed");
      return;
    }
    setMsg(`Saved role → ${nextRole}`);
    await load();
  }

  async function toggleActive(id: string, is_active: boolean) {
    setMsg(null);
    const res = await fetch(`/api/admin/users/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active }),
    });
    const json = await res.json();
    if (!json.ok) {
      setError(json.error?.message || "Save failed");
      return;
    }
    setMsg(is_active ? "User activated" : "User deactivated");
    await load();
  }

  return (
    <AdminShell adminName={adminName}>
      <h1 className="om-admin-h1">Users & roles</h1>
      <p className="om-admin-sub">
        One role per account: admin · motorist · repair_pro. Changes save to
        Supabase.
      </p>
      {msg ? (
        <div
          className="om-admin-error"
          style={{ background: "#14532d", color: "#bbf7d0", marginBottom: 12 }}
        >
          {msg}
        </div>
      ) : null}
      {error ? <div className="om-admin-error">{error}</div> : null}
      <div className="om-admin-panel">
        <div className="om-admin-toolbar">
          <input
            placeholder="Search name, email, phone"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ minWidth: 220 }}
          />
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="">All roles</option>
            <option value="admin">admin</option>
            <option value="motorist">motorist</option>
            <option value="repair_pro">repair_pro</option>
          </select>
          <button type="button" className="om-admin-btn" onClick={() => load()}>
            Refresh
          </button>
        </div>
        <table className="om-admin-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Contact</th>
              <th>Role</th>
              <th>Status</th>
              <th>Assign role (save)</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan={5} className="om-admin-muted">
                  No users yet. After Supabase is connected and seed admin runs,
                  users appear here.
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div>{u.full_name || "—"}</div>
                    <div className="om-admin-muted">{u.id.slice(0, 8)}…</div>
                  </td>
                  <td>
                    <div>{u.email || "—"}</div>
                    <div className="om-admin-muted">{u.phone || u.city || ""}</div>
                  </td>
                  <td>
                    <span className={`om-admin-badge ${u.role}`}>{u.role}</span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="om-admin-btn ghost"
                      onClick={() => toggleActive(u.id, !u.is_active)}
                    >
                      {u.is_active ? "Active" : "Inactive"}
                    </button>
                  </td>
                  <td>
                    <div className="om-admin-row-actions">
                      {(["motorist", "repair_pro", "admin"] as const).map(
                        (r) => (
                          <button
                            key={r}
                            type="button"
                            className="om-admin-btn ghost"
                            disabled={u.role === r}
                            onClick={() => assignRole(u.id, r)}
                          >
                            {r}
                          </button>
                        )
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
