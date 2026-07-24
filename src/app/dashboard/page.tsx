"use client";

/**
 * Pro dashboard — Uber-style list under Live (no section titles):
 * - Incoming: New Request only, real meet address (never “Current location”)
 * - Recent: Uber place + area only (never problem text / demo address)
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Clock3, Loader2, Radio, Shield } from "lucide-react";
import { BankForcePanel } from "@/components/auth/bank-force-panel";
import { PageHeader } from "@/components/layout/page-header";
import { getArtisanProfile } from "@/lib/artisan/local-store";
import {
  canGoLive,
  resolveVisibilityTier,
  tier2GoLiveWarning,
} from "@/lib/artisan/status";
import type { ArtisanVerificationProfile } from "@/lib/artisan/types";
import { apiListJobs } from "@/lib/jobs/client";
import type { JobFlowStatus, JobRecord } from "@/lib/jobs/types";
import { useT } from "@/lib/i18n";
import { isProService, PRO_SERVICE_LABELS } from "@/lib/services";
import { useApp } from "@/lib/store";
import type { ProService } from "@/lib/types";
import { cn } from "@/lib/utils";

/** New Request only — leaves dashboard after Accept */
const INCOMING_STATUSES = new Set<JobFlowStatus>(["negotiating"]);

/** Past / closed jobs for Recent — same set for every trade (Battery, Vulcanizer, …) */
const RECENT_STATUSES = new Set<JobFlowStatus>([
  "completed",
  "satisfied",
  "released",
  "cancelled",
  "expired",
  "disputed",
  "under_appeal",
  "refunded",
]);

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
    userProfile,
    proServices,
  } = useApp();
  const t = useT();
  const isLight = theme === "light";
  const [liveBusy, setLiveBusy] = useState(false);
  const [liveErr, setLiveErr] = useState<string | null>(null);
  const [incoming, setIncoming] = useState<JobRecord[]>([]);
  const [recent, setRecent] = useState<JobRecord[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [awayLabel, setAwayLabel] = useState(() => liveAwayButtonLabel());
  const [artisan, setArtisan] = useState<ArtisanVerificationProfile | null>(
    null
  );
  const [switchBusy, setSwitchBusy] = useState(false);

  const dashboardTitle = useMemo(() => {
    const fromArtisan = artisan?.trade?.service;
    const fromProfile = userProfile?.services?.[0];
    const fromProList = proServices?.[0];
    return skillDashboardTitle(fromArtisan || fromProfile || fromProList);
  }, [artisan?.trade?.service, userProfile?.services, proServices]);

  useEffect(() => {
    if (!backendUserId) {
      setArtisan(null);
      return;
    }
    try {
      setArtisan(getArtisanProfile(backendUserId));
    } catch {
      setArtisan(null);
    }

    // Hydrate + poll care approval so dashboard tier flips without leaving
    let cancelled = false;
    const sync = async () => {
      try {
        const res = await fetch(
          `/api/artisan/profile?userId=${encodeURIComponent(backendUserId)}`,
          { cache: "no-store" }
        );
        const json = (await res.json().catch(() => null)) as {
          ok?: boolean;
          data?: {
            pro?: {
              status?: string;
              gov_id_review_status?: string | null;
              visibility_tier?: number | null;
              verified?: boolean | null;
              nin_verified?: boolean | null;
              face_liveness_verified?: boolean | null;
              docs_status?: string | null;
              tier2_approved_at?: string | null;
              tier3_approved_at?: string | null;
              tier4_approved_at?: string | null;
              go_live_window_ends_at?: string | null;
            } | null;
          };
        } | null;
        if (cancelled || !json?.ok || !json.data?.pro) return;
        const pro = json.data.pro;
        const local = getArtisanProfile(backendUserId);
        if (!local) return;
        const gov = String(pro.gov_id_review_status || "none");
        const t2 =
          gov === "approved" ||
          Boolean(pro.verified) ||
          Boolean(pro.nin_verified);
        const vis = Number(pro.visibility_tier) || local.visibilityTier || 1;
        const docs = String(pro.docs_status || "none");
        if (!t2 && gov !== "submitted" && gov !== "rejected") {
          // Still refresh visibility if server moved ladder
          if (vis !== local.visibilityTier) {
            const next = {
              ...local,
              visibilityTier: vis as 1 | 2 | 3 | 4,
              isNewArtisan: vis <= 2,
            };
            const { saveArtisanProfile } = await import(
              "@/lib/artisan/local-store"
            );
            saveArtisanProfile(next);
            if (!cancelled) setArtisan(next);
          }
          return;
        }
        const fully = String(pro.status) === "approved" || (t2 && vis >= 2);
        const next = {
          ...local,
          status: fully
            ? ("approved" as const)
            : gov === "rejected"
              ? ("rejected" as const)
              : gov === "submitted"
                ? ("pending_review" as const)
                : local.status,
          rejectReason: fully ? null : local.rejectReason,
          govIdReviewStatus: t2
            ? ("approved" as const)
            : gov === "rejected"
              ? ("rejected" as const)
              : gov === "submitted"
                ? ("submitted" as const)
                : local.govIdReviewStatus,
          tiers: {
            ...local.tiers,
            tier2_govId: t2 || local.tiers.tier2_govId,
            tier2_nin:
              Boolean(pro.nin_verified) || t2 || local.tiers.tier2_nin,
            tier3_liveness:
              Boolean(pro.face_liveness_verified) ||
              local.tiers.tier3_liveness,
            tier4_skillProof:
              docs === "approved" || local.tiers.tier4_skillProof,
          },
          visibilityTier: vis as 1 | 2 | 3 | 4,
          tier2ApprovedAt:
            pro.tier2_approved_at || local.tier2ApprovedAt,
          tier3ApprovedAt:
            pro.tier3_approved_at || local.tier3ApprovedAt,
          tier4ApprovedAt:
            pro.tier4_approved_at || local.tier4ApprovedAt,
          goLiveWindowEndsAt:
            pro.go_live_window_ends_at || local.goLiveWindowEndsAt,
          isNewArtisan: vis <= 2,
        };
        const { saveArtisanProfile } = await import(
          "@/lib/artisan/local-store"
        );
        saveArtisanProfile(next);
        if (!cancelled) setArtisan(next);
      } catch {
        /* offline */
      }
    };
    void sync();
    const poll = window.setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      void sync();
    }, 60_000);
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

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 pb-4 scrollbar-hide">
        {/* Artisan verification / visibility tier gate */}
        {artisan ? (
          <section
            className={cn(
              "rounded-md px-3 py-3",
              isLight ? "bg-[#d4d5d9]" : "bg-white/10"
            )}
          >
            <div className="flex items-start gap-2">
              <Shield className="mt-0.5 h-4 w-4 shrink-0 text-[#FF6B35]" />
              <div className="min-w-0 flex-1">
                {(() => {
                  const tier = resolveVisibilityTier(artisan);
                  const g = canGoLive(artisan);
                  const warn =
                    artisan.status === "approved"
                      ? tier2GoLiveWarning(artisan)
                      : null;
                  const statusLine =
                    artisan.status !== "approved"
                      ? artisan.status === "draft"
                        ? t("gate.finishBeforeLive")
                        : g.allowed
                          ? ""
                          : g.message
                      : "";
                  return (
                    <>
                      <p className={cn("text-[13px] font-bold", ink)}>
                        Tier {tier}
                      </p>
                      {statusLine ? (
                      <p className={cn("mt-0.5 text-[11px] font-medium", muted)}>
                        {statusLine}
                      </p>
                      ) : null}
                      {warn ? (
                        <p
                          className={cn(
                            "mt-1.5 text-[11px] font-semibold",
                            "text-[#FF6B35]"
                          )}
                        >
                          {warn}
                        </p>
                      ) : null}
                      {artisan.status !== "approved" ? (
                        <Link
                          href={
                            artisan.status === "draft" ||
                            artisan.status === "rejected"
                              ? "/artisan/onboarding"
                              : "/artisan/verification"
                          }
                          className="mt-2 inline-flex text-[12px] font-bold text-[#FF6B35]"
                        >
                          {artisan.status === "pending_review"
                            ? t("gate.viewStatus")
                            : t("gate.continueVerification")}
                        </Link>
                      ) : null}
                    </>
                  );
                })()}
              </div>
            </div>
          </section>
        ) : null}

        <section className={cn("border-b pb-4", hairline)}>
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
              <p className={cn("text-[12px] font-medium", muted)}>
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

        {/* Recent — Uber place + area only (no problem text, no demo fallbacks) */}
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
                    className={cn(
                      "mt-0.5 h-3.5 w-3.5 shrink-0",
                      isLight ? "text-slate-600" : "text-white/60"
                    )}
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
