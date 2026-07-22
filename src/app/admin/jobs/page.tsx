"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";

type Job = {
  id: string;
  status: string;
  service_type: string;
  description: string;
  created_at: string;
  motorist?: { full_name: string; email: string } | null;
  pro?: { full_name: string; email: string } | null;
};

const STATUSES = [
  "requested",
  "matched",
  "accepted",
  "en_route",
  "in_progress",
  "completed",
  "cancelled",
] as const;

export default function AdminJobsPage() {
  const router = useRouter();
  const [adminName, setAdminName] = useState("Admin");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/requests");
    const json = await res.json();
    if (!json.ok) {
      if (res.status === 401 || res.status === 403) {
        router.replace("/admin/login");
        return;
      }
      return;
    }
    setJobs(json.data.requests);
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

  async function setStatus(id: string, status: string) {
    setMsg(null);
    const res = await fetch("/api/admin/requests", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    const json = await res.json();
    if (!json.ok) {
      setMsg(json.error?.message || "Failed");
      return;
    }
    setMsg(`Saved job status → ${status}`);
    await load();
  }

  return (
    <AdminShell adminName={adminName}>
      <h1 className="om-admin-h1">Jobs</h1>
      <p className="om-admin-sub">
        All service jobs from the live app — negotiation, booked, en route, complete. Open a job to inspect parties, escrow, and timeline.
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
              <th>Job</th>
              <th>Customer</th>
              <th>Pro</th>
              <th>Status</th>
              <th>Update (save)</th>
            </tr>
          </thead>
          <tbody>
            {jobs.length === 0 ? (
              <tr>
                <td colSpan={5} className="om-admin-muted">
                  No jobs yet.
                </td>
              </tr>
            ) : (
              jobs.map((j) => (
                <tr key={j.id}>
                  <td>
                    <div>{j.service_type}</div>
                    <div className="om-admin-muted">
                      {j.description?.slice(0, 48) || j.id.slice(0, 8)}
                    </div>
                  </td>
                  <td>{j.motorist?.full_name || "—"}</td>
                  <td>{j.pro?.full_name || "Unassigned"}</td>
                  <td>
                    <span className="om-admin-badge">{j.status}</span>
                  </td>
                  <td>
                    <select
                      defaultValue={j.status}
                      onChange={(e) => setStatus(j.id, e.target.value)}
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
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
