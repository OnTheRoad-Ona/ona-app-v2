"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { useAdminGate } from "@/components/admin/use-admin-gate";
import { AdminGuideBanner } from "@/components/admin/admin-guide-banner";
import { withSensitivePassword } from "@/components/admin/sensitive-unlock";

type StaffRow = {
  id: string;
  fullName: string | null;
  email: string | null;
  adminRole: string;
  roleLabel: string;
  isActive: boolean;
};

/** Full L1–L5 ladder — always visible so operators can see every level */
const LEVEL_GUIDE: {
  value: string;
  level: number;
  label: string;
  blurb: string;
  color: string;
  soft: string;
}[] = [
  {
    value: "customer_care",
    level: 1,
    label: "Customer Care",
    blurb: "Jobs, users, verification, simple issues",
    color: "#0f766e",
    soft: "#ccfbf1",
  },
  {
    value: "senior_support",
    level: 2,
    label: "Senior Support",
    blurb: "Disputes, freezes, payment status",
    color: "#1d4ed8",
    soft: "#dbeafe",
  },
  {
    value: "operations",
    level: 3,
    label: "Operations / Finance",
    blurb: "Escrow release/refund, full payments, banks",
    color: "#b45309",
    soft: "#fef3c7",
  },
  {
    value: "manager",
    level: 4,
    label: "Manager",
    blurb: "Content + assign L1–L3 staff",
    color: "#6d28d9",
    soft: "#ede9fe",
  },
  {
    value: "super_admin",
    level: 5,
    label: "Super Admin",
    blurb: "Owner · all settings · assign L1–L5",
    color: "#1a1b1e",
    soft: "#e5e7eb",
  },
];

const LEVEL_OPTIONS = LEVEL_GUIDE.map((l) => ({
  value: l.value,
  label: `L${l.level} · ${l.label}`,
}));

export default function AdminStaffPage() {
  const { adminName, adminRole, ready, api } = useAdminGate();
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [assignable, setAssignable] = useState<string[]>([]);
  const [actorRole, setActorRole] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    const res = await api<{
      staff: StaffRow[];
      assignable: string[];
      actorRole?: string;
    }>("/api/admin/staff");
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setStaff(res.data.staff);
    setAssignable(res.data.assignable || []);
    setActorRole(res.data.actorRole || null);
    setError(null);
  }

  useEffect(() => {
    if (!ready) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  async function setLevel(userId: string, adminRoleNext: string) {
    setBusyId(userId);
    setMsg(null);
    setError(null);
    await withSensitivePassword(
      {
        title: "Confirm staff level change",
        detail: "Temporary access code required to change access levels.",
      },
      async () => {
        const res = await api<{ roleLabel: string }>("/api/admin/staff", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, adminRole: adminRoleNext }),
        });
        if (!res.ok) {
          setError(res.message);
          return;
        }
        setMsg(`Access level updated → ${res.data.roleLabel}`);
        await load();
      }
    );
    setBusyId(null);
  }

  const counts = LEVEL_GUIDE.map((l) => ({
    ...l,
    count: staff.filter((s) => s.adminRole === l.value).length,
  }));

  // Super Admin should always see all 5 options in the dropdown
  const dropdownOptions =
    actorRole === "super_admin" || assignable.length >= 5
      ? LEVEL_OPTIONS
      : LEVEL_OPTIONS.filter(
          (o) => assignable.includes(o.value) || staff.some((s) => s.adminRole === o.value)
        );

  return (
    <AdminShell adminName={adminName} adminRole={adminRole}>
      <h1 className="om-admin-h1">Staff access levels</h1>
      <p className="om-admin-sub">
        Ona staff uses five fixed levels. Everyone who can open the admin panel
        must have <code>profiles.role = admin</code> and an{" "}
        <code>admin_role</code> of L1–L5 below.
      </p>

      <AdminGuideBanner pageId="staff" />

      {error ? <div className="om-admin-error">{error}</div> : null}
      {msg ? <div className="om-admin-success">{msg}</div> : null}

      {/* Always-visible Level 1 → 5 guide */}
      <div
        className="om-admin-panel"
        style={{ marginBottom: 16 }}
        aria-label="Access levels Level 1 to Level 5"
      >
        <h2 className="om-admin-h2" style={{ marginTop: 0 }}>
          Levels 1 – 5
        </h2>
        <p className="om-admin-muted" style={{ marginBottom: 12 }}>
          These are the only access levels. Your account must be L4 or L5 to
          open this page and assign roles.
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
            gap: 10,
          }}
        >
          {counts.map((l) => (
            <div
              key={l.value}
              style={{
                borderRadius: 12,
                padding: "12px 12px 10px",
                background: l.soft,
                border: `1px solid ${l.color}33`,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  color: l.color,
                }}
              >
                Level {l.level}
              </div>
              <div
                style={{
                  marginTop: 4,
                  fontSize: 14,
                  fontWeight: 800,
                  color: l.color,
                }}
              >
                {l.label}
              </div>
              <div
                className="om-admin-muted"
                style={{ marginTop: 6, fontSize: 11, lineHeight: 1.35 }}
              >
                {l.blurb}
              </div>
              <div
                style={{
                  marginTop: 8,
                  fontSize: 12,
                  fontWeight: 700,
                  color: l.color,
                }}
              >
                {l.count} staff
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="om-admin-panel">
        <h2 className="om-admin-h2" style={{ marginTop: 0 }}>
          Staff accounts
        </h2>
        <table className="om-admin-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Level</th>
              <th>Active</th>
              <th>Change level</th>
            </tr>
          </thead>
          <tbody>
            {staff.length === 0 ? (
              <tr>
                <td colSpan={5} className="om-admin-muted">
                  No staff accounts found. To appear here, a user needs{" "}
                  <strong>profiles.role = admin</strong> and{" "}
                  <strong>profiles.admin_role</strong> set to one of:{" "}
                  customer_care (L1), senior_support (L2), operations (L3),
                  manager (L4), super_admin (L5). Right now only true admin
                  panel logins are listed — regular motorist/pro accounts are
                  hidden even if admin_role was set by mistake.
                </td>
              </tr>
            ) : (
              staff.map((s) => (
                <tr key={s.id}>
                  <td>{s.fullName || "—"}</td>
                  <td className="om-admin-muted">{s.email}</td>
                  <td>
                    <span className="om-admin-badge">{s.roleLabel}</span>
                  </td>
                  <td>{s.isActive ? "Yes" : "No"}</td>
                  <td>
                    <select
                      className="om-admin-select"
                      disabled={
                        busyId === s.id ||
                        (assignable.length === 0 && actorRole !== "super_admin")
                      }
                      value={s.adminRole}
                      onChange={(e) => void setLevel(s.id, e.target.value)}
                      aria-label={`Change level for ${s.fullName || s.email || s.id}`}
                    >
                      {(actorRole === "super_admin"
                        ? LEVEL_OPTIONS
                        : dropdownOptions.filter(
                            (o) =>
                              assignable.includes(o.value) ||
                              o.value === s.adminRole
                          )
                      ).map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
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
