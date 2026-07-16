"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Loader2 } from "lucide-react";
import { JobShell } from "@/components/jobs/job-shell";
import { apiListJobs } from "@/lib/jobs/client";
import type { JobFlowStatus, JobRecord } from "@/lib/jobs/types";
import { formatMoney } from "@/lib/pricing";
import { PRO_SERVICE_LABELS } from "@/lib/services";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

function shortStatus(
  status: JobFlowStatus,
  viewer: "repair_pro" | "motorist"
): string {
  switch (status) {
    case "paid_booked":
      return "Paid · Booked";
    case "negotiating":
      return viewer === "repair_pro" ? "New Request" : "Negotiating";
    case "agreed":
      return "Agreed";
    case "en_route":
      return "On the road";
    case "arrived":
      return "Arrived";
    case "in_progress":
      return "Working";
    case "completed":
    case "satisfied":
      return "Complete";
    case "disputed":
      return "Dispute";
    case "under_appeal":
      return "Appeal";
    default:
      return status.replace(/_/g, " ");
  }
}

/** Pro Incoming = open pipeline only. Motorist My jobs can still show recent complete. */
const PRO_INCOMING = new Set([
  "negotiating",
  "agreed",
  "paid_booked",
  "en_route",
  "arrived",
  "in_progress",
]);

const MOTORIST_ACTIVE = new Set([
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
      const allowed =
        viewer === "repair_pro" ? PRO_INCOMING : MOTORIST_ACTIVE;
      const list = res.data.jobs
        .filter((j) => {
          if (!allowed.has(j.status)) return false;
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
    }, 12_000);
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
          const skill = PRO_SERVICE_LABELS[j.serviceType] ?? j.serviceType;
          const status = shortStatus(j.status, viewer);
          const price =
            j.agreedMajor != null
              ? formatMoney(j.agreedMajor, j.currency)
              : null;
          return (
            <li key={j.id}>
              <Link
                href={`/jobs/${j.id}`}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-3",
                  row
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span
                      className={cn(
                        "shrink-0 rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide",
                        j.status === "paid_booked"
                          ? "bg-emerald-600 text-white"
                          : j.status === "negotiating"
                            ? "bg-amber-500 text-white"
                            : "bg-[#e07a3d] text-white"
                      )}
                    >
                      {status}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold",
                        isLight
                          ? "bg-[#a8a9ae] text-slate-900"
                          : "bg-[#2c2c2e] text-white"
                      )}
                    >
                      {skill}
                    </span>
                    <p
                      className={cn(
                        "min-w-0 flex-1 truncate text-[15px] font-black leading-tight",
                        ink
                      )}
                    >
                      {name}
                    </p>
                  </div>
                  {j.problem?.trim() && (
                    <p
                      className={cn(
                        "mt-1.5 line-clamp-1 text-[12px] font-medium",
                        muted
                      )}
                    >
                      {j.problem}
                    </p>
                  )}
                  {price && (
                    <p className="mt-1 text-[13px] font-black tabular-nums text-[#e07a3d]">
                      {price}
                    </p>
                  )}
                </div>
                <ChevronRight
                  className={cn(
                    "h-4 w-4 shrink-0",
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
