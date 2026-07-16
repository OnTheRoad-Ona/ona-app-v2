"use client";

/**
 * Pro dashboard — Uber-style list slot under Live:
 * - New Request (negotiating) only while not yet accepted
 * - Otherwise Recent Bookings: address + car type (if set)
 * No section titles, descriptions, or History/All jobs links.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Car, ChevronRight, Clock3, Loader2, MapPin, Radio } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { apiListJobs } from "@/lib/jobs/client";
import type { JobFlowStatus, JobRecord } from "@/lib/jobs/types";
import { isProService, PRO_SERVICE_LABELS } from "@/lib/services";
import { useApp } from "@/lib/store";
import type { ProService } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Only unaccepted new requests sit in the Incoming slot */
const INCOMING_STATUSES = new Set<JobFlowStatus>(["negotiating"]);

const RECENT_STATUSES = new Set<JobFlowStatus>([
  "completed",
  "satisfied",
  "released",
  "cancelled",
  "expired",
  "refunded",
  // After accept, job leaves Incoming but is not yet “recent finished”
  // agreed / paid / trip still not listed here (Uber: gone from home list)
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

      // Incoming = New Request only (disappears after Accept / can fix)
      const open = mine
        .filter((j) => {
          if (!INCOMING_STATUSES.has(j.status)) return false;
          if (
            j.negotiateEndsAt &&
            now > new Date(j.negotiateEndsAt).getTime()
          ) {
            return false;
          }
          return true;
        })
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );

      const finished = mine
        .filter((j) => RECENT_STATUSES.has(j.status))
        .sort(
          (a, b) =>
            new Date(b.updatedAt || b.createdAt).getTime() -
            new Date(a.updatedAt || a.createdAt).getTime()
        )
        .slice(0, 20);

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
    }, 6_000);
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

  // Uber-style: one list slot under Live
  const showIncoming = incoming.length > 0;
  const showRecent = !showIncoming && recent.length > 0;

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

        {jobsLoading && (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-[#e07a3d]" />
          </div>
        )}

        {/* Incoming job rows only — no title / description */}
        {!jobsLoading && showIncoming && (
          <ul className="space-y-0">
            {incoming.map((j) => (
              <li key={j.id}>
                <Link
                  href={`/jobs/${j.id}`}
                  className={cn(
                    "flex items-center gap-3 border-0 border-b bg-transparent py-3.5 active:opacity-90",
                    isLight ? "border-black/10" : "border-white/10"
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className={cn("truncate text-[15px] font-semibold", ink)}>
                      {j.motoristName}
                    </p>
                    {j.locationLabel?.trim() ? (
                      <p
                        className={cn(
                          "mt-0.5 flex items-center gap-1 text-[12px] font-medium",
                          muted
                        )}
                      >
                        <MapPin className="h-3 w-3 shrink-0 text-[#e07a3d]" />
                        <span className="truncate">{j.locationLabel}</span>
                      </p>
                    ) : null}
                    {j.problem?.trim() ? (
                      <p
                        className={cn(
                          "mt-0.5 line-clamp-1 text-[12px] font-medium",
                          muted
                        )}
                      >
                        {j.problem}
                      </p>
                    ) : null}
                  </div>
                  <ChevronRight className={cn("h-4 w-4 shrink-0", muted)} />
                </Link>
              </li>
            ))}
          </ul>
        )}

        {/* Recent: address + car type only — same slot, no titles */}
        {!jobsLoading && showRecent && (
          <ul className="space-y-0">
            {recent
              .filter(
                (j) =>
                  Boolean(j.locationLabel?.trim()) ||
                  Boolean(j.motoristVehicle?.trim())
              )
              .map((j) => {
                const address = j.locationLabel?.trim() || "";
                const car = (j.motoristVehicle || "").trim();
                return (
                  <li key={j.id}>
                    <Link
                      href={`/requests/${j.id}`}
                      className={cn(
                        "flex w-full items-start gap-2.5 border-0 border-b bg-transparent py-3.5 text-left last:border-b-0",
                        isLight ? "border-black/10" : "border-white/10"
                      )}
                    >
                      <Clock3
                        className="mt-0.5 h-4 w-4 shrink-0 text-[#e07a3d]"
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1 space-y-1">
                        {address ? (
                          <p
                            className={cn(
                              "flex items-start gap-1.5 text-[14px] font-semibold leading-snug",
                              ink
                            )}
                          >
                            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#e07a3d]" />
                            <span className="line-clamp-2">{address}</span>
                          </p>
                        ) : null}
                        {car ? (
                          <p
                            className={cn(
                              "flex items-center gap-1.5 pl-0.5 text-[12px] font-medium",
                              muted
                            )}
                          >
                            <Car className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{car}</span>
                          </p>
                        ) : null}
                      </div>
                      <ChevronRight
                        className={cn("mt-0.5 h-4 w-4 shrink-0", muted)}
                      />
                    </Link>
                  </li>
                );
              })}
          </ul>
        )}
      </div>
    </div>
  );
}
