"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { cn } from "@/lib/utils";

type DeletionRequest = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  deletion_status: "pending_deletion" | "restored";
  deletion_scheduled_at: string | null;
  deleted_at: string | null;
  self_reactivated_at: string | null;
  created_at: string;
  updated_at: string;
};

export default function AdminDeletionRequestsPage() {
  const [requests, setRequests] = useState<DeletionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actioning, setActioning] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/deletion-requests");
      const json = await res.json();
      if (json.ok) setRequests(json.data.requests ?? []);
    } catch { /* */ }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const act = async (userId: string, action: "force_delete" | "restore") => {
    setActioning(userId);
    try {
      const res = await fetch("/api/admin/deletion-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, action }),
      });
      const json = await res.json();
      if (json.ok) void load();
    } catch { /* */ }
    setActioning(null);
  };

  const daysLeft = (scheduled: string | null) => {
    if (!scheduled) return null;
    const diff = new Date(scheduled).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  };

  return (
    <AdminShell>
      <div className="p-6">
        <h1 className="mb-6 text-2xl font-bold">Deletion Requests</h1>
        {loading ? (
          <p className="text-white/50">Loading...</p>
        ) : requests.length === 0 ? (
          <p className="text-white/50">No pending or restored deletion requests.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-white/60">
                  <th className="pb-2 pr-4">Name</th>
                  <th className="pb-2 pr-4">Email</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2 pr-4">Days left</th>
                  <th className="pb-2 pr-4">Scheduled</th>
                  <th className="pb-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id} className="border-b border-white/5">
                    <td className="py-3 pr-4">{r.full_name || "—"}</td>
                    <td className="py-3 pr-4 text-white/70">{r.email}</td>
                    <td className="py-3 pr-4">
                      <span
                        className={cn(
                          "inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold",
                          r.deletion_status === "pending_deletion"
                            ? "bg-red-500/20 text-red-400"
                            : "bg-emerald-500/20 text-emerald-400"
                        )}
                      >
                        {r.deletion_status === "pending_deletion"
                          ? "Pending"
                          : "Restored"}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      {r.deletion_status === "pending_deletion"
                        ? `${daysLeft(r.deletion_scheduled_at)}d`
                        : "—"}
                    </td>
                    <td className="py-3 pr-4 text-white/50 text-[12px]">
                      {r.deletion_scheduled_at
                        ? new Date(r.deletion_scheduled_at).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="py-3">
                      {r.deletion_status === "pending_deletion" && (
                        <div className="flex gap-2">
                          <button
                            disabled={actioning === r.id}
                            onClick={() => act(r.id, "force_delete")}
                            className="rounded bg-red-600 px-3 py-1 text-[12px] font-semibold text-white disabled:opacity-50"
                          >
                            {actioning === r.id ? "..." : "Delete now"}
                          </button>
                          <button
                            disabled={actioning === r.id}
                            onClick={() => act(r.id, "restore")}
                            className="rounded bg-emerald-600 px-3 py-1 text-[12px] font-semibold text-white disabled:opacity-50"
                          >
                            {actioning === r.id ? "..." : "Restore"}
                          </button>
                        </div>
                      )}
                      {r.deletion_status === "restored" && (
                        <span className="text-white/40 text-[12px]">
                          Restored
                          {r.self_reactivated_at
                            ? ` ${new Date(r.self_reactivated_at).toLocaleDateString()}`
                            : ""}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
