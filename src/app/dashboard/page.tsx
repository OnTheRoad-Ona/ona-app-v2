"use client";

/**
 * Professional dashboard — NO nearby discovery map.
 * Idle: Go Live + waiting for requests.
 * Jobs: text list only; map/travel opens on /jobs/[id] after a request.
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

  const sheetBg = isLight ? "bg-[#c8c9cd]" : "bg-black";
  const ink = isLight ? "text-slate-900" : "text-white";
  const muted = isLight ? "text-slate-600" : "text-white/65";

  const userId =
    backendUserId || userProfile?.identityId || userProfile?.email || "";

  const loadJobs = useCallback(async () => {
    if (!userId) {
      setJobsLoading(false);
      return;
    }
    const res = await apiListJobs(userId, "repair_pro");
    if (res.ok) setJobs(res.data.jobs);
    setJobsLoading(false);
  }, [userId]);

  useEffect(() => {
    void loadJobs();
    const t = window.setInterval(() => void loadJobs(), 5000);
    return () => window.clearInterval(t);
  }, [loadJobs]);

  const openJobs = jobs.filter(
    (j) =>
      !["released", "cancelled", "expired", "refunded"].includes(j.status)
  );

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
    <div className={cn("flex h-full min-h-0 flex-col", sheetBg)}>
      <div className={cn("z-20 shrink-0", sheetBg)}>
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
            title={
              proLive
                ? "You are Live — motorists can find you within range"
                : "You are Away — motorists cannot find you"
            }
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

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 pb-4 scrollbar-hide">
        {/* Idle status card — no nearby map */}
        <div
          className={cn(
            "rounded-2xl px-4 py-5 text-center",
            isLight ? "bg-white/70" : "bg-white/[0.06]"
          )}
        >
          <div
            className={cn(
              "mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl",
              proLive ? "bg-emerald-500/15" : "bg-[#e07a3d]/15"
            )}
          >
            <Radio
              className={cn(
                "h-7 w-7",
                proLive ? "text-emerald-500" : "text-[#e07a3d]"
              )}
            />
          </div>
          <p className={cn("text-[16px] font-black", ink)}>
            {proLive ? "You’re Live" : "You’re Away"}
          </p>
          <p className={cn("mt-1 text-[12px] font-medium leading-snug", muted)}>
            {proLive
              ? "Motorists within 10 km can find you (2 km while docs are under review). Your GPS is shared for discovery only — trip map appears after a job is booked."
              : "Go Live so motorists nearby can request you. We need GPS permission for your live pin."}
          </p>
          <Button
            className="mt-4 h-11 w-full max-w-xs"
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
            <p className="mt-2 text-[11px] font-semibold text-red-500">
              {liveErr}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className={cn("text-sm font-bold", ink)}>Incoming jobs</h2>
            <p className={cn("text-[11px]", muted)}>
              Text list · open a job for travel time & live map
            </p>
          </div>
          <Link
            href="/jobs"
            className="text-[12px] font-bold text-[#e07a3d]"
          >
            All jobs
          </Link>
        </div>

        {jobsLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-[#e07a3d]" />
          </div>
        ) : openJobs.length === 0 ? (
          <div
            className={cn(
              "rounded-2xl px-4 py-6 text-center",
              isLight ? "bg-black/[0.04]" : "bg-white/[0.04]"
            )}
          >
            <Briefcase
              className={cn("mx-auto h-8 w-8 opacity-40", muted)}
            />
            <p className={cn("mt-2 text-[13px] font-semibold", muted)}>
              Waiting for requests
            </p>
            <p className={cn("mt-1 text-[11px]", muted)}>
              {proLive
                ? "No open jobs yet. Stay Live near motorists."
                : "Go Live first so motorists can send jobs."}
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {openJobs.map((j) => (
              <li key={j.id}>
                <Link
                  href={`/jobs/${j.id}`}
                  className={cn(
                    "flex items-start gap-2 rounded-2xl px-3 py-3 transition active:scale-[0.99]",
                    isLight ? "bg-white/80" : "bg-white/[0.06]"
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="rounded-full bg-[#e07a3d]/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-[#e07a3d]">
                        {j.status.replace(/_/g, " ")}
                      </span>
                      <span className={cn("text-[11px] font-semibold", muted)}>
                        {PRO_SERVICE_LABELS[j.serviceType]}
                      </span>
                    </div>
                    <p className={cn("mt-1 text-[14px] font-black", ink)}>
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
                    <p className="mt-1 text-[11px] font-bold text-[#e07a3d]">
                      Open for travel time & live map →
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

        <p className={cn("px-1 text-center text-[10px] leading-snug", muted)}>
          Discovery map is motorist-only. Your map shows route, ETA and location
          only after a motorist books you.
        </p>
      </div>
    </div>
  );
}
