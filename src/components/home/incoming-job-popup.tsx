"use client";

/**
 * Repair Pro: lower-panel Incoming Request only (no top toast).
 * - Instant surface: poll + Supabase realtime
 * - Up to 2 requests visible at once (full cards, panel expands — no shrink/scroll)
 * - Further jobs queue; when a slot frees, next promotes instantly
 * - 66s progress per card (server pairing_deadline)
 * - OS push kept alongside in-app panel
 * - No dim scrim — panel only; cannot dismiss by outside tap or Escape
 *   (timer elapse or Decline / Later / I can fix this only)
 */

/** Max concurrent request cards in the lower panel (no scroll for this many). */
const MAX_VISIBLE_INCOMING = 2;

/** Fast status-check cadence while a request card is on screen — the close
 *  falls back from realtime to this poll, so a customer cancel lands in ≤ ~½s
 *  even when the realtime push is missed on a flaky connection. */
export const INCOMING_POPUP_STATUS_POLL_MS = 500;

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  PointerEvent as ReactPointerEvent,
  WheelEvent as ReactWheelEvent,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { Briefcase, ChevronLeft, ChevronRight, ChevronUp, Clock, Loader2, Wrench, X } from "lucide-react";
import {
  canNotify,
  ensureNotifyPermission,
  showAppNotification,
  vibrateCallPattern,
} from "@/lib/app-notify";
import { apiDeferJob, apiGetJob, apiListJobs, apiProIncomingStatus, apiTransition, getCurrentPosition } from "@/lib/jobs/client";
import { ConfirmCancelSheet } from "@/components/ui/confirm-cancel-sheet";
import {
  canSurfaceIncomingJob,
  clearJobShown,
  INCOMING_POPUP_VISIBLE_MS,
  INCOMING_POPUP_VISIBLE_SEC,
  isIncomingJobOpen,
  isProRequestCardKeepable,
  markJobShown,
  PAIRING_ACTION_STAGES,
  requestCloseText,
  setIncomingPanelOpen,
  takeForceIncomingPanelJobId,
} from "@/lib/jobs/incoming-popup-timing";
import type { JobRecord } from "@/lib/jobs/types";
import { refreshServerClock, serverNow } from "@/lib/jobs/server-clock";
import {
  isDeadlinePast,
  secondsLeftFloor,
} from "@/lib/jobs/countdown-math";
import { formatMoney } from "@/lib/pricing";
import { calculateCalloutFee, resolveAppliedMultiplier } from "@/lib/callout/engine";
import { DEFAULT_TRADE_BASE_FEES } from "@/lib/callout/constants";
import type { CalloutQuote } from "@/lib/callout/constants";
import type { ProService } from "@/lib/types";
import { isAutomotiveTrade } from "@/lib/artisan/catalog";
import { DEFAULT_VENDOR_PHOTO } from "@/lib/brand";
import { enablePushNotifications } from "@/lib/push/client";
import { PRO_SERVICE_LABELS } from "@/lib/services";
import { playAppSound, unlockAudio } from "@/lib/sound-tone";
import { backendSubscribeJobs } from "@/lib/supabase/app-api";
import { VoiceNotePlayer } from "@/components/jobs/voice-note-player";
import { JobProblemQA } from "@/components/jobs/job-problem-qa";
import { useJobCallout } from "@/lib/callout/use-job-callout";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

/** Per-card concise Base + Call-Out fee. Fetches the locked quote for this
 *  request (or the server estimate while still pairing) and shows the fee
 *  once the quote is available. Refetches when the job status changes so a
 *  restarted search (customer Retry) still surfaces the fee. */
/** Fallback fee for the OPEN trade (base fee + distance×rate) when the server
 *  quote is not yet payable — same formula the server runs. Never ₦0 for a
 *  real trade. Always carries the applicable urgency multiplier: the chip from
 *  the server quote stays in effect, but the current-time auto band (Night
 *  9PM–5AM Lagos) overrides it when higher. The urgency feature is forced —
 *  no fallback may show an un-multiplied fee. */
function tradeFallbackFee(
  trade: string | null | undefined,
  quote?: Partial<
    Pick<CalloutQuote, "urgencyKind" | "urgencyMultiplier">
  > | null
): number {
  if (!trade || !(trade in DEFAULT_TRADE_BASE_FEES)) return 0;
  const applied = resolveAppliedMultiplier({
    chipKind: quote?.urgencyKind ?? null,
    chipMultiplier: quote?.urgencyMultiplier ?? null,
    approvedDistanceKm: 0,
    acceptedAt: new Date(),
  }).multiplier;
  const fee = calculateCalloutFee({
    tradeId: trade as ProService,
    approvedRouteDistanceKm: 0,
    urgencyMultiplier: applied,
  });
  return Number.isFinite(fee.calloutFee) ? fee.calloutFee : 0;
}

function CalloutFeeOnCard({
  job,
  isLight,
}: {
  job: JobRecord;
  isLight: boolean;
}) {
  const { quote } = useJobCallout(job.id, job.status, job.calloutQuote);
  const ink = isLight ? "text-slate-900" : "text-white";
  const muted = isLight ? "text-slate-500" : "text-white/50";
  const qFee = Number(quote?.calloutFee);
  const payable = quote && Number.isFinite(qFee) && qFee > 0 ? qFee : 0;
  const fee =
    payable > 0 ? payable : tradeFallbackFee(job.serviceType, quote);
  const currency = quote?.currency || job.currency || "NGN";
  return (
    <div
      className={cn(
        "mt-2.5 border-t pt-2",
        isLight ? "border-black/10" : "border-white/10"
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className={cn("text-[11px] font-bold", ink)}>Call Out Fee</span>
        {quote ? (
          <span className={cn("text-[11px] font-black tabular-nums", ink)}>
            {formatMoney(fee, currency)}
          </span>
        ) : (
          <span className={cn("text-[11px] font-semibold", muted)}>
            Calculating…
          </span>
        )}
      </div>
    </div>
  );
}

function isPairingAlert(j: JobRecord): boolean {
  return (
    PAIRING_ACTION_STAGES.has(j.pairingStage ?? "") ||
    PAIRING_ACTION_STAGES.has(j.status ?? "")
  );
}

function idemFor(j: JobRecord, proId: string, event: string): string {
  return `${event}:${j.id}:${(proId || "").slice(0, 8)}`;
}

/** Server messages that mean "this request is no longer this pro's live
 *  request" (the customer closed/cancelled it, or it moved to another pro).
 *  The server already refuses the tap — surface a friendly message and drop
 *  the card instead of echoing the raw API error. */
function isStaleRequestError(message?: string | null): boolean {
  return Boolean(
    message &&
      /not open for this action|not awaiting confirmation|moved on while opening|moved on before confirmation|not assigned to this request/i.test(
        message
      )
  );
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
  const visibleJobsRef = useRef<JobRecord[]>([]);
  const queueRef = useRef<JobRecord[]>([]);
  const osPushed = useRef<Set<string>>(new Set());
  /** When each card was surfaced (local respond-window fallback when the job
   *  has no server-owned deadline). */
  const surfacedAtRef = useRef<Record<string, number>>({});
  /** Consecutive polls a card's id was missing from the pro list (grace window
   *  for Supabase/realtime blips before the card is truly dropped). */
  const missingCountRef = useRef<Record<string, number>>({});
  /** Job ids we already told the pro was closed — so a request that closes
   *  once doesn't toast/push repeatedly on every realtime ping. */
  const notifiedCloseRef = useRef<Set<string>>(new Set());
  /** Horizontal swipe origin for the photo lightbox (next/prev without closing). */
  const lightboxTouchX = useRef<number | null>(null);

  /** Up to MAX_VISIBLE_INCOMING full request cards in the lower panel */
  const [visibleJobs, setVisibleJobs] = useState<JobRecord[]>([]);
  const [queue, setQueue] = useState<JobRecord[]>([]);
  const [otherCount, setOtherCount] = useState(0);
  const [confirmFix, setConfirmFix] = useState<JobRecord | null>(null);
  const [confirmCancelFix, setConfirmCancelFix] = useState(false);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [snoozedJob, setSnoozedJob] = useState<JobRecord | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  /** Transient X-style banner — "this request was closed". Shown when a live
   *  card is closed because the customer cancelled, expired, or moved to another
   *  pro. Renders as an in-app top card (mirrors the app's notification toasts);
   *  never an OS/browser push. Survives the panel closing. */
  const [closeBanner, setCloseBanner] = useState<{
    title: string;
    body: string;
    avatarUrl?: string | null;
  } | null>(null);
  /** Seconds left per job id (server deadline) */
  const [timeLeftById, setTimeLeftById] = useState<Record<string, number>>({});
  const [lightbox, setLightbox] = useState<{
    photos: { id: string; url: string; name?: string | null }[];
    index: number;
  } | null>(null);

  useEffect(() => {
    visibleJobsRef.current = visibleJobs;
  }, [visibleJobs]);
  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  useEffect(() => {
    if (!closeBanner) return;
    const t = window.setTimeout(() => setCloseBanner(null), 4500);
    return () => window.clearTimeout(t);
  }, [closeBanner]);

  const fullyHide = useCallback(() => {
    setVisibleJobs([]);
    visibleJobsRef.current = [];
    setQueue([]);
    queueRef.current = [];
    setSnoozedJob(null);
    setActionError(null);
    setTimeLeftById({});
    setAcceptingId(null);
    surfacedAtRef.current = {};
    missingCountRef.current = {};
  }, []);

  /** If a request the pro was seeing closed (customer cancelled, request
   *  expired, or it went to another pro), tell them once with an in-app
   *  X-style banner. Fires whether the card closes via realtime, the status
   *  poll, or the list poll. */
  const notifyRequestClosed = useCallback(
    (
      jobId: string,
      opts: {
        job?: JobRecord | null;
        status?: string | null;
        movedOn?: boolean;
      }
    ) => {
      if (notifiedCloseRef.current.has(jobId)) return;
      // Only announce a close the pro actually witnessed live this session.
      // A pre-existing terminal/history job (already expired/cancelled before
      // this page mounted) must never re-announce on every reload — surface
      // only the real transition, exactly once.
      if (!(surfacedAtRef.current[jobId] > 0)) return;
      notifiedCloseRef.current.add(jobId);
      const { job, status = "", movedOn = false } = opts;
      // Cancellations toast through the notification center's top toast (live
      // INSERT on notifications) — never also pile a transient banner here, or
      // the pro would see two "Request cancelled" notices for the same event.
      if (!movedOn && String(status).toLowerCase() === "cancelled") return;
      const title =
        movedOn
          ? "Request moved on"
          : status === "cancelled"
            ? "Request cancelled"
            : status === "expired"
              ? "Request expired"
              : "Request closed";
      setCloseBanner({
        title,
        body: requestCloseText(opts),
        avatarUrl: job?.motoristPhoto || null,
      });
    },
    []
  );

  /**
   * One-tap "I can fix this": accepts the request right here (lower panel) and
   * lands straight on the negotiation page — no full-page review in between.
   * - pairing-stage: OPEN (reserve) then CONFIRM (accept) so the negotiation
   *   gate is skipped server-side (reservation confirmed / assignment assigned)
   * - classic: START_NEGOTIATION + session flag so the page skips the gate.
   * Errors are surfaced inline so a failed tap is never silent.
   */
  const handleFixIt = useCallback(
    async (j: JobRecord) => {
      if (!backendUserId) return;
      setAcceptingId(j.id);
      setActionError(null);
      try {
        // Branch on the LIVE flow status, not pairingStage: a card that
        // already moved to negotiating (e.g. stale pairing stage left on the
        // record) must take the classic path, not fail the CONFIRM gate.
        if (PAIRING_ACTION_STAGES.has(j.status ?? "")) {
          const stage = j.pairingStage ?? "";
          const needsOpen =
            stage === "waiting_for_selected" || stage === "waiting_for_pro";
          // GPS is best-effort — never block the confirm on it. Start it
          // alongside OPEN and only attach the fix if it resolves within
          // ~250ms; otherwise the server uses the pro's existing Live pin.
          const gpsPromise = getCurrentPosition({
            enableHighAccuracy: true,
            timeout: 8000,
            maximumAge: 5000,
          })
            .then((pos) => ({
              proLat: pos.coords.latitude,
              proLng: pos.coords.longitude,
              accuracyM: pos.coords.accuracy,
              capturedAt: new Date().toISOString(),
            }))
            .catch(() => ({}));
          if (needsOpen) {
            const openRes = await apiTransition({
              jobId: j.id,
              event: "OPEN",
              actor: "repair_pro",
              actorId: backendUserId,
              idempotencyKey: idemFor(j, backendUserId, "OPEN"),
            });
            if (!openRes.ok) {
              if (isStaleRequestError(openRes.message)) {
                removeRef.current(j.id);
                notifyRequestClosed(j.id, {
                  job: j,
                  status: j.status,
                  movedOn: /not assigned|moved on/i.test(
                    openRes.message || ""
                  ),
                });
              } else {
                setActionError(
                  openRes.message ||
                    "Could not open this request. Please try again."
                );
              }
              return;
            }
          }
          const gps = await Promise.race([
            gpsPromise,
            new Promise<Record<string, never>>((resolve) =>
              setTimeout(() => resolve({}), 250)
            ),
          ]);
          const confirmRes = await apiTransition({
            jobId: j.id,
            event: "CONFIRM",
            actor: "repair_pro",
            actorId: backendUserId,
            idempotencyKey: idemFor(j, backendUserId, "CONFIRM"),
            ...gps,
          });
          if (!confirmRes.ok) {
            if (isStaleRequestError(confirmRes.message)) {
              removeRef.current(j.id);
              notifyRequestClosed(j.id, {
                job: j,
                status: j.status,
                movedOn: /not assigned|moved on/i.test(
                  confirmRes.message || ""
                ),
              });
            } else {
              setActionError(
                confirmRes.message ||
                  "Could not confirm this request. Please try again."
              );
            }
            return;
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
          if (!res.ok) {
            setActionError(
              res.message || "Could not connect. Please try again."
            );
            return;
          }
          // Skip the full-page "Can you fix this?" gate — go straight to
          // negotiation (lower-panel flow).
          try {
            sessionStorage.setItem(`om-can-fix-${j.id}`, "1");
          } catch {
            /* */
          }
          fullyHide();
          router.push(`/jobs/${j.id}`);
        }
      } finally {
        setAcceptingId(null);
      }
    },
    [backendUserId, fullyHide, notifyRequestClosed, router]
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

  /**
   * Add/update a job in a free visible slot (max 2).
   * Customer photos/voice load before open when missing.
   */
  const presentJob = useCallback(
    async (j: JobRecord) => {
      markJobShown(
        j.id,
        backendUserId || undefined,
        j.pairingDeadline || null
      );

      // OS push only when the incoming panel isn't already on screen — a pro
      // looking at the request cards sees new work without a browser
      // notification (same brand rule as the toast pile: no double voice).
      const panelAlreadyOpen = visibleJobsRef.current.length > 0;

      let job = j;
      const hasMedia =
        (Array.isArray(j.photos) && j.photos.length > 0) ||
        Boolean(j.voiceNote?.url);
      if (!hasMedia) {
        try {
          const res = await apiGetJob(j.id);
          if (res.ok) {
            const full = res.data.job;
            job = {
              ...j,
              ...full,
              pairingDeadline:
                full.pairingDeadline || j.pairingDeadline || null,
              photos: full.photos?.length ? full.photos : j.photos || [],
              voiceNote: full.voiceNote || j.voiceNote || null,
              motoristPhoto: full.motoristPhoto || j.motoristPhoto || null,
            };
          }
        } catch {
          /* open with text-only if media fetch fails */
        }
      }

      setVisibleJobs((prev) => {
        const idx = prev.findIndex((x) => x.id === j.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = job;
          visibleJobsRef.current = next;
          return next;
        }
        if (prev.length >= MAX_VISIBLE_INCOMING) return prev;
        const next = [...prev, job].slice(0, MAX_VISIBLE_INCOMING);
        visibleJobsRef.current = next;
        return next;
      });
      setSnoozedJob(null);
      setActionError(null);
      setTimeLeftById((m) => ({
        ...m,
        [job.id]: INCOMING_POPUP_VISIBLE_SEC,
      }));
      surfacedAtRef.current[job.id] = Date.now();
      unlockAudio();
      playAppSound("request_new");
      vibrateCallPattern();
      // The request is now ON this pro's screen. Ask the server to arm the
      // shared pairing_deadline exactly once (the server noops if a deadline is
      // already set) so the 66s timer starts at this instant — on this card AND
      // the customer's ring — and never rolls back. Fire-and-forget.
      import("@/lib/jobs/client")
        .then(({ apiSurfaceJob }) => apiSurfaceJob(job.id))
        .catch(() => {
          /* surface alignment best-effort */
        });
      // Enroll this device for web-push (once per session) so the server can
      // reach the pro with a cancellation OS notification even when the app is
      // closed or the tab hidden. Best-effort; never blocks the card.
      void enablePushNotifications(backendUserId);
      if (!panelAlreadyOpen) pushOsOnce(job);
    },
    [pushOsOnce, backendUserId]
  );

  /** Present up to 2 jobs; extras wait in queue until a slot frees. */
  const offerJob = useCallback(
    (j: JobRecord) => {
      const gate = canSurfaceIncomingJob(j.id, {
        proId: backendUserId || undefined,
        pairingDeadline: j.pairingDeadline || null,
      });
      if (!gate.allow) return;

      const visible = visibleJobsRef.current;
      const existing = visible.find((x) => x.id === j.id);
      if (existing) {
        if (
          j.pairingDeadline &&
          existing.pairingDeadline !== j.pairingDeadline
        ) {
          void presentJob(j);
        }
        return;
      }
      if (visible.length < MAX_VISIBLE_INCOMING) {
        void presentJob(j);
        return;
      }
      setQueue((prev) => {
        if (prev.some((x) => x.id === j.id)) return prev;
        const next = [...prev, j].slice(0, 8);
        queueRef.current = next;
        return next;
      });
    },
    [presentJob, backendUserId]
  );

  /** Remove one card; promote next from queue into free slot. */
  const removeJobAndMaybeNext = useCallback(
    (
      jobId: string,
      opts?: { defer?: boolean; goDashboard?: boolean }
    ) => {
      const proId = backendUserId;
      const target =
        visibleJobsRef.current.find((j) => j.id === jobId) ||
        queueRef.current.find((j) => j.id === jobId);
      if (opts?.defer && target && proId) {
        void apiDeferJob(target.id, proId);
      }
      if (opts?.goDashboard) {
        fullyHide();
        router.replace("/dashboard");
        return;
      }

      const rest = visibleJobsRef.current.filter((j) => j.id !== jobId);
      let q = queueRef.current.filter((j) => j.id !== jobId);
      // Any surface for this request must close too — including the "Confirm
      // you can fix this" dialog that may be open over the expired card.
      setConfirmFix((c) => (c?.id === jobId ? null : c));
      setConfirmCancelFix(false);
      // Promote queued jobs into free slots after state settles
      const toPresent: JobRecord[] = [];
      while (rest.length + toPresent.length < MAX_VISIBLE_INCOMING && q.length > 0) {
        const [next, ...tail] = q;
        q = tail;
        toPresent.push(next);
      }
      queueRef.current = q;
      setQueue(q);
      visibleJobsRef.current = rest;
      setVisibleJobs(rest);
      setTimeLeftById((m) => {
        const n = { ...m };
        delete n[jobId];
        return n;
      });
      delete surfacedAtRef.current[jobId];
      if (rest.length === 0 && q.length === 0) {
        setSnoozedJob(null);
        setActionError(null);
      }
      for (const n of toPresent) void presentJob(n);
    },
    [backendUserId, fullyHide, presentJob, router]
  );

  const endCurrentAndMaybeNext = useCallback(
    (opts?: { defer?: boolean; goDashboard?: boolean }) => {
      const current = visibleJobsRef.current[0];
      if (!current) {
        if (opts?.goDashboard) {
          fullyHide();
          router.replace("/dashboard");
        }
        return;
      }
      removeJobAndMaybeNext(current.id, opts);
    },
    [fullyHide, removeJobAndMaybeNext, router]
  );

  // Progress lines — ALWAYS each job.pairingDeadline (same as customer ring).
  const removeRef = useRef(removeJobAndMaybeNext);
  useEffect(() => {
    removeRef.current = removeJobAndMaybeNext;
  });
  const visibleKey = visibleJobs.map((j) => `${j.id}:${j.pairingDeadline || ""}`).join("|");
  useEffect(() => {
    if (visibleJobsRef.current.length === 0 || snoozedJob || lightbox) return;
    // Align the server clock so the card shows the SAME remaining seconds as
    // the customer's ring (both count the same absolute pairing_deadline).
    void refreshServerClock();
    const interval = window.setInterval(() => {
      const jobs = visibleJobsRef.current;
      if (jobs.length === 0) return;
      const nextMap: Record<string, number> = {};
      const expired: string[] = [];
      // Any request whose timer has elapsed (classic + pairing) must also close
      // the "Confirm you can fix this" dialog open over it.
      const deadlineUp: string[] = [];
      for (const j of jobs) {
        const deadlineMs = j.pairingDeadline
          ? Date.parse(j.pairingDeadline)
          : Number.NaN;
        // Any server-owned deadline (the pairing window) drives the card first
        // — same value the customer's ring counts, so they stay in sync.
        if (Number.isFinite(deadlineMs)) {
          // Shared countdown math: floor like the customer ring so both phones
          // show the same number, and expire at the real moment (never a tick
          // late). Pairing cards never auto-defer (the sweep owns each wave and
          // re-issues pairing_deadline); classic cards defer when their server
          // window lapses.
          nextMap[j.id] = secondsLeftFloor(deadlineMs, serverNow());
          if (isDeadlinePast(deadlineMs, serverNow())) {
            deadlineUp.push(j.id);
            if (!isPairingAlert(j)) expired.push(j.id);
          }
          continue;
        }
        if (isPairingAlert(j)) {
          // Pairing card mid-transition without a deadline: hold at 0.
          nextMap[j.id] = 0;
          continue;
        }
        // Classic negotiating/agreed: sync to the REAL negotiation deadline
        // when it's armed (the customer counts it down too). A far-future
        // negotiate_ends_at means the request isn't accepted yet → use a
        // local 66s respond window so the card never freezes.
        const endsMs = j.negotiateEndsAt
          ? Date.parse(j.negotiateEndsAt)
          : Number.NaN;
        if (
          Number.isFinite(endsMs) &&
          endsMs - serverNow() <= 24 * 60 * 60 * 1000
        ) {
          nextMap[j.id] = secondsLeftFloor(endsMs, serverNow());
          if (isDeadlinePast(endsMs, serverNow())) {
            deadlineUp.push(j.id);
            expired.push(j.id);
          }
          continue;
        }
        const started = surfacedAtRef.current[j.id] ?? Date.now();
        const remainingMs = INCOMING_POPUP_VISIBLE_SEC * 1000 - (Date.now() - started);
        nextMap[j.id] = Math.max(0, Math.floor(remainingMs / 1000));
        if (remainingMs <= 0) {
          deadlineUp.push(j.id);
          expired.push(j.id);
        }
      }
      setTimeLeftById((prev) => ({ ...prev, ...nextMap }));
      // The request's timer elapsed while its "Confirm you can fix this" (or
      // "Decline this job?") dialog was open → close that surface too.
      if (deadlineUp.length > 0) {
        setConfirmFix((c) => (c && deadlineUp.includes(c.id) ? null : c));
        setConfirmCancelFix(false);
      }
      // Expire each classic card independently (defer that request)
      for (const id of expired) {
        removeRef.current(id, { defer: true });
      }
    }, 250);
    return () => window.clearInterval(interval);
  }, [visibleKey, snoozedJob, lightbox]);

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
      const now = serverNow();
      const open = jobs.filter((j) =>
        isIncomingJobOpen(j, backendUserId, now)
      );
      setOtherCount(open.length);

      // Cards survive as long as the request is still THIS pro's live request
      // (looser than `open`: it stays through a lapsed pairing window between
      // sweep waves, instead of flickering off then back on).
      const keepIds = new Set(
        jobs
          .filter(
            (j) =>
              j.repairProId === backendUserId &&
              isProRequestCardKeepable(j.status, j.pairingStage)
          )
          .map((j) => j.id)
      );
      // Grace window: only drop a card after it has been missing for 2
      // consecutive polls (covers realtime/Supabase blips without waiting on
      // genuine reassignment/cancellation).
      const dropIds = new Set<string>();
      const findKnownJob = (id: string): JobRecord | null =>
        visibleJobsRef.current.find((j) => j.id === id) ||
        queueRef.current.find((j) => j.id === id) ||
        null;
      for (const [id, n] of Object.entries(missingCountRef.current)) {
        if (keepIds.has(id)) {
          delete missingCountRef.current[id];
        } else {
          missingCountRef.current[id] = n + 1;
          if (n + 1 >= 2) {
            dropIds.add(id);
            delete missingCountRef.current[id];
            // Missing for 2 full polls = no longer this pro's live request
            // (most commonly reassigned to another pro) — tell the pro.
            notifyRequestClosed(id, {
              job: findKnownJob(id),
              status: findKnownJob(id)?.status,
              movedOn: true,
            });
          }
        }
      }
      // Explicit close: the job is still listed but the server moved it out of
      // an actionable status (customer cancelled/completed, declined, reassigned
      // to searching, …). Close its card NOW — no grace. Grace only covers
      // cards that VANISH from the list (transient realtime blips). Tell the
      // pro why it closed.
      for (const j of jobs) {
        if (
          j.repairProId === backendUserId &&
          !isProRequestCardKeepable(j.status, j.pairingStage)
        ) {
          notifyRequestClosed(j.id, { job: j, status: j.status });
          dropIds.add(j.id);
          delete missingCountRef.current[j.id];
        }
      }

      // Forced open (bounced off full /jobs page → dashboard + panel only,
      // or tapped from the dashboard Incoming requests list). Expand a
      // collapsed/hidden panel so the tapped request is fully visible.
      const forceId = takeForceIncomingPanelJobId();
      if (forceId) {
        const forced = open.find((j) => j.id === forceId);
        if (forced) {
          clearJobShown(forced.id, backendUserId);
          presentJob(forced);
          setLevel("middle");
          knownIds.current.add(forced.id);
          primed.current = true;
          return;
        }
      }

      if (!primed.current) {
        knownIds.current = new Set(open.map((j) => j.id));
        primed.current = true;
        // Surface up to 2 open requests immediately
        for (const j of open.slice(0, MAX_VISIBLE_INCOMING)) {
          offerJob(j);
        }
        // Rest go through offerJob queue path on next polls via knownIds
        for (const j of open.slice(MAX_VISIBLE_INCOMING)) {
          offerJob(j);
        }
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

      // Keep visible cards in lockstep with server pairing_deadline
      setVisibleJobs((prev) => {
        let changed = false;
        const next = prev.map((cur) => {
          if (!openIds.has(cur.id)) return cur;
          const fresh = open.find((j) => j.id === cur.id);
          if (!fresh) return cur;
          // Only ADOPT a non-null deadline change. Never let a stale poll
          // result (fetched before the surface arm, or a server that just
          // re-dispatched) overwrite an already-armed deadline with null —
          // that flip would hide+reshow the 66s line (the "bounce").
          const freshDeadlineHasValue = Boolean(fresh.pairingDeadline);
          const deadlineChanged =
            freshDeadlineHasValue &&
            fresh.pairingDeadline !== cur.pairingDeadline;
          const restChanged =
            fresh.status !== cur.status ||
            fresh.pairingStage !== cur.pairingStage;
          if (deadlineChanged || restChanged) {
            changed = true;
            return {
              ...cur,
              ...fresh,
              pairingDeadline:
                fresh.pairingDeadline || cur.pairingDeadline || null,
              photos: cur.photos?.length ? cur.photos : fresh.photos,
              voiceNote: cur.voiceNote || fresh.voiceNote,
              motoristPhoto: cur.motoristPhoto || fresh.motoristPhoto,
            };
          }
          return cur;
        });
        // Drop cards no longer this pro's live request (after grace)
        const kept = next.filter(
          (j) => keepIds.has(j.id) && !dropIds.has(j.id)
        );
        if (kept.length !== prev.length) changed = true;
        if (changed) {
          visibleJobsRef.current = kept;
          return kept;
        }
        return prev;
      });

      // Drop queue items no longer open
      setQueue((prev) => {
        const next = prev.filter((j) => openIds.has(j.id));
        queueRef.current = next;
        return next;
      });

      // If all visible slots emptied (reassigned), promote from queue
      const still = visibleJobsRef.current.filter((j) => openIds.has(j.id));
      if (still.length < MAX_VISIBLE_INCOMING) {
        for (const j of queueRef.current.slice()) {
          if (visibleJobsRef.current.length >= MAX_VISIBLE_INCOMING) break;
          if (openIds.has(j.id)) offerJob(j);
        }
      }
    };

    let polling = false;
    let pending = false;
    let tick = 0;
    /** Ultra-light close check: one tiny query for the visible card ids. Detects
     *  a customer cancellation/close within ~1s even when the realtime push is
     *  missed — no list payload, no media, no expiry work. */
    const statusCheck = async () => {
      const visible = visibleJobsRef.current;
      if (visible.length === 0) return;
      const res = await apiProIncomingStatus(visible.map((j) => j.id));
      if (cancelled || !res.ok) return;
      const byId = new Map(res.data.jobs.map((j) => [j.id, j]));
      for (const cur of visible.slice()) {
        const s = byId.get(cur.id);
        if (!s) continue;
        const movedOn =
          (Boolean(s.repairProId) && s.repairProId !== backendUserId) ||
          false;
        if (!isProRequestCardKeepable(s.status, s.pairingStage) || movedOn) {
          notifyRequestClosed(cur.id, {
            job: cur,
            status: s.status,
            movedOn,
          });
          removeRef.current(cur.id);
          continue;
        }
        // Keep the card's countdown in lockstep with the server deadline.
        if (
          s.pairingDeadline &&
          s.pairingDeadline !== cur.pairingDeadline
        ) {
          setVisibleJobs((prev) =>
            prev.map((j) =>
              j.id === s.id ? { ...j, pairingDeadline: s.pairingDeadline } : j
            )
          );
        }
      }
    };
    const poll = async () => {
      // Never lose an update that arrives mid-fetch: if a poll is already in
      // flight, remember the request and re-run right after it settles instead
      // of swallowing it (that was the "close is a few seconds late" bug).
      if (polling) {
        pending = true;
        return;
      }
      polling = true;
      try {
        // While a card is on screen, prefer the per-card status check (tiny).
        // Every few cycles run the full lean list so NEW offers surface and
        // everything reconciles even when realtime is missed.
        const visibleCount = visibleJobsRef.current.length;
        if (visibleCount > 0 && tick < 2) {
          tick++;
          await statusCheck();
        } else {
          tick = 0;
          const res = await apiListJobs(backendUserId, "repair_pro", {
            lean: true,
          });
          if (cancelled || !res.ok) return;
          ingest(res.data.jobs);
        }
      } finally {
        polling = false;
        if (pending && !cancelled) {
          pending = false;
          void poll();
        }
      }
    };

    // A realtime push already contains the row — close a card the instant the
    // server moves it out of an actionable status (customer cancel/complete,
    // pro decline, …). No need to wait for the next poll. Pairing rows keep
    // their stage in pairing_stage/flow_status while the legacy `status`
    // column stays "requested", so keepability checks all three.
    const applyRealtimeClose = (
      payload?: {
        new?: Record<string, unknown>;
        old?: Record<string, unknown>;
      }
    ) => {
      const row = payload?.new ?? payload?.old;
      if (!row || typeof row.id !== "string") return;
      const status = String(row.flow_status ?? row.status ?? "");
      const movedOn =
        typeof row.repair_pro_id === "string" &&
        row.repair_pro_id !== backendUserId;
      const keep = isProRequestCardKeepable(
        status,
        String(row.pairing_stage ?? "")
      );
      if (!keep || movedOn) {
        const known =
          visibleJobsRef.current.find((j) => j.id === row.id) ||
          queueRef.current.find((j) => j.id === row.id) ||
          null;
        notifyRequestClosed(String(row.id), {
          job: known,
          status,
          movedOn,
        });
        removeRef.current(String(row.id));
      }
    };

    void poll();
// A card on screen is time-critical: the customer can close the request at any
// moment, and a missed realtime event (flaky mobile network) must still drop
// the card within ~1s — the server already refuses stale taps, but the card
// shouldn't outlive the request. Idle pros poll less.
      // Local deadline timer + Realtime still wake instantly on new offers.
      // The cadence is decided at FIRE time from what is visible NOW, and the
      // wake points (mount, realtime push) arm the fast 1s interval so a card
      // that just surfaced is not stuck behind the 3s idle timer before its
      // first status check.
      let timer = 0;
      const schedule = (delay?: number) => {
        timer = window.setTimeout(() => {
          if (typeof document !== "undefined" && document.hidden) {
            schedule();
            return;
          }
          void poll();
          schedule();
        }, delay ?? (visibleJobsRef.current.length || queueRef.current.length ? INCOMING_POPUP_STATUS_POLL_MS : 3_000));
      };
      schedule(INCOMING_POPUP_STATUS_POLL_MS);

    const unsub = backendSubscribeJobs(backendUserId, (payload) => {
      applyRealtimeClose(payload);
      if (!cancelled) {
        void poll();
        // A push may have surfaced a card while the timer sat armed at the
        // idle 12s — jump onto the fast 1s cadence so its first status check
        // isn't delayed.
        clearTimeout(timer);
        schedule(INCOMING_POPUP_STATUS_POLL_MS);
      }
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
      surfacedAtRef.current = {};
      missingCountRef.current = {};
      primedForId.current = backendUserId;
      if (!isAuthenticated || accountType !== "professional") {
        fullyHide();
      }
    }
  }, [isAuthenticated, accountType, backendUserId, fullyHide]);

  const showBadge =
    accountType === "professional" &&
    otherCount > MAX_VISIBLE_INCOMING &&
    pathname.startsWith("/jobs/") &&
    visibleJobs.length === 0;

  const panelOpen = visibleJobs.length > 0 && !snoozedJob;

  type PanelLevel = "middle" | "full" | "collapsed";

  // The panel opens at the MIDDLE level on an incoming request and never
  // auto-minimizes. Swipe up / flip → full (all Q&A, 77% of the shell); swipe
  // down steps back one level: full → middle → collapsed (5%-height peek).
  // Tap on the collapsed strip reopens the middle. Jobs still clear instantly
  // on decline / cancel / timer expiry at any level (existing poll + 250ms
  // expiry interval).
  const [level, setLevel] = useState<PanelLevel>("middle");
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragStartRef = useRef<{ y: number; level: PanelLevel } | null>(null);
  const panelHeightRef = useRef(0);
  const panelScrollRef = useRef<HTMLDivElement | null>(null);
  const PEEK_RATIO = 0.05;
  const COLLAPSE_SNAP_PX = 64;
  const FULL_HEIGHT = "min(77%, 760px)";
  const MIDDLE_MAX_H = "max-h-[min(84dvh,760px)]";
  /** Same spring as the customer Home lower panel (bottom-sheet.tsx). */
  const SPRING = "0.48s cubic-bezier(0.32, 0.72, 0, 1)";
  const stepDown = () =>
    setLevel((l) =>
      l === "full" ? "middle" : l === "middle" ? "collapsed" : l
    );

  // Trackpad swipe support, mirroring the customer Home lower panel
  // (bottom-sheet.tsx): a NATIVE non-passive wheel listener (React onWheel is
  // passive, so it cannot preventDefault the browser's own scroll). deltaY < 0
  // is the "swipe down" gesture → step down; deltaY > 0 is "swipe up" → step
  // up. At FULL the card list scrolls; a short cooldown swallows the leftover
  // momentum of the expand gesture so the freshly-expanded content stays at
  // the top (profile picture placeholder first) until the user scrolls.
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const levelRef = useRef<PanelLevel>("middle");
  useEffect(() => {
    levelRef.current = level;
  }, [level]);

  useEffect(() => {
    if (!panelOpen) return;
    const el = dialogRef.current;
    if (!el) return;
    let accum = 0;
    let dir = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let swallowUntil = 0;

    const onWheel = (e: WheelEvent) => {
      const inScrollArea =
        e.target instanceof Element &&
        e.target.closest("[data-panel-scroll]");
      // Leftover expand-momentum over the content must not scroll it — the
      // profile picture stays first until the user deliberately scrolls.
      if (performance.now() < swallowUntil && inScrollArea) {
        e.preventDefault();
        return;
      }
      // Only at FULL does the card list scroll; elsewhere a swipe moves panel.
      if (levelRef.current === "full" && inScrollArea) return;
      const d = e.deltaY < 0 ? -1 : e.deltaY > 0 ? 1 : 0;
      if (d === 0) return;
      if (timer) clearTimeout(timer);
      if (d !== dir) {
        accum = 0;
        dir = d;
      }
      accum += Math.abs(e.deltaY);
      timer = setTimeout(() => {
        accum = 0;
      }, 180);
      if (accum > 24 || Math.abs(e.deltaY) > 18) {
        accum = 0;
        const l = levelRef.current;
        if (d === -1 && l !== "collapsed") {
          e.preventDefault();
          setLevel(l === "full" ? "middle" : "collapsed");
        } else if (d === 1 && l !== "full") {
          e.preventDefault();
          if (l === "collapsed") setLevel("middle");
          else {
            setLevel("full");
            swallowUntil = performance.now() + 400;
          }
        }
      }
    };

    const opts: AddEventListenerOptions = { passive: false };
    el.addEventListener("wheel", onWheel, opts);
    return () => {
      el.removeEventListener("wheel", onWheel);
      if (timer) clearTimeout(timer);
    };
  }, [panelOpen]);

  const peekHeight = Math.max(
    36,
    Math.round((panelHeightRef.current || 0) * PEEK_RATIO)
  );

  const isPanelControl = (el: EventTarget | null) =>
    Boolean(
      el instanceof Element &&
        el.closest(
          "button, a, input, textarea, select, label, [role='slider']"
        )
    );

  const onPanelPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (isPanelControl(e.target)) return;
    // At FULL the card list scrolls instead of dragging the panel; anywhere
    // else (and at middle/collapsed) any touch starts a panel drag.
    if (
      level === "full" &&
      e.target instanceof Element &&
      e.target.closest("[data-panel-scroll]")
    ) {
      return;
    }
    dragStartRef.current = { y: e.clientY, level };
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPanelPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const start = dragStartRef.current;
    if (!start) return;
    const dy = e.clientY - start.y;
    if (start.level === "collapsed") setDragY(Math.min(0, dy));
    else if (start.level === "full") setDragY(Math.max(0, dy));
    else setDragY(dy);
  };

  const onPanelPointerEnd = (e: ReactPointerEvent<HTMLDivElement>) => {
    const start = dragStartRef.current;
    if (!start) return;
    dragStartRef.current = null;
    setDragging(false);
    const dy = e.clientY - start.y;
    if (start.level === "collapsed") {
      if (dy < -COLLAPSE_SNAP_PX) setLevel("middle");
    } else if (start.level === "middle") {
      if (dy < -COLLAPSE_SNAP_PX) setLevel("full");
      else if (dy > COLLAPSE_SNAP_PX) setLevel("collapsed");
    } else if (dy > COLLAPSE_SNAP_PX) {
      setLevel("middle");
    }
    setDragY(0);
  };

  // Must respond via buttons or wait for timer — no outside tap / Escape dismiss
  // Hook is called unconditionally (before the accountType early return) so the
  // hook count never changes on a role switch (React error #310).
  useEffect(() => {
    if (!panelOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [panelOpen]);

  // Every level change resets the card list to the top, so the profile
  // picture placeholder is the first thing visible at full expansion and
  // stays put until the user scrolls.
  useEffect(() => {
    if (panelScrollRef.current) panelScrollRef.current.scrollTop = 0;
  }, [level]);

  // Publish panel visibility so the dashboard can hide its "Incoming
  // requests" list while the lower panel is up.
  useEffect(() => {
    setIncomingPanelOpen(panelOpen);
    return () => setIncomingPanelOpen(false);
  }, [panelOpen]);

  if (accountType !== "professional") return null;

  const solid = isLight ? "#ffffff" : "#1c1c1e";
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

      {/* No dim scrim — panel only. Outside taps do nothing (no dismiss layer). */}

      {/* Lower panel — medium compact, up to 2 cards; buttons stay full-size */}
      {panelOpen && (
        <div
          ref={(el) => {
            dialogRef.current = el;
            if (
              el &&
              level !== "collapsed" &&
              el.clientHeight > panelHeightRef.current
            ) {
              panelHeightRef.current = el.clientHeight;
            }
          }}
          className={cn(
            "pointer-events-auto absolute inset-x-0 bottom-0 z-[180] flex flex-col rounded-t-[1.75rem] shadow-[0_-8px_28px_rgba(0,0,0,0.28)]",
            level === "collapsed"
              ? "cursor-pointer"
              : cn(
                  "px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]",
                  level === "middle" && MIDDLE_MAX_H
                )
          )}
          style={{
            backgroundColor: solid,
            borderTop: `0.5px solid ${hairline}`,
            height:
              level === "collapsed"
                ? peekHeight
                : level === "full"
                  ? FULL_HEIGHT
                  : undefined,
            transform: dragging ? `translateY(${dragY}px)` : undefined,
            transition: dragging
              ? "none"
              : `height ${SPRING}, transform ${SPRING}`,
          }}
          role="dialog"
          aria-modal="true"
          aria-label={
            level === "collapsed"
              ? `${visibleJobs.length} incoming ${
                  visibleJobs.length === 1 ? "request" : "requests"
                }`
              : visibleJobs.length > 1
                ? `${visibleJobs.length} incoming requests`
                : titleFor(visibleJobs[0])
          }
          onClick={(e) => {
            e.stopPropagation();
            if (level === "collapsed") setLevel("middle");
          }}
          onPointerDown={onPanelPointerDown}
          onPointerMove={onPanelPointerMove}
          onPointerUp={onPanelPointerEnd}
          onPointerCancel={onPanelPointerEnd}
        >
          {level === "collapsed" ? (
            <div className="flex h-full min-h-0 items-center justify-center gap-2 px-3">
              <div
                className={cn(
                  "h-1 w-9 shrink-0 rounded-full",
                  isLight ? "bg-black/15" : "bg-white/20"
                )}
              />
              <span className="text-[11px] font-bold" style={{ color: muted }}>
                {visibleJobs.length} incoming{" "}
                {visibleJobs.length === 1 ? "request" : "requests"}
              </span>
              <ChevronUp
                className="h-3.5 w-3.5 shrink-0"
                style={{ color: muted }}
              />
            </div>
          ) : (
            <>
          <div className="flex shrink-0 justify-center pb-1.5 pt-1">
            <button
              type="button"
              aria-label={
                level === "full"
                  ? "Show fewer questions"
                  : "Minimize panel"
              }
              className="flex cursor-grab items-center justify-center border-0 bg-transparent px-8 py-0.5 active:cursor-grabbing"
              onClick={stepDown}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <span
                className={cn(
                  "block h-[5px] w-10 rounded-full",
                  isLight ? "bg-black/25" : "bg-white/35"
                )}
              />
            </button>
          </div>
          {visibleJobs.length > 1 ? (
            <p
              className="mb-1.5 shrink-0 text-center text-[11px] font-bold"
              style={{ color: muted }}
            >
              {visibleJobs.length} requests · respond to each
            </p>
          ) : null}

          <div
            ref={panelScrollRef}
            className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain scrollbar-hide"
            data-panel-scroll
          >
            {visibleJobs.map((job) => {
              const timeLeft =
                timeLeftById[job.id] ?? INCOMING_POPUP_VISIBLE_SEC;
              const pairingCard = isPairingAlert(job);
              const accepting = acceptingId === job.id;
              const strip =
                job.photos?.length > 0 ? job.photos : [];
              return (
                <div
                  key={job.id}
                  className="shrink-0 rounded-xl p-2.5"
                  style={{ border: "none" }}
                >
                  <div className="flex items-center gap-2">
                    {job.motoristPhoto ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img loading="lazy" decoding="async"
                        src={job.motoristPhoto}
                        alt=""
                        className="h-7 w-7 shrink-0 rounded-full object-cover"
                      />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img loading="lazy" decoding="async"
                        src={DEFAULT_VENDOR_PHOTO}
                        alt=""
                        className="h-7 w-7 shrink-0 rounded-full object-cover"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <p
                        className="truncate text-[14px] font-black leading-tight"
                        style={{ color: ink }}
                      >
                        {titleFor(job)}
                      </p>
                      {job.agreedMajor != null ? (
                        <p
                          className="mt-0.5 text-[12px] font-bold"
                          style={{ color: ink }}
                        >
                          {formatMoney(job.agreedMajor, job.currency)}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-2">
                    <JobProblemQA
                      problem={job.problem}
                      isLight={isLight}
                      transparent
                      hideVehicleRow
                      pageSize={level === "full" ? undefined : 2}
                    />
                  </div>
                  {job.voiceNote?.url ? (
                    <div className="mt-2">
                      <VoiceNotePlayer
                        url={job.voiceNote.url}
                        durationSec={job.voiceNote.durationSec}
                        isLight={isLight}
                      />
                    </div>
                  ) : null}
                  {strip.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {strip.slice(0, 4).map((p, i) => (
                        <button
                          key={p.id || `photo-${job.id}-${i}`}
                          type="button"
                          aria-label={p.name || "View job photo"}
                          onClick={() =>
                            setLightbox({
                              photos: strip,
                              index: i,
                            })
                          }
                          className="h-12 w-12 shrink-0 cursor-pointer overflow-hidden rounded-md border-0 p-0"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={p.url}
                            alt={p.name || "Job photo"}
                            className="h-full w-full object-cover"
                            loading="eager"
                            decoding="async"
                          />
                        </button>
                      ))}
                    </div>
                  ) : null}

                  <CalloutFeeOnCard job={job} isLight={isLight} />

                  <div className="mt-2 flex gap-1.5">
                    <button
                      type="button"
                      disabled={!!acceptingId}
                      onClick={() => {
                        const id = job.id;
                        removeJobAndMaybeNext(id, { defer: false });
                        void (async () => {
                          try {
                            if (isPairingAlert(job)) {
                              await apiTransition({
                                jobId: id,
                                event: "DECLINE",
                                actor: "repair_pro",
                                actorId: backendUserId || undefined,
                                reason: "Currently unavailable",
                                idempotencyKey: backendUserId
                                  ? idemFor(job, backendUserId, "DECLINE")
                                  : undefined,
                              });
                            } else {
                              await apiTransition({
                                jobId: id,
                                event: "CANCEL",
                                actor: "repair_pro",
                                actorId: backendUserId || undefined,
                                reason: "pro_declined",
                              });
                            }
                          } catch {
                            /* panel already updated */
                          }
                        })();
                      }}
                      className={cn(
                        "h-11 flex-1 rounded-xl border-0 text-[13px] font-bold",
                        isLight
                          ? "bg-red-500/15 text-red-700"
                          : "bg-red-500/20 text-red-400"
                      )}
                    >
                      Decline
                    </button>
                    <button
                      type="button"
                      disabled={!!acceptingId || !backendUserId}
                      onClick={() => setConfirmFix(job)}
                      className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border-0 bg-[#FF6B35] text-[14px] font-bold text-white"
                    >
                      {accepting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : null}
                      I can fix this
                    </button>
                  </div>

                  {pairingCard && !job.pairingDeadline ? null : (
                    <div
                      className="mt-2 h-1 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10"
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
                            Math.min(
                              100,
                              (timeLeft / INCOMING_POPUP_VISIBLE_SEC) * 100
                            )
                          )}%`,
                        }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {actionError ? (
            <p
              className="mt-2 shrink-0 text-center text-[12px] font-semibold"
              style={{ color: isLight ? "#b91c1c" : "#fca5a5" }}
            >
              {actionError}
            </p>
          ) : null}
            </>
          )}
        </div>
      )}

      {snoozedJob && (
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
              onClick={() => setSnoozedJob(null)}
              className="mt-4 h-11 w-full rounded-xl border-0 bg-[#FF6B35] text-[13px] font-bold text-white"
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {confirmFix && (
        <div
          className="absolute inset-0 z-[190] flex items-end justify-center bg-black/45 p-3 pb-[max(1rem,env(safe-area-inset-bottom))]"
          role="dialog"
          aria-modal
          aria-label="Confirm you can fix this"
        >
          <div
            className={cn(
              "w-full max-w-[360px] rounded-2xl border-0 p-5",
              isLight ? "bg-[#c8c9cd] text-slate-900" : "bg-black text-white"
            )}
          >
            <p className="text-[15px] font-black">Confirm you can fix this</p>
            <p
              className={cn(
                "mt-1.5 text-[13px] font-medium leading-relaxed",
                isLight ? "text-slate-600" : "text-white/60"
              )}
            >
              You&apos;re confirming you can fix this job as a professional{" "}
              {PRO_SERVICE_LABELS[
                confirmFix.serviceType as keyof typeof PRO_SERVICE_LABELS
              ] || "Repair Pro"}
              , and you won&apos;t get call out fee if you don&apos;t.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setConfirmCancelFix(true)}
                className="h-11 rounded-xl border-0 bg-white/10 text-[13px] font-bold text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!!acceptingId}
                onClick={() => {
                  const j = confirmFix;
                  setConfirmFix(null);
                  void handleFixIt(j);
                }}
                className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border-0 bg-[#FF6B35] text-[13px] font-bold text-white"
              >
                {acceptingId === confirmFix.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                I can fix it
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmCancelSheet
        open={confirmCancelFix}
        isLight={isLight}
        title="Decline this job?"
        message="You won't accept this job as a Repair Pro."
        confirmLabel="Yes, decline"
        keepLabel="Keep"
        onClose={() => setConfirmCancelFix(false)}
        onConfirm={() => {
          setConfirmCancelFix(false);
          setConfirmFix(null);
        }}
      />

      {lightbox && (
        <div
          className="absolute inset-0 z-[200] flex items-center justify-center bg-black/90"
          role="dialog"
          aria-modal
          aria-label="Job photo"
          onClick={() => setLightbox(null)}
          onTouchStart={(e) => {
            lightboxTouchX.current = e.touches[0].clientX;
          }}
          onTouchEnd={(e) => {
            const start = lightboxTouchX.current;
            lightboxTouchX.current = null;
            if (start == null) return;
            const dx = e.changedTouches[0].clientX - start;
            if (Math.abs(dx) < 48) return;
            setLightbox((lb) => {
              if (!lb) return lb;
              const dir = dx < 0 ? 1 : -1;
              return {
                ...lb,
                index:
                  (lb.index + dir + lb.photos.length) % lb.photos.length,
              };
            });
          }}
        >
          <button
            type="button"
            aria-label="Close photo"
            onClick={() => setLightbox(null)}
            className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] rounded-full border-0 p-2 text-white"
          >
            <X className="h-6 w-6" />
          </button>
          {lightbox.photos.length > 1 && (
            <>
              <button
                type="button"
                aria-label="Previous photo"
                onClick={(e) => {
                  e.stopPropagation();
                  setLightbox((lb) =>
                    lb
                      ? {
                          ...lb,
                          index:
                            (lb.index - 1 + lb.photos.length) % lb.photos.length,
                        }
                      : lb
                  );
                }}
                className="absolute left-2 z-[201] rounded-full border-0 bg-white/10 p-2 text-white"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button
                type="button"
                aria-label="Next photo"
                onClick={(e) => {
                  e.stopPropagation();
                  setLightbox((lb) =>
                    lb ? { ...lb, index: (lb.index + 1) % lb.photos.length } : lb
                  );
                }}
                className="absolute right-2 z-[201] rounded-full border-0 bg-white/10 p-2 text-white"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            </>
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img loading="lazy" decoding="async"
            src={lightbox.photos[lightbox.index]?.url}
            alt={lightbox.photos[lightbox.index]?.name || "Job photo"}
            className="max-h-[80%] max-w-[90%] rounded-xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <p className="absolute bottom-[max(1.5rem,env(safe-area-inset-bottom))] text-[12px] font-semibold text-white/80">
            {lightbox.index + 1} / {lightbox.photos.length}
          </p>
        </div>
      )}

      {closeBanner && (
        <div
          className="pointer-events-none absolute inset-x-0 top-[max(0.5rem,env(safe-area-inset-top))] z-[190] flex justify-center px-3"
          aria-live="polite"
        >
          <div
            className="pointer-events-auto w-full max-w-[300px] animate-[om-toast-in_0.32s_cubic-bezier(0.2,0.8,0.2,1)] rounded-sm px-3 py-2.5 backdrop-blur-xl"
            style={{
              backgroundColor: isLight
                ? "rgba(255,255,255,0.94)"
                : "rgba(28,28,30,0.94)",
              boxShadow: isLight
                ? "0 8px 28px rgba(0,0,0,0.12)"
                : "0 8px 28px rgba(0,0,0,0.45)",
            }}
          >
            <button
              type="button"
              className="flex w-full items-start gap-2.5 p-0 text-left"
              style={{ background: "transparent" }}
              onClick={() => {
                setCloseBanner(null);
                router.push("/jobs");
              }}
            >
              <div
                className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                style={{
                  backgroundColor: isLight
                    ? "rgba(255,107,53,0.12)"
                    : "rgba(255,107,53,0.18)",
                }}
                aria-hidden
              >
                <Wrench
                  className="h-[18px] w-[18px]"
                  style={{ color: "#FF6B35" }}
                  strokeWidth={2}
                />
              </div>
              <div className="min-w-0 flex-1 pt-0.5">
                <div className="flex items-center gap-1.5">
                  <span
                    className="truncate text-[13px] font-bold leading-tight tracking-[-0.01em]"
                    style={{ color: isLight ? "#0f1419" : "#e7e9ea" }}
                  >
                    Ona
                  </span>
                  <span
                    className="shrink-0 text-[11px] font-medium"
                    style={{ color: isLight ? "#536471" : "#71767b" }}
                  >
                    · now
                  </span>
                  {closeBanner.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img loading="lazy" decoding="async"
                      src={closeBanner.avatarUrl}
                      alt=""
                      className="ml-auto h-5 w-5 shrink-0 rounded-full object-cover"
                    />
                  ) : null}
                </div>
                <p
                  className="mt-0.5 text-[13px] font-semibold leading-snug tracking-[-0.01em]"
                  style={{ color: isLight ? "#0f1419" : "#e7e9ea" }}
                >
                  {closeBanner.title}
                </p>
                <p
                  className="mt-0.5 line-clamp-2 text-[12px] font-normal leading-snug"
                  style={{ color: isLight ? "#536471" : "#71767b" }}
                >
                  {closeBanner.body}
                </p>
              </div>
            </button>
            <button
              type="button"
              aria-label="Dismiss"
              className="absolute right-2 top-2 rounded-full p-1"
              style={{ color: isLight ? "#536471" : "#71767b" }}
              onClick={(e) => {
                e.stopPropagation();
                setCloseBanner(null);
              }}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
