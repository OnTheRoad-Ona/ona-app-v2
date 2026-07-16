"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Loader2, MapPin, Wrench } from "lucide-react";
import { JobShell } from "@/components/jobs/job-shell";
import { apiListJobs } from "@/lib/jobs/client";
import type { JobFlowStatus, JobRecord } from "@/lib/jobs/types";
import { formatMoney } from "@/lib/pricing";
import { PRO_SERVICE_LABELS } from "@/lib/services";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

function jobStatusLabel(status: JobFlowStatus): {
  label: string;
  tone: string;
} {
  switch (status) {
    case "paid_booked":
      return { label: "Paid · Booked", tone: "bg-emerald-600 text-white" };
    case "negotiating":
      return { label: "Negotiating", tone: "bg-amber-500 text-white" };
    case "agreed":
      return { label: "Price agreed", tone: "bg-[#e07a3d] text-white" };
    case "en_route":
      return { label: "On the road", tone: "bg-[#e07a3d] text-white" };
    case "arrived":
      return { label: "Arrived", tone: "bg-[#e07a3d] text-white" };
    case "in_progress":
      return { label: "Working", tone: "bg-[#e07a3d] text-white" };
    default:
      return {
        label: status.replace(/_/g, " "),
        tone: "bg-slate-700 text-white",
      };
  }
}

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
    const t = window.setInterval(() => {
      if (document.hidden) return;
      void load();
    }, 10_000);
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
      <ul className="space-y-2.5">
        {jobs.map((j) => {
          const st = jobStatusLabel(j.status);
          const name =
            viewer === "repair_pro" ? j.motoristName : j.repairProName;
          return (
            <li key={j.id}>
              <Link
                href={`/jobs/${j.id}`}
                className={cn(
                  "block overflow-hidden rounded-2xl ring-1 transition active:scale-[0.99]",
                  isLight
                    ? "bg-[#d4d5d9] ring-black/8"
                    : "bg-[#1a1a1c] ring-white/10"
                )}
              >
                <div
                  className={cn(
                    "flex items-center justify-between gap-2 px-3.5 py-2",
                    isLight ? "bg-white/55" : "bg-white/[0.04]"
                  )}
                >
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wide",
                        st.tone
                      )}
                    >
                      {st.label}
                    </span>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 text-[11px] font-bold",
                        muted
                      )}
                    >
                      <Wrench className="h-3 w-3 text-[#e07a3d]" />
                      {PRO_SERVICE_LABELS[j.serviceType]}
                    </span>
                  </div>
                  <ArrowUpRight
                    className={cn(
                      "h-4 w-4 shrink-0",
                      isLight ? "text-slate-400" : "text-white/35"
                    )}
                  />
                </div>
                <div className="space-y-2 px-3.5 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className={cn("truncate text-[16px] font-black", ink)}>
                      {name}
                    </p>
                    {j.agreedMajor != null && (
                      <p className="shrink-0 text-[15px] font-black tabular-nums text-[#e07a3d]">
                        {formatMoney(j.agreedMajor, j.currency)}
                      </p>
                    )}
                  </div>
                  <p
                    className={cn(
                      "line-clamp-2 text-[13px] font-semibold leading-snug",
                      isLight ? "text-slate-700" : "text-white/75"
                    )}
                  >
                    {j.problem}
                  </p>
                  {j.locationLabel && (
                    <p
                      className={cn(
                        "flex items-center gap-1.5 text-[12px] font-medium",
                        muted
                      )}
                    >
                      <MapPin className="h-3.5 w-3.5 shrink-0 text-[#e07a3d]" />
                      <span className="truncate">{j.locationLabel}</span>
                    </p>
                  )}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </JobShell>
  );
}
