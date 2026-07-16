"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Loader2, MapPin } from "lucide-react";
import { JobShell } from "@/components/jobs/job-shell";
import { apiListJobs } from "@/lib/jobs/client";
import type { JobFlowStatus, JobRecord } from "@/lib/jobs/types";
import { formatMoney } from "@/lib/pricing";
import { PRO_SERVICE_LABELS } from "@/lib/services";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

function shortStatus(status: JobFlowStatus): string {
  switch (status) {
    case "paid_booked":
      return "Paid · Booked";
    case "negotiating":
      return "Negotiating";
    case "agreed":
      return "Agreed";
    case "en_route":
      return "On the road";
    case "arrived":
      return "Arrived";
    case "in_progress":
      return "Working";
    default:
      return status.replace(/_/g, " ");
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
  const muted = isLight ? "text-slate-600" : "text-[#a1a1a6]";
  const row = isLight ? "bg-[#bebfc4]" : "bg-[#141414]";

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
    }, 30_000);
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
          <Loader2 className="h-6 w-6 animate-spin text-[#e07a3d]" />
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
      <ul className="space-y-2">
        {jobs.map((j) => {
          const name =
            viewer === "repair_pro" ? j.motoristName : j.repairProName;
          const price =
            j.agreedMajor != null
              ? formatMoney(j.agreedMajor, j.currency)
              : null;
          return (
            <li key={j.id}>
              <Link
                href={`/jobs/${j.id}`}
                className={cn(
                  "flex items-start gap-2 rounded-md px-3 py-2.5",
                  row
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2">
                    <span className="text-[10px] font-black uppercase tracking-wide text-[#e07a3d]">
                      {shortStatus(j.status)}
                    </span>
                    <span className={cn("text-[11px] font-semibold", muted)}>
                      {PRO_SERVICE_LABELS[j.serviceType]}
                    </span>
                  </div>
                  <p className={cn("mt-0.5 truncate text-[14px] font-black", ink)}>
                    {name}
                  </p>
                  <p
                    className={cn(
                      "mt-0.5 line-clamp-1 text-[12px] font-medium",
                      muted
                    )}
                  >
                    {j.problem}
                  </p>
                  {(j.locationLabel || price) && (
                    <p
                      className={cn(
                        "mt-1 flex items-center gap-1 text-[11px] font-semibold",
                        muted
                      )}
                    >
                      {j.locationLabel && (
                        <>
                          <MapPin className="h-3 w-3 shrink-0 text-[#e07a3d]" />
                          <span className="min-w-0 truncate">
                            {j.locationLabel}
                          </span>
                        </>
                      )}
                      {price && (
                        <span className="ml-auto shrink-0 font-black text-[#e07a3d]">
                          {price}
                        </span>
                      )}
                    </p>
                  )}
                </div>
                <ChevronRight
                  className={cn(
                    "mt-1 h-4 w-4 shrink-0",
                    isLight ? "text-slate-500" : "text-[#6b6b6b]"
                  )}
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </JobShell>
  );
}
