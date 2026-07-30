"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/lib/store";
import { getAppSupabase } from "@/lib/supabase/app-client";
import { cn } from "@/lib/utils";

export function DeletionBanner() {
  const { theme, backendUserId } = useApp();
  const isLight = theme === "light";
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);
  const [daysLeft, setDaysLeft] = useState<number | null>(null);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    if (!backendUserId) return;
    const sb = getAppSupabase();
    if (!sb) return;
    sb.auth.getSession().then(({ data }) => {
      const token = data.session?.access_token;
      if (!token) return;
      fetch("/api/auth/deletion-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: token }),
      })
        .then((r) => r.json())
        .then((json) => {
          if (json.ok && json.data?.deletion_status === "pending_deletion") {
            setStatus("pending_deletion");
            const scheduled = json.data.deletion_scheduled_at;
            if (scheduled) {
              const diff = new Date(scheduled).getTime() - Date.now();
              setDaysLeft(Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24))));
            }
          }
        })
        .catch(() => {});
    });
  }, [backendUserId]);

  const restore = async () => {
    setRestoring(true);
    try {
      const sb = getAppSupabase();
      const { data: sessionData } = await sb!.auth.getSession();
      const token = sessionData.session?.access_token;
      const res = await fetch("/api/auth/restore-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: token }),
      });
      const json = await res.json();
      if (json.ok) {
        setStatus(null);
        setDaysLeft(null);
      }
    } catch { /* */ }
    setRestoring(false);
  };

  const extendDays = async () => {
    setRestoring(true);
    await restore();
    setRestoring(false);
  };

  if (status !== "pending_deletion") return null;

  return (
    <div
      className={cn(
        "sticky top-0 z-50 flex items-center justify-between gap-2 px-3 py-2 text-[12px] font-semibold",
        isLight ? "bg-red-100 text-red-800" : "bg-red-900/60 text-red-200"
      )}
    >
      <span>
        Your account will be deleted in{" "}
        <strong>{daysLeft ?? "?"} days</strong>. Reactivate to keep it.
      </span>
      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          disabled={restoring}
          onClick={() => void restore()}
          className="rounded bg-red-600 px-3 py-1 text-[11px] font-bold text-white disabled:opacity-50"
        >
          {restoring ? "..." : "Reactivate"}
        </button>
      </div>
    </div>
  );
}
