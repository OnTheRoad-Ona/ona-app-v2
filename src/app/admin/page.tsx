"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { useAdminGate } from "@/components/admin/use-admin-gate";

type Dashboard = {
  totals: {
    users: number;
    motorists: number;
    repairPros: number;
    pendingPros: number;
    openJobs: number;
    completedJobs: number;
    revenueNgn: number;
  };
  recentActions: Array<{
    id: string;
    action: string;
    target_user_id: string | null;
    created_at: string;
  }>;
};

const QUICK = [
  {
    href: "/admin/users",
    title: "Users & roles",
    desc: "Motorists, pros, admins",
  },
  {
    href: "/admin/pros",
    title: "Repair Pros",
    desc: "Approve, suspend, verify",
  },
  {
    href: "/admin/jobs",
    title: "Jobs",
    desc: "Live service requests",
  },
  {
    href: "/admin/settings",
    title: "App settings",
    desc: "Name, maintenance, theme",
  },
  {
    href: "/admin/features",
    title: "Feature flags",
    desc: "Signup, maps, chat, pay",
  },
  {
    href: "/admin/content",
    title: "Content",
    desc: "Problems, banners, copy",
  },
  {
    href: "/admin/matching",
    title: "Map & matching",
    desc: "Radius, tech limits",
  },
  {
    href: "/admin/services",
    title: "Services",
    desc: "Enable/disable trades",
  },
];

export default function AdminDashboardPage() {
  const { adminName, ready, api } = useAdminGate();
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    (async () => {
      const res = await api<Dashboard>("/api/admin/dashboard");
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setData(res.data);
    })();
  }, [ready, api]);

  const t = data?.totals;

  return (
    <AdminShell adminName={adminName}>
      <h1 className="om-admin-h1">Control centre</h1>
      <p className="om-admin-sub">
        Full control of the OgaMecho app — people, jobs, money, content &
        behaviour.
      </p>
      {error ? <div className="om-admin-error">{error}</div> : null}

      <div className="om-admin-cards">
        {(
          [
            ["Users", t?.users, "/admin/users"],
            ["Motorists", t?.motorists, "/admin/users"],
            ["Repair Pros", t?.repairPros, "/admin/pros"],
            ["Pending Pros", t?.pendingPros, "/admin/pros"],
            ["Open jobs", t?.openJobs, "/admin/jobs"],
            ["Completed", t?.completedJobs, "/admin/jobs"],
            [
              "Revenue (₦)",
              t != null ? t.revenueNgn.toLocaleString() : undefined,
              "/admin/payments",
            ],
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

      <h2 className="om-admin-section-title">Jump to control</h2>
      <div className="om-admin-quick">
        {QUICK.map((q) => (
          <Link key={q.href} href={q.href}>
            {q.title}
            <small>{q.desc}</small>
          </Link>
        ))}
      </div>

      <div className="om-admin-panel">
        <div className="om-admin-toolbar">
          <strong>Recent admin actions</strong>
          <Link
            href="/admin/audit"
            className="om-admin-btn ghost"
            style={{ marginLeft: "auto", textDecoration: "none" }}
          >
            Full audit log
          </Link>
        </div>
        <table className="om-admin-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Action</th>
              <th>Target</th>
            </tr>
          </thead>
          <tbody>
            {(data?.recentActions ?? []).length === 0 ? (
              <tr>
                <td colSpan={3} className="om-admin-muted">
                  No actions yet — change a setting or approve a pro to start
                  the log.
                </td>
              </tr>
            ) : (
              data!.recentActions.map((a) => (
                <tr key={a.id}>
                  <td>{new Date(a.created_at).toLocaleString()}</td>
                  <td>{a.action}</td>
                  <td className="om-admin-muted">
                    {a.target_user_id?.slice(0, 8) || "—"}
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
