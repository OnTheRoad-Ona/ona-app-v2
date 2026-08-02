"use client";

/**
 * Repair Pro: service-request popup (X-style banner + inDrive pile).
 * - Auto-show at most once per 10 minutes (wave)
 * - Stay 66s then fully hide
 * - New requests during the 66s window stack (pile)
 * - Manual dismiss / Open / Later never blocked by throttle for next *manual* open via /jobs
 */

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Briefcase, Clock, Loader2, Wrench, X } from "lucide-react";
import {
  canNotify,
  ensureNotifyPermission,
  showAppNotification,
  vibrateCallPattern,
} from "@/lib/app-notify";
import { apiDeferJob, apiListJobs, apiTransition } from "@/lib/jobs/client";
import {
  canSurfaceIncomingJob,
  INCOMING_POPUP_VISIBLE_MS,
  markJobShown,
  writeLastWaveAt,
} from "@/lib/jobs/incoming-popup-timing";
import type { JobRecord } from "@/lib/jobs/types";
import { formatMoney } from "@/lib/pricing";
import { isAutomotiveTrade } from "@/lib/artisan/catalog";
import { PRO_SERVICE_LABELS } from "@/lib/services";
import { playAppSound, unlockAudio } from "@/lib/sound-tone";
import { VoiceNotePlayer } from "@/components/jobs/voice-note-player";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

export function IncomingJobPopup() {
  const { accountType, backendUserId, theme, isAuthenticated, authReady } =
    useApp();
  const isLight = theme === "light";
  const router = useRouter();
  const pathname = usePathname() || "";
  const knownIds = useRef<Set<string>>(new Set());
  const primed = useRef(false);
  const hideTimer = useRef<number | null>(null);
  const waveStartedAt = useRef(0);

  const [alertJob, setAlertJob] = useState<JobRecord | null>(null);
  const [pile, setPile] = useState<JobRecord[]>([]);
  const [otherCount, setOtherCount] = useState(0);
  const [expandedJob, setExpandedJob] = useState<JobRecord | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [snoozed, setSnoozed] = useState(false);

  const clearHideTimer = () => {
    if (hideTimer.current) {
      window.clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  };

  const fullyHide = () => {
    clearHideTimer();
    setAlertJob(null);
    setPile([]);
    setSnoozed(false);
    setExpandedJob(null);
  };

  const scheduleAutoHide = (fromMs: number) => {
    clearHideTimer();
    const remaining = Math.max(
      0,
      INCOMING_POPUP_VISIBLE_MS - (Date.now() - fromMs)
    );
    hideTimer.current = window.setTimeout(() => {
      fullyHide();
    }, remaining || INCOMING_POPUP_VISIBLE_MS);
  };

  const surfaceJob = (j: JobRecord, reason: "new_wave" | "pile") => {
    if (pathname.includes(`/jobs/${j.id}`)) {
      markJobShown(j.id);
      return;
    }

    const gate = canSurfaceIncomingJob(j.id);
    if (!gate.allow) return;

    markJobShown(j.id);

    if (reason === "new_wave" || gate.reason === "new_wave") {
      const now = Date.now();
      waveStartedAt.current = now;
      writeLastWaveAt(now);
      setPile([j]);
      setAlertJob(j);
      setSnoozed(false);
      scheduleAutoHide(now);
      unlockAudio();
      playAppSound("request_new");
      vibrateCallPattern();
    } else {
      // Pile onto open wave
      setPile((prev) => {
        if (prev.some((x) => x.id === j.id)) return prev;
        const next = [j, ...prev].slice(0, 4);
        return next;
      });
      setAlertJob(j);
      setSnoozed(false);
      if (waveStartedAt.current > 0) {
        scheduleAutoHide(waveStartedAt.current);
      }
      unlockAudio();
      playAppSound("request_new");
      vibrateCallPattern();
    }

    const skill =
      PRO_SERVICE_LABELS[j.serviceType] || j.serviceType || "Job";
    void ensureNotifyPermission().then(() => {
      if (canNotify()) {
        showAppNotification({
          title: "Ona · Service Request",
          body: `${isAutomotiveTrade(j.serviceType) && j.motoristVehicle ? j.motoristVehicle : j.motoristName?.split(/\s+/)[0] || skill} · ${j.problem.slice(0, 70)} · ${skill}`,
          tag: `job-${j.id}`,
          href: `/jobs/${j.id}`,
          requireInteraction: false,
        });
      }
    });
  };

  useEffect(() => {
    if (
      !authReady ||
      !isAuthenticated ||
      accountType !== "professional" ||
      !backendUserId
    ) {
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
        // Surface newest eligible request once (respects 10m + shown)
        const newest = open.find((j) => j.status === "negotiating");
        if (newest) {
          const gate = canSurfaceIncomingJob(newest.id);
          if (gate.allow) surfaceJob(newest, gate.reason);
        }
        return;
      }

      for (const j of open) {
        if (!knownIds.current.has(j.id)) {
          knownIds.current.add(j.id);
          if (j.status === "negotiating") {
            const gate = canSurfaceIncomingJob(j.id);
            if (gate.allow) {
              surfaceJob(j, gate.reason);
              break;
            }
          }
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
      if (typeof document !== "undefined" && document.hidden) return;
      void poll();
    }, 20_000);
    const onVis = () => {
      if (!document.hidden) void poll();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountType, backendUserId, isAuthenticated, authReady, pathname]);

  useEffect(() => {
    if (!isAuthenticated || accountType !== "professional") {
      primed.current = false;
      knownIds.current = new Set();
      fullyHide();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, accountType]);

  useEffect(() => {
    return () => clearHideTimer();
  }, []);

  const showBadge =
    accountType === "professional" &&
    otherCount > 1 &&
    pathname.startsWith("/jobs/") &&
    !alertJob;

  if (accountType !== "professional") return null;

  // X-style surface
  const solid = isLight
    ? "rgba(255,255,255,0.96)"
    : "rgba(28,28,30,0.96)";
  const ink = isLight ? "#0f1419" : "#e7e9ea";
  const muted = isLight ? "#536471" : "#71767b";
  const hairline = isLight
    ? "rgba(0,0,0,0.08)"
    : "rgba(255,255,255,0.08)";

  const titleFor = (j: JobRecord) =>
    isAutomotiveTrade(j.serviceType) && j.motoristVehicle?.trim()
      ? j.motoristVehicle.trim()
      : j.motoristName?.split(/\s+/)[0] ||
        PRO_SERVICE_LABELS[j.serviceType] ||
        "Service Request";

  return (
    <>
      {showBadge && (
        <button
          type="button"
          onClick={() => router.push("/jobs")}
          className={cn(
            "absolute right-3 top-[max(0.6rem,env(safe-area-inset-top))] z-[160] flex items-center gap-1.5 rounded-full border-0 px-2.5 py-1.5 text-[11px] font-bold shadow-md",
            isLight ? "bg-slate-900 text-white" : "bg-[#FF6B35] text-white"
          )}
        >
          <Briefcase className="h-3.5 w-3.5" />
          {otherCount} open
        </button>
      )}

      {/* X-style top banner + inDrive pile (compact) */}
      {alertJob && !expandedJob && !snoozed && (
        <div
          className="pointer-events-none absolute inset-x-0 top-2 z-[180] flex flex-col items-center px-3"
          role="dialog"
          aria-modal
          aria-label="Service Request"
        >
          <div className="relative w-full max-w-[380px]">
            {/* Pile under-cards */}
            {pile.slice(1, 4).map((j, i) => (
              <div
                key={j.id}
                aria-hidden
                className="absolute left-0 right-0 top-0 rounded-[18px]"
                style={{
                  zIndex: 10 - i,
                  transform: `translateY(${(i + 1) * 6}px) scale(${1 - (i + 1) * 0.03})`,
                  opacity: 0.85 - i * 0.12,
                  height: 88,
                  backgroundColor: solid,
                  boxShadow: isLight
                    ? "0 8px 28px rgba(0,0,0,0.10)"
                    : "0 8px 28px rgba(0,0,0,0.4)",
                  border: `0.5px solid ${hairline}`,
                }}
              />
            ))}

            <div
              className="pointer-events-auto relative animate-[om-toast-in_0.32s_cubic-bezier(0.2,0.8,0.2,1)] rounded-[18px] shadow-[0_8px_28px_rgba(0,0,0,0.18)] backdrop-blur-xl"
              style={{
                zIndex: 20,
                backgroundColor: solid,
                boxShadow: isLight
                  ? "0 8px 28px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.06)"
                  : "0 8px 28px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.06)",
                border: `0.5px solid ${hairline}`,
              }}
            >
              <div className="flex items-start gap-2.5 px-3 py-2.5">
                <div
                  className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                  style={{
                    backgroundColor: isLight
                      ? "rgba(255,107,53,0.12)"
                      : "rgba(255,107,53,0.18)",
                  }}
                >
                  <Wrench
                    className="h-[18px] w-[18px] text-[#FF6B35]"
                    strokeWidth={2}
                  />
                </div>
                <div className="min-w-0 flex-1 pt-0.5">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="truncate text-[13px] font-bold leading-tight"
                      style={{ color: ink }}
                    >
                      Ona
                    </span>
                    <span
                      className="shrink-0 text-[11px] font-medium"
                      style={{ color: muted }}
                    >
                      · Service Request
                    </span>
                    {pile.length > 1 ? (
                      <span className="ml-auto shrink-0 rounded-full bg-[#FF6B35] px-1.5 py-0.5 text-[10px] font-bold text-white">
                        +{pile.length - 1}
                      </span>
                    ) : null}
                  </div>
                  <p
                    className="mt-0.5 text-[13px] font-semibold leading-snug"
                    style={{ color: ink }}
                  >
                    {titleFor(alertJob)}
                  </p>
                  <p
                    className="mt-0.5 line-clamp-2 text-[12px] font-normal leading-snug"
                    style={{ color: muted }}
                  >
                    {alertJob.problem}
                    {alertJob.agreedMajor != null
                      ? ` · ${formatMoney(alertJob.agreedMajor, alertJob.currency)}`
                      : ""}
                  </p>
                  <div className="mt-2 grid grid-cols-3 gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        const id = alertJob.id;
                        fullyHide();
                        void apiTransition({
                          jobId: id,
                          event: "CANCEL",
                          actor: "repair_pro",
                          actorId: backendUserId || undefined,
                          reason: "pro_declined",
                        });
                      }}
                      className={cn(
                        "h-9 rounded-xl border-0 text-[12px] font-bold",
                        isLight
                          ? "bg-red-500/15 text-red-700"
                          : "bg-red-500/20 text-red-400"
                      )}
                    >
                      Decline
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const id = alertJob.id;
                        setSnoozed(true);
                        clearHideTimer();
                        if (backendUserId) {
                          void apiDeferJob(id, backendUserId);
                        }
                      }}
                      className={cn(
                        "h-9 rounded-xl border-0 text-[12px] font-bold",
                        isLight
                          ? "bg-black/8 text-slate-900"
                          : "bg-white/10 text-white"
                      )}
                    >
                      Later
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        clearHideTimer();
                        setExpandedJob(alertJob);
                      }}
                      className="h-9 rounded-xl border-0 bg-[#FF6B35] text-[12px] font-bold text-white"
                    >
                      Open
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => fullyHide()}
                  className="shrink-0 rounded-full border-0 p-1"
                  style={{ color: muted }}
                  aria-label="Dismiss"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            {pile.length > 1 ? (
              <div
                aria-hidden
                style={{ height: Math.min(pile.length - 1, 3) * 6 }}
              />
            ) : null}
          </div>
        </div>
      )}

      {/* Snoozed confirmation */}
      {alertJob && snoozed && !expandedJob && (
        <div
          className="absolute inset-0 z-[180] flex items-end justify-center bg-black/35 p-3 pb-[max(1rem,env(safe-area-inset-bottom))]"
          role="dialog"
          aria-modal
          aria-label="Request snoozed"
        >
          <div
            className={cn(
              "w-full max-w-[360px] rounded-2xl border-0 p-5 text-center",
              isLight ? "bg-[#c8c9cd] text-slate-900" : "bg-black text-white"
            )}
          >
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#FF6B35]/20">
              <Clock className="h-6 w-6 text-[#FF6B35]" />
            </div>
            <p className="text-[16px] font-black">Request snoozed</p>
            <p
              className={cn(
                "mt-1.5 text-[12px] font-medium leading-relaxed",
                isLight ? "text-slate-600" : "text-white/60"
              )}
            >
              Hidden for now. If still open, it returns in{" "}
              <span className="font-bold text-[#FF6B35]">05:00</span>.
            </p>
            <button
              type="button"
              onClick={() => fullyHide()}
              className="mt-4 h-11 w-full rounded-xl border-0 bg-[#FF6B35] text-[13px] font-bold text-white"
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {/* Expanded detail */}
      {expandedJob && (
        <div
          className="absolute inset-0 z-[180] flex items-end justify-center bg-black/35 p-3 pb-[max(1rem,env(safe-area-inset-bottom))]"
          role="dialog"
          aria-modal
          aria-label="Request details"
        >
          <div
            className={cn(
              "flex max-h-[88vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border-0",
              isLight ? "bg-[#c8c9cd] text-slate-900" : "bg-black text-white"
            )}
          >
            <div className="flex-1 overflow-y-auto px-5 pb-2 pt-5">
              <div className="mb-3 flex items-start justify-between gap-2">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-wide text-[#FF6B35]">
                    Service Request
                  </p>
                  <p className="mt-0.5 text-[16px] font-black leading-tight">
                    {titleFor(expandedJob)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setExpandedJob(null)}
                  className={cn(
                    "rounded-full border-0 p-1.5",
                    isLight ? "bg-black/5" : "bg-white/10"
                  )}
                  aria-label="Back"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {isAutomotiveTrade(expandedJob.serviceType) &&
              expandedJob.motoristVehicle?.trim() ? (
                <div className="mb-3">
                  <p
                    className={cn(
                      "text-[11px] font-semibold uppercase",
                      isLight ? "text-slate-600" : "text-white/50"
                    )}
                  >
                    Vehicle
                  </p>
                  <p
                    className={cn(
                      "mt-0.5 text-[15px] font-semibold",
                      isLight ? "text-slate-900" : "text-white"
                    )}
                  >
                    {expandedJob.motoristVehicle.trim()}
                  </p>
                </div>
              ) : null}

              <div className="mb-3">
                <p
                  className={cn(
                    "text-[11px] font-semibold uppercase",
                    isLight ? "text-slate-600" : "text-white/50"
                  )}
                >
                  Problem
                </p>
                <p
                  className={cn(
                    "mt-0.5 text-[15px] font-medium leading-relaxed",
                    isLight ? "text-slate-900" : "text-white"
                  )}
                >
                  {expandedJob.problem}
                </p>
              </div>

              <div className="mb-3">
                <p
                  className={cn(
                    "text-[11px] font-semibold uppercase",
                    isLight ? "text-slate-600" : "text-white/50"
                  )}
                >
                  Skill
                </p>
                <p
                  className={cn(
                    "mt-0.5 text-[15px] font-semibold",
                    isLight ? "text-slate-900" : "text-white"
                  )}
                >
                  {PRO_SERVICE_LABELS[expandedJob.serviceType] ||
                    expandedJob.serviceType}
                </p>
              </div>

              {expandedJob.voiceNote?.url ? (
                <div className="mb-3">
                  <VoiceNotePlayer
                    url={expandedJob.voiceNote.url}
                    durationSec={expandedJob.voiceNote.durationSec}
                    isLight={isLight}
                    label="Problem voice note"
                  />
                </div>
              ) : null}

              {expandedJob.photos?.length > 0 ? (
                <div className="mb-3">
                  <p
                    className={cn(
                      "mb-1.5 text-[11px] font-semibold uppercase",
                      isLight ? "text-slate-600" : "text-white/50"
                    )}
                  >
                    Photos ({expandedJob.photos.length})
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {expandedJob.photos.map((p) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={p.id}
                        src={p.url}
                        alt=""
                        className="h-20 w-20 rounded-lg object-cover"
                      />
                    ))}
                  </div>
                </div>
              ) : null}

              <p
                className={cn(
                  "text-[13px] font-medium leading-relaxed",
                  isLight ? "text-slate-500" : "text-white/50"
                )}
              >
                By tapping{" "}
                <span className="font-semibold text-[#FF6B35]">
                  I can fix this
                </span>
                , you confirm you can complete this job.
              </p>
            </div>

            <div className="shrink-0 space-y-2 px-5 pb-5 pt-2">
              {accepting ? (
                <div className="flex h-12 items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-[#FF6B35]" />
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={accepting}
                    onClick={async () => {
                      setAccepting(true);
                      try {
                        const res = await apiTransition({
                          jobId: expandedJob.id,
                          event: "START_NEGOTIATION",
                          actor: "repair_pro",
                          actorId: backendUserId || undefined,
                        });
                        if (res.ok) {
                          try {
                            sessionStorage.setItem(
                              `om-can-fix-${expandedJob.id}`,
                              "1"
                            );
                          } catch {
                            /* */
                          }
                          fullyHide();
                          router.push(`/jobs/${expandedJob.id}`);
                        }
                      } finally {
                        setAccepting(false);
                      }
                    }}
                    className="inline-flex h-12 w-full items-center justify-center rounded-md border-0 bg-[#FF6B35] text-[14px] font-semibold text-white disabled:opacity-50"
                  >
                    I can fix this
                  </button>
                  <button
                    type="button"
                    disabled={accepting}
                    onClick={() => {
                      const id = expandedJob.id;
                      fullyHide();
                      void apiTransition({
                        jobId: id,
                        event: "CANCEL",
                        actor: "repair_pro",
                        actorId: backendUserId || undefined,
                        reason: "pro_declined",
                      });
                    }}
                    className="inline-flex h-12 w-full items-center justify-center rounded-md border-0 bg-[#2c2c2e] text-[14px] font-semibold text-white disabled:opacity-50"
                  >
                    Not available
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
