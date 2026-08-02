"use client";

/**
 * Pro dashboard — Uber-style list under Live (no section titles):
 * - Incoming: Service Request only, real meet address (never “Current location”)
 * - Recent: Uber place + area only (never problem text / demo address)
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Clock, Loader2, Radio, Shield } from "lucide-react";
import { isAutomotiveTrade } from "@/lib/artisan/catalog";
import { BankForcePanel } from "@/components/auth/bank-force-panel";
import { PageHeader } from "@/components/layout/page-header";
import { getArtisanProfile } from "@/lib/artisan/local-store";
import {
  canGoLive,
  resolveVisibilityTier,
  tier2GoLiveWarning,
} from "@/lib/artisan/status";
import { nextProEmbedTierStep } from "@/lib/artisan/verification-order";
import type { ArtisanVerificationProfile } from "@/lib/artisan/types";
import { apiListJobs } from "@/lib/jobs/client";
import type { JobFlowStatus, JobRecord } from "@/lib/jobs/types";
import { useT } from "@/lib/i18n";
import { isProService, PRO_SERVICE_LABELS } from "@/lib/services";
import {
  isCustomerToProDualPath,
  proT2CareApproved,
} from "@/lib/pro-switch-onboarding";
import { useApp } from "@/lib/store";
import type { ProService } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Service Request only — leaves dashboard after Accept */
const INCOMING_STATUSES = new Set<JobFlowStatus>(["negotiating"]);

/** Active work the pro can open quickly (agreed → in progress → awaiting customer) */
const ONGOING_STATUSES = new Set<JobFlowStatus>([
  "agreed",
  "paid_booked",
  "en_route",
  "arrived",
  "in_progress",
  "completed",
]);

/** Past / closed jobs for Recent — same set for every trade (Battery, Vulcanizer, …) */
const RECENT_STATUSES = new Set<JobFlowStatus>([
  "satisfied",
  "released",
]);

function ongoingStatusLabel(st: JobFlowStatus): string {
  switch (st) {
    case "agreed":
      return "Awaiting payment";
    case "paid_booked":
      return "Booked · start trip";
    case "en_route":
      return "En route";
    case "arrived":
      return "Arrived";
    case "in_progress":
      return "In progress";
    case "completed":
      return "Awaiting customer confirm";
    default:
      return st;
  }
}

/** Common city / area tokens for subtitle line */
const AREA_HINT =
  /\b(lekki|ikeja|ikoyi|vi|victoria island|island|ajah|yaba|surulere|gbagada|magodo|maryland|ojodu|berger|festac|apapa|mainland|abuja|lagos|phase\s*\d*|estate|gate|route|alternative)\b/i;

/** Away CTA when already Live — rotates every 3 hours */
const LIVE_AWAY_LABELS = [
  "Take Time Off",
  "Take Some Rest",
  "Go Away",
] as const;
const LIVE_AWAY_ROTATE_MS = 3 * 60 * 60 * 1000;

function liveAwayButtonLabel(now = Date.now()): string {
  const i = Math.floor(now / LIVE_AWAY_ROTATE_MS) % LIVE_AWAY_LABELS.length;
  return LIVE_AWAY_LABELS[i];
}

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

/** e.g. Mechanic → "Mechanic Dashboard"; unknown → "Repair Pro Dashboard" */
function skillDashboardTitle(skill: ProService | string | null | undefined): string {
  const raw = String(skill || "").trim().toLowerCase();
  if (raw && isProService(raw)) {
    return `${PRO_SERVICE_LABELS[raw]} Dashboard`;
  }
  // Specialty-only strings sometimes stored without catalog id
  if (raw) {
    const pretty = raw
      .split(/[\s_/|-]+/)
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
    if (pretty) return `${pretty} Dashboard`;
  }
  return "Repair Pro Dashboard";
}

export default function TechnicianDashboardPage() {
  const {
    theme,
    proLive,
    setProLive,
    backendUserId,
    accountType,
    isAuthenticated,
    switchAccount,
    hasProAccount,
    hasMotoristAccount,
    primaryAccountType,
    userProfile,
    proServices,
    setProOnboardingSheetRequired,
  } = useApp();
  const t = useT();
  const isLight = theme === "light";
  const dualCtoPro = isCustomerToProDualPath({
    hasMotoristAccount,
    hasProAccount,
    accountType,
    primaryAccountType,
  });
  const [liveBusy, setLiveBusy] = useState(false);
  const [liveErr, setLiveErr] = useState<string | null>(null);
  const [incoming, setIncoming] = useState<JobRecord[]>([]);
  const [ongoing, setOngoing] = useState<JobRecord[]>([]);
  const [recent, setRecent] = useState<JobRecord[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [awayLabel, setAwayLabel] = useState(() => liveAwayButtonLabel());
  const [artisan, setArtisan] = useState<ArtisanVerificationProfile | null>(
    null
  );
  const t2CareOk = proT2CareApproved(userProfile, artisan);
  const [switchBusy, setSwitchBusy] = useState(false);
  const [jobsCompletedCount, setJobsCompletedCount] = useState(0);

  const dashboardTitle = useMemo(() => {
    const fromArtisan = artisan?.trade?.service;
    const fromProfile = userProfile?.services?.[0];
    const fromProList = proServices?.[0];
    return skillDashboardTitle(fromArtisan || fromProfile || fromProList);
  }, [artisan?.trade?.service, userProfile?.services, proServices]);

  useEffect(() => {
    if (!backendUserId) {
      setArtisan(null);
      setJobsCompletedCount(0);
      return;
    }
    try {
      setArtisan(getArtisanProfile(backendUserId));
    } catch {
      setArtisan(null);
    }
    // Jobs completed = times customers tapped I am Satisfied (released)
    let cancelled = false;
    void (async () => {
      try {
        const res = await apiListJobs(backendUserId, "repair_pro");
        if (cancelled || !res.ok) return;
        const n = (res.data.jobs || []).filter((j) =>
          ["satisfied", "released"].includes(j.status)
        ).length;
        setJobsCompletedCount(n);
      } catch {
        /* keep 0 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [backendUserId]);

  useEffect(() => {
    if (!backendUserId) {
      return;
    }

    let cancelled = false;
    const sync = async () => {
      try {
        const { syncArtisanCareStatus } = await import(
          "@/lib/artisan/sync-care-status"
        );
        const result = await syncArtisanCareStatus(backendUserId);
        if (!cancelled && result.ok && result.profile) {
          setArtisan(result.profile);
        }
      } catch {
        /* offline */
      }
    };
    void sync();
    const poll = window.setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      void sync();
    }, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(poll);
    };
  }, [backendUserId, proLive, liveErr]);

  const stage = isLight ? "bg-[#c8c9cd]" : "bg-black";
  const ink = isLight ? "text-slate-900" : "text-white";
  const muted = isLight ? "text-slate-700" : "text-white/75";
  const hairline = isLight ? "border-black/10" : "border-white/10";

  const loadJobs = useCallback(async () => {
    if (!backendUserId) {
      setIncoming([]);
      setOngoing([]);
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

      const active = mine
        .filter((j) => ONGOING_STATUSES.has(j.status))
        .sort(
          (a, b) =>
            new Date(b.updatedAt || b.createdAt).getTime() -
            new Date(a.updatedAt || a.createdAt).getTime()
        );

      const finished = mine
        .filter((j) => RECENT_STATUSES.has(j.status))
        .sort(
          (a, b) =>
            new Date(b.updatedAt || b.createdAt).getTime() -
            new Date(a.updatedAt || a.createdAt).getTime()
        )
        .slice(0, 6);

      setIncoming(open);
      setOngoing(active);
      setRecent(finished);
    } else {
      setIncoming([]);
      setOngoing([]);
      setRecent([]);
    }
    setJobsLoading(false);
  }, [backendUserId]);

  useEffect(() => {
    void loadJobs();
    const t = window.setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      void loadJobs();
    }, 180_000);
    return () => window.clearInterval(t);
  }, [loadJobs]);

  // Refresh Away button copy when the 3-hour slot rolls over (local only)
  useEffect(() => {
    if (!proLive) return;
    const tick = () => setAwayLabel(liveAwayButtonLabel());
    tick();
    const t = window.setInterval(tick, 300_000);
    return () => window.clearInterval(t);
  }, [proLive]);

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
  const showOngoing = ongoing.length > 0;
  /** Same for every trade: Recent always when finished jobs exist (not hidden by Incoming). */
  const showRecent = recent.length > 0;

  // Always paint a shell — never blank when role/session is mid-switch
  if (isAuthenticated && accountType !== "professional") {
    return (
      <div className={cn("flex h-full min-h-0 flex-col", stage)}>
        <PageHeader title={dashboardTitle} showBack={false} />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-5 text-center">
          <p className={cn("text-[15px] font-bold", ink)}>
            You are on Customer mode
          </p>
          <p className={cn("max-w-[280px] text-[12px] leading-relaxed", muted)}>
            {hasProAccount
              ? "Switch to Repair Pro to open this dashboard and Go Live."
              : "Create a Repair Pro account from the menu (Use as · Repair Pro) to use the professional dashboard."}
          </p>
          {hasProAccount ? (
            <button
              type="button"
              disabled={switchBusy}
              className="mt-1 inline-flex h-11 items-center justify-center rounded-md bg-[#2c2c2e] px-5 text-[14px] font-semibold text-white disabled:opacity-50"
              onClick={() => {
                setSwitchBusy(true);
                void switchAccount("professional").finally(() =>
                  setSwitchBusy(false)
                );
              }}
            >
              {switchBusy ? "Switching…" : "Use as Repair Pro"}
            </button>
          ) : (
            <Link
              href="/signup/pro?from=profile&next=/dashboard"
              className="mt-1 inline-flex h-11 items-center justify-center rounded-md bg-[#2c2c2e] px-5 text-[14px] font-semibold text-white"
            >
              Become a Repair Pro
            </Link>
          )}
          <Link
            href="/"
            className={cn("text-[12px] font-bold text-[#FF6B35]", "mt-1")}
          >
            Back to customer home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("relative flex h-full min-h-0 flex-col", stage)}>
      <BankForcePanel surface="dashboard" />
      <div className={cn("z-20 shrink-0", stage)}>
        <PageHeader
          title={dashboardTitle}
          showBack={false}
        />
        <div className="flex items-center justify-end gap-2 px-3 pb-2">
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
            {liveBusy ? "…" : proLive ? "Live" : "Live"}
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col space-y-4 overflow-y-auto px-3 pb-4 scrollbar-hide">
        {/* Verification above Go Live — card must contrast with shell (#c8c9cd / black) */}
        {artisan || dualCtoPro ? (
          <section
            className={cn(
              "rounded-md px-3 py-3",
              isLight
                ? "bg-white shadow-[0_1px_0_rgba(0,0,0,0.06)] ring-1 ring-black/10"
                : "bg-[#1c1c1e] ring-1 ring-white/15"
            )}
          >
            {(() => {
              const tier = artisan
                ? resolveVisibilityTier(artisan)
                : t2CareOk
                  ? 2
                  : 1;
              const hasApproved =
                tier >= 2 ||
                t2CareOk ||
                Boolean(artisan?.tiers?.tier2_govId) ||
                artisan?.govIdReviewStatus === "approved";
              const nextStep = artisan
                ? nextProEmbedTierStep(artisan, {
                    hidePhone: Boolean(
                      artisan.tiers?.tier1_phone ||
                        userProfile?.phoneVerified
                    ),
                    hideGovId: t2CareOk,
                  })
                : t2CareOk
                  ? "liveness"
                  : "phone";
              const needsContinue = nextStep !== "done";
              const g = artisan
                ? canGoLive(artisan)
                : { allowed: false, message: "" };
              const warn =
                artisan?.status === "approved"
                  ? tier2GoLiveWarning(artisan)
                  : null;
              const statusLine =
                !needsContinue && artisan && artisan.status !== "approved"
                  ? artisan.status === "draft"
                    ? t("gate.finishBeforeLive")
                    : g.allowed
                      ? ""
                      : g.message
                  : "";
              const openSetup = () => {
                setProOnboardingSheetRequired(true);
                void import("@/components/pro/pro-onboarding-sheet").then(
                  (m) => m.requestProOnboardingSheetExpand()
                );
              };
              return (
                <div className="flex items-start gap-2">
                  <Shield
                    className="mt-0.5 h-5 w-5 shrink-0"
                    strokeWidth={2.25}
                    style={
                      hasApproved
                        ? {
                            // Solid green fill — readable on light and dark cards
                            color: isLight ? "#047857" : "#6ee7b7",
                            fill: isLight ? "#059669" : "#10b981",
                          }
                        : {
                            color: "#FF6B35",
                            fill: "none",
                          }
                    }
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p className={cn("text-[13px] font-bold", ink)}>
                      Tier {tier}
                    </p>
                    {statusLine ? (
                      <p
                        className={cn(
                          "mt-0.5 text-[11px] font-medium",
                          muted
                        )}
                      >
                        {statusLine}
                      </p>
                    ) : null}
                    {warn && !needsContinue ? (
                      <p className="mt-1.5 text-[11px] font-semibold text-[#FF6B35]">
                        {warn}
                      </p>
                    ) : null}
                    {needsContinue ? (
                      dualCtoPro ? (
                        <button
                          type="button"
                          className="mt-1.5 inline-flex border-0 bg-transparent p-0 text-[11px] font-semibold text-[#FF6B35]"
                          onClick={openSetup}
                        >
                          Continue Verification
                        </button>
                      ) : artisan ? (
                        <Link
                          href="/artisan/verification"
                          className="mt-1.5 inline-flex text-[11px] font-semibold text-[#FF6B35]"
                        >
                          Continue Verification
                        </Link>
                      ) : null
                    ) : null}
                  </div>
                </div>
              );
            })()}
          </section>
        ) : null}

        <section className="pb-4">
          <div className="flex items-center gap-3">
            <Radio
              className={cn(
                "h-5 w-5 shrink-0",
                proLive ? "text-emerald-500" : "text-[#FF6B35]"
              )}
            />
            <div className="min-w-0 flex-1">
              <p className={cn("text-[15px] font-black", ink)}>
                {proLive ? "You are Live" : "Go Live"}
              </p>
              <p className={cn("text-[10px] font-medium leading-snug", muted)}>
                {proLive
                  ? "You’re Live. Customers nearby can find you."
                  : "Customers nearby can find you when you’re Live."}
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
            {liveBusy
              ? "Updating…"
              : proLive
                ? awayLabel
                : "Go Live"}
          </button>
          {liveErr && (
            <p className="mt-2 text-center text-[11px] font-semibold text-red-500">
              {liveErr}
            </p>
          )}
        </section>

        {jobsLoading && (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-[#FF6B35]" />
          </div>
        )}

        {/* Incoming requests */}
        {!jobsLoading && showIncoming && (
          <section>
            <p
              className={cn(
                "mb-1 text-[11px] font-black uppercase tracking-[0.12em]",
                muted
              )}
            >
              Incoming requests
            </p>
            <ul className="space-y-0">
              {incoming.map((j) => {
                const addr = meetAddress(j);
                return (
                  <li key={j.id}>
                    <Link
                      href={`/jobs/${j.id}`}
                      className="flex items-center gap-3 border-0 bg-transparent py-3.5 active:opacity-90"
                    >
                      <div className="min-w-0 flex-1">
                        <p
                          className={cn(
                            "truncate text-[15px] font-semibold",
                            ink
                          )}
                        >
                          {isAutomotiveTrade(j.serviceType) && j.motoristVehicle?.trim()
                            ? j.motoristVehicle.trim()
                            : PRO_SERVICE_LABELS[j.serviceType] || "Service Request"}
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
          </section>
        )}

        {/* Ongoing jobs — easy navigation for active work */}
        {!jobsLoading && showOngoing && (
          <section>
            <p
              className={cn(
                "mb-1 text-[11px] font-black uppercase tracking-[0.12em]",
                muted
              )}
            >
              Ongoing jobs
            </p>
            <ul className="space-y-0">
              {ongoing.map((j) => {
                const addr = meetAddress(j);
                return (
                  <li key={j.id}>
                    <Link
                      href={`/jobs/${j.id}`}
                      className="flex items-center gap-3 border-0 bg-transparent py-3.5 active:opacity-90"
                    >
                      <div className="min-w-0 flex-1">
                        <p
                          className={cn(
                            "truncate text-[15px] font-semibold",
                            ink
                          )}
                        >
                          {isAutomotiveTrade(j.serviceType) && j.motoristVehicle?.trim()
                            ? j.motoristVehicle.trim()
                            : PRO_SERVICE_LABELS[j.serviceType] || "Job"}
                        </p>
                        <p
                          className={cn(
                            "mt-0.5 text-[11px] font-bold text-[#FF6B35]"
                          )}
                        >
                          {ongoingStatusLabel(j.status)}
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
                      </div>
                      <ChevronRight className={cn("h-4 w-4 shrink-0", muted)} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* Last 6 finished jobs — vertical listing (Uber/inDrive style), place + area only */}
        {!jobsLoading && showRecent && (
          <section aria-label="Recent jobs">
            <div className={cn("my-2 h-px", muted.replace(/text-/, "bg-"))} />
            <ul className="space-y-0">
              {recent.map((j) => {
                const addr = meetAddress(j);
                if (!addr) return null;
                const { title, subtitle } = splitPlaceAndArea(addr);
                if (!title) return null;
                return (
                  <li key={j.id}>
                    <Link
                      href={`/jobs/${j.id}`}
                      className="flex items-center gap-2 py-3 active:opacity-90"
                    >
                      <Clock className="h-3.5 w-3.5 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p
                          className={cn(
                            "truncate text-[13px] font-semibold leading-snug",
                            ink
                          )}
                        >
                          {title}
                        </p>
                        {subtitle ? (
                          <p
                            className={cn(
                              "mt-0.5 truncate text-[11px] font-medium leading-snug",
                              muted
                            )}
                          >
                            {subtitle}
                          </p>
                        ) : null}
                      </div>
                      <ChevronRight
                        className={cn("h-4 w-4 shrink-0", muted)}
                        aria-hidden
                      />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* Bottom: problem solved count (no gray plate) */}
        <div className="mt-auto pt-8 pb-3 text-center">
          <p className={cn("text-[12px] font-semibold", muted)}>
            Problem Solved
          </p>
          <p className={cn("mt-0.5 text-[20px] font-bold tabular-nums", ink)}>
            {jobsCompletedCount}
          </p>
        </div>
      </div>
    </div>
  );
}
