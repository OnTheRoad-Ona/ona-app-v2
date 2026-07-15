"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Loader2 } from "lucide-react";
import {
  CopperButton,
  JobCard,
  JobShell,
} from "@/components/jobs/job-shell";
import { apiListJobs } from "@/lib/jobs/client";
import type { JobRecord } from "@/lib/jobs/types";
import { formatMoney } from "@/lib/pricing";
import { PRO_SERVICE_LABELS } from "@/lib/services";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

export default function JobsInboxPage() {
  const router = useRouter();
  const { theme, accountType, backendUserId, userProfile } = useApp();
  const isLight = theme === "light";
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const viewer =
    accountType === "professional" ? "repair_pro" : "motorist";
  const userId =
    backendUserId || userProfile?.identityId || userProfile?.email || "";

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    const load = async () => {
      const res = await apiListJobs(userId, viewer);
      if (cancelled) return;
      if (!res.ok) {
        setErr(res.message);
        setLoading(false);
        return;
      }
      setJobs(res.data.jobs);
      setLoading(false);
    };
    void load();
    const t = window.setInterval(() => void load(), 4000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [userId, viewer]);

  return (
    <JobShell
      isLight={isLight}
      title={viewer === "repair_pro" ? "Incoming jobs" : "My jobs"}
      subtitle="Live escrow & negotiation"
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
        <JobCard isLight={isLight}>
          <p
            className={cn(
              "text-[14px] font-semibold",
              isLight ? "text-slate-600" : "text-white/60"
            )}
          >
            No premium jobs yet.{" "}
            {viewer === "motorist"
              ? "Request a Repair Pro from the map."
              : "When a motorist sends a request, it appears here for pricing."}
          </p>
          {viewer === "motorist" && (
            <CopperButton className="mt-4" onClick={() => router.push("/")}>
              Open map
            </CopperButton>
          )}
        </JobCard>
      )}
      <div className="space-y-2">
        {jobs.map((j) => (
          <Link key={j.id} href={`/jobs/${j.id}`} className="block">
            <JobCard isLight={isLight} className="transition active:scale-[0.99]">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-[#e07a3d]/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-[#e07a3d]">
                      {j.status.replace(/_/g, " ")}
                    </span>
                    <span
                      className={cn(
                        "text-[11px] font-semibold",
                        isLight ? "text-slate-500" : "text-white/45"
                      )}
                    >
                      {PRO_SERVICE_LABELS[j.serviceType]}
                    </span>
                  </div>
                  <p
                    className={cn(
                      "mt-1 truncate text-[15px] font-black",
                      isLight ? "text-slate-900" : "text-white"
                    )}
                  >
                    {viewer === "repair_pro"
                      ? j.motoristName
                      : j.repairProName}
                  </p>
                  <p
                    className={cn(
                      "mt-0.5 line-clamp-2 text-[12px] font-medium",
                      isLight ? "text-slate-500" : "text-white/50"
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
              </div>
            </JobCard>
          </Link>
        ))}
      </div>
    </JobShell>
  );
}
