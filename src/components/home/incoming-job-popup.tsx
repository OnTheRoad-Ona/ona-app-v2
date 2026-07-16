"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Briefcase, X } from "lucide-react";
import {
  canNotify,
  ensureNotifyPermission,
  showAppNotification,
  vibrateCallPattern,
} from "@/lib/app-notify";
import { apiListJobs } from "@/lib/jobs/client";
import type { JobRecord } from "@/lib/jobs/types";
import { formatMoney } from "@/lib/pricing";
import { PRO_SERVICE_LABELS } from "@/lib/services";
import { playPersonTone, unlockAudio } from "@/lib/sound-tone";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * Repair Pro only: new motorist request → in-app popup + browser notification.
 * Only open New Request / agreed jobs (not completed).
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
        // New Request / agreed only for popup alerts
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

      if (!primed.current) {
        knownIds.current = new Set(open.map((j) => j.id));
        primed.current = true;
        setOtherCount(open.length);
        return;
      }

      for (const j of open) {
        if (!knownIds.current.has(j.id)) {
          knownIds.current.add(j.id);
          if (pathname.includes(`/jobs/${j.id}`)) continue;
          unlockAudio();
          playPersonTone(j.motoristId || j.motoristName, "notification");
          vibrateCallPattern();
          setAlertJob(j);
          const skill =
            PRO_SERVICE_LABELS[j.serviceType] || j.serviceType || "Job";
          void ensureNotifyPermission().then(() => {
            if (canNotify()) {
              showAppNotification({
                title: "New Request",
                body: `${j.motoristName}: ${j.problem.slice(0, 80)} · ${skill}`,
                tag: `job-${j.id}`,
                href: `/jobs/${j.id}`,
                requireInteraction: true,
              });
            }
          });
          break;
        }
      }

      const openIds = new Set(open.map((j) => j.id));
      for (const id of [...knownIds.current]) {
        if (!openIds.has(id)) knownIds.current.delete(id);
      }

      setOtherCount(open.length);
    };

    void poll();
    const t = window.setInterval(() => {
      // Keep polling when app is open (even backgrounded tab when possible)
      void poll();
    }, 8000);
    const onVis = () => {
      if (!document.hidden) void poll();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
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
            "absolute right-3 top-[max(0.6rem,env(safe-area-inset-top))] z-[160] flex items-center gap-1.5 rounded-full border-0 px-2.5 py-1.5 text-[11px] font-bold shadow-md",
            isLight
              ? "bg-slate-900 text-white"
              : "bg-[#e07a3d] text-white"
          )}
        >
          <Briefcase className="h-3.5 w-3.5" />
          {otherCount} open
        </button>
      )}

      {alertJob && (
        <div
          className="absolute inset-0 z-[180] flex items-end justify-center bg-black/50 p-3 pb-[max(1rem,env(safe-area-inset-bottom))]"
          role="dialog"
          aria-modal
          aria-label="New request"
        >
          <div
            className={cn(
              "w-full max-w-[360px] rounded-2xl p-4 shadow-xl",
              isLight ? "bg-white text-slate-900" : "bg-[#1c1c1e] text-white"
            )}
          >
            <div className="mb-2 flex items-start justify-between gap-2">
              <div>
                <p className="text-[11px] font-black uppercase tracking-wide text-[#e07a3d]">
                  New Request
                </p>
                <p className="mt-0.5 text-[16px] font-black leading-tight">
                  {alertJob.motoristName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAlertJob(null)}
                className={cn(
                  "rounded-full border-0 p-1.5",
                  isLight ? "bg-black/5" : "bg-white/10"
                )}
                aria-label="Dismiss"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p
              className={cn(
                "text-[13px] font-semibold leading-snug",
                isLight ? "text-slate-700" : "text-white/80"
              )}
            >
              {alertJob.problem}
            </p>
            <p
              className={cn(
                "mt-1 text-[11px] font-medium",
                isLight ? "text-slate-500" : "text-white/50"
              )}
            >
              {PRO_SERVICE_LABELS[alertJob.serviceType] || alertJob.serviceType}
              {alertJob.agreedMajor != null
                ? ` · ${formatMoney(alertJob.agreedMajor, alertJob.currency)}`
                : ""}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setAlertJob(null)}
                className={cn(
                  "h-11 rounded-xl border-0 text-[13px] font-bold",
                  isLight ? "bg-black/8 text-slate-900" : "bg-white/10 text-white"
                )}
              >
                Later
              </button>
              <button
                type="button"
                onClick={() => {
                  const id = alertJob.id;
                  setAlertJob(null);
                  router.push(`/jobs/${id}`);
                }}
                className="h-11 rounded-xl border-0 bg-[#e07a3d] text-[13px] font-bold text-white"
              >
                Open request
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
