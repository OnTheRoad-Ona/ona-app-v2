"use client";

/**
 * Professional dashboard — flat on the main app stage (no nested glass panels).
 * Incoming jobs only after a motorist has requested this pro (active flow).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Briefcase,
  Loader2,
  MapPin,
  Radio,
  Wrench,
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

function statusPresentation(status: JobFlowStatus): {
  label: string;
  tone: "emerald" | "copper" | "amber" | "slate" | "red";
} {
  switch (status) {
    case "paid_booked":
      return { label: "Paid · Booked", tone: "emerald" };
    case "negotiating":
      return { label: "Negotiating", tone: "amber" };
    case "agreed":
      return { label: "Price agreed", tone: "copper" };
    case "en_route":
      return { label: "On the road", tone: "copper" };
    case "arrived":
      return { label: "Arrived", tone: "copper" };
    case "in_progress":
      return { label: "Working", tone: "copper" };
    case "completed":
    case "satisfied":
      return { label: "Complete", tone: "emerald" };
    case "disputed":
    case "under_appeal":
      return { label: status === "disputed" ? "Dispute" : "Appeal", tone: "red" };
    default:
      return {
        label: status.replace(/_/g, " "),
        tone: "slate",
      };
  }
}

const toneClass = {
  emerald: "bg-emerald-600 text-white",
  copper: "bg-[#e07a3d] text-white",
  amber: "bg-amber-500 text-white",
  slate: "bg-slate-700 text-white",
  red: "bg-red-500 text-white",
} as const;

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
    const t = window.setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      void loadJobs();
    }, 12_000);
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
          s === "negotiating" ? 0 : s === "agreed" ? 1 : s === "paid_booked" ? 2 : 3;
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

        <section className="space-y-3">
          {/* Section header */}
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2
                  className={cn(
                    "text-[17px] font-black tracking-tight",
                    ink
                  )}
                >
                  Incoming jobs
                </h2>
                {jobs.length > 0 && (
                  <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-[#e07a3d] px-2 text-[11px] font-black text-white">
                    {jobs.length}
                  </span>
                )}
              </div>
              <p
                className={cn(
                  "mt-0.5 text-[11px] font-medium",
                  isLight ? "text-slate-500" : "text-white/45"
                )}
              >
                New requests stay visible even mid-job
              </p>
            </div>
            <Link
              href="/jobs"
              className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-bold transition active:scale-[0.98]",
                isLight
                  ? "bg-white/80 text-[#c45a20] shadow-sm ring-1 ring-black/6"
                  : "bg-[#2c2c2e] text-[#e07a3d]"
              )}
            >
              All jobs
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {/* Compact tip */}
          <div
            className={cn(
              "flex gap-2.5 rounded-2xl px-3 py-2.5",
              isLight
                ? "bg-white/55 ring-1 ring-black/5"
                : "bg-[#1a1a1c] ring-1 ring-white/8"
            )}
          >
            <span
              className={cn(
                "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-xl",
                proLive ? "bg-emerald-500/15 text-emerald-600" : "bg-[#e07a3d]/15 text-[#e07a3d]"
              )}
            >
              <Radio className="h-3.5 w-3.5" />
            </span>
            <p
              className={cn(
                "text-[11px] font-medium leading-snug",
                isLight ? "text-slate-600" : "text-white/60"
              )}
            >
              {proLive ? (
                <>
                  You’re <span className="font-bold text-emerald-600">Live</span>
                  {" — "}new motorist requests keep arriving. Open any job if
                  the current one isn’t a fit.
                </>
              ) : (
                <>
                  Go <span className="font-bold text-[#e07a3d]">Live</span> to
                  receive new requests while other jobs stay open.
                </>
              )}
            </p>
          </div>

          {jobsLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-[#e07a3d]" />
            </div>
          ) : sortedJobs.length === 0 ? (
            <div
              className={cn(
                "flex flex-col items-center rounded-2xl px-4 py-10 text-center",
                isLight
                  ? "bg-white/50 ring-1 ring-black/5"
                  : "bg-[#141414] ring-1 ring-white/8"
              )}
            >
              <span
                className={cn(
                  "flex h-12 w-12 items-center justify-center rounded-2xl",
                  isLight ? "bg-black/5" : "bg-white/5"
                )}
              >
                <Briefcase
                  className={cn("h-6 w-6 opacity-50", muted)}
                />
              </span>
              <p className={cn("mt-3 text-[14px] font-bold", ink)}>
                No incoming jobs yet
              </p>
              <p className={cn("mt-1 max-w-[220px] text-[12px] font-medium", muted)}>
                When a motorist requests you, it will appear here as a card.
              </p>
            </div>
          ) : (
            <ul className="space-y-2.5">
              {sortedJobs.map((j) => {
                const st = statusPresentation(j.status);
                const skill =
                  PRO_SERVICE_LABELS[j.serviceType] ?? j.serviceType;
                return (
                  <li key={j.id}>
                    <Link
                      href={`/jobs/${j.id}`}
                      className={cn(
                        "block overflow-hidden rounded-2xl shadow-sm ring-1 transition active:scale-[0.99]",
                        isLight
                          ? "bg-[#d4d5d9] ring-black/8"
                          : "bg-[#1a1a1c] ring-white/10"
                      )}
                    >
                      {/* Status strip */}
                      <div
                        className={cn(
                          "flex items-center justify-between gap-2 px-3.5 py-2",
                          isLight ? "bg-white/55" : "bg-white/[0.04]"
                        )}
                      >
                        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                          <span
                            className={cn(
                              "inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.06em]",
                              toneClass[st.tone]
                            )}
                          >
                            {st.label}
                          </span>
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 truncate text-[11px] font-bold",
                              isLight ? "text-slate-600" : "text-white/55"
                            )}
                          >
                            <Wrench className="h-3 w-3 shrink-0 text-[#e07a3d]" />
                            {skill}
                          </span>
                        </div>
                        <ArrowUpRight
                          className={cn(
                            "h-4 w-4 shrink-0",
                            isLight ? "text-slate-400" : "text-white/35"
                          )}
                        />
                      </div>

                      <div className="space-y-2.5 px-3.5 py-3">
                        {/* Motorist + price */}
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p
                              className={cn(
                                "text-[10px] font-bold uppercase tracking-[0.12em]",
                                isLight ? "text-slate-500" : "text-white/40"
                              )}
                            >
                              Motorist
                            </p>
                            <p
                              className={cn(
                                "mt-0.5 truncate text-[16px] font-black tracking-tight",
                                ink
                              )}
                            >
                              {j.motoristName}
                            </p>
                          </div>
                          {j.agreedMajor != null ? (
                            <div className="shrink-0 text-right">
                              <p className="text-[10px] font-bold uppercase tracking-wide text-[#e07a3d]/90">
                                Labour
                              </p>
                              <p className="text-[16px] font-black tabular-nums text-[#e07a3d]">
                                {formatMoney(j.agreedMajor, j.currency)}
                              </p>
                            </div>
                          ) : j.proBaseMajor != null ? (
                            <div className="shrink-0 text-right">
                              <p className="text-[10px] font-bold uppercase tracking-wide text-[#e07a3d]/90">
                                Offer
                              </p>
                              <p className="text-[16px] font-black tabular-nums text-[#e07a3d]">
                                {formatMoney(j.proBaseMajor, j.currency)}
                              </p>
                            </div>
                          ) : null}
                        </div>

                        {/* Problem */}
                        {j.problem?.trim() && (
                          <div
                            className={cn(
                              "rounded-xl px-3 py-2",
                              isLight ? "bg-white/70" : "bg-black/35"
                            )}
                          >
                            <p
                              className={cn(
                                "text-[10px] font-bold uppercase tracking-[0.12em]",
                                isLight ? "text-slate-500" : "text-white/40"
                              )}
                            >
                              Problem
                            </p>
                            <p
                              className={cn(
                                "mt-0.5 line-clamp-2 text-[13px] font-semibold leading-snug",
                                ink
                              )}
                            >
                              {j.problem}
                            </p>
                          </div>
                        )}

                        {/* Location */}
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
                              isLight
                                ? "bg-white text-[#e07a3d]"
                                : "bg-[#2c2c2e] text-[#e07a3d]"
                            )}
                          >
                            <MapPin className="h-3.5 w-3.5" />
                          </span>
                          <p
                            className={cn(
                              "min-w-0 flex-1 truncate text-[12px] font-semibold",
                              isLight ? "text-slate-700" : "text-white/75"
                            )}
                          >
                            {j.locationLabel || "Location on map"}
                          </p>
                          <span
                            className={cn(
                              "shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold",
                              isLight
                                ? "bg-slate-900 text-white"
                                : "bg-white/10 text-white"
                            )}
                          >
                            Open
                          </span>
                        </div>
                      </div>
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
