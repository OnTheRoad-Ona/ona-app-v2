"use client";

/**
 * Professional dashboard — flat on the main app stage (no nested glass panels).
 * Incoming jobs only after a motorist has requested this pro (active flow).
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Briefcase,
  ChevronRight,
  Loader2,
  MapPin,
  Radio,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { apiListJobs } from "@/lib/jobs/client";
import type { JobRecord } from "@/lib/jobs/types";
import { formatMoney } from "@/lib/pricing";
import { isProService, PRO_SERVICE_LABELS } from "@/lib/services";
import { useApp } from "@/lib/store";
import type { ProService } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Only active escrow flow states after a real motorist request */
const ACTIVE_INCOMING = new Set([
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

export default function TechnicianDashboardPage() {
  const {
    theme,
    registeredAs,
    proServices,
    proLive,
    setProLive,
    userProfile,
    backendUserId,
    displayName,
  } = useApp();
  const isLight = theme === "light";
  const [liveBusy, setLiveBusy] = useState(false);
  const [liveErr, setLiveErr] = useState<string | null>(null);
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);

  const mySkill: ProService | null = isProService(registeredAs)
    ? registeredAs
    : proServices[0] ?? null;

  const roleLabel = mySkill
    ? PRO_SERVICE_LABELS[mySkill] ?? mySkill
    : "Professional";

  // Same solid stage as motorist home / app shell
  const stage = isLight ? "bg-[#c8c9cd]" : "bg-black";
  const ink = isLight ? "text-slate-900" : "text-white";
  const muted = isLight ? "text-slate-600" : "text-white/65";
  const hairline = isLight ? "border-black/10" : "border-white/10";

  const loadJobs = useCallback(async () => {
    if (!backendUserId) {
      setJobs([]);
      setJobsLoading(false);
      return;
    }
    const res = await apiListJobs(backendUserId, "repair_pro");
    if (res.ok) {
      const now = Date.now();
      const mine = res.data.jobs.filter((j) => {
        if (j.repairProId !== backendUserId) return false;
        if (!j.motoristId || !j.problem?.trim()) return false;
        if (!ACTIVE_INCOMING.has(j.status)) return false;
        // Drop expired negotiation windows
        if (
          j.status === "negotiating" &&
          j.negotiateEndsAt &&
          now > new Date(j.negotiateEndsAt).getTime()
        ) {
          return false;
        }
        return true;
      });
      setJobs(mine);
    } else {
      setJobs([]);
    }
    setJobsLoading(false);
  }, [backendUserId]);

  useEffect(() => {
    void loadJobs();
    const t = window.setInterval(() => void loadJobs(), 5000);
    return () => window.clearInterval(t);
  }, [loadJobs]);

  const toggleLive = async () => {
    setLiveBusy(true);
    setLiveErr(null);
    try {
      const err = await setProLive(!proLive);
      if (err) setLiveErr(err);
    } catch {
      setLiveErr("Could not update Live status. Check GPS permission.");
    } finally {
      setLiveBusy(false);
    }
  };

  return (
    <div className={cn("flex h-full min-h-0 flex-col", stage)}>
      <div className={cn("z-20 shrink-0", stage)}>
        <PageHeader
          title="Professional Dashboard"
          subtitle={`${roleLabel} · ${userProfile?.fullName || displayName || "Pro"}`}
          showBack={false}
        />
        <div className="flex items-center justify-between gap-2 px-3 pb-3">
          {mySkill ? (
            <p className={cn("text-[12px] font-bold", ink)}>
              {PRO_SERVICE_LABELS[mySkill] ?? mySkill}
              <span className={cn("font-semibold", muted)}> only</span>
            </p>
          ) : (
            <span />
          )}
          <button
            type="button"
            disabled={liveBusy}
            onClick={() => void toggleLive()}
            className={cn(
              "inline-flex shrink-0 items-center gap-2 border-0 bg-transparent px-0 py-1 text-xs font-bold transition-colors",
              proLive
                ? "text-emerald-600"
                : isLight
                  ? "text-slate-500"
                  : "text-white/55"
            )}
            aria-pressed={proLive}
          >
            <span className="relative flex h-2 w-2">
              {proLive && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
              )}
              <span
                className={cn(
                  "relative inline-flex h-2 w-2 rounded-full",
                  proLive ? "bg-emerald-500" : "bg-slate-400"
                )}
              />
            </span>
            {liveBusy ? "…" : proLive ? "Live" : "Away"}
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-3 pb-5 scrollbar-hide">
        {/* Live status — flat on stage, no floating glass card */}
        <section className={cn("border-b pb-5", hairline)}>
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl",
                proLive ? "bg-emerald-500/20" : "bg-[#e07a3d]/20"
              )}
            >
              <Radio
                className={cn(
                  "h-5 w-5",
                  proLive ? "text-emerald-500" : "text-[#e07a3d]"
                )}
              />
            </span>
            <div className="min-w-0 flex-1">
              <p className={cn("text-[16px] font-black", ink)}>
                {proLive ? "You’re Live" : "You’re Away"}
              </p>
              <p className={cn("text-[12px] font-medium", muted)}>
                {proLive
                  ? "Motorists nearby can find you."
                  : "Go Live so motorists can request you."}
              </p>
            </div>
          </div>
          <Button
            className="mt-4 h-11 w-full"
            disabled={liveBusy}
            onClick={() => void toggleLive()}
          >
            {liveBusy
              ? "Updating…"
              : proLive
                ? "Go Away"
                : "Go Live (share GPS)"}
          </Button>
          {liveErr && (
            <p className="mt-2 text-center text-[11px] font-semibold text-red-500">
              {liveErr}
            </p>
          )}
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className={cn("text-sm font-bold", ink)}>Incoming jobs</h2>
            {jobs.length > 0 && (
              <Link
                href="/jobs"
                className="text-[12px] font-bold text-[#e07a3d]"
              >
                All jobs
              </Link>
            )}
          </div>

          {jobsLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-[#e07a3d]" />
            </div>
          ) : jobs.length === 0 ? (
            <div className="py-8 text-center">
              <Briefcase
                className={cn("mx-auto h-8 w-8 opacity-35", muted)}
              />
              <p className={cn("mt-2 text-[13px] font-semibold", muted)}>
                Waiting for requests
              </p>
            </div>
          ) : (
            <ul className={cn("divide-y", hairline)}>
              {jobs.map((j) => (
                <li key={j.id}>
                  <Link
                    href={`/jobs/${j.id}`}
                    className="flex items-start gap-2 py-3.5 transition active:opacity-80"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded-full bg-[#e07a3d]/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-[#e07a3d]">
                          {j.status.replace(/_/g, " ")}
                        </span>
                        <span
                          className={cn("text-[11px] font-semibold", muted)}
                        >
                          {PRO_SERVICE_LABELS[j.serviceType]}
                        </span>
                      </div>
                      <p className={cn("mt-1 text-[15px] font-black", ink)}>
                        {j.motoristName}
                      </p>
                      <p
                        className={cn(
                          "mt-0.5 line-clamp-2 text-[12px] font-medium",
                          muted
                        )}
                      >
                        {j.problem}
                      </p>
                      <p
                        className={cn(
                          "mt-1 flex items-center gap-1 text-[11px]",
                          muted
                        )}
                      >
                        <MapPin className="h-3 w-3 text-[#e07a3d]" />
                        {j.locationLabel}
                        {j.agreedMajor != null && (
                          <span className="ml-1 font-bold text-[#e07a3d]">
                            · {formatMoney(j.agreedMajor, j.currency)}
                          </span>
                        )}
                      </p>
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
          )}
        </section>
      </div>
    </div>
  );
}
