"use client";

/**
 * Professional dashboard — Live control, Incoming jobs, Recent Bookings.
 * Recent Bookings (finished) only when there is no open Incoming request.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Briefcase,
  ChevronRight,
  Clock3,
  Loader2,
  MapPin,
  Radio,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
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
      return "New Request";
    case "agreed":
      return "Agreed";
    case "en_route":
      return "On the road";
    case "arrived":
      return "Arrived";
    case "in_progress":
      return "Working";
    case "completed":
      return "Completed";
    case "satisfied":
    case "released":
      return "Finished";
    default:
      return String(status).replace(/_/g, " ");
  }
}

/** Open pipeline — active work */
const ACTIVE_INCOMING = new Set<JobFlowStatus>([
  "negotiating",
  "agreed",
  "paid_booked",
  "en_route",
  "arrived",
  "in_progress",
]);

/** Finished bookings for Recent Bookings */
const RECENT_FINISHED = new Set<JobFlowStatus>([
  "completed",
  "satisfied",
  "released",
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
  const [incoming, setIncoming] = useState<JobRecord[]>([]);
  const [recent, setRecent] = useState<JobRecord[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);

  const mySkill: ProService | null = isProService(registeredAs)
    ? registeredAs
    : proServices[0] ?? null;

  const roleLabel = mySkill
    ? PRO_SERVICE_LABELS[mySkill] ?? mySkill
    : "Professional";

  const stage = isLight ? "bg-[#c8c9cd]" : "bg-black";
  const ink = isLight ? "text-slate-900" : "text-white";
  const muted = isLight ? "text-slate-700" : "text-white/75";
  const hairline = isLight ? "border-black/10" : "border-white/10";

  const loadJobs = useCallback(async () => {
    if (!backendUserId) {
      setIncoming([]);
      setRecent([]);
      setJobsLoading(false);
      return;
    }
    const res = await apiListJobs(backendUserId, "repair_pro");
    if (res.ok) {
      const now = Date.now();
      const mine = res.data.jobs.filter((j) => {
        if (j.repairProId !== backendUserId) return false;
        if (!j.motoristId || !j.problem?.trim()) return false;
        return true;
      });

      const open = mine
        .filter((j) => {
          if (!ACTIVE_INCOMING.has(j.status)) return false;
          if (
            j.status === "negotiating" &&
            j.negotiateEndsAt &&
            now > new Date(j.negotiateEndsAt).getTime()
          ) {
            return false;
          }
          return true;
        })
        .sort((a, b) => {
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
        });

      const finished = mine
        .filter((j) => RECENT_FINISHED.has(j.status))
        .sort(
          (a, b) =>
            new Date(b.updatedAt || b.createdAt).getTime() -
            new Date(a.updatedAt || a.createdAt).getTime()
        )
        .slice(0, 12);

      setIncoming(open);
      setRecent(finished);
    } else {
      setIncoming([]);
      setRecent([]);
    }
    setJobsLoading(false);
  }, [backendUserId]);

  useEffect(() => {
    void loadJobs();
    const t = window.setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      void loadJobs();
    }, 8_000);
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

  /** Hide Recent Bookings whenever any open Incoming exists */
  const showRecent = incoming.length === 0;

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

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-3 pb-4 scrollbar-hide">
        {/* Live */}
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
          <button
            type="button"
            disabled={liveBusy}
            onClick={() => void toggleLive()}
            className={cn(
              "mt-3 inline-flex h-11 w-full items-center justify-center rounded-md border-0",
              "bg-[#2c2c2e] text-[14px] font-semibold text-white transition active:scale-[0.99]",
              "disabled:opacity-50"
            )}
          >
            {liveBusy ? "Updating…" : proLive ? "Go Away" : "Go Live"}
          </button>
          {liveErr && (
            <p className="mt-2 text-center text-[11px] font-semibold text-red-500">
              {liveErr}
            </p>
          )}
        </section>

        {/* Incoming jobs */}
        <section>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className={cn("text-[15px] font-black", ink)}>
              Incoming jobs
              {incoming.length > 0 ? (
                <span className="ml-1.5 text-[#e07a3d]">
                  ({incoming.length})
                </span>
              ) : null}
            </h2>
            <Link href="/jobs" className="text-[12px] font-bold text-[#e07a3d]">
              All jobs
            </Link>
          </div>
          <p className={cn("mb-2 text-[11px] font-medium leading-snug", muted)}>
            New requests pop up as Job request. Stay Live to receive them.
          </p>

          {jobsLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-[#e07a3d]" />
            </div>
          ) : incoming.length === 0 ? (
            <div className="py-6 text-center">
              <Briefcase className={cn("mx-auto h-7 w-7 opacity-40", muted)} />
              <p className={cn("mt-2 text-[13px] font-semibold", muted)}>
                No open requests
              </p>
            </div>
          ) : (
            <ul className="space-y-0 divide-y divide-black/10 dark:divide-white/10">
              {incoming.map((j) => {
                const skill =
                  PRO_SERVICE_LABELS[j.serviceType] ?? j.serviceType;
                const price =
                  j.agreedMajor != null
                    ? formatMoney(j.agreedMajor, j.currency)
                    : j.proBaseMajor != null
                      ? formatMoney(j.proBaseMajor, j.currency)
                      : null;
                return (
                  <li key={j.id}>
                    <Link
                      href={`/jobs/${j.id}`}
                      className="flex items-center gap-2.5 bg-transparent py-3 active:opacity-90"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span
                            className={cn(
                              "shrink-0 rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-white",
                              j.status === "paid_booked"
                                ? "bg-emerald-600"
                                : j.status === "negotiating"
                                  ? "bg-amber-500"
                                  : "bg-[#e07a3d]"
                            )}
                          >
                            {shortStatus(j.status)}
                          </span>
                          <span
                            className={cn(
                              "shrink-0 text-[10px] font-semibold",
                              muted
                            )}
                          >
                            {skill}
                          </span>
                          <p
                            className={cn(
                              "min-w-0 flex-1 truncate text-[15px] font-semibold",
                              ink
                            )}
                          >
                            {j.motoristName}
                          </p>
                        </div>
                        {j.locationLabel?.trim() && (
                          <p
                            className={cn(
                              "mt-1 flex items-center gap-1 text-[12px] font-medium",
                              muted
                            )}
                          >
                            <MapPin className="h-3 w-3 shrink-0 text-[#e07a3d]" />
                            <span className="truncate">{j.locationLabel}</span>
                          </p>
                        )}
                        {price && (
                          <p className="mt-0.5 text-[13px] font-semibold tabular-nums text-[#e07a3d]">
                            {price}
                          </p>
                        )}
                      </div>
                      <ChevronRight
                        className={cn("h-4 w-4 shrink-0", muted)}
                      />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Recent Bookings — only when no open Incoming */}
        {showRecent && (
          <section>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className={cn("text-[15px] font-black", ink)}>
                Recent Bookings
              </h2>
              <Link
                href="/history"
                className="text-[12px] font-bold text-[#e07a3d]"
              >
                History
              </Link>
            </div>
            <p className={cn("mb-2 text-[11px] font-medium leading-snug", muted)}>
              Finished jobs. Tap for process (view only).
            </p>

            {jobsLoading ? null : recent.length === 0 ? (
              <p className={cn("py-4 text-center text-[13px] font-medium", muted)}>
                No recent bookings yet
              </p>
            ) : (
              <ul className="space-y-0">
                {recent.map((j) => (
                  <li key={j.id}>
                    <Link
                      href={`/requests/${j.id}`}
                      className={cn(
                        "flex w-full items-start gap-2.5 border-0 border-b bg-transparent py-3 text-left last:border-b-0",
                        isLight ? "border-black/10" : "border-white/10"
                      )}
                    >
                      <Clock3
                        className="mt-0.5 h-4 w-4 shrink-0 text-[#e07a3d]"
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <p className={cn("truncate text-[15px] font-semibold", ink)}>
                          {j.motoristName}
                        </p>
                        <p
                          className={cn(
                            "mt-0.5 flex items-start gap-1 text-[12px] font-medium leading-snug",
                            muted
                          )}
                        >
                          <MapPin className="mt-0.5 h-3 w-3 shrink-0 opacity-70" />
                          <span className="line-clamp-2">
                            {j.locationLabel?.trim() || "Address not set"}
                          </span>
                        </p>
                        <p className={cn("mt-1 text-[10px] font-medium", muted)}>
                          {shortStatus(j.status)}
                          {j.agreedMajor != null
                            ? ` · ${formatMoney(j.agreedMajor, j.currency)}`
                            : ""}
                        </p>
                      </div>
                      <ChevronRight
                        className={cn("mt-0.5 h-4 w-4 shrink-0", muted)}
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
