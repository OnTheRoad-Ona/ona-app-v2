"use client";

/**
 * Pro dashboard — Uber-style list under Live (no section titles):
 * - Incoming: New Request only, real meet address (never “Current location”)
 * - Else Recent: clock + place name / area (non-clickable, completed only)
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, Clock3, Loader2, Radio } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { apiListJobs } from "@/lib/jobs/client";
import type { JobFlowStatus, JobRecord } from "@/lib/jobs/types";
import { isProService, PRO_SERVICE_LABELS } from "@/lib/services";
import { useApp } from "@/lib/store";
import type { ProService } from "@/lib/types";
import { cn } from "@/lib/utils";

/** New Request only — leaves dashboard after Accept */
const INCOMING_STATUSES = new Set<JobFlowStatus>(["negotiating"]);

/** Completed jobs only for Recent */
const RECENT_STATUSES = new Set<JobFlowStatus>([
  "completed",
  "satisfied",
  "released",
]);

/** Common city / area tokens for subtitle line */
const AREA_HINT =
  /\b(lekki|ikeja|ikoyi|vi|victoria island|island|ajah|yaba|surulere|gbagada|magodo|maryland|ojodu|berger|festac|apapa|mainland|abuja|lagos|phase\s*\d*|estate|gate|route|alternative)\b/i;

/** Labels that are pro GPS noise, not motorist meet address */
function isGenericLocation(label: string): boolean {
  const t = label.trim().toLowerCase();
  if (!t) return true;
  return (
    t === "current location" ||
    t === "locating…" ||
    t === "locating..." ||
    t === "near you" ||
    t === "last known location" ||
    t === "live location" ||
    t === "pinned location" ||
    t === "pinned"
  );
}

function meetAddress(j: JobRecord): string | null {
  const raw = (j.locationLabel || "").trim();
  if (!raw || isGenericLocation(raw)) return null;
  return raw;
}

/**
 * Uber-style split from full Google address:
 * title = street / first segment
 * subtitle = everything under (area, city, …)
 * Always try to produce a second line when the full address has commas.
 */
function splitPlaceAndArea(label: string): {
  title: string;
  subtitle: string | null;
} {
  const raw = label.trim();
  if (!raw) return { title: "", subtitle: null };
  // "7b Oye Balogun Street, Lekki, Lagos, Nigeria"
  const parts = raw
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length >= 2) {
    return {
      title: parts[0],
      subtitle: parts.slice(1).join(", "),
    };
  }
  // Single phrase: try trailing area keyword
  const words = raw.split(/\s+/);
  if (words.length >= 2) {
    for (let i = words.length - 1; i >= 1; i--) {
      const tail = words.slice(i).join(" ");
      if (AREA_HINT.test(tail)) {
        return {
          title: words.slice(0, i).join(" "),
          subtitle: tail,
        };
      }
    }
  }
  return { title: raw, subtitle: null };
}

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

        {/* Incoming — live request only, real meet address (no labels) */}
        {!jobsLoading && showIncoming && (
          <ul className="space-y-0">
            {incoming.map((j) => {
              const addr = meetAddress(j);
              return (
                <li key={j.id}>
                  <Link
                    href={`/jobs/${j.id}`}
                    className={cn(
                      "flex items-center gap-3 border-0 border-b bg-transparent py-3.5 active:opacity-90",
                      isLight ? "border-black/10" : "border-white/10"
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          "truncate text-[15px] font-semibold",
                          ink
                        )}
                      >
                        {j.motoristName}
                      </p>
                      {addr ? (
                        <p
                          className={cn(
                            "mt-0.5 truncate text-[12px] font-medium",
                            muted
                          )}
                        >
                          {addr}
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
              );
            })}
          </ul>
        )}

        {/* Recent completed — clock + Uber place/area, no lines, not clickable */}
        {!jobsLoading && showRecent && (
          <ul className="space-y-3">
            {recent.map((j) => {
              const addr = meetAddress(j);
              if (!addr) return null;
              const { title, subtitle } = splitPlaceAndArea(addr);
              if (!title) return null;
              return (
                <li
                  key={j.id}
                  className="flex items-start gap-2.5 border-0 bg-transparent py-0.5"
                >
                  <Clock3
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#e07a3d]"
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        "text-[13px] font-semibold leading-snug",
                        ink
                      )}
                    >
                      {title}
                    </p>
                    {subtitle ? (
                      <p
                        className={cn(
                          "mt-0.5 text-[11px] font-medium leading-snug",
                          muted
                        )}
                      >
                        {subtitle}
                      </p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
