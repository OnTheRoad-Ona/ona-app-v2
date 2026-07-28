"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type TouchEvent as ReactTouchEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  Navigation,
  ShieldAlert,
  Star,
} from "lucide-react";
import { useInAppCall } from "@/components/call/in-app-call";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CountdownTimer } from "@/components/jobs/countdown-timer";
import { LiveJobTrackMap } from "@/components/jobs/live-job-track-map";
import {
  CopperButton,
  GhostButton,
  JobCard,
  JobShell,
  StageButton,
} from "@/components/jobs/job-shell";
import { VoiceNotePlayer } from "@/components/jobs/voice-note-player";
import { ExpiredDialog } from "@/components/ui/expired-dialog";
import {
  CONVERSATION_ENDED_MESSAGE,
  JOB_CLOSED_MESSAGE,
  isJobEndedStatus,
  isJobHistoryOnlyStatus,
} from "@/lib/chat-expired";
import {
  apiAcceptOffer,
  apiGetJob,
  apiOpenAppeal,
  apiOpenDispute,
  apiPlaceOffer,
  apiPushTripLocation,
  apiRateJob,
  apiTransition,
  getCurrentPosition,
  processPendingOffers,
} from "@/lib/jobs/client";
import { isAutomotiveTrade } from "@/lib/artisan/catalog";
import { SwipeToRelease } from "@/components/jobs/motorist-release-pay-gate";
import {
  canOpenDisputeNow,
  COMPLETED_AUTO_RELEASE_WINDOW_MS,
  DISPUTE_REASONS,
  isNegotiationTimerArmed,
  isPayoutPendingSettlement,
  MAX_OFFER_DIGITS,
  MIN_OFFER_AMOUNT_MAJOR,
  paymentEndsAtIso,
  PRO_TRIP_STATUS_COPY,
  satisfiedReleaseEndsAtIso,
  TRIP_STATUS_COPY,
} from "@/lib/jobs/constants";
import { negotiationUiStatus } from "@/lib/jobs/state-machine";
import type { DisputeReason, JobRecord } from "@/lib/jobs/types";
import { avatarInitials, DEFAULT_VENDOR_PHOTO } from "@/lib/brand";
import { tradeIconDataUrl } from "@/lib/map-trade-icons";
import {
  buildCustomerChargeMajor,
  formatMoney,
  fromMinorUnits,
  LABOUR_SPLIT_LINE_PRO,
} from "@/lib/pricing";
import { PRO_SERVICE_LABELS } from "@/lib/services";
import { useApp } from "@/lib/store";
import type { ServiceRequest } from "@/lib/types";
import { cn, firstNameOnly } from "@/lib/utils";

/** Prefer newer job snapshots so stale polls never undo Start trip etc. */
function isJobNewer(next: JobRecord, prev: JobRecord | null): boolean {
  if (!prev) return true;
  if (next.id !== prev.id) return true;
  const nt = Date.parse(next.updatedAt || "") || 0;
  const pt = Date.parse(prev.updatedAt || "") || 0;
  if (nt !== pt) return nt >= pt;
  // Same timestamp: allow forward status progression only
  const order = [
    "negotiating",
    "agreed",
    "paid_booked",
    "en_route",
    "arrived",
    "in_progress",
    "completed",
    "satisfied",
    "released",
    "disputed",
    "under_appeal",
    "cancelled",
    "expired",
    "refunded",
  ];
  return order.indexOf(next.status) >= order.indexOf(prev.status);
}

export function JobFlowScreen({
  jobId,
  isLight,
  viewer,
  actorId,
  email,
}: {
  jobId: string;
  isLight: boolean;
  viewer: "motorist" | "repair_pro";
  actorId: string;
  email?: string;
}) {
  const router = useRouter();
  const { startCall } = useInAppCall();
  const {
    technicians,
    ensureChatForRequestAsync,
    visibleMessageThreads,
    userProfile,
  } = useApp();
  const [job, setJob] = useState<JobRecord | null>(null);
  const jobRef = useRef<JobRecord | null>(null);
  const [err, setErr] = useState<string | null>(null);
  /** Release/payout errors must survive job polls (load() used to wipe setErr). */
  const [stickyReleaseErr, setStickyReleaseErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [offerInput, setOfferInput] = useState("");
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [disputeReason, setDisputeReason] =
    useState<DisputeReason>("work_incomplete");
  const [disputeDesc, setDisputeDesc] = useState("");
  /** 0 = blank until customer taps a star */
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [reviewLeft, setReviewLeft] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [locHint, setLocHint] = useState<string | null>(null);
  /** Ended-chat gate: OK stay / View read-only */
  const [chatGateOpen, setChatGateOpen] = useState(false);
  const [chatGateViewHref, setChatGateViewHref] = useState<string | null>(
    null
  );
  /** Repair Pro must confirm they can fix the job before negotiating */
  const [proCanFixAccepted, setProCanFixAccepted] = useState(false);
  /** Arrived / Work in progress: home-style swipe sheet */
  const [tripSheetExpanded, setTripSheetExpanded] = useState(false);
  const tripGestureY = useRef<number | null>(null);
  /** Pay screen: single Cancel → choose payment vs request */
  const [payCancelOpen, setPayCancelOpen] = useState(false);

  /** Open (or create) cloud job chat so both parties share one conversation */
  const openJobChat = useCallback(
    async (j: JobRecord) => {
      if (isJobEndedStatus(j.status)) {
        const { readOnlyChatHref } = await import("@/lib/chat-expired");
        const existing = visibleMessageThreads.find(
          (t) =>
            (t.requestId === j.id && !t.id.startsWith("chat-")) ||
            t.id === `chat-${j.id}`
        );
        // Message on ended job → conversation copy; still gated
        setChatGateViewHref(
          existing && !existing.id.startsWith("chat-")
            ? readOnlyChatHref(existing.id)
            : `/requests/${j.id}`
        );
        setChatGateOpen(true);
        return;
      }
      const existing = visibleMessageThreads.find(
        (t) =>
          (t.requestId === j.id && !t.id.startsWith("chat-")) ||
          t.id === `chat-${j.id}`
      );
      if (existing && !existing.id.startsWith("chat-")) {
        router.push(`/messages/${existing.id}`);
        return;
      }
      const req: ServiceRequest = {
        id: j.id,
        technicianId: j.repairProId,
        technicianName: j.repairProName,
        motoristId: j.motoristId,
        serviceType: j.serviceType,
        problem: j.problem,
        status: "accepted",
        createdAt: j.createdAt,
        etaMinutes: j.etaMinutes ?? 0,
        distanceKm: j.distanceKm ?? 0,
        locationLabel: j.locationLabel,
      };
      setFlash("Opening chat…");
      try {
        const threadId = await ensureChatForRequestAsync(req);
        setFlash(null);
        router.push(`/messages/${threadId}`);
      } catch {
        setFlash("Could not open chat. Try again.");
        window.setTimeout(() => setFlash(null), 3000);
      }
    },
    [ensureChatForRequestAsync, router, visibleMessageThreads]
  );

  const startJobCall = useCallback(
    (j: JobRecord) => {
      if (viewer === "motorist") {
        const tech =
          technicians.find((t) => t.id === j.repairProId) ||
          technicians.find(
            (t) =>
              t.name === j.repairProName && t.serviceType === j.serviceType
          );
        const phone = (j.repairProPhone || tech?.phone || "").trim();
        const peerId = j.repairProId;
        if (!phone && !peerId) {
          setFlash("Cannot call — no in-app peer or phone. Use Message.");
          window.setTimeout(() => setFlash(null), 3500);
          return;
        }
        // Prefer in-app WebRTC when peer id known; phone is fallback
        startCall({
          name: j.repairProName,
          phone,
          photo: j.repairProPhoto || tech?.photo,
          roleLabel: PRO_SERVICE_LABELS[j.serviceType] || "Repair Pro",
          userId: peerId || undefined,
          jobId: j.id,
        });
        return;
      }
      const phone = (j.motoristPhone || "").trim();
      const peerId = j.motoristId;
      if (!phone && !peerId) {
        setFlash("Cannot call — no in-app peer or phone. Use Message.");
        window.setTimeout(() => setFlash(null), 3500);
        return;
      }
      startCall({
        name: j.motoristName,
        phone,
        photo: j.motoristPhoto || undefined,
        roleLabel: "Customer",
        userId: peerId || undefined,
        jobId: j.id,
      });
    },
    [startCall, technicians, viewer]
  );

  useEffect(() => {
    try {
      if (
        typeof window !== "undefined" &&
        sessionStorage.getItem(`om-can-fix-${jobId}`) === "1"
      ) {
        setProCanFixAccepted(true);
      }
    } catch {
      /* */
    }
  }, [jobId]);

  const REVIEW_MAX = 144;

  const commitJob = useCallback((next: JobRecord, force = false) => {
    setJob((prev) => {
      if (!force && prev && !isJobNewer(next, prev)) return prev;
      jobRef.current = next;
      return next;
    });
  }, []);

  const load = useCallback(async () => {
    const res = await apiGetJob(jobId);
    if (!res.ok) {
      // Don't overwrite a sticky release error with a generic load failure
      setErr((prev) => stickyReleaseErr || prev || res.message);
      return;
    }
    commitJob(res.data.job);
    // Never clear stickyReleaseErr here — only dismiss / successful release
    setErr((prev) => (stickyReleaseErr ? stickyReleaseErr : null));
    // If payout already done, drop sticky error
    if (
      res.data.job.releasedAt ||
      res.data.job.escrowStatus === "released" ||
      res.data.job.status === "released"
    ) {
      setStickyReleaseErr(null);
    }
  }, [jobId, commitJob, stickyReleaseErr]);

  // Replay any offers that failed due to network (offline queue)
  useEffect(() => {
    void processPendingOffers();
  }, []);

  // Client backup: sweep overdue jobs + retry PENDING_SETTLEMENT payouts while open
  useEffect(() => {
    let cancelled = false;
    const pendingPayout =
      job?.status === "satisfied" ||
      job?.escrowStatus === "pending_settlement" ||
      job?.escrowStatus === "release_pending";
    const sweep = async () => {
      try {
        const { apiExpireStaleBookedJobs } = await import("@/lib/jobs/client");
        if (cancelled) return;
        await apiExpireStaleBookedJobs();
        if (!cancelled) await load();
      } catch {
        /* ignore */
      }
    };
    void sweep();
    // Faster poll while payout is stuck processing (funds may already be Available)
    const intervalMs = pendingPayout ? 20_000 : 120_000;
    const t = window.setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      void sweep();
    }, intervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [
    load,
    job?.status,
    job?.escrowStatus,
  ]);

  // When job flips to completed for customer, force satisfaction UI + notify
  const prevStatusRef = useRef<string | null>(null);
  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = job?.status || null;
    if (!job || job.status !== "completed") return;
    const isCustomer =
      (Boolean(actorId) && job.motoristId === actorId) ||
      viewer === "motorist";
    if (!isCustomer) return;
    // Always re-assert path so dual-role / deep links land on release screen
    if (typeof window !== "undefined") {
      const path = `/jobs/${job.id}`;
      if (!window.location.pathname.includes(path)) {
        router.replace(path);
      }
    }
    if (prev && prev !== "completed") {
      try {
        // Short in-app flash only (2s) — not sticky
        setFlash("Job complete — release payment");
        window.setTimeout(() => setFlash(null), 2000);
        void import("@/lib/app-notify").then(({ showAppNotification }) => {
          showAppNotification({
            title: "Confirm & release pay",
            body: "Job complete — tap I am Satisfied to release payment.",
            tag: `job-complete-${job.id}`,
            href: `/jobs/${job.id}`,
            requireInteraction: false,
          });
        });
        void import("@/lib/sound-tone").then(({ playAppSound }) => {
          playAppSound("success_soft");
        });
      } catch {
        /* */
      }
    }
  }, [job?.status, job?.id, job?.motoristId, viewer, actorId, router]);

  // Poll job state; faster while trip active / awaiting satisfaction
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      await load();
    };
    void tick();
    // Real-time feel: negotiate/agreed fast; trip moderate; completed fast for customer
    const ms =
      job?.status === "negotiating" || job?.status === "agreed"
        ? 2_500
        : job?.status === "completed"
          ? 2_000
          : ["paid_booked", "en_route", "arrived", "in_progress"].includes(
                job?.status || ""
              )
            ? 5_000
            : job?.status === "released" || job?.status === "satisfied"
              ? 12_000
              : 20_000;
    const id = window.setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      void tick();
    }, ms);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [load, job?.status]);

  /** My jobs list — stay on open negotiation without cancelling */
  const goJobsList = useCallback(() => {
    router.push("/jobs");
  }, [router]);

  /** After success: motorist home, pro dashboard */
  const goHome = useCallback(() => {
    router.push(viewer === "repair_pro" ? "/dashboard" : "/");
  }, [router, viewer]);

  // Live GPS only after Start trip (map is shown). Ready-to-go has no map.
  useEffect(() => {
    if (!job) return;
    const tracking = ["en_route", "arrived", "in_progress"].includes(
      job.status
    );
    if (!tracking || !navigator.geolocation) return;

    let cancelled = false;

    // DATA: no watchPosition stream + no Google matrix per ping.
    // One interval every 30s is enough for map movement on mobile.
    let lastPushAt = 0;
    let inflight = false;
    const PUSH_MIN_MS = 28_000;

    const push = async (lat: number, lng: number) => {
      if (cancelled || inflight) return;
      const now = Date.now();
      if (now - lastPushAt < PUSH_MIN_MS) return;
      lastPushAt = now;
      inflight = true;
      try {
        const res = await apiPushTripLocation({
          jobId: job.id,
          lat,
          lng,
          actor: viewer,
          actorId,
        });
        if (!cancelled && res.ok) {
          // Merge slim location payload into current job (API no longer returns full job)
          const patch = res.data.job as Partial<JobRecord>;
          setJob((prev) => {
            if (!prev || prev.id !== job.id) return prev;
            const next = {
              ...prev,
              ...patch,
              // Keep rich fields that slim response omits
              offers: prev.offers,
              photos: prev.photos,
              voiceNote: prev.voiceNote,
              problem: prev.problem,
              motoristName: prev.motoristName,
              repairProName: prev.repairProName,
              statusHistory: prev.statusHistory,
            } as JobRecord;
            jobRef.current = next;
            return next;
          });
          setLocHint(null);
        }
      } catch {
        /* network blip */
      } finally {
        inflight = false;
      }
    };

    const sample = () => {
      if (document.hidden) return;
      void getCurrentPosition({
        enableHighAccuracy: false,
        maximumAge: 25_000,
        timeout: 6000,
      })
        .then((p) => push(p.coords.latitude, p.coords.longitude))
        .catch(() => undefined);
    };

    sample();
    const poll = window.setInterval(sample, 45_000);

    setLocHint(null);

    return () => {
      cancelled = true;
      window.clearInterval(poll);
    };
  }, [viewer, job?.id, job?.status, actorId]);

  const ink = isLight ? "text-slate-900" : "text-white";
  /** Readable secondary text — avoid pale gray on stage */
  const muted = isLight ? "text-slate-700" : "text-white/75";

  const negStatus = useMemo(() => {
    if (!job) return "waiting";
    const last = job.offers[job.offers.length - 1];
    return negotiationUiStatus({
      status: job.status,
      offerCount: job.offers.length,
      lastSide: last?.side,
      negotiateEndsAt: job.negotiateEndsAt,
    });
  }, [job]);

  const applyJob = (j: JobRecord) => {
    commitJob(j, true);
    setFlash(null);
  };

  const run = async (fn: () => Promise<{ ok: true; data: { job: JobRecord } } | { ok: false; message: string }>) => {
    setBusy(true);
    setErr(null);
    const prevStatus = jobRef.current?.status;
    try {
      const res = await fn();
      if (!res.ok) {
        setErr(res.message);
        try {
          const { playAppSound } = await import("@/lib/sound-tone");
          playAppSound("error");
        } catch {
          /* */
        }
        return;
      }
      applyJob(res.data.job);
      const next = res.data.job.status;
      try {
        const { playAppSound } = await import("@/lib/sound-tone");
        if (next !== prevStatus) {
          if (next === "agreed") playAppSound("request_accepted");
          else if (next === "paid_booked") playAppSound("payment_success");
          else if (next === "en_route") playAppSound("trip_started");
          else if (next === "arrived") playAppSound("arrived");
          else if (next === "completed" || next === "satisfied")
            playAppSound("job_complete");
          else if (next === "released") playAppSound("job_complete");
          else playAppSound("success_soft");
        } else if (prevStatus === "negotiating") {
          // Offer placed without status change
          playAppSound("offer_sent");
        }
      } catch {
        /* audio optional */
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong. Try again.");
      try {
        const { playAppSound } = await import("@/lib/sound-tone");
        playAppSound("error");
      } catch {
        /* */
      }
    } finally {
      // Never leave the UI stuck on “Updating…”
      setBusy(false);
    }
  };

  if (!job) {
    return (
      <JobShell
        isLight={isLight}
        title="Loading job…"
        compactHeader
        onBack={goJobsList}
      >
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-[#FF6B35]" />
        </div>
        {err && (
          <p className="text-center text-[13px] font-semibold text-red-500">
            {err}
          </p>
        )}
      </JobShell>
    );
  }

  /* Truly finished jobs only → history. Keep completed/satisfied on live shell
   * so customer can tap I’M SATISFIED and release pay. */
  if (isJobHistoryOnlyStatus(job.status)) {
    if (typeof window !== "undefined") {
      const path = window.location.pathname || "";
      if (path.startsWith("/jobs/")) {
        router.replace(`/requests/${job.id}`);
        return (
          <JobShell
            isLight={isLight}
            title="Job closed"
            compactHeader
            onBack={goJobsList}
          >
            <p className={cn("px-0.5 pt-4 text-[14px] font-medium", ink)}>
              {JOB_CLOSED_MESSAGE}
            </p>
            <p className={cn("mt-2 text-[12px]", muted)}>Opening summary…</p>
          </JobShell>
        );
      }
    }
  }

  /* ─── EXPIRED — pure history, no action buttons ─── */
  if (job.status === "expired" || negStatus === "expired") {
    const isPro = viewer === "repair_pro";

    return (
      <JobShell
        isLight={isLight}
        title="Negotiation expired"
        compactHeader
        onBack={isPro ? () => router.push("/dashboard") : goJobsList}
      >
        <p className={cn("px-0.5 pt-4 text-[14px] font-medium leading-relaxed", ink)}>
          {isPro
            ? `This request ended between you and ${job.motoristName}. No agreement was reached.`
            : `No agreement was reached with ${job.repairProName}.`}
        </p>
      </JobShell>
    );
  }

  /* ─── NEGOTIATING / NEW REQUEST ─── */
  if (job.status === "negotiating") {
    const last = job.offers[job.offers.length - 1];
    const mySide = viewer === "motorist" ? "motorist" : "repair_pro";
    const canOffer =
      job.offers.length < job.maxOffers &&
      (job.offers.length > 0 || mySide === "repair_pro");
    const canAccept = Boolean(last && last.side !== mySide);
    const theirOffer =
      last && last.side !== mySide
        ? last
        : [...job.offers].reverse().find((o) => o.side !== mySide);

    // D2: first time pro opens this request — confirm they can fix it
    const needsProCanFixGate =
      viewer === "repair_pro" &&
      !proCanFixAccepted &&
      job.offers.length === 0;

    if (needsProCanFixGate) {
      return (
        <JobShell
          isLight={isLight}
          title="Can you fix this?"
          compactHeader
          onBack={goJobsList}
          footer={
            <div className="space-y-2">
              <CopperButton
                disabled={busy}
                onClick={() => {
                  void run(async () => {
                    const res = await apiTransition({
                      jobId: job.id,
                      event: "START_NEGOTIATION",
                      actor: "repair_pro",
                      actorId,
                    });
                    if (res.ok) {
                      setProCanFixAccepted(true);
                      try {
                        sessionStorage.setItem(`om-can-fix-${job.id}`, "1");
                      } catch {
                        /* */
                      }
                    }
                    return res;
                  });
                }}
              >
                I can fix this
              </CopperButton>
              <button
                type="button"
                className={cn(
                  "inline-flex h-12 w-full items-center justify-center rounded-md border-0 bg-[#2c2c2e] text-[14px] font-semibold text-white"
                )}
                onClick={() =>
                  void run(() =>
                    apiTransition({
                      jobId: job.id,
                      event: "CANCEL",
                      actor: "repair_pro",
                      actorId,
                    })
                  )
                }
              >
                Cancel · I cannot fix this
              </button>
            </div>
          }
        >
          <div className="space-y-4 px-0.5 pt-2">
            <p className={cn("text-[15px] font-semibold leading-snug", ink)}>
              Service Request — {isAutomotiveTrade(job.serviceType) ? "vehicle & issues only" : "issues only"}
            </p>
            <div className="space-y-3">
              {isAutomotiveTrade(job.serviceType) ? (
                <div>
                  <p className={cn("text-[11px] font-medium uppercase", muted)}>
                    Vehicle
                  </p>
                  <p className={cn("mt-1 text-[14px] font-semibold", ink)}>
                    {job.motoristVehicle?.trim() || "Vehicle details on request"}
                  </p>
                </div>
              ) : null}
              <div>
                <p className={cn("text-[11px] font-medium uppercase", muted)}>
                  Common issues
                </p>
                <p className={cn("mt-1 text-[14px] font-medium leading-relaxed", ink)}>
                  {job.problem}
                </p>
              </div>
              <div>
                <p className={cn("text-[11px] font-medium uppercase", muted)}>
                  Your matching skill
                </p>
                <p className={cn("mt-1 text-[14px] font-semibold", ink)}>
                  {PRO_SERVICE_LABELS[job.serviceType] || job.serviceType}
                </p>
              </div>
              {job.voiceNote?.url && (
                <div className="mt-1">
                  <VoiceNotePlayer
                    url={job.voiceNote.url}
                    durationSec={job.voiceNote.durationSec}
                    isLight={isLight}
                    label="Problem voice note"
                  />
                </div>
              )}
            </div>
            <p className={cn("text-[13px] font-medium leading-relaxed", muted)}>
              By tapping{" "}
              <span className="font-semibold text-[#FF6B35]">I can fix this</span>
              , you confirm you can complete this job.
            </p>
            {err && (
              <p className="text-center text-[12px] font-semibold text-red-500">
                {err}
              </p>
            )}
          </div>
        </JobShell>
      );
    }

    return (
      <JobShell
        isLight={isLight}
        title={viewer === "repair_pro" ? "Service Request" : "Negotiate labour"}
        compactHeader
        onBack={goJobsList}
        footer={
          <div className="space-y-1.5">
            {canAccept && last && (
              <CopperButton
                disabled={busy}
                onClick={() =>
                  void run(() =>
                    apiAcceptOffer({
                      jobId: job.id,
                      side: mySide,
                      actorId,
                    })
                  )
                }
              >
                Accept {formatMoney(last.amountMajor, job.currency)}
              </CopperButton>
            )}
            {canOffer && (
              <div className="space-y-1">
                <div className="flex gap-1.5">
                  <input
                    inputMode="numeric"
                    pattern="[1-9][0-9]*"
                    maxLength={MAX_OFFER_DIGITS}
                    value={offerInput}
                    onChange={(e) => {
                      const raw = e.target.value
                        .replace(/\D/g, "")
                        .slice(0, MAX_OFFER_DIGITS);
                      if (raw === "") {
                        setOfferInput("");
                        return;
                      }
                      if (/^0+$/.test(raw)) {
                        setOfferInput("");
                        return;
                      }
                      setOfferInput(raw.replace(/^0+/, "") || raw);
                    }}
                    placeholder={
                      mySide === "repair_pro"
                        ? `Labour price (min ₦${MIN_OFFER_AMOUNT_MAJOR})`
                        : "Counter (max 50% off)"
                    }
                    className={cn(
                      "h-11 flex-1 rounded-md border-0 bg-transparent px-3 text-[14px] font-medium outline-none ring-1",
                      isLight
                        ? "text-slate-900 ring-black/20 placeholder:text-slate-500 focus:ring-[#FF6B35]/55"
                        : "text-white ring-white/25 placeholder:text-white/40 focus:ring-[#FF6B35]/55"
                    )}
                    aria-label="Labour price offer"
                  />
                  <button
                    type="button"
                    disabled={
                      busy ||
                      !offerInput ||
                      Number(offerInput.replace(/\D/g, "")) <
                        MIN_OFFER_AMOUNT_MAJOR
                    }
                    onClick={() =>
                      void run(async () => {
                        const amount = Number(offerInput.replace(/\D/g, ""));
                        if (
                          !Number.isFinite(amount) ||
                          amount < MIN_OFFER_AMOUNT_MAJOR
                        ) {
                          const msg = `Minimum service charge is ₦${MIN_OFFER_AMOUNT_MAJOR.toLocaleString("en-NG")}.`;
                          setErr(msg);
                          return {
                            ok: false as const,
                            message: msg,
                          };
                        }
                        const res = await apiPlaceOffer({
                          jobId: job.id,
                          side: mySide,
                          actorId,
                          amountMajor: amount,
                        });
                        if (res.ok) setOfferInput("");
                        return res;
                      })
                    }
                    className="h-11 shrink-0 rounded-md border-0 bg-[#FF6B35] px-4 text-[13px] font-semibold text-white disabled:opacity-40"
                  >
                    Send
                  </button>
                </div>
              </div>
            )}
            <button
              type="button"
              className={cn(
                "inline-flex h-11 w-full items-center justify-center rounded-md border-0 bg-transparent text-[13px] font-medium",
                ink
              )}
              onClick={() =>
                void run(() =>
                  apiTransition({
                    jobId: job.id,
                    event: "CANCEL",
                    actor: viewer,
                    actorId,
                  })
                )
              }
            >
              Cancel request
            </button>
          </div>
        }
      >
        {/* Top: vehicle/service/problem + offers · Middle: ring timer */}
        <div className="flex min-h-0 flex-col bg-transparent px-0.5 pt-1">
          <div className="shrink-0 space-y-4 bg-transparent">
            {viewer === "repair_pro" ? (
              <div className="space-y-3 bg-transparent">
                {/* Pro request: vehicle details + matching skills only — no customer PII */}
                {isAutomotiveTrade(job.serviceType) ? (
                  <div>
                    <p
                      className={cn(
                        "text-[11px] font-semibold uppercase tracking-wide",
                        muted
                      )}
                    >
                      Vehicle
                    </p>
                    <p className={cn("mt-1 text-[15px] font-semibold", ink)}>
                      {job.motoristVehicle?.trim() || "Vehicle details on request"}
                    </p>
                  </div>
                ) : null}
                <div>
                  <p
                    className={cn(
                      "text-[11px] font-semibold uppercase tracking-wide",
                      muted
                    )}
                  >
                    Common issues
                  </p>
                  <p
                    className={cn(
                      "mt-1 text-[15px] font-medium leading-relaxed",
                      ink
                    )}
                  >
                    {job.problem}
                  </p>
                </div>
                <div>
                  <p
                    className={cn(
                      "text-[11px] font-semibold uppercase tracking-wide",
                      muted
                    )}
                  >
                    Your matching skill
                  </p>
                  <p className={cn("mt-1 text-[15px] font-semibold", ink)}>
                    {PRO_SERVICE_LABELS[job.serviceType] || job.serviceType}
                  </p>
                </div>
                {job.voiceNote?.url && (
                  <div className="mt-1">
                    <VoiceNotePlayer
                      url={job.voiceNote.url}
                      durationSec={job.voiceNote.durationSec}
                      isLight={isLight}
                      label="Customer voice note"
                    />
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-transparent">
                <p
                  className={cn(
                    "text-[11px] font-semibold uppercase tracking-wide",
                    muted
                  )}
                >
                  I ADMIT TO FIX IT
                </p>
                <p
                  className={cn(
                    "mt-1 text-[15px] font-medium leading-relaxed",
                    ink
                  )}
                >
                  {job.problem}
                </p>
                {job.voiceNote?.url && (
                  <div className="mt-2.5">
                    <VoiceNotePlayer
                      url={job.voiceNote.url}
                      durationSec={job.voiceNote.durationSec}
                      isLight={isLight}
                      label="Your voice note"
                    />
                  </div>
                )}
              </div>
            )}

            {theirOffer && (
              <div className="bg-transparent">
                <p className={cn("text-[11px] font-semibold uppercase tracking-wide", muted)}>
                  {theirOffer.side === "repair_pro"
                    ? "Repair Pro offered"
                    : "Customer offered"}
                </p>
                <p className={cn("mt-0.5 text-[22px] font-semibold tabular-nums", ink)}>
                  {formatMoney(theirOffer.amountMajor, job.currency)}
                </p>
                <p className={cn("mt-0.5 text-[12px] font-medium", muted)}>
                  Labour only. Spare parts not included.
                </p>
              </div>
            )}

            {job.offers.length > 0 ? (
              <div className="bg-transparent">
                <p className={cn("mb-1.5 text-[11px] font-semibold uppercase tracking-wide", muted)}>
                  Offer history
                </p>
                <ul className="space-y-2">
                  {job.offers.map((o) => (
                    <li
                      key={o.id}
                      className="flex items-center justify-between gap-3 bg-transparent py-0.5"
                    >
                      <span className={cn("text-[12px] font-medium", muted)}>
                        #{o.offerIndex}{" "}
                        {o.side === "repair_pro" ? "Repair Pro" : "Customer"}
                      </span>
                      <span
                        className={cn(
                          "text-[15px] font-semibold tabular-nums",
                          ink
                        )}
                      >
                        {formatMoney(o.amountMajor, o.currency)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          {/* Ring mid-page — only after pro armed the negotiate clock */}
          <div className="flex min-h-[42vh] flex-1 flex-col items-center justify-center bg-transparent py-5">
            {isNegotiationTimerArmed(job) ? (
              <CountdownTimer
                variant="ring"
                endsAt={job.negotiateEndsAt}
                onExpire={() => {
                  void run(() =>
                    apiTransition({
                      jobId: job.id,
                      event: "EXPIRE_NEGOTIATION",
                      actor: "system",
                    })
                  );
                }}
                className={ink}
              />
            ) : (
              <p className={cn("text-center text-[13px] font-semibold", muted)}>
                {viewer === "repair_pro"
                  ? "Accept the request to start the 20‑min negotiate timer"
                  : "Waiting for Repair Pro to accept this request…"}
              </p>
            )}

          </div>
        </div>
        {err && (
          <p className="mt-1 text-center text-[12px] font-medium text-red-500">
            {err}
          </p>
        )}
      </JobShell>
    );
  }

  /* ─── AGREED ─── */
  if (job.status === "agreed") {
    const counterpartName =
      viewer === "motorist"
        ? job.repairProName
        : firstNameOnly(job.motoristName);
    const counterpartPhoto =
      viewer === "motorist"
        ? job.repairProPhoto || DEFAULT_VENDOR_PHOTO
        : DEFAULT_VENDOR_PHOTO;
    const counterpartLabel =
      viewer === "motorist"
        ? PRO_SERVICE_LABELS[job.serviceType]
        : "Customer";
    const payEndsAt = paymentEndsAtIso(job);

    return (
      <JobShell
        isLight={isLight}
        title="Price agreed"
        compactHeader
        onBack={goJobsList}
        footer={
          viewer === "motorist" ? (
            <div className="flex w-full flex-col gap-2">
              {err && (
                <p className="text-center text-[12px] font-semibold text-red-500">
                  {err}
                </p>
              )}
              <StageButton
                isLight={isLight}
                disabled={busy}
                onClick={() => {
                  router.push(
                    `/payments/checkout?jobId=${encodeURIComponent(job.id)}`
                  );
                }}
              >
                {job.paymentSessionEndsAt
                  ? "Continue payment"
                  : "Pay now to book"}
              </StageButton>
              <button
                type="button"
                disabled={busy}
                onClick={() => setPayCancelOpen(true)}
                className={cn(
                  "inline-flex h-11 w-full items-center justify-center rounded-md border-0 text-[13px] font-semibold",
                  isLight
                    ? "bg-black/10 text-slate-900"
                    : "bg-[#2c2c2e] text-white"
                )}
              >
                Cancel
              </button>
            </div>
          ) : (
            <p
              className={cn(
                "text-center text-[13px] font-semibold",
                isLight ? "text-slate-700" : "text-[#c8c9cd]"
              )}
            >
              Waiting for customer to pay into escrow…
            </p>
          )
        }
      >
        <div className="mb-3 flex flex-col items-center py-3 text-center">
          <p className={cn("text-[26px] font-black tracking-tight", ink)}>
            {job.agreedMajor != null
              ? formatMoney(
                  viewer === "motorist"
                    ? buildCustomerChargeMajor(job.agreedMajor).totalMajor
                    : job.agreedMajor,
                  job.currency
                )
              : "—"}
          </p>
          {viewer === "repair_pro" ? (
            <p className={cn("mt-1 text-[12px] font-medium", muted)}>
              {LABOUR_SPLIT_LINE_PRO}
            </p>
          ) : job.agreedMajor != null ? (
            <p className={cn("mt-1 text-[12px] font-medium", muted)}>
              Service charge · pay exact amount
            </p>
          ) : null}
          {/*
            20-min pay timer lives only on checkout after Flutterwave opens.
            Pros never see a pay countdown — only “waiting for customer”.
          */}
          {viewer === "motorist" && payEndsAt ? (
            <p className={cn("mt-3 text-center text-[12px] font-semibold", muted)}>
              Complete payment within 20 minutes in the checkout screen
            </p>
          ) : viewer === "repair_pro" ? (
            <p className={cn("mt-3 text-center text-[12px] font-semibold", muted)}>
              Waiting for customer to pay into escrow
            </p>
          ) : null}
        </div>
        {viewer === "motorist" ? (
          <JobCard isLight={isLight}>
            <div className="flex items-center gap-3">
              <Avatar className="h-12 w-12 rounded-full">
                <AvatarImage
                  src={counterpartPhoto}
                  className="object-cover"
                />
                <AvatarFallback>
                  {avatarInitials(counterpartName)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className={cn("truncate text-[15px] font-black", ink)}>
                  {counterpartName}
                </p>
                <p className={cn("text-[12px] font-semibold", muted)}>
                  {counterpartLabel}
                </p>
              </div>
            </div>
          </JobCard>
        ) : (
          <JobCard isLight={isLight}>
            <div className="space-y-2">
              {isAutomotiveTrade(job.serviceType) && job.motoristVehicle ? (
                <p className={cn("text-[14px] font-semibold", ink)}>
                  <span className={cn("text-[11px] uppercase", muted)}>
                    Vehicle ·{" "}
                  </span>
                  {job.motoristVehicle}
                </p>
              ) : null}
              <p className={cn("text-[14px] font-semibold", ink)}>
                <span className={cn("text-[11px] uppercase", muted)}>
                  Matching skill ·{" "}
                </span>
                {PRO_SERVICE_LABELS[job.serviceType] || job.serviceType}
              </p>
              <p className={cn("text-[14px] font-medium", ink)}>
                <span className={cn("text-[11px] uppercase", muted)}>
                  Common issues ·{" "}
                </span>
                {job.problem}
              </p>
            </div>
          </JobCard>
        )}
        {err && (
          <p className="mt-3 text-center text-[12px] font-semibold text-red-500">
            {err}
          </p>
        )}
        {payCancelOpen ? (
          <div className="fixed inset-0 z-[500] flex items-end justify-center bg-black/50 p-3">
            <div
              className={cn(
                "w-full max-w-md overflow-hidden rounded-2xl shadow-2xl",
                isLight ? "bg-white" : "bg-[#1c1c1e]"
              )}
              role="dialog"
              aria-label="Cancel options"
            >
              <div className="px-4 pb-2 pt-4">
                <p
                  className={cn(
                    "text-center text-[15px] font-black",
                    isLight ? "text-slate-900" : "text-white"
                  )}
                >
                  Cancel
                </p>
                <p
                  className={cn(
                    "mt-1 text-center text-[12px] font-medium",
                    isLight ? "text-slate-500" : "text-white/55"
                  )}
                >
                  Choose what you want to cancel
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPayCancelOpen(false);
                  goJobsList();
                }}
                className={cn(
                  "flex h-12 w-full items-center justify-center border-0 text-[14px] font-bold",
                  isLight ? "text-slate-900" : "text-white"
                )}
              >
                Cancel payment
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setPayCancelOpen(false);
                  void run(() =>
                    apiTransition({
                      jobId: job.id,
                      event: "CANCEL",
                      actor: "motorist",
                      actorId,
                    })
                  );
                }}
                className={cn(
                  "flex h-12 w-full items-center justify-center border-0 text-[14px] font-bold text-red-500"
                )}
              >
                Cancel request
              </button>
              <button
                type="button"
                onClick={() => setPayCancelOpen(false)}
                className={cn(
                  "flex h-11 w-full items-center justify-center border-0 text-[13px] font-semibold",
                  isLight ? "text-slate-500" : "text-white/50"
                )}
              >
                Keep paying
              </button>
            </div>
          </div>
        ) : null}
      </JobShell>
    );
  }

  /* ─── TRACKING / ACTIVE ─── */
  if (
    ["paid_booked", "en_route", "arrived", "in_progress"].includes(job.status)
  ) {
    const copySource =
      viewer === "repair_pro" ? PRO_TRIP_STATUS_COPY : TRIP_STATUS_COPY;
    const copy = copySource[job.status] ||
      TRIP_STATUS_COPY[job.status] || {
        title: "Booked",
        subtitle: "",
      };
    const statusLabel: Record<string, string> = {
      paid_booked: "Booked",
      // Exact product label — do not uppercase in CSS (would become ONTHEROAD)
      en_route: "OnTheRoad",
      arrived: "Arrived",
      in_progress: "Working",
    };
    const proActions: {
      when: string[];
      event: "START_TRIP" | "MARK_ARRIVED" | "START_WORK" | "MARK_COMPLETED";
      label: string;
    }[] = [
      { when: ["paid_booked"], event: "START_TRIP", label: "Start trip" },
      { when: ["en_route"], event: "MARK_ARRIVED", label: "I’ve arrived" },
      { when: ["arrived"], event: "START_WORK", label: "Start work" },
      {
        when: ["in_progress", "arrived"],
        event: "MARK_COMPLETED",
        label: "Mark job complete",
      },
    ];
    // Prefer earliest unfinished step (Start trip → … → Mark complete)
    const nextPro = proActions.find((a) => a.when.includes(job.status));

    const proAdvance = async (
      event: "START_TRIP" | "MARK_ARRIVED" | "START_WORK" | "MARK_COMPLETED"
    ) => {
      setBusy(true);
      setErr(null);
      // GPS preferred for live map, but never block the status change
      let proLat: number | undefined;
      let proLng: number | undefined;
      try {
        try {
          const pos = await getCurrentPosition({
            enableHighAccuracy: true,
            timeout: 5000,
            maximumAge: 20000,
          });
          proLat = pos.coords.latitude;
          proLng = pos.coords.longitude;
        } catch {
          if (job.proLocation) {
            proLat = job.proLocation.lat;
            proLng = job.proLocation.lng;
          } else if (job.motoristLocation) {
            // Start near motorist pin so map still has a pro marker
            proLat = job.motoristLocation.lat + 0.004;
            proLng = job.motoristLocation.lng + 0.004;
          }
          if (event === "START_TRIP" || event === "MARK_ARRIVED") {
            setLocHint(
              "Location is limited. Trip continues. Enable GPS for live ETA"
            );
          }
        }

        const res = await apiTransition({
          jobId: job.id,
          event,
          actor: "repair_pro",
          actorId,
          proLat,
          proLng,
        });
        if (!res.ok) {
          setErr(res.message || "Could not update trip status. Try again.");
          return;
        }
        // Force apply — never let a stale poll undo the advance
        commitJob(res.data.job, true);
        setFlash(
          event === "START_TRIP"
            ? "Trip started you’re on the road"
            : event === "MARK_ARRIVED"
              ? "Marked arrived"
              : event === "START_WORK"
                ? "Work started"
                : "Job marked complete"
        );
        window.setTimeout(() => setFlash(null), 3500);
      } catch (e) {
        setErr(
          e instanceof Error ? e.message : "Could not update trip. Try again."
        );
      } finally {
        setBusy(false);
      }
    };

    // Ready to go (paid_booked): no map.
    // En route / arrived / WIP: map + solid lower panel (details never float on map).
    // Map-only chrome: grey Time · Distance · Escrow Held bar.
    const showMap = job.status !== "paid_booked";
    const isReadyToGo = job.status === "paid_booked";
    const isSwipeTrip =
      job.status === "en_route" ||
      job.status === "arrived" ||
      job.status === "in_progress";
    const isPostArrival =
      job.status === "arrived" || job.status === "in_progress";

    // Status / skill / name / ₦ — solid lower panel only (never map overlay).
    // en_route uses mixed-case "OnTheRoad" — no CSS uppercase.
    const statusChip = (
      <span
        className={cn(
          "rounded px-1.5 py-0.5 text-[9px] font-black text-white",
          job.status === "en_route"
            ? "tracking-normal"
            : "uppercase tracking-wide",
          job.status === "paid_booked"
            ? "bg-emerald-600"
            : job.status === "en_route" || job.status === "in_progress"
              ? "bg-[#FF6B35]"
              : isLight
                ? "bg-slate-800"
                : "bg-[#3a3a3c]"
        )}
      >
        {job.status === "paid_booked"
          ? "Booked"
          : statusLabel[job.status] || job.status}
      </span>
    );

    const skillChip = (
      <span
        className={cn(
          "rounded px-1.5 py-0.5 text-[9px] font-bold",
          isLight
            ? "bg-[#a8a9ae] text-slate-900"
            : "bg-[#2c2c2e] text-white"
        )}
      >
        {PRO_SERVICE_LABELS[job.serviceType] || job.serviceType}
      </span>
    );

    // Pro: vehicle details (not customer name). Customer: pro name.
    const vehicleLabel = (job.motoristVehicle || "").trim();

    // Lower-panel meta row only (map keeps ETA + ESCROW Held exclusively)
    // Customer: skill (Mechanic) + pro name only — no BOOKED chip
    // Pro: status + skill + vehicle card
    const tripMetaHeader = (
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {viewer === "repair_pro" ? statusChip : null}
          {skillChip}
          {viewer === "motorist" ? (
            <p
              className={cn(
                "min-w-0 flex-1 truncate text-[16px] font-black",
                ink
              )}
            >
              {job.repairProName}
            </p>
          ) : null}
          {job.agreedMajor != null && (
            <p
              className={cn(
                "ml-auto shrink-0 text-[15px] font-black tabular-nums",
                isLight ? "text-black" : "text-white"
              )}
            >
              {formatMoney(job.agreedMajor, job.currency)}
            </p>
          )}
        </div>
        {viewer === "repair_pro" && isAutomotiveTrade(job.serviceType) ? (
          <div
            className={cn(
              "rounded-xl px-3 py-2.5",
              isLight ? "bg-black/[0.05]" : "bg-white/[0.06]"
            )}
          >
            <p
              className={cn(
                "text-[10px] font-bold uppercase tracking-[0.08em]",
                muted
              )}
            >
              Vehicle
            </p>
            <p
              className={cn(
                "mt-0.5 text-[15px] font-black leading-snug tracking-tight",
                ink
              )}
            >
              {vehicleLabel || "Vehicle details not set"}
            </p>
          </div>
        ) : null}
      </div>
    );

    const tripDetails = (
      <>
        {job.problem?.trim() && (
          <div>
            <p
              className={cn(
                "text-[10px] font-bold uppercase tracking-wide",
                muted
              )}
            >
              I ADMIT TO FIX IT
            </p>
            <p
              className={cn(
                "mt-1 text-[14px] font-semibold leading-snug break-words",
                ink
              )}
            >
              {job.problem}
            </p>
          </div>
        )}

        {/*
          Address + “live on map” block:
          — Hidden for customer (motorist) entirely
          — Pro still sees navigate cue while en route (not after arrival)
        */}
        {viewer === "repair_pro" && !isReadyToGo && !isPostArrival && (
          <div className="flex items-start gap-2">
            <Navigation className="mt-0.5 h-4 w-4 shrink-0 text-[#FF6B35]" />
            <div className="min-w-0">
              <p className={cn("text-[13px] font-semibold break-words", ink)}>
                {job.locationLabel || "Location on map"}
              </p>
              <p className={cn("mt-0.5 text-[11px] font-medium", muted)}>
                Navigate to pin
              </p>
            </div>
          </div>
        )}

        {/* Customer: keep only the lower status line (from TRIP_STATUS_COPY) */}
        {!isSwipeTrip && copy.subtitle && viewer === "motorist" ? (
          <p className={cn("text-[12px] font-medium leading-snug", muted)}>
            {copy.subtitle}
          </p>
        ) : null}
      </>
    );

    const chatClosedForever = isJobEndedStatus(job.status);

    /**
     * Icon-only Call / Message — elite Swiss-minimal line marks.
     * Flat solid buttons, no labels / glow / gradient / shadow on icons.
     */
    const callMessageRow = (
      <div
        className={cn(
          "grid grid-cols-2 gap-2.5",
          isSwipeTrip ? "mt-8 pt-2" : "pt-1"
        )}
      >
        <button
          type="button"
          onClick={() => startJobCall(job)}
          aria-label="Call"
          className="inline-flex h-12 w-full items-center justify-center rounded-lg border-0 bg-[#E8E8E8] shadow-none"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-[22px] w-[22px]"
            fill="none"
            aria-hidden
          >
            {/* Classic phone handset — instantly readable call mark */}
            <path
              d="M8.05 3.5c.4-.4 1-.5 1.5-.3l2.2 1c.5.2.8.7.7 1.2l-.4 2.1c-.1.4-.3.7-.7.9l-1.3.6c1.2 2.4 3.1 4.3 5.5 5.5l.6-1.3c.2-.4.5-.6.9-.7l2.1-.4c.5-.1 1 .2 1.2.7l1 2.2c.2.5.1 1.1-.3 1.5l-1.2 1.2c-.5.5-1.2.7-1.9.6-4.8-.7-8.8-4.7-9.5-9.5-.1-.7.1-1.4.6-1.9L8.05 3.5Z"
              stroke="#111111"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
            {/* Gold accent — short detail on earpiece */}
            <path
              d="M9.4 5.6l1.4.6"
              stroke="#FF6B35"
              strokeWidth="1.45"
              strokeLinecap="round"
            />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => void openJobChat(job)}
          aria-label={chatClosedForever ? "View chat" : "Message"}
          className={cn(
            "inline-flex h-12 w-full items-center justify-center rounded-lg border-0 shadow-none",
            chatClosedForever ? "bg-[#3a3a3c]" : "bg-[#FF6B35]"
          )}
        >
          <svg
            viewBox="0 0 24 24"
            className="h-[22px] w-[22px]"
            fill="none"
            aria-hidden
          >
            {/* Speech bubble + elegant tail */}
            <path
              d="M5.5 5.8A1.8 1.8 0 0 1 7.3 4h9.4a1.8 1.8 0 0 1 1.8 1.8v7.2a1.8 1.8 0 0 1-1.8 1.8h-4.1L8.2 18.2v-3.4H7.3a1.8 1.8 0 0 1-1.8-1.8V5.8Z"
              stroke="#111111"
              strokeWidth="1.55"
              strokeLinejoin="round"
            />
            {/* Text lines — two black, one gold accent */}
            <path
              d="M8.4 7.6h7.2"
              stroke="#111111"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
            <path
              d="M8.4 10h5.6"
              stroke="#FF6B35"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
            <path
              d="M8.4 12.4h4"
              stroke="#111111"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
    );

    const footerBlock = (
      <div className="relative space-y-2">
        <ExpiredDialog
          open={chatGateOpen}
          isLight={isLight}
          message={CONVERSATION_ENDED_MESSAGE}
          onClose={() => {
            setChatGateOpen(false);
            setChatGateViewHref(null);
          }}
        />
        {flash && (
          <p className="text-center text-[12px] font-bold text-[#FF6B35]">
            {flash}
          </p>
        )}
        {locHint && showMap && (
          <p
            className={cn(
              "rounded-md px-3 py-2 text-center text-[12px] font-bold",
              isLight ? "bg-slate-900 text-white" : "bg-[#2c2c2e] text-white"
            )}
          >
            {locHint}
          </p>
        )}
        {err && (
          <p className="text-center text-[12px] font-semibold text-red-500">
            {err}
          </p>
        )}
        {viewer === "repair_pro" && nextPro && (
          <>
            {isLight ? (
              <CopperButton
                disabled={busy}
                onClick={() => void proAdvance(nextPro.event)}
              >
                {busy ? "Updating job…" : nextPro.label}
              </CopperButton>
            ) : (
              <StageButton
                isLight={isLight}
                disabled={busy}
                onClick={() => void proAdvance(nextPro.event)}
              >
                {busy ? "Updating job…" : nextPro.label}
              </StageButton>
            )}
          </>
        )}
        {viewer === "motorist" && job.status === "en_route" && (
          <p
            className={cn(
              "text-center text-[12px] font-semibold",
              isLight ? "text-slate-700" : "text-[#c8c9cd]"
            )}
          >
            Repair Pro is OnTheRoad
            {job.etaMinutes != null ? ` · ETA ${job.etaMinutes} min` : ""}
          </p>
        )}
        {viewer === "motorist" && job.status === "paid_booked" && (
          <button
            type="button"
            onClick={() =>
              void run(() =>
                apiTransition({
                  jobId: job.id,
                  event: "CANCEL",
                  actor: "motorist",
                  actorId,
                })
              )
            }
            className="inline-flex h-12 w-full items-center justify-center rounded-sm border-0 bg-[#3a3a3c] text-[14px] font-bold text-white transition active:scale-[0.99]"
          >
            Cancel full refund
          </button>
        )}
        {viewer === "motorist" &&
          (job.status === "en_route" ||
            job.status === "arrived" ||
            job.status === "in_progress") && (
            <button
              type="button"
              onClick={() =>
                void run(() =>
                  apiTransition({
                    jobId: job.id,
                    event: "CANCEL",
                    actor: "motorist",
                    actorId,
                  })
                )
              }
              className="inline-flex h-12 w-full items-center justify-center rounded-sm border-0 bg-[#3a3a3c] text-[14px] font-bold text-white transition active:scale-[0.99]"
            >
              Cancel full refund
            </button>
          )}
        <button
          type="button"
          onClick={() => setDisputeOpen(true)}
          className="w-full text-center text-[12px] font-bold text-red-500"
        >
          Open dispute
        </button>
      </div>
    );

    const disputeNode = disputeOpen ? (
      <DisputeSheet
        isLight={isLight}
        reason={disputeReason}
        setReason={setDisputeReason}
        desc={disputeDesc}
        setDesc={setDisputeDesc}
        busy={busy}
        onClose={() => setDisputeOpen(false)}
        onSubmit={() =>
          void run(async () => {
            const res = await apiOpenDispute({
              jobId: job.id,
              by: viewer,
              reason: disputeReason,
              description: disputeDesc,
            });
            if (res.ok) setDisputeOpen(false);
            return res;
          })
        }
      />
    ) : null;

    /* ── Arrived / Work in progress: map + swipeable lower panel ── */
    if (isSwipeTrip) {
      const onPillTouchStart = (e: ReactTouchEvent) => {
        tripGestureY.current = e.touches[0].clientY;
      };
      const onPillTouchMove = (e: ReactTouchEvent) => {
        if (tripGestureY.current == null) return;
        const dy = e.touches[0].clientY - tripGestureY.current;
        if (!tripSheetExpanded && dy < -14) {
          setTripSheetExpanded(true);
          tripGestureY.current = null;
          return;
        }
        if (tripSheetExpanded && dy > 14) {
          setTripSheetExpanded(false);
          tripGestureY.current = null;
        }
      };
      const onPillClick = () => setTripSheetExpanded((v) => !v);
      const onSheetWheel = (e: ReactWheelEvent) => {
        if (e.deltaY > 0 && !tripSheetExpanded) {
          e.preventDefault();
          setTripSheetExpanded(true);
          return;
        }
        if (e.deltaY < 0 && tripSheetExpanded) {
          e.preventDefault();
          setTripSheetExpanded(false);
        }
      };

      return (
        <JobShell
          isLight={isLight}
          title={copy.title}
          subtitle={undefined}
          compactHeader
          onBack={goJobsList}
          fullBleed
          fillBody
          footer={footerBlock}
        >
          <div className="relative flex min-h-0 flex-1 flex-col">
            {/* Map — collapses when sheet expands (home pattern) */}
            <div
              className={cn(
                "om-sheet-spring relative min-h-0 overflow-hidden",
                tripSheetExpanded
                  ? "h-0 flex-[0_0_0%] opacity-0 pointer-events-none"
                  : "flex-[0_0_42%] opacity-100"
              )}
            >
              <div className="absolute inset-0">
                <LiveJobTrackMap job={job} isLight={isLight} viewer={viewer} />
              </div>
            </div>

            {/* Lower swipe sheet */}
            <div
              className={cn(
                "om-sheet-spring z-30 flex min-h-0 flex-col overflow-hidden",
                tripSheetExpanded ? "flex-1" : "flex-[0_0_58%]",
                isLight ? "bg-[#c8c9cd]" : "bg-black",
                !tripSheetExpanded &&
                  "rounded-t-sm shadow-[0_-6px_24px_rgba(0,0,0,0.18)]"
              )}
              style={{ touchAction: "pan-y" }}
              onWheel={onSheetWheel}
            >
              {/* Expand pill */}
              <div className="shrink-0">
                <div
                  role="button"
                  tabIndex={0}
                  aria-label={
                    tripSheetExpanded
                      ? "Swipe down to show map"
                      : "Swipe up to expand details"
                  }
                  onClick={onPillClick}
                  onTouchStart={onPillTouchStart}
                  onTouchMove={onPillTouchMove}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onPillClick();
                    }
                    if (e.key === "ArrowUp") {
                      e.preventDefault();
                      setTripSheetExpanded(true);
                    }
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      setTripSheetExpanded(false);
                    }
                  }}
                  className="flex cursor-grab justify-center pb-1.5 pt-2.5 active:cursor-grabbing"
                  style={{ touchAction: "pan-y" }}
                >
                  <span
                    className={cn(
                      "h-1.5 w-11 rounded-full border-0",
                      isLight ? "bg-[#6b7280]" : "bg-white/40"
                    )}
                  />
                </div>
              </div>

              <div
                className={cn(
                  "flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-3 pb-3 scrollbar-hide",
                  isLight ? "bg-[#c8c9cd]" : "bg-black"
                )}
              >
                {/* Meta (OnTheRoad · skill · name · ₦) lives only in this solid sheet */}
                <div className="space-y-3 pt-0.5">
                  {tripMetaHeader}
                  {tripDetails}
                </div>
                {/* Push Call / Message / swipe hint lower on the sheet */}
                <div className="mt-auto space-y-2 pt-10">
                  {callMessageRow}
                  {!tripSheetExpanded && (
                    <p
                      className={cn(
                        "pb-1 pt-2 text-center text-[10px] font-semibold",
                        muted
                      )}
                    >
                      Swipe up to expand — swipe down to collapse
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
          {disputeNode}
        </JobShell>
      );
    }

    /* ── Ready to go only (no map) — details stay on solid stage panel ── */
    return (
      <JobShell
        isLight={isLight}
        title={
          viewer === "motorist"
            ? PRO_SERVICE_LABELS[job.serviceType] || "Booked"
            : copy.title
        }
        compactHeader
        onBack={goJobsList}
        footer={footerBlock}
      >
        <div className="space-y-4 px-0 pb-2 pt-1">
          {tripMetaHeader}
          {tripDetails}
          {callMessageRow}
        </div>
        {disputeNode}
      </JobShell>
    );
  }

  /* ─── COMPLETED → customer must confirm to release pay ─── */
  if (job.status === "completed") {
    // Prefer job membership over “Use as” role (dual-account devices).
    // Motorist on the job ALWAYS gets I’m Satisfied — never hide behind role.
    const isMotoristOnJob =
      Boolean(actorId) && Boolean(job.motoristId) && job.motoristId === actorId;
    const isProOnlyOnJob =
      Boolean(actorId) &&
      Boolean(job.repairProId) &&
      job.repairProId === actorId &&
      !isMotoristOnJob;
    // Only treat as done when money actually released (not a false satisfiedAt stamp)
    const payoutDone =
      Boolean(job.releasedAt) || job.escrowStatus === "released";
    const showSatisfiedCta =
      !payoutDone &&
      (isMotoristOnJob || viewer === "motorist" || !isProOnlyOnJob);

    const motoristActor =
      (job.motoristId && job.motoristId.length > 10
        ? job.motoristId
        : null) ||
      (actorId && actorId.length > 10 ? actorId : null) ||
      "";

    const onSatisfied = () => {
      if (!motoristActor) {
        const msg =
          "Sign in as the customer who booked this job to release payment.";
        setErr(msg);
        setStickyReleaseErr(msg);
        return;
      }
      setBusy(true);
      setErr(null);
      // Keep previous sticky until we know result
      void (async () => {
        try {
          const res = await apiTransition({
            jobId: job.id,
            event: "SATISFIED",
            actor: "motorist",
            actorId: motoristActor,
          });
          try {
            const again = await apiGetJob(job.id);
            if (again.ok && again.data.job) commitJob(again.data.job, true);
          } catch {
            /* */
          }
          if (!res.ok) {
            const msg =
              res.message ||
              "Could not release payment. Funds stay held. Fix bank details or contact support.";
            setErr(msg);
            setStickyReleaseErr(msg);
            try {
              const { playAppSound } = await import("@/lib/sound-tone");
              playAppSound("error");
            } catch {
              /* */
            }
            return;
          }
          setStickyReleaseErr(null);
          setErr(null);
          applyJob(res.data.job);
          try {
            const { playAppSound } = await import("@/lib/sound-tone");
            playAppSound(
              isPayoutPendingSettlement(res.data.job)
                ? "success_soft"
                : "job_complete"
            );
          } catch {
            /* */
          }
          // Customer → dashboard immediately after confirm
          window.setTimeout(() => {
            router.replace("/dashboard");
          }, 600);
        } catch (e) {
          const msg =
            e instanceof Error
              ? e.message
              : "Release failed. Funds stay in escrow.";
          setErr(msg);
          setStickyReleaseErr(msg);
        } finally {
          setBusy(false);
        }
      })();
    };

    const releaseBanner = stickyReleaseErr || err;
    const copyReleaseErr = () => {
      if (!releaseBanner) return;
      void navigator.clipboard.writeText(releaseBanner).catch(() => null);
    };
    const dismissReleaseErr = () => {
      setErr(null);
      setStickyReleaseErr(null);
    };
    // Only show optional egress help when FLW message is clearly IP-related
    const showEgressHint =
      Boolean(releaseBanner) &&
      /ip whitelist|ip whitelisting|whitelist.*ip|ip policy/i.test(
        releaseBanner || ""
      );

    const autoReleaseEndsAt = satisfiedReleaseEndsAtIso(job);

    // Pro 87.5% · Ona 5% · VAT 7.5% (VAT stays on FLW)
    const releaseTotalMajor =
      job.agreedMajor != null && job.agreedMajor > 0
        ? job.agreedMajor
        : job.amountMinor != null && job.amountMinor > 0
          ? fromMinorUnits(job.amountMinor, job.currency)
          : null;
    const releaseSplit =
      releaseTotalMajor != null
        ? buildCustomerChargeMajor(releaseTotalMajor)
        : null;
    const releaseProMajor =
      releaseSplit != null
        ? releaseSplit.proPayoutMajor
        : job.proPayoutMinor != null
          ? fromMinorUnits(job.proPayoutMinor, job.currency)
          : null;
    const releasePlatformMajor =
      releaseSplit != null
        ? releaseSplit.platformFeeMajor
        : job.platformFeeMinor != null
          ? fromMinorUnits(job.platformFeeMinor, job.currency)
          : null;
    const releaseVatMajor = releaseSplit != null ? releaseSplit.vatMajor : null;

    const completedDisputeSheet = disputeOpen ? (
      <DisputeSheet
        isLight={isLight}
        reason={disputeReason}
        setReason={setDisputeReason}
        desc={disputeDesc}
        setDesc={setDisputeDesc}
        busy={busy}
        onClose={() => setDisputeOpen(false)}
        onSubmit={() =>
          void run(async () => {
            const res = await apiOpenDispute({
              jobId: job.id,
              by: "motorist",
              reason: disputeReason,
              description: disputeDesc,
            });
            if (res.ok) setDisputeOpen(false);
            return res;
          })
        }
      />
    ) : null;

    return (
      <JobShell
        isLight={isLight}
        title={
          showSatisfiedCta
            ? "Release payment"
            : payoutDone
              ? "Paid"
              : "Completed"
        }
        compactHeader
        onBack={goJobsList}
        footer={
          showSatisfiedCta ? (
            <div className="flex w-full flex-col gap-2">
              {releaseBanner ? (
                <div
                  className="z-20 max-h-48 overflow-y-auto rounded-lg border border-red-500/40 bg-red-50 px-3 py-2.5 text-left dark:bg-red-950/40"
                  role="alert"
                >
                  <p className="text-[12px] font-semibold leading-snug text-red-700 dark:text-red-300">
                    {releaseBanner}
                  </p>
                  {showEgressHint ? (
                    <p className="mt-2 text-[11px] font-medium leading-snug text-red-800/90 dark:text-red-200/90">
                      Optional: if Flutterwave IP Whitelisting is ON, check{" "}
                      <a
                        href="/api/payments/egress-ip"
                        target="_blank"
                        rel="noreferrer"
                        className="font-bold underline"
                      >
                        /api/payments/egress-ip
                      </a>
                      {" "}or turn IP Whitelisting OFF. Prefer{" "}
                      <code className="text-[10px]">FLUTTERWAVE_TRANSFER_PROXY_URL</code>{" "}
                      for a fixed payout IP.
                    </p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={copyReleaseErr}
                      className="rounded-md border-0 bg-red-600/15 px-2.5 py-1 text-[11px] font-bold text-red-700"
                    >
                      Copy
                    </button>
                    <button
                      type="button"
                      onClick={dismissReleaseErr}
                      className="rounded-md border-0 bg-black/5 px-2.5 py-1 text-[11px] font-bold text-red-800"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              ) : null}
              <SwipeToRelease
                onRelease={onSatisfied}
                busy={busy || !motoristActor}
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => setDisputeOpen(true)}
                className="w-full text-center text-[12px] font-bold text-red-500"
              >
                Open a dispute
              </button>
              <p className={cn("text-center text-[11px] font-medium", muted)}>
                Cannot close this job · auto-releases after 6 hours if no dispute
              </p>
            </div>
          ) : payoutDone ? (
            <p className={cn("text-center text-[13px] font-semibold", muted)}>
              Released
            </p>
          ) : (
            <p className={cn("text-center text-[13px] font-semibold", muted)}>
              Waiting for customer…
            </p>
          )
        }
      >
        <JobCard isLight={isLight} className="text-center">
          <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-500" />
          <p className={cn("mt-3 text-[18px] font-black", ink)}>
            {showSatisfiedCta
              ? "Release payment"
              : payoutDone
                ? "Released"
                : "Work complete"}
          </p>
          {!showSatisfiedCta ? (
            <p className={cn("mt-1 text-[13px] leading-snug", muted)}>
              {payoutDone ? "Payment released" : "Awaiting customer confirm"}
            </p>
          ) : null}
          {releaseTotalMajor != null && (
            <p className={cn("mt-4 text-[24px] font-black tabular-nums", ink)}>
              {formatMoney(releaseTotalMajor, job.currency)}
            </p>
          )}
          {/* Split breakdown — Repair Pro only (customers never see 95/5) */}
          {viewer === "repair_pro" &&
          releaseProMajor != null &&
          releasePlatformMajor != null ? (
            <div
              className={cn(
                "mx-auto mt-3 w-full max-w-[280px] space-y-1.5 rounded-xl px-3 py-2.5 text-left text-[12px] font-semibold",
                isLight ? "bg-black/5" : "bg-white/8"
              )}
            >
              <p className={cn("text-center text-[11px] font-bold uppercase tracking-wide", muted)}>
                Split on release
              </p>
              <div className="flex items-center justify-between gap-2">
                <span className={muted}>You receive (87.5%)</span>
                <span className={cn("tabular-nums font-black", ink)}>
                  {formatMoney(releaseProMajor, job.currency)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className={muted}>Ona platform (5%)</span>
                <span className={cn("tabular-nums font-black", ink)}>
                  {formatMoney(releasePlatformMajor, job.currency)}
                </span>
              </div>
              {releaseVatMajor != null ? (
                <div className="flex items-center justify-between gap-2">
                  <span className={muted}>VAT held on FLW (7.5%)</span>
                  <span className={cn("tabular-nums font-black", ink)}>
                    {formatMoney(releaseVatMajor, job.currency)}
                  </span>
                </div>
              ) : null}
              <p className={cn("pt-0.5 text-center text-[10px] font-medium", muted)}>
                Paid to your bank · Ona 5% settles to platform · VAT stays on Flutterwave
              </p>
            </div>
          ) : null}
          {showSatisfiedCta && autoReleaseEndsAt ? (
            <div className="mt-4 px-1">
              <p className="mb-1 text-center text-[11px] font-semibold text-[#FF6B35]">
                Auto-release in
              </p>
              <CountdownTimer
                endsAt={autoReleaseEndsAt}
                totalMs={COMPLETED_AUTO_RELEASE_WINDOW_MS}
                className={ink}
              />
            </div>
          ) : null}
          {releaseBanner && showSatisfiedCta ? (
            <div
              className="mt-3 max-h-40 overflow-y-auto rounded-lg border border-red-500/30 bg-red-50 px-3 py-2 text-left dark:bg-red-950/30"
              role="alert"
            >
              <p className="text-[12px] font-semibold leading-snug text-red-600 dark:text-red-300">
                {releaseBanner}
              </p>
              <div className="mt-1.5 flex gap-3">
                <button
                  type="button"
                  onClick={copyReleaseErr}
                  className="text-[11px] font-bold text-red-700 underline"
                >
                  Copy error
                </button>
                <button
                  type="button"
                  onClick={dismissReleaseErr}
                  className="text-[11px] font-bold text-red-700 underline"
                >
                  Dismiss
                </button>
              </div>
            </div>
          ) : null}
        </JobCard>
        {completedDisputeSheet}
      </JobShell>
    );
  }

  /* ─── PENDING SETTLEMENT (customer confirmed, payout auto-retrying) ─── */
  if (isPayoutPendingSettlement(job) && job.status !== "released") {
    return (
      <JobShell
        isLight={isLight}
        title="Payout processing"
        compactHeader
        onBack={() =>
          router.replace(
            viewer === "repair_pro" ? "/payments/history" : "/dashboard"
          )
        }
        footer={
          <button
            type="button"
            onClick={() =>
              router.replace(
                viewer === "repair_pro" ? "/payments/history" : "/dashboard"
              )
            }
            className="inline-flex h-12 w-full items-center justify-center rounded-md border-0 bg-[#FF6B35] text-[14px] font-black text-white"
          >
            Back to Dashboard
          </button>
        }
      >
        <JobCard isLight={isLight} className="text-center">
          <Loader2 className="mx-auto h-12 w-12 animate-spin text-[#FF6B35]" />
          <p className={cn("mt-3 text-[17px] font-black", ink)}>
            Payout processing
          </p>
          <p className={cn("mt-2 text-[13px] leading-snug", muted)}>
            {viewer === "repair_pro"
              ? "Your payout is being processed automatically. You’ll be notified when it’s released to your bank."
              : "Your payment is being processed. You’ll get a notification when it’s fully released. No further action needed."}
          </p>
          {job.agreedMajor != null ? (
            <p className={cn("mt-4 text-[22px] font-black tabular-nums", ink)}>
              {formatMoney(job.agreedMajor, job.currency)}
            </p>
          ) : null}
        </JobCard>
      </JobShell>
    );
  }

  /* ─── RELEASED / SATISFIED ─── */
  if (job.status === "released" || job.status === "satisfied") {
    // Only motorist rates the Repair Pro. Both sides can view the result.
    const hasRating = job.rating != null && job.rating > 0;
    const alreadyLeft = reviewLeft || hasRating;
    const displayRating = hasRating ? Number(job.rating) : rating;
    const displayNote = (job.ratingNote || "").trim();
    const reviewChars = reviewText.length;

    const submitReview = async () => {
      if (viewer !== "motorist") return;
      if (!rating || rating < 1) {
        setErr("Tap a star rating first");
        return;
      }
      setBusy(true);
      setErr(null);
      const note = reviewText.trim().slice(0, REVIEW_MAX);
      const res = await apiRateJob({
        jobId: job.id,
        rating,
        note: note || undefined,
        actor: "motorist",
      });
      setBusy(false);
      if (!res.ok) {
        setErr(res.message || "Could not save review");
        return;
      }
      commitJob(res.data.job, true);
      setReviewLeft(true);
      setFlash("Thanks for your review");
      window.setTimeout(() => setFlash(null), 2500);
    };

    const starRow = (value: number, interactive: boolean) => (
      <div
        className="flex items-center justify-center gap-2"
        role={interactive ? "radiogroup" : "img"}
        aria-label={
          interactive
            ? "Rate the Repair Pro"
            : value > 0
              ? `Rated ${value} out of 5`
              : "No rating yet"
        }
      >
        {[1, 2, 3, 4, 5].map((n) => {
          const on = value > 0 && value >= n;
          if (!interactive) {
            return (
              <Star
                key={n}
                className={cn(
                  "h-8 w-8",
                  on
                    ? "fill-[#FF6B35] text-[#FF6B35]"
                    : isLight
                      ? "fill-transparent text-slate-400"
                      : "fill-transparent text-white/35"
                )}
                strokeWidth={1.75}
                aria-hidden
              />
            );
          }
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={rating === n}
              aria-label={`${n} star${n === 1 ? "" : "s"}`}
              disabled={alreadyLeft}
              onClick={() => setRating(n)}
              className="border-0 bg-transparent p-1 transition active:scale-95 disabled:opacity-70"
            >
              <Star
                className={cn(
                  "h-9 w-9",
                  on
                    ? "fill-[#FF6B35] text-[#FF6B35]"
                    : isLight
                      ? "fill-transparent text-slate-400"
                      : "fill-transparent text-white/35"
                )}
                strokeWidth={1.75}
              />
            </button>
          );
        })}
      </div>
    );

    const canDisputeClosed = canOpenDisputeNow(job);

    return (
      <JobShell
        isLight={isLight}
        title={
          isPayoutPendingSettlement(job) && job.status !== "released"
            ? "Payout processing"
            : job.status === "released"
              ? "Payment released"
              : "Confirmed"
        }
        compactHeader
        onBack={viewer === "repair_pro" ? () => router.replace("/payments/history") : goHome}
        footer={
          <div className="flex w-full flex-col gap-2">
            {viewer === "motorist" && !alreadyLeft ? (
              <CopperButton
                disabled={busy || rating < 1}
                onClick={() => void submitReview()}
              >
                {busy ? "Saving…" : "Leave review"}
              </CopperButton>
            ) : null}
            {canDisputeClosed ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => setDisputeOpen(true)}
                className="w-full text-center text-[12px] font-bold text-red-500"
              >
                Open a dispute (48h window)
              </button>
            ) : null}
            {viewer === "motorist" ? (
              <button
                type="button"
                onClick={() => router.replace("/dashboard")}
                className={cn(
                  "w-full text-center text-[12px] font-semibold",
                  muted
                )}
              >
                Go to dashboard
              </button>
            ) : (
              <button
                type="button"
                onClick={() => router.replace("/payments/history")}
                className={cn(
                  "w-full text-center text-[12px] font-semibold",
                  muted
                )}
              >
                Payment status
              </button>
            )}
          </div>
        }
      >
        {/* Flat success layout — no cards / no tinted panels (both themes) */}
        <div className="flex flex-col items-center px-2 pt-6 text-center">
          <CheckCircle2
            className="h-14 w-14 text-emerald-500"
            strokeWidth={1.75}
            aria-hidden
          />
          <p className={cn("mt-4 text-[22px] font-black tracking-tight", ink)}>
            Success
          </p>
          {job.agreedMajor != null && (
            <p className={cn("mt-3 text-[32px] font-black tabular-nums tracking-tight", ink)}>
              {formatMoney(job.agreedMajor, job.currency)}
            </p>
          )}
          <p className={cn("mt-1 text-[12px] font-semibold", muted)}>
            Labour only
          </p>

          {/* Receipt: hidden until tapped */}
          <button
            type="button"
            onClick={() => setReceiptOpen((o) => !o)}
            className={cn(
              "mt-6 inline-flex items-center gap-1 border-0 bg-transparent px-0 text-[13px] font-bold",
              isLight ? "text-slate-800" : "text-white"
            )}
          >
            Receipt
            {receiptOpen ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
          {receiptOpen && (
            <div className={cn("mt-2 space-y-1 text-[12px] font-medium", muted)}>
              <p>Ref {job.paymentReference || job.id}</p>
              <p>Escrow {job.escrowStatus || "released"}</p>
            </div>
          )}

          {/* Rating: motorist writes; both motorist + pro can read */}
          <div className="mt-10 w-full max-w-md text-left">
            {viewer === "motorist" && !alreadyLeft ? (
              <>
                <p className={cn("mb-3 text-center text-[14px] font-bold", ink)}>
                  Rate your Repair Pro
                </p>
                {starRow(rating, true)}
                <div className="mt-5">
                  <label
                    htmlFor="job-review-text"
                    className={cn("mb-1.5 block text-[12px] font-bold", ink)}
                  >
                    Write a review
                  </label>
                  <textarea
                    id="job-review-text"
                    value={reviewText}
                    onChange={(e) =>
                      setReviewText(e.target.value.slice(0, REVIEW_MAX))
                    }
                    maxLength={REVIEW_MAX}
                    rows={3}
                    placeholder="How was the repair? (optional)"
                    className={cn(
                      "w-full resize-none rounded-md border-0 px-3 py-2.5 text-[13px] font-medium outline-none ring-1 transition placeholder:opacity-50",
                      isLight
                        ? "bg-transparent text-slate-900 ring-black/15 focus:ring-[#FF6B35]/50"
                        : "bg-transparent text-white ring-white/20 focus:ring-[#FF6B35]/50"
                    )}
                  />
                  <p
                    className={cn(
                      "mt-1 text-right text-[11px] font-semibold tabular-nums",
                      reviewChars >= REVIEW_MAX ? "text-[#FF6B35]" : muted
                    )}
                  >
                    {reviewChars}/{REVIEW_MAX}
                  </p>
                </div>
              </>
            ) : hasRating ? (
              <>
                <p className={cn("mb-3 text-center text-[14px] font-bold", ink)}>
                  {viewer === "repair_pro"
                    ? "Customer rating"
                    : "Your review of the Repair Pro"}
                </p>
                {starRow(displayRating, false)}
                {displayNote ? (
                  <p
                    className={cn(
                      "mt-4 rounded-md px-3 py-2.5 text-[13px] font-medium leading-snug break-words",
                      isLight
                        ? "bg-[#bebfc4]/60 text-slate-900"
                        : "bg-[#1a1a1a] text-white/90"
                    )}
                  >
                    “{displayNote}”
                  </p>
                ) : (
                  <p
                    className={cn(
                      "mt-3 text-center text-[12px] font-semibold",
                      muted
                    )}
                  >
                    No written review
                  </p>
                )}
                {viewer === "motorist" && (
                  <p
                    className={cn(
                      "mt-3 text-center text-[12px] font-semibold",
                      muted
                    )}
                  >
                    Review submitted
                  </p>
                )}
              </>
            ) : (
              <p
                className={cn(
                  "text-center text-[13px] font-semibold leading-snug",
                  muted
                )}
              >
                {viewer === "repair_pro"
                  ? "Waiting for the motorist to rate and review this job."
                  : "Rate this job when you’re ready."}
              </p>
            )}

            {flash && (
              <p className="mt-2 text-center text-[12px] font-bold text-[#FF6B35]">
                {flash}
              </p>
            )}
            {err && (
              <p className="mt-2 text-center text-[12px] font-semibold text-red-500">
                {err}
              </p>
            )}
          </div>
        </div>

        {job.dispute?.decision && !job.dispute.appeal && (
          <button
            type="button"
            className="mt-8 w-full text-center text-[12px] font-bold text-[#FF6B35]"
            onClick={() =>
              void run(() =>
                apiOpenAppeal({
                  jobId: job.id,
                  by: viewer,
                  reason: "I disagree with the dispute decision.",
                })
              )
            }
          >
            Appeal decision (48h window)
          </button>
        )}
      </JobShell>
    );
  }

  /* ─── DISPUTED / APPEAL ─── */
  if (job.status === "disputed" || job.status === "under_appeal") {
    return (
      <JobShell
        isLight={isLight}
        title={
          job.status === "under_appeal" ? "Under appeal" : "Dispute active"
        }
        compactHeader
        onBack={goJobsList}
      >
        <div className="mb-3 flex items-center gap-2 rounded-2xl bg-[#FF6B35]/150/15 px-3 py-3 text-[#FF6B35] dark:text-[#FF6B35]">
          <ShieldAlert className="h-5 w-5 shrink-0" />
          <p className="text-[13px] font-bold">
            Admin review in progress. Chat remains open. You may add evidence.
          </p>
        </div>
        <JobCard isLight={isLight}>
          <p className={cn("text-[12px] font-bold uppercase", muted)}>Reason</p>
          <p className={cn("mt-1 text-[14px] font-semibold", ink)}>
            {job.dispute?.reason}
          </p>
          <p className={cn("mt-2 text-[13px]", muted)}>
            {job.dispute?.description}
          </p>
          {job.evidence && (
            <div className="mt-3 rounded-xl bg-black/5 p-3 dark:bg-white/5">
              <p className={cn("text-[12px] font-bold", ink)}>
                Evidence score: {job.evidence.composite}/100 ·{" "}
                {job.evidence.priority}
              </p>
              <p className={cn("mt-1 text-[11px]", muted)}>
                Photo {job.evidence.photoScore} · Voice {job.evidence.voiceScore}{" "}
                · Location {job.evidence.locationScore} · Time{" "}
                {job.evidence.timestampScore}
              </p>
            </div>
          )}
        </JobCard>
        <GhostButton
          isLight={isLight}
          className="mt-3"
          onClick={() => void openJobChat(job)}
        >
          Open chat
        </GhostButton>
        <div className="relative min-h-0">
          <ExpiredDialog
            open={chatGateOpen}
            isLight={isLight}
            message={CONVERSATION_ENDED_MESSAGE}
            onClose={() => {
              setChatGateOpen(false);
              setChatGateViewHref(null);
            }}
          />
        </div>
      </JobShell>
    );
  }

  /* ─── CANCELLED / REFUNDED ─── */
  return (
    <JobShell
      isLight={isLight}
      title={
        job.status === "refunded"
          ? "Refunded"
          : job.status === "cancelled"
            ? "Cancelled"
            : job.status
      }
      compactHeader
      onBack={goJobsList}
      footer={
        <div className="space-y-2">
          <CopperButton
            onClick={() => router.push(`/request?tech=${job.repairProId}`)}
          >
            Request again
          </CopperButton>
          <GhostButton
            isLight={isLight}
            onClick={() =>
              router.push(viewer === "repair_pro" ? "/dashboard" : "/")
            }
          >
            {viewer === "repair_pro" ? "Home" : "Choose another pro"}
          </GhostButton>
        </div>
      }
    >
      <JobCard isLight={isLight}>
        <p className={cn("text-[14px] font-medium", muted)}>
          {flash ||
            (job.status === "cancelled" || job.status === "refunded"
              ? job.escrowStatus === "refunded" || job.status === "refunded"
                ? "This job was cancelled. The full amount was refunded to the customer. Booked jobs must be completed within 6 hours of payment."
                : "This job was cancelled. If escrow was held, the full amount returns to the customer."
              : "This job has ended.")}
        </p>
      </JobCard>
    </JobShell>
  );
}

function StatusPill({
  label,
  tone,
}: {
  label: string;
  tone: "amber" | "copper" | "neutral";
}) {
  const cls =
    tone === "amber"
      ? "bg-[#FF6B35]/150/20 text-[#FF6B35] dark:text-[#FF6B35]"
      : tone === "copper"
        ? "bg-[#FF6B35]/20 text-[#FF6B35]"
        : "bg-black/10 text-slate-700 dark:bg-white/10 dark:text-white/70";
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-1 text-[11px] font-black uppercase tracking-wide",
        cls
      )}
    >
      {label}
    </span>
  );
}

function DisputeSheet({
  isLight,
  reason,
  setReason,
  desc,
  setDesc,
  busy,
  onClose,
  onSubmit,
}: {
  isLight: boolean;
  reason: DisputeReason;
  setReason: (r: DisputeReason) => void;
  desc: string;
  setDesc: (s: string) => void;
  busy: boolean;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4">
      <div
        className={cn(
          "max-h-[85vh] w-full max-w-md overflow-y-auto rounded-3xl p-5",
          isLight ? "bg-[#c8c9cd]" : "bg-black"
        )}
      >
        <p
          className={cn(
            "text-[17px] font-black",
            isLight ? "text-slate-900" : "text-white"
          )}
        >
          Open dispute
        </p>
        <p
          className={cn(
            "mt-1 text-[12px]",
            isLight ? "text-slate-500" : "text-white/50"
          )}
        >
          Money stays locked until admin resolves (within 24h).
        </p>
        <label className="mt-4 block text-[11px] font-bold uppercase tracking-wide text-[#FF6B35]">
          Reason
        </label>
        <select
          value={reason}
          onChange={(e) => setReason(e.target.value as DisputeReason)}
          className={cn(
            "mt-1 h-11 w-full rounded-xl px-3 text-[13px] font-semibold",
            isLight ? "bg-[#bebfc4]" : "bg-[#1c1c1c] text-white"
          )}
        >
          {DISPUTE_REASONS.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
        <textarea
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          rows={4}
          placeholder="Short description…"
          className={cn(
            "mt-3 w-full resize-none rounded-xl p-3 text-[13px] outline-none",
            isLight ? "bg-[#bebfc4]" : "bg-[#1c1c1c] text-white"
          )}
        />
        <div className="mt-4 flex gap-2">
          <GhostButton isLight={isLight} onClick={onClose}>
            Cancel
          </GhostButton>
          <CopperButton disabled={busy || desc.trim().length < 5} onClick={onSubmit}>
            Submit dispute
          </CopperButton>
        </div>
      </div>
    </div>
  );
}
