"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Briefcase, X } from "lucide-react";
import { apiListJobs } from "@/lib/jobs/client";
import type { JobRecord } from "@/lib/jobs/types";
import { formatMoney } from "@/lib/pricing";
import { PRO_SERVICE_LABELS } from "@/lib/services";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * Repair Pro only: when a *new* motorist request arrives (even mid-job),
 * surface an alert so the pro can switch if the current job is not going well.
 * Does not hide other jobs — always multi-request aware.
 */
export function IncomingJobPopup() {
  const { accountType, backendUserId, theme, isAuthenticated } = useApp();
  const isLight = theme === "light";
  const router = useRouter();
  const pathname = usePathname() || "";
  const knownIds = useRef<Set<string>>(new Set());
  const primed = useRef(false);
  const [alertJob, setAlertJob] = useState<JobRecord | null>(null);
  const [otherCount, setOtherCount] = useState(0);

  useEffect(() => {
    if (!isAuthenticated || accountType !== "professional" || !backendUserId) {
      return;
    }

    let cancelled = false;

    const poll = async () => {
      const res = await apiListJobs(backendUserId, "repair_pro");
      if (cancelled || !res.ok) return;

      const now = Date.now();
      const open = res.data.jobs.filter((j) => {
        if (j.repairProId !== backendUserId) return false;
        if (!j.motoristId || !j.problem?.trim()) return false;
        if (j.status !== "negotiating" && j.status !== "agreed") return false;
        if (
          j.status === "negotiating" &&
          j.negotiateEndsAt &&
          now > new Date(j.negotiateEndsAt).getTime()
        ) {
          return false;
        }
        return true;
      });

      // First snapshot: baseline only — no popup spam on login
      if (!primed.current) {
        knownIds.current = new Set(open.map((j) => j.id));
        primed.current = true;
        setOtherCount(open.length);
        return;
      }

      for (const j of open) {
        if (!knownIds.current.has(j.id)) {
          knownIds.current.add(j.id);
          // Don't re-alert if user is already on that job screen
          if (pathname.includes(`/jobs/${j.id}`)) continue;
          setAlertJob(j);
          break;
        }
      }

      // Track ids that left (expired/cancelled) so they can re-appear later if recreated
      const openIds = new Set(open.map((j) => j.id));
      for (const id of [...knownIds.current]) {
        if (!openIds.has(id)) knownIds.current.delete(id);
      }

      setOtherCount(open.length);
    };

    void poll();
    const t = window.setInterval(() => void poll(), 4000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [accountType, backendUserId, isAuthenticated, pathname]);

  useEffect(() => {
    if (!isAuthenticated || accountType !== "professional") {
      primed.current = false;
      knownIds.current = new Set();
      setAlertJob(null);
      setOtherCount(0);
    }
  }, [isAuthenticated, accountType]);

  // Compact badge on job screens when other open requests exist
  const showBadge =
    accountType === "professional" &&
    otherCount > 1 &&
    pathname.startsWith("/jobs/") &&
    !alertJob;

  if (accountType !== "professional") return null;

  return (
    <>
      {showBadge && (
        <button
          type="button"
          onClick={() => router.push("/jobs")}
          className={cn(
            "absolute bottom-[max(4.5rem,env(safe-area-inset-bottom))] left-1/2 z-[115] flex -translate-x-1/2 items-center gap-2 rounded-full border-0 px-3.5 py-2 text-[12px] font-bold shadow-lg",
            isLight
              ? "bg-slate-900 text-white"
              : "bg-[#e07a3d] text-white"
          )}
        >
          <Briefcase className="h-3.5 w-3.5" />
          {otherCount - 1}+ other request{otherCount - 1 === 1 ? "" : "s"}
        </button>
      )}

      {alertJob && (
        <div
          className="absolute inset-0 z-[125] flex items-end justify-center bg-black/45 p-3 pb-6"
          role="dialog"
          aria-modal
          aria-labelledby="incoming-job-title"
        >
          <div
            className={cn(
              "w-full max-w-sm rounded-2xl p-4 shadow-xl",
              isLight ? "bg-[#c8c9cd]" : "bg-neutral-950"
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p
                  id="incoming-job-title"
                  className={cn(
                    "text-[15px] font-bold",
                    isLight ? "text-slate-900" : "text-white"
                  )}
                >
                  New motorist request
                </p>
                <p
                  className={cn(
                    "mt-1 text-[12px] leading-snug",
                    isLight ? "text-slate-600" : "text-white/65"
                  )}
                >
                  <strong>{alertJob.motoristName}</strong> needs{" "}
                  {PRO_SERVICE_LABELS[alertJob.serviceType] ??
                    alertJob.serviceType}
                  . You can open this even if another job is already open.
                </p>
                <p
                  className={cn(
                    "mt-2 line-clamp-2 text-[12px] font-semibold",
                    isLight ? "text-slate-800" : "text-white/90"
                  )}
                >
                  {alertJob.problem}
                </p>
                {alertJob.agreedMajor != null && (
                  <p className="mt-1 text-[13px] font-black text-[#e07a3d]">
                    {formatMoney(alertJob.agreedMajor, alertJob.currency)}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setAlertJob(null)}
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border-0",
                  isLight ? "bg-black/5 text-slate-700" : "bg-white/10 text-white"
                )}
                aria-label="Dismiss"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  const id = alertJob.id;
                  setAlertJob(null);
                  router.push(`/jobs/${id}`);
                }}
                className="flex w-full items-center justify-center gap-2 rounded-lg border-0 bg-[#e07a3d] py-3 text-sm font-semibold text-white"
              >
                <Briefcase className="h-4 w-4" />
                Open this request
              </button>
              <button
                type="button"
                onClick={() => {
                  setAlertJob(null);
                  router.push("/jobs");
                }}
                className={cn(
                  "flex w-full items-center justify-center rounded-lg border-0 py-2.5 text-sm font-semibold",
                  isLight ? "text-slate-800" : "text-white/90"
                )}
              >
                See all incoming jobs
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
