"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Briefcase, Clock, Loader2, X } from "lucide-react";
import {
  canNotify,
  ensureNotifyPermission,
  showAppNotification,
  vibrateCallPattern,
} from "@/lib/app-notify";
import { apiDeferJob, apiListJobs, apiTransition } from "@/lib/jobs/client";
import type { JobRecord } from "@/lib/jobs/types";
import { formatMoney } from "@/lib/pricing";
import { isAutomotiveTrade } from "@/lib/artisan/catalog";
import { PRO_SERVICE_LABELS } from "@/lib/services";
import { playAppSound, unlockAudio } from "@/lib/sound-tone";
import { VoiceNotePlayer } from "@/components/jobs/voice-note-player";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

const SHOWN_KEY = "om-job-request-shown";

function readShown(): Set<string> {
  try {
    const raw = sessionStorage.getItem(SHOWN_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function markShown(id: string) {
  try {
    const s = readShown();
    s.add(id);
    sessionStorage.setItem(SHOWN_KEY, JSON.stringify([...s].slice(-40)));
  } catch {
    /* */
  }
}

/**
 * Repair Pro only: Job request auto-popup + browser notification.
 * New motorist requests surface immediately while the app is open.
 */
export function IncomingJobPopup() {
  const { accountType, backendUserId, theme, isAuthenticated } = useApp();
  const isLight = theme === "light";
  const router = useRouter();
  const pathname = usePathname() || "";
  const knownIds = useRef<Set<string>>(new Set());
  const primed = useRef(false);
  const [alertJob, setAlertJob] = useState<JobRecord | null>(null);
  const [otherCount, setOtherCount] = useState(0);
  const [expandedJob, setExpandedJob] = useState<JobRecord | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [snoozed, setSnoozed] = useState(false);

  const surfaceJob = (j: JobRecord) => {
    if (pathname.includes(`/jobs/${j.id}`)) {
      markShown(j.id);
      return;
    }
    unlockAudio();
    playAppSound("request_new");
    vibrateCallPattern();
    setAlertJob(j);
    setSnoozed(false);
    markShown(j.id);
    const skill =
      PRO_SERVICE_LABELS[j.serviceType] || j.serviceType || "Job";
    void ensureNotifyPermission().then(() => {
      if (canNotify()) {
        showAppNotification({
          title: "Service Request",
          body: `${isAutomotiveTrade(j.serviceType) && j.motoristVehicle ? j.motoristVehicle : j.motoristName?.split(/\s+/)[0] || skill} · ${j.problem.slice(0, 70)} · ${skill}`,
          tag: `job-${j.id}`,
          href: `/jobs/${j.id}`,
          requireInteraction: true,
        });
      }
    });
  };

  useEffect(() => {
    if (!isAuthenticated || accountType !== "professional" || !backendUserId) {
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
        // Popup for new requests (negotiating) primarily
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

      const shown = readShown();

      if (!primed.current) {
        knownIds.current = new Set(open.map((j) => j.id));
        primed.current = true;
        setOtherCount(open.length);
        // Surface newest Job request not yet shown this session
        const newest = open.find(
          (j) => j.status === "negotiating" && !shown.has(j.id)
        );
        if (newest) surfaceJob(newest);
        return;
      }

      for (const j of open) {
        if (!knownIds.current.has(j.id)) {
          knownIds.current.add(j.id);
          if (j.status === "negotiating" || !shown.has(j.id)) {
            surfaceJob(j);
            break;
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
    // Fast poll for new job requests
    const t = window.setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      void poll();
    }, 5_000);
    const onVis = () => {
      if (!document.hidden) void poll();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [accountType, backendUserId, isAuthenticated, pathname]);

  useEffect(() => {
    if (!isAuthenticated || accountType !== "professional") {
      primed.current = false;
      knownIds.current = new Set();
      setAlertJob(null);
      setOtherCount(0);
    }
  }, [isAuthenticated, accountType]);

  const showBadge =
    accountType === "professional" &&
    otherCount > 1 &&
    pathname.startsWith("/jobs/") &&
    !alertJob;

  if (accountType !== "professional") return null;

  return (
    <>
      {showBadge && (
        <button
          type="button"
          onClick={() => router.push("/jobs")}
          className={cn(
            "absolute right-3 top-[max(0.6rem,env(safe-area-inset-top))] z-[160] flex items-center gap-1.5 rounded-full border-0 px-2.5 py-1.5 text-[11px] font-bold shadow-md",
            isLight
              ? "bg-slate-900 text-white"
              : "bg-[#FF6B35] text-white"
          )}
        >
          <Briefcase className="h-3.5 w-3.5" />
          {otherCount} open
        </button>
      )}

      {/* Compact popup — 3-button card */}
      {alertJob && !expandedJob && (
        <div
          className="absolute inset-0 z-[180] flex items-end justify-center bg-black/35 p-3 pb-[max(1rem,env(safe-area-inset-bottom))]"
          role="dialog"
          aria-modal
          aria-label="Service Request"
        >
          <div
            className={cn(
              "w-full max-w-[360px] rounded-2xl border-0 p-4",
              isLight ? "bg-[#c8c9cd] text-slate-900" : "bg-black text-white"
            )}
          >
            <div className="mb-2 flex items-start justify-between gap-2">
              <div>
                <p className="text-[11px] font-black uppercase tracking-wide text-[#FF6B35]">
                  Service Request
                </p>
                <p className="mt-0.5 text-[16px] font-black leading-tight">
                  {isAutomotiveTrade(alertJob.serviceType) && alertJob.motoristVehicle?.trim()
                    ? alertJob.motoristVehicle.trim()
                    : alertJob.motoristName?.split(/\s+/)[0] || PRO_SERVICE_LABELS[alertJob.serviceType] || "Service Request"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAlertJob(null)}
                className={cn(
                  "rounded-full border-0 p-1.5",
                  isLight ? "bg-black/5" : "bg-white/10"
                )}
                aria-label="Dismiss"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p
              className={cn(
                "text-[13px] font-semibold leading-snug",
                isLight ? "text-slate-700" : "text-white/80"
              )}
            >
              {alertJob.problem}
            </p>
            <p
              className={cn(
                "mt-1 text-[11px] font-medium",
                isLight ? "text-slate-500" : "text-white/50"
              )}
            >
              {PRO_SERVICE_LABELS[alertJob.serviceType] || alertJob.serviceType}
              {alertJob.agreedMajor != null
                ? ` · ${formatMoney(alertJob.agreedMajor, alertJob.currency)}`
                : ""}
            </p>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => {
                  const id = alertJob.id;
                  setAlertJob(null);
                  void apiTransition({
                    jobId: id,
                    event: "CANCEL",
                    actor: "repair_pro",
                    actorId: backendUserId || undefined,
                    reason: "pro_declined",
                  });
                }}
                className={cn(
                  "h-11 rounded-xl border-0 text-[13px] font-bold",
                  isLight ? "bg-red-500/20 text-red-700" : "bg-red-500/20 text-red-400"
                )}
              >
                Not available
              </button>
              <button
                type="button"
                onClick={() => {
                  const id = alertJob.id;
                  setSnoozed(true);
                  if (backendUserId) {
                    void apiDeferJob(id, backendUserId);
                  }
                }}
                className={cn(
                  "h-11 rounded-xl border-0 text-[13px] font-bold",
                  isLight ? "bg-black/8 text-slate-900" : "bg-white/10 text-white"
                )}
              >
                Later
              </button>
              <button
                type="button"
                onClick={() => setExpandedJob(alertJob)}
                className="h-11 rounded-xl border-0 bg-[#FF6B35] text-[13px] font-bold text-white"
              >
                Open
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Snoozed confirmation — request returns in 5 minutes */}
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
              This request is hidden from you for now. If it&rsquo;s still open, it
              returns in <span className="font-bold text-[#FF6B35]">05:00</span>.
            </p>
            <button
              type="button"
              onClick={() => {
                setAlertJob(null);
                setSnoozed(false);
              }}
              className="mt-4 h-11 w-full rounded-xl border-0 bg-[#FF6B35] text-[13px] font-bold text-white"
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {/* Expanded detail view — full request review */}
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
            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto px-5 pb-2 pt-5">
              <div className="mb-3 flex items-start justify-between gap-2">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-wide text-[#FF6B35]">
                    Service Request
                  </p>
                  <p className="mt-0.5 text-[16px] font-black leading-tight">
                    {isAutomotiveTrade(expandedJob.serviceType) && expandedJob.motoristVehicle?.trim()
                      ? expandedJob.motoristVehicle.trim()
                      : expandedJob.motoristName?.split(/\s+/)[0] || PRO_SERVICE_LABELS[expandedJob.serviceType] || "Service Request"}
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

              {isAutomotiveTrade(expandedJob.serviceType) && expandedJob.motoristVehicle?.trim() ? (
                <div className="mb-3">
                  <p className={cn("text-[11px] font-semibold uppercase", isLight ? "text-slate-600" : "text-white/50")}>
                    Vehicle
                  </p>
                  <p className={cn("mt-0.5 text-[15px] font-semibold", isLight ? "text-slate-900" : "text-white")}>
                    {expandedJob.motoristVehicle.trim()}
                  </p>
                </div>
              ) : null}

              <div className="mb-3">
                <p className={cn("text-[11px] font-semibold uppercase", isLight ? "text-slate-600" : "text-white/50")}>
                  Common issues
                </p>
                <p className={cn("mt-0.5 text-[15px] font-medium leading-relaxed", isLight ? "text-slate-900" : "text-white")}>
                  {expandedJob.problem}
                </p>
              </div>

              <div className="mb-3">
                <p className={cn("text-[11px] font-semibold uppercase", isLight ? "text-slate-600" : "text-white/50")}>
                  Your matching skill
                </p>
                <p className={cn("mt-0.5 text-[15px] font-semibold", isLight ? "text-slate-900" : "text-white")}>
                  {PRO_SERVICE_LABELS[expandedJob.serviceType] || expandedJob.serviceType}
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
                  <p className={cn("mb-1.5 text-[11px] font-semibold uppercase", isLight ? "text-slate-600" : "text-white/50")}>
                    Photos ({expandedJob.photos.length})
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {expandedJob.photos.map((p) => (
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

              <p className={cn("text-[13px] font-medium leading-relaxed", isLight ? "text-slate-500" : "text-white/50")}>
                By tapping{" "}
                <span className="font-semibold text-[#FF6B35]">I can fix this</span>
                , you confirm you can complete this job.
              </p>
            </div>

            {/* Fixed footer buttons */}
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
                          setExpandedJob(null);
                          setAlertJob(null);
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
                      setExpandedJob(null);
                      setAlertJob(null);
                      void apiTransition({
                        jobId: id,
                        event: "CANCEL",
                        actor: "repair_pro",
                        actorId: backendUserId || undefined,
                        reason: "pro_declined",
                      });
                    }}
                    className={cn(
                      "inline-flex h-12 w-full items-center justify-center rounded-md border-0 text-[14px] font-semibold disabled:opacity-50",
                      isLight
                        ? "bg-[#2c2c2e] text-white"
                        : "bg-[#2c2c2e] text-white"
                    )}
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
