"use client";

/**
 * Professional dashboard — solid stage, compact incoming jobs, low data use.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Briefcase,
  ChevronRight,
  Loader2,
  Radio,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { apiListJobs } from "@/lib/jobs/client";
import type { JobFlowStatus, JobRecord } from "@/lib/jobs/types";
import { formatMoney } from "@/lib/pricing";
import { isProService, PRO_SERVICE_LABELS } from "@/lib/services";
import { useApp } from "@/lib/store";
import type { ProService } from "@/lib/types";
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

  const stage = isLight ? "bg-[#c8c9cd]" : "bg-black";
  const ink = isLight ? "text-slate-900" : "text-white";
  const muted = isLight ? "text-slate-600" : "text-[#a1a1a6]";
  const hairline = isLight ? "border-black/10" : "border-white/10";
  /** Solid row surface — no translucency */
  const row = isLight ? "bg-[#bebfc4]" : "bg-[#141414]";

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
    // Low data: 60s poll when visible (Realtime also covers own jobs)
    const t = window.setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      void loadJobs();
    }, 60_000);
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

  const sortedJobs = useMemo(
    () =>
      [...jobs].sort((a, b) => {
        const rank = (s: string) =>
          s === "negotiating"
            ? 0
            : s === "agreed"
              ? 1
              : s === "paid_booked"
                ? 2
                : 3;
        const d = rank(a.status) - rank(b.status);
        if (d !== 0) return d;
        return (
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      }),
    [jobs]
  );

  return (
    <div className={cn("flex h-full min-h-0 flex-col", stage)}>
      <div className={cn("z-20 shrink-0", stage)}>
        <PageHeader
          title="Professional Dashboard"
          subtitle={`${roleLabel} · ${userProfile?.fullName || displayName || "Pro"}`}
          showBack={false}
        />
        <div className="flex items-center justify-between gap-2 px-3 pb-2">
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
              "inline-flex shrink-0 items-center gap-2 border-0 bg-transparent px-0 py-1 text-xs font-bold",
              proLive
                ? "text-emerald-600"
                : isLight
                  ? "text-slate-500"
                  : "text-[#a1a1a6]"
            )}
            aria-pressed={proLive}
          >
            <span
              className={cn(
                "inline-flex h-2 w-2 rounded-full",
                proLive ? "bg-emerald-500" : "bg-slate-400"
              )}
            />
            {liveBusy ? "…" : proLive ? "Live" : "Away"}
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 pb-4 scrollbar-hide">
        {/* Live — flat, no layered cards */}
        <section className={cn("border-b pb-4", hairline)}>
          <div className="flex items-center gap-3">
            <Radio
              className={cn(
                "h-5 w-5 shrink-0",
                proLive ? "text-emerald-500" : "text-[#e07a3d]"
              )}
            />
            <div className="min-w-0 flex-1">
              <p className={cn("text-[15px] font-black", ink)}>
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
            className="mt-3 h-10 w-full"
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

        {/* Incoming jobs — compact solid rows, no nested transparent layers */}
        <section>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className={cn("text-[15px] font-black", ink)}>
              Incoming jobs
              {jobs.length > 0 ? (
                <span className="ml-1.5 text-[#e07a3d]">({jobs.length})</span>
              ) : null}
            </h2>
            <Link
              href="/jobs"
              className="text-[12px] font-bold text-[#e07a3d]"
            >
              All jobs
            </Link>
          </div>

          <p className={cn("mb-2 text-[11px] font-medium leading-snug", muted)}>
            Stay Live for new requests — even with a job open.
          </p>

          {jobsLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-[#e07a3d]" />
            </div>
          ) : sortedJobs.length === 0 ? (
            <div className="py-8 text-center">
              <Briefcase className={cn("mx-auto h-7 w-7 opacity-40", muted)} />
              <p className={cn("mt-2 text-[13px] font-semibold", muted)}>
                Waiting for requests
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {sortedJobs.map((j) => {
                const skill =
                  PRO_SERVICE_LABELS[j.serviceType] ?? j.serviceType;
                const price =
                  j.agreedMajor != null
                    ? formatMoney(j.agreedMajor, j.currency)
                    : j.proBaseMajor != null
                      ? formatMoney(j.proBaseMajor, j.currency)
                      : null;
                const status = shortStatus(j.status);
                return (
                  <li key={j.id}>
                    <Link
                      href={`/jobs/${j.id}`}
                      className={cn(
                        "flex items-center gap-2.5 rounded-lg px-3 py-3 active:opacity-90",
                        row
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        {/* Status + skill in front of name — one clean line */}
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
                            {j.motoristName}
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
          )}
        </section>
      </div>
    </div>
  );
}
