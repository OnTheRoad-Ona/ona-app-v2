"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Loader2 } from "lucide-react";
import { JobShell } from "@/components/jobs/job-shell";
import { apiListJobs } from "@/lib/jobs/client";
import type { JobRecord } from "@/lib/jobs/types";
import { formatMoney } from "@/lib/pricing";
import { PRO_SERVICE_LABELS } from "@/lib/services";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

const ACTIVE = new Set([
  "negotiating",
  "agreed",
  "paid_booked",
  "en_route",
  "arrived",
  "in_progress",
  "completed",
  "satisfied",
  "disputed",
  "under_appeal",
]);

export default function JobsInboxPage() {
  const router = useRouter();
  const { theme, accountType, backendUserId } = useApp();
  const isLight = theme === "light";
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const viewer =
    accountType === "professional" ? "repair_pro" : "motorist";
  const ink = isLight ? "text-slate-900" : "text-white";
  const muted = isLight ? "text-slate-600" : "text-white/60";
  const hairline = isLight ? "border-black/10" : "border-white/10";

  useEffect(() => {
    if (!backendUserId) {
      setJobs([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    const load = async () => {
      const res = await apiListJobs(backendUserId, viewer);
      if (cancelled) return;
      if (!res.ok) {
        setErr(res.message);
        setLoading(false);
        return;
      }
      const now = Date.now();
      const list = res.data.jobs
        .filter((j) => {
          if (!ACTIVE.has(j.status)) return false;
          if (!j.problem?.trim()) return false;
          if (
            j.status === "negotiating" &&
            j.negotiateEndsAt &&
            now > new Date(j.negotiateEndsAt).getTime()
          ) {
            return false;
          }
          if (viewer === "repair_pro" && j.repairProId !== backendUserId) {
            return false;
          }
          if (viewer === "motorist" && j.motoristId !== backendUserId) {
            return false;
          }
          return true;
        })
        .sort((a, b) => {
          // Keep new negotiations on top so pros can switch mid-job
          const rank = (s: string) =>
            s === "negotiating" ? 0 : s === "agreed" ? 1 : 2;
          const d = rank(a.status) - rank(b.status);
          if (d !== 0) return d;
          return (
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
        });
      setJobs(list);
      setLoading(false);
    };
    void load();
    const t = window.setInterval(() => void load(), 4000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [backendUserId, viewer]);

  return (
    <JobShell
      isLight={isLight}
      title={viewer === "repair_pro" ? "Incoming jobs" : "My jobs"}
      onBack={() => router.push(viewer === "repair_pro" ? "/dashboard" : "/")}
    >
      {loading && (
        <div className="flex justify-center py-16">
          <Loader2 className="h-7 w-7 animate-spin text-[#e07a3d]" />
        </div>
      )}
      {err && (
        <p className="mb-3 text-center text-[12px] font-semibold text-red-500">
          {err}
        </p>
      )}
      {!loading && jobs.length === 0 && (
        <p className={cn("py-10 text-center text-[14px] font-semibold", muted)}>
          No jobs yet
        </p>
      )}
      <ul className={cn("divide-y", hairline)}>
        {jobs.map((j) => (
          <li key={j.id}>
            <Link
              href={`/jobs/${j.id}`}
              className="flex items-start gap-2 py-3.5 transition active:opacity-80"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-[#e07a3d]/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-[#e07a3d]">
                    {j.status.replace(/_/g, " ")}
                  </span>
                  <span className={cn("text-[11px] font-semibold", muted)}>
                    {PRO_SERVICE_LABELS[j.serviceType]}
                  </span>
                </div>
                <p className={cn("mt-1 truncate text-[15px] font-black", ink)}>
                  {viewer === "repair_pro" ? j.motoristName : j.repairProName}
                </p>
                <p
                  className={cn(
                    "mt-0.5 line-clamp-2 text-[12px] font-medium",
                    muted
                  )}
                >
                  {j.problem}
                </p>
                {j.agreedMajor != null && (
                  <p className="mt-1 text-[13px] font-black text-[#e07a3d]">
                    {formatMoney(j.agreedMajor, j.currency)}
                  </p>
                )}
              </div>
              <ChevronRight
                className={cn(
                  "mt-1 h-5 w-5 shrink-0",
                  isLight ? "text-slate-400" : "text-white/30"
                )}
              />
            </Link>
          </li>
        ))}
      </ul>
    </JobShell>
  );
}
