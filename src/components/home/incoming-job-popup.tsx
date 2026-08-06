"use client";

/**
 * Repair Pro: lower-panel Incoming Request only (no top toast).
 * - Instant surface: 1s poll + Supabase realtime
 * - One request at a time (first only); others queue silently
 * - UI: title + problem only (no repetitive labels)
 * - 66s progress line; when empty → hide + defer/search; next job shows instantly with fresh 66s
 * - OS push kept alongside in-app panel
 * - Background is dimmed while the panel is visible; clears when it closes.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Briefcase, Clock, Loader2, X } from "lucide-react";
import {
  canNotify,
  ensureNotifyPermission,
  showAppNotification,
  vibrateCallPattern,
} from "@/lib/app-notify";
import { apiDeferJob, apiListJobs, apiTransition } from "@/lib/jobs/client";
import {
  canSurfaceIncomingJob,
  INCOMING_POPUP_VISIBLE_SEC,
  isIncomingJobOpen,
  markJobShown,
  PAIRING_ACTION_STAGES,
} from "@/lib/jobs/incoming-popup-timing";
import type { JobRecord } from "@/lib/jobs/types";
import { formatMoney } from "@/lib/pricing";
import { isAutomotiveTrade } from "@/lib/artisan/catalog";
import { PRO_SERVICE_LABELS } from "@/lib/services";
import { playAppSound, unlockAudio } from "@/lib/sound-tone";
import { backendSubscribeJobs } from "@/lib/supabase/app-api";
import { VoiceNotePlayer } from "@/components/jobs/voice-note-player";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

function isPairingAlert(j: JobRecord): boolean {
  return PAIRING_ACTION_STAGES.has(j.pairingStage ?? "");
}

function idemFor(j: JobRecord, proId: string, event: string): string {
  return `${j.id}:${proId}:${event}`;
}

export function IncomingJobPopup() {
  const { accountType, backendUserId, theme, isAuthenticated, authReady } =
    useApp();
  const isLight = theme === "light";
  const router = useRouter();
  const pathname = usePathname() || "";
  const knownIds = useRef<Set<string>>(new Set());
  const primed = useRef(false);
  const primedForId = useRef<string | null | undefined>(undefined);
  const alertJobRef = useRef<JobRecord | null>(null);
  const queueRef = useRef<JobRecord[]>([]);
  const osPushed = useRef<Set<string>>(new Set());

  const [alertJob, setAlertJob] = useState<JobRecord | null>(null);
  const [queue, setQueue] = useState<JobRecord[]>([]);
  const [otherCount, setOtherCount] = useState(0);
  const [expandedJob, setExpandedJob] = useState<JobRecord | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [snoozed, setSnoozed] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(INCOMING_POPUP_VISIBLE_SEC);

  useEffect(() => {
    alertJobRef.current = alertJob;
  }, [alertJob]);
  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  const fullyHide = useCallback(() => {
    setAlertJob(null);
    setQueue([]);
    queueRef.current = [];
    setSnoozed(false);
    setExpandedJob(null);
    setActionError(null);
    setTimeLeft(INCOMING_POPUP_VISIBLE_SEC);
  }, []);

  /**
   * One-tap "I can fix this": for pairing-stage requests this OPENS the
   * request (server-side reservation) and lands on the reviewing screen
   * ("Can you fix this?" + "I can fix it"); for classic requests it connects
   * straight into negotiation. Errors are surfaced inline so a failed tap is
   * never silent.
   */
  const handleFixIt = useCallback(
    async (j: JobRecord) => {
      if (!backendUserId) return;
      setAccepting(true);
      setActionError(null);
      try {
        if (isPairingAlert(j)) {
          const stage = j.pairingStage ?? "";
          const needsOpen =
            stage === "waiting_for_selected" || stage === "waiting_for_pro";
          if (needsOpen) {
            const openRes = await apiTransition({
              jobId: j.id,
              event: "OPEN",
              actor: "repair_pro",
              actorId: backendUserId,
              idempotencyKey: idemFor(j, backendUserId, "OPEN"),
            });
            if (!openRes.ok) {
              setActionError(
                openRes.message ||
                  "Could not open this request. Please try again."
              );
              return;
            }
          }
          fullyHide();
          router.push(`/jobs/${j.id}`);
        } else {
          const res = await apiTransition({
            jobId: j.id,
            event: "START_NEGOTIATION",
            actor: "repair_pro",
            actorId: backendUserId,
          });
          if (res.ok) {
            fullyHide();
            router.push(`/jobs/${j.id}`);
          } else {
            setActionError(
              res.message || "Could not connect. Please try again."
            );
          }
        }
      } finally {
        setAccepting(false);
      }
    },
    [backendUserId, fullyHide, router]
  );

  const pushOsOnce = useCallback((j: JobRecord) => {
    if (osPushed.current.has(j.id)) return;
    osPushed.current.add(j.id);
    const skill = PRO_SERVICE_LABELS[j.serviceType] || j.serviceType || "Job";
    const title =
      isAutomotiveTrade(j.serviceType) && j.motoristVehicle?.trim()
        ? j.motoristVehicle.trim()
        : j.motoristName?.split(/\s+/)[0] || skill;
    void ensureNotifyPermission().then(() => {
      if (canNotify()) {
        showAppNotification({
          title: "Ona · Service Request",
          body: `${title} · ${j.problem.slice(0, 90)}`,
          tag: `job-${j.id}`,
          href: `/jobs/${j.id}`,
          requireInteraction: false,
        });
      }
    });
  }, []);

  /** Show this job as the single active panel (fresh 66s). */
  const presentJob = useCallback(
    (j: JobRecord) => {
      if (pathname.includes(`/jobs/${j.id}`)) {
        markJobShown(j.id, backendUserId || undefined);
        return;
      }
      markJobShown(j.id, backendUserId || undefined);
      setAlertJob(j);
      setSnoozed(false);
      setExpandedJob(null);
      setActionError(null);
      setTimeLeft(INCOMING_POPUP_VISIBLE_SEC);
      unlockAudio();
      playAppSound("request_new");
      vibrateCallPattern();
      pushOsOnce(j);
    },
    [pathname, pushOsOnce, backendUserId]
  );

  /**
   * Enqueue or present: only the first request is shown.
   * Later jobs wait in queue until current ends / is dismissed.
   */
  const offerJob = useCallback(
    (j: JobRecord) => {
      if (pathname.includes(`/jobs/${j.id}`)) {
        markJobShown(j.id, backendUserId || undefined);
        return;
      }
      const gate = canSurfaceIncomingJob(j.id, {
        proId: backendUserId || undefined,
      });
      if (!gate.allow) return;

      const current = alertJobRef.current;
      if (!current) {
        presentJob(j);
        return;
      }
      if (current.id === j.id) return;
      setQueue((prev) => {
        if (prev.some((x) => x.id === j.id)) return prev;
        const next = [...prev, j].slice(0, 8);
        queueRef.current = next;
        return next;
      });
    },
    [pathname, presentJob, backendUserId]
  );

  /** After 66s / decline: promote next queued job instantly, or hide fully. */
  const endCurrentAndMaybeNext = useCallback(
    (opts?: { defer?: boolean }) => {
      const current = alertJobRef.current;
      const proId = backendUserId;
      if (opts?.defer && current && proId) {
        void apiDeferJob(current.id, proId);
      }
      const rest = queueRef.current.filter((j) => j.id !== current?.id);
      if (rest.length > 0) {
        const [next, ...tail] = rest;
        queueRef.current = tail;
        setQueue(tail);
        presentJob(next);
        return;
      }
      fullyHide();
    },
    [backendUserId, fullyHide, presentJob]
  );

  // 66s progress line (stable — end handler via ref so timer never restarts mid-wave)
  const endRef = useRef(endCurrentAndMaybeNext);
  endRef.current = endCurrentAndMaybeNext;
  useEffect(() => {
    if (!alertJob || snoozed || expandedJob) return;
    setTimeLeft(INCOMING_POPUP_VISIBLE_SEC);
    const interval = window.setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          window.clearInterval(interval);
          endRef.current({ defer: true });
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [alertJob?.id, snoozed, expandedJob]);

  // Poll + realtime
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

    const ingest = (jobs: JobRecord[]) => {
      const now = Date.now();
      const open = jobs.filter((j) =>
        isIncomingJobOpen(j, backendUserId, now)
      );
      setOtherCount(open.length);

      if (!primed.current) {
        knownIds.current = new Set(open.map((j) => j.id));
        primed.current = true;
        const newest = open[0];
        if (newest) offerJob(newest);
        return;
      }

      for (const j of open) {
        if (!knownIds.current.has(j.id)) {
          knownIds.current.add(j.id);
          offerJob(j);
        }
      }

      const openIds = new Set(open.map((j) => j.id));
      for (const id of [...knownIds.current]) {
        if (!openIds.has(id)) knownIds.current.delete(id);
      }

      // Drop queue items no longer open
      setQueue((prev) => {
        const next = prev.filter((j) => openIds.has(j.id));
        queueRef.current = next;
        return next;
      });

      const current = alertJobRef.current;
      if (current && !openIds.has(current.id) && !snoozed) {
        // Current reassigned / closed — show next instantly if any
        endCurrentAndMaybeNext({ defer: false });
      }
    };

    let polling = false;
    const poll = async () => {
      if (polling) return;
      polling = true;
      try {
        const res = await apiListJobs(backendUserId, "repair_pro");
        if (cancelled || !res.ok) return;
        ingest(res.data.jobs);
      } finally {
        polling = false;
      }
    };

    void poll();
    // Adaptive cadence: 1s while a request is live on screen, 3s otherwise.
    // Realtime events still trigger an instant poll, so the popup stays snappy.
    let timer = 0;
    const schedule = () => {
      timer = window.setTimeout(() => {
        if (typeof document !== "undefined" && document.hidden) {
          schedule();
          return;
        }
        void poll();
        schedule();
      }, alertJobRef.current || queueRef.current.length ? 1_000 : 3_000);
    };
    schedule();

    const unsub = backendSubscribeJobs(backendUserId, () => {
      if (!cancelled) void poll();
    });

    const onVis = () => {
      if (!document.hidden) void poll();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVis);
      unsub?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountType, backendUserId, isAuthenticated, authReady, pathname]);

  useEffect(() => {
    if (
      !isAuthenticated ||
      accountType !== "professional" ||
      primedForId.current !== backendUserId
    ) {
      primed.current = false;
      knownIds.current = new Set();
      osPushed.current = new Set();
      primedForId.current = backendUserId;
      if (!isAuthenticated || accountType !== "professional") {
        fullyHide();
      }
    }
  }, [isAuthenticated, accountType, backendUserId, fullyHide]);

  const showBadge =
    accountType === "professional" &&
    otherCount > 1 &&
    pathname.startsWith("/jobs/") &&
    !alertJob;

  if (accountType !== "professional") return null;

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

  const dismissPanel = () => endCurrentAndMaybeNext({ defer: false });

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

      {/* Dim scrim behind the lower panel while it is visible */}
      {alertJob && !expandedJob && !snoozed && (
        <div
          role="button"
          tabIndex={-1}
          aria-label="Close request"
          className="pointer-events-auto absolute inset-0 z-[179] border-0 animate-[om-scrim-in_0.35s_ease-out]"
          style={{
            backgroundColor: "rgba(0,0,0,0.55)",
            cursor: "default",
          }}
          onClick={dismissPanel}
          onKeyDown={(e) => {
            if (e.key === "Escape") dismissPanel();
          }}
        />
      )}

      {/* Lower panel only — title + problem (no top toast, no repeated labels) */}
      {alertJob && !expandedJob && !snoozed && (
        <div
          className="pointer-events-auto absolute inset-x-0 bottom-0 z-[180] flex flex-col rounded-t-[2rem] px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-12px_40px_rgba(0,0,0,0.35)] backdrop-blur-2xl"
          style={{
            maxHeight: "40vh",
            backgroundColor: solid,
            borderTop: `0.5px solid ${hairline}`,
          }}
          role="dialog"
          aria-modal
          aria-label={titleFor(alertJob)}
        >
          <div
            className={cn(
              "mx-auto mb-2 h-1 w-10 shrink-0 rounded-full",
              isLight ? "bg-black/15" : "bg-white/20"
            )}
          />

          <div
            className="min-w-0 flex-1 cursor-pointer overflow-y-auto"
            onClick={() => setExpandedJob(alertJob)}
          >
            <p
              className="text-[15px] font-black leading-tight"
              style={{ color: ink }}
            >
              {titleFor(alertJob)}
            </p>
            <p
              className="mt-1 text-[13px] font-medium leading-relaxed"
              style={{ color: muted }}
            >
              {alertJob.problem}
              {alertJob.agreedMajor != null
                ? ` · ${formatMoney(alertJob.agreedMajor, alertJob.currency)}`
                : ""}
            </p>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                const j = alertJob;
                const id = j.id;
                if (isPairingAlert(j)) {
                  void apiTransition({
                    jobId: id,
                    event: "DECLINE",
                    actor: "repair_pro",
                    actorId: backendUserId || undefined,
                    reason: "Currently unavailable",
                    idempotencyKey: backendUserId
                      ? idemFor(j, backendUserId, "DECLINE")
                      : undefined,
                  });
                } else {
                  void apiTransition({
                    jobId: id,
                    event: "CANCEL",
                    actor: "repair_pro",
                    actorId: backendUserId || undefined,
                    reason: "pro_declined",
                  });
                }
                endCurrentAndMaybeNext({ defer: false });
              }}
              className={cn(
                "h-11 rounded-xl border-0 text-[13px] font-bold",
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
                const j = alertJob;
                const id = j.id;
                setSnoozed(true);
                if (!backendUserId) return;
                if (isPairingAlert(j)) {
                  void apiTransition({
                    jobId: id,
                    event: "LATER",
                    actor: "repair_pro",
                    actorId: backendUserId,
                    idempotencyKey: idemFor(j, backendUserId, "LATER"),
                  });
                } else {
                  void apiDeferJob(id, backendUserId);
                }
              }}
              className={cn(
                "h-11 rounded-xl border-0 text-[13px] font-bold",
                isLight
                  ? "bg-black/8 text-slate-900"
                  : "bg-white/10 text-white"
              )}
            >
              Later
            </button>
          </div>
          <button
            type="button"
            disabled={accepting || !backendUserId}
            onClick={() => handleFixIt(alertJob)}
            className="mt-2 inline-flex h-12 w-full items-center justify-center gap-1.5 rounded-xl border-0 bg-[#FF6B35] text-[14px] font-bold text-white"
          >
            {accepting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : null}
            I can fix this
          </button>
          {actionError ? (
            <p
              className="mt-2 text-center text-[12px] font-semibold"
              style={{ color: isLight ? "#b91c1c" : "#fca5a5" }}
            >
              {actionError}
            </p>
          ) : null}

          <div
            className="mt-3 h-1 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={INCOMING_POPUP_VISIBLE_SEC}
            aria-valuenow={timeLeft}
            aria-label="Time remaining for this request"
          >
            <div
              className="h-full bg-[#FF6B35] transition-[width] duration-1000 ease-linear"
              style={{
                width: `${Math.max(
                  0,
                  Math.min(100, (timeLeft / INCOMING_POPUP_VISIBLE_SEC) * 100)
                )}%`,
              }}
            />
          </div>
        </div>
      )}

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
              Kept in your incoming list and still acceptable until the timer
              runs out.
            </p>
            <button
              type="button"
              onClick={() => endCurrentAndMaybeNext({ defer: false })}
              className="mt-4 h-11 w-full rounded-xl border-0 bg-[#FF6B35] text-[13px] font-bold text-white"
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {expandedJob && (
        <div
          className="absolute inset-0 z-[180] flex items-end justify-center bg-black/35 p-3 pb-[max(1rem,env(safe-area-inset-bottom))]"
          role="dialog"
          aria-modal
          aria-label="Request detail"
        >
          <div
            className={cn(
              "flex max-h-[85vh] w-full max-w-[360px] flex-col overflow-hidden rounded-2xl border-0",
              isLight ? "bg-[#c8c9cd] text-slate-900" : "bg-black text-white"
            )}
          >
            <div className="flex items-center justify-between px-4 pt-4">
              <p className="text-[15px] font-black">{titleFor(expandedJob)}</p>
              <button
                type="button"
                onClick={() => setExpandedJob(null)}
                className="rounded-full border-0 p-1.5"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              <p
                className={cn(
                  "text-[13px] font-medium leading-relaxed",
                  isLight ? "text-slate-700" : "text-white/75"
                )}
              >
                {expandedJob.problem}
              </p>
              {expandedJob.voiceNote?.url ? (
                <div className="mt-3">
                  <VoiceNotePlayer url={expandedJob.voiceNote.url} isLight={isLight} />
                </div>
              ) : null}
            </div>
            <div className="grid grid-cols-2 gap-2 p-4 pt-2">
              <button
                type="button"
                disabled={accepting}
                onClick={() => {
                  const j = expandedJob;
                  setExpandedJob(null);
                  endCurrentAndMaybeNext({ defer: false });
                  if (isPairingAlert(j)) {
                    void apiTransition({
                      jobId: j.id,
                      event: "DECLINE",
                      actor: "repair_pro",
                      actorId: backendUserId || undefined,
                      reason: "Currently unavailable",
                      idempotencyKey: backendUserId
                        ? idemFor(j, backendUserId, "DECLINE")
                        : undefined,
                    });
                  } else {
                    void apiTransition({
                      jobId: j.id,
                      event: "CANCEL",
                      actor: "repair_pro",
                      actorId: backendUserId || undefined,
                      reason: "pro_declined",
                    });
                  }
                }}
                className={cn(
                  "h-11 rounded-xl border-0 text-[13px] font-bold",
                  isLight
                    ? "bg-red-500/15 text-red-700"
                    : "bg-red-500/20 text-red-400"
                )}
              >
                Decline
              </button>
              <button
                type="button"
                disabled={accepting || !backendUserId}
                onClick={() => handleFixIt(expandedJob)}
                className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border-0 bg-[#FF6B35] text-[13px] font-bold text-white"
              >
                {accepting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                I can fix this
              </button>
            </div>
            {actionError ? (
              <p
                className="px-4 pb-4 text-center text-[12px] font-semibold"
                style={{ color: isLight ? "#b91c1c" : "#fca5a5" }}
              >
                {actionError}
              </p>
            ) : null}
          </div>
        </div>
      )}
    </>
  );
}
