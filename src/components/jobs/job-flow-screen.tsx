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
  MessageCircle,
  Navigation,
  Phone,
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
import {
  apiAcceptOffer,
  apiGetJob,
  apiOpenAppeal,
  apiOpenDispute,
  apiPayJob,
  apiPlaceOffer,
  apiPushTripLocation,
  apiRateJob,
  apiTransition,
  getCurrentPosition,
} from "@/lib/jobs/client";
import {
  DISPUTE_REASONS,
  MAX_OFFER_DIGITS,
  PRO_TRIP_STATUS_COPY,
  TRIP_STATUS_COPY,
} from "@/lib/jobs/constants";
import { negotiationUiStatus } from "@/lib/jobs/state-machine";
import type { DisputeReason, JobRecord } from "@/lib/jobs/types";
import { avatarInitials, DEFAULT_VENDOR_PHOTO } from "@/lib/brand";
import { tradeIconDataUrl } from "@/lib/map-trade-icons";
import { formatMoney, LABOUR_SPLIT_LINE } from "@/lib/pricing";
import { PRO_SERVICE_LABELS } from "@/lib/services";
import { useApp } from "@/lib/store";
import type { ServiceRequest } from "@/lib/types";
import { cn } from "@/lib/utils";

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
  const { technicians, ensureChatForRequestAsync, visibleMessageThreads } =
    useApp();
  const [job, setJob] = useState<JobRecord | null>(null);
  const jobRef = useRef<JobRecord | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [offerInput, setOfferInput] = useState("");
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [disputeReason, setDisputeReason] =
    useState<DisputeReason>("work_incomplete");
  const [disputeDesc, setDisputeDesc] = useState("");
  const [rating, setRating] = useState(5);
  const [reviewText, setReviewText] = useState("");
  const [reviewLeft, setReviewLeft] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [locHint, setLocHint] = useState<string | null>(null);
  /** Repair Pro must confirm they can fix the job before negotiating */
  const [proCanFixAccepted, setProCanFixAccepted] = useState(false);
  /** Arrived / Work in progress: home-style swipe sheet */
  const [tripSheetExpanded, setTripSheetExpanded] = useState(false);
  const tripGestureY = useRef<number | null>(null);

  /** Open (or create) cloud job chat so both parties share one conversation */
  const openJobChat = useCallback(
    async (j: JobRecord) => {
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
        roleLabel: "Motorist",
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
      setErr(res.message);
      return;
    }
    commitJob(res.data.job);
    setErr(null);
  }, [jobId, commitJob]);

  // Poll job state; slower during tracking so GPS + UI never thrash
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      await load();
    };
    void tick();
    // Low data: negotiate 8s, active trip 15s; post-pay reviews poll fast (3s)
    const ms =
      job?.status === "negotiating" || job?.status === "agreed"
        ? 8000
        : ["paid_booked", "en_route", "arrived", "in_progress"].includes(
              job?.status || ""
            )
          ? 15_000
          : job?.status === "released" || job?.status === "satisfied"
            ? 3000
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
    const poll = window.setInterval(sample, 30_000);

    setLocHint(
      viewer === "repair_pro"
        ? "Sharing location for this trip"
        : "Sharing your pin so Repair Pro can find you"
    );
    const hintClear = window.setTimeout(() => setLocHint(null), 4000);

    return () => {
      cancelled = true;
      window.clearInterval(poll);
      window.clearTimeout(hintClear);
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
    try {
      const res = await fn();
      if (!res.ok) {
        setErr(res.message);
        return;
      }
      applyJob(res.data.job);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong. Try again.");
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
          <Loader2 className="h-8 w-8 animate-spin text-[#e07a3d]" />
        </div>
        {err && (
          <p className="text-center text-[13px] font-semibold text-red-500">
            {err}
          </p>
        )}
      </JobShell>
    );
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
                onClick={() => {
                  setProCanFixAccepted(true);
                  try {
                    sessionStorage.setItem(`om-can-fix-${job.id}`, "1");
                  } catch {
                    /* */
                  }
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
              Read this before you accept this request
            </p>
            <p className={cn("text-[14px] font-medium leading-relaxed", ink)}>
              By tapping{" "}
              <span className="font-semibold text-[#e07a3d]">I can fix this</span>
              , you are saying you have the skill and tools for this job. Only
              continue if you can complete the work. If you cannot, cancel so
              the motorist can find someone else.
            </p>
            <div>
              <p className={cn("text-[11px] font-medium", muted)}>Problem</p>
              <p className={cn("mt-1 text-[14px] font-medium leading-relaxed", ink)}>
                {job.problem}
              </p>
              {job.voiceNote?.url && (
                <div className="mt-3">
                  <VoiceNotePlayer
                    url={job.voiceNote.url}
                    durationSec={job.voiceNote.durationSec}
                    isLight={isLight}
                    label="Motorist voice note"
                  />
                </div>
              )}
            </div>
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
        title={viewer === "repair_pro" ? "New Request" : "Negotiate labour"}
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
                        ? "Labour price (not 0)"
                        : "Counter (max 50% off)"
                    }
                    className={cn(
                      "h-11 flex-1 rounded-md border-0 bg-transparent px-3 text-[14px] font-medium outline-none ring-1",
                      isLight
                        ? "text-slate-900 ring-black/20 placeholder:text-slate-500 focus:ring-[#e07a3d]/55"
                        : "text-white ring-white/25 placeholder:text-white/40 focus:ring-[#e07a3d]/55"
                    )}
                    aria-label="Labour price offer"
                  />
                  <button
                    type="button"
                    disabled={busy || !offerInput || Number(offerInput) < 1}
                    onClick={() =>
                      void run(async () => {
                        const amount = Number(offerInput.replace(/\D/g, ""));
                        if (!Number.isFinite(amount) || amount < 1) {
                          setErr("Price cannot start from 0.");
                          return {
                            ok: false as const,
                            message: "Price cannot start from 0.",
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
                    className="h-11 shrink-0 rounded-md border-0 bg-[#e07a3d] px-4 text-[13px] font-semibold text-white disabled:opacity-40"
                  >
                    Send
                  </button>
                </div>
                <p className={cn("text-[10px] font-medium", muted)}>
                  Up to {job.maxOffers} offers · not 0 · max {MAX_OFFER_DIGITS}{" "}
                  digits · 20 min
                </p>
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
        {/* Top: problem + offers · Middle: ring timer · no gray panels */}
        <div className="flex min-h-0 flex-col bg-transparent px-0.5 pt-1">
          <div className="shrink-0 space-y-4 bg-transparent">
            <div className="bg-transparent">
              <p className={cn("text-[11px] font-semibold uppercase tracking-wide", muted)}>
                Problem
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
                    label={
                      viewer === "motorist"
                        ? "Your voice note"
                        : "Motorist voice note"
                    }
                  />
                </div>
              )}
            </div>

            {theirOffer && (
              <div className="bg-transparent">
                <p className={cn("text-[11px] font-semibold uppercase tracking-wide", muted)}>
                  {theirOffer.side === "repair_pro"
                    ? "Repair Pro offered"
                    : "Motorist offered"}
                </p>
                <p className="mt-0.5 text-[22px] font-semibold tabular-nums text-[#e07a3d]">
                  {formatMoney(theirOffer.amountMajor, job.currency)}
                </p>
                <p className={cn("mt-0.5 text-[12px] font-medium", muted)}>
                  Labour only. Spare parts not included.
                </p>
              </div>
            )}

            <div className="bg-transparent">
              <p className={cn("mb-1.5 text-[11px] font-semibold uppercase tracking-wide", muted)}>
                Offer history
              </p>
              {job.offers.length === 0 ? (
                <p className={cn("text-[13px] font-medium leading-snug", ink)}>
                  {viewer === "repair_pro"
                    ? "Set your labour price to start. Spare parts are never included."
                    : "Waiting for Repair Pro to open with a labour price…"}
                </p>
              ) : (
                <ul className="space-y-2">
                  {job.offers.map((o) => (
                    <li
                      key={o.id}
                      className="flex items-center justify-between gap-3 bg-transparent py-0.5"
                    >
                      <span className={cn("text-[12px] font-medium", muted)}>
                        #{o.offerIndex}{" "}
                        {o.side === "repair_pro" ? "Repair Pro" : "Motorist"}
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
              )}
            </div>
          </div>

          {/* Ring mid-page under problem / offer history */}
          <div className="flex min-h-[42vh] flex-1 flex-col items-center justify-center bg-transparent py-5">
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
            <p
              className={cn(
                "mt-3 text-center text-[12px] font-medium",
                ink
              )}
            >
              {negStatus === "waiting"
                ? "Waiting for a reply"
                : negStatus === "countered"
                  ? "Counter offer on the table"
                  : String(negStatus)}
              {" · "}
              {job.offers.length}/{job.maxOffers} offers
            </p>
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
      viewer === "motorist" ? job.repairProName : job.motoristName;
    const counterpartPhoto =
      viewer === "motorist"
        ? job.repairProPhoto || DEFAULT_VENDOR_PHOTO
        : DEFAULT_VENDOR_PHOTO;
    const counterpartLabel =
      viewer === "motorist"
        ? PRO_SERVICE_LABELS[job.serviceType]
        : "Motorist";

    return (
      <JobShell
        isLight={isLight}
        title="Price agreed"
        compactHeader
        onBack={goJobsList}
        footer={
          viewer === "motorist" ? (
            <StageButton
              isLight={isLight}
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const res = await apiPayJob({
                    jobId: job.id,
                    motoristId: actorId,
                    email,
                  });
                  return res;
                })
              }
            >
              {busy ? "Processing…" : "Pay now to book"}
            </StageButton>
          ) : (
            <p
              className={cn(
                "text-center text-[13px] font-semibold",
                isLight ? "text-slate-700" : "text-[#c8c9cd]"
              )}
            >
              Waiting for motorist to pay into escrow…
            </p>
          )
        }
      >
        <div className="mb-3 flex flex-col items-center py-3 text-center">
          <p className={cn("text-[26px] font-black tracking-tight", ink)}>
            {job.agreedMajor != null
              ? formatMoney(job.agreedMajor, job.currency)
              : "—"}
          </p>
          <p className={cn("mt-1 text-[12px] font-medium", muted)}>
            {LABOUR_SPLIT_LINE}
          </p>
        </div>
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
        {err && (
          <p className="mt-3 text-center text-[12px] font-semibold text-red-500">
            {err}
          </p>
        )}
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
      // Pro: ON THE ROAD (not “on the way”). Motorist keeps friendly wording.
      en_route: viewer === "repair_pro" ? "On the road" : "On the way",
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
        when: ["in_progress"],
        event: "MARK_COMPLETED",
        label: "Mark job complete",
      },
    ];
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

    // Ready to go (paid_booked): no map. En route: fixed map strip.
    // Arrived + Work in progress: home-style map + swipe sheet + expand pill.
    const showMap = job.status !== "paid_booked";
    const isReadyToGo = job.status === "paid_booked";
    const isSwipeTrip =
      job.status === "arrived" || job.status === "in_progress";

    const statusChip = (
      <span
        className={cn(
          "rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-white",
          job.status === "paid_booked"
            ? "bg-emerald-600"
            : job.status === "en_route" || job.status === "in_progress"
              ? "bg-[#e07a3d]"
              : isLight
                ? "bg-slate-800"
                : "bg-[#3a3a3c]"
        )}
      >
        {job.status === "paid_booked"
          ? "Paid · Booked"
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
        {viewer === "motorist"
          ? PRO_SERVICE_LABELS[job.serviceType]
          : "Motorist"}
      </span>
    );

    const tripMetaHeader = (
      <div className="flex flex-wrap items-center gap-1.5">
        {statusChip}
        {skillChip}
        <p className={cn("min-w-0 flex-1 truncate text-[16px] font-black", ink)}>
          {viewer === "motorist" ? job.repairProName : job.motoristName}
        </p>
        {job.agreedMajor != null && (
          <p className="shrink-0 text-[15px] font-black tabular-nums text-[#e07a3d]">
            {formatMoney(job.agreedMajor, job.currency)}
          </p>
        )}
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
              Problem
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

        {!isReadyToGo && (
          <div className="flex items-start gap-2">
            <Navigation className="mt-0.5 h-4 w-4 shrink-0 text-[#e07a3d]" />
            <div className="min-w-0">
              <p className={cn("text-[13px] font-semibold break-words", ink)}>
                {job.locationLabel || "Location on map"}
              </p>
              <p className={cn("mt-0.5 text-[11px] font-medium", muted)}>
                {viewer === "motorist"
                  ? job.proLocation
                    ? "Repair Pro live on map"
                    : "Waiting for Repair Pro GPS"
                  : "Navigate to motorist pin"}
                {job.distanceKm != null &&
                  ` · ${
                    job.distanceKm < 0.1
                      ? "<0.1 km"
                      : `${job.distanceKm.toFixed(1)} km`
                  }`}
              </p>
            </div>
          </div>
        )}

        {isReadyToGo && (
          <p className={cn("text-[12px] font-medium", muted)}>
            {viewer === "repair_pro"
              ? "Start trip when you leave for the motorist."
              : "Repair Pro will start the trip soon."}
          </p>
        )}

        {copy.subtitle && (
          <p className={cn("text-[12px] font-medium leading-snug", muted)}>
            {copy.subtitle}
          </p>
        )}
      </>
    );

    const chatClosedForever = ["satisfied", "released", "cancelled", "expired", "refunded"].includes(
      job.status
    );

    const callMessageRow = (
      <div className="grid grid-cols-2 gap-2 pt-1">
        <button
          type="button"
          onClick={() => startJobCall(job)}
          className={cn(
            "inline-flex h-12 items-center justify-center gap-2 rounded-md border-0 text-[13px] font-bold",
            isLight
              ? "bg-[#a8a9ae] text-slate-900"
              : "bg-[#2c2c2e] text-white"
          )}
        >
          <Phone className="h-4 w-4 text-[#e07a3d]" />
          Call
        </button>
        <button
          type="button"
          onClick={() => void openJobChat(job)}
          className={cn(
            "inline-flex h-12 items-center justify-center gap-2 rounded-md border-0 text-[13px] font-bold text-white",
            chatClosedForever ? "bg-[#2c2c2e]" : "bg-[#e07a3d]"
          )}
        >
          <MessageCircle className="h-4 w-4" />
          {chatClosedForever ? "View chat" : "Message"}
        </button>
      </div>
    );

    const footerBlock = (
      <div className="space-y-2">
        {flash && (
          <p className="text-center text-[12px] font-bold text-[#e07a3d]">
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
            Repair Pro is on the way
            {job.etaMinutes != null ? ` ETA ${job.etaMinutes} min` : ""}
          </p>
        )}
        {viewer === "motorist" && job.status === "paid_booked" && (
          <GhostButton
            isLight={isLight}
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
          >
            Cancel · full refund
          </GhostButton>
        )}
        {viewer === "motorist" &&
          (job.status === "en_route" ||
            job.status === "arrived" ||
            job.status === "in_progress") && (
            <GhostButton
              isLight={isLight}
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
            >
              Cancel · full refund
            </GhostButton>
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
          subtitle={copy.subtitle}
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
                  "rounded-t-2xl shadow-[0_-6px_24px_rgba(0,0,0,0.18)]"
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
                      "h-1.5 w-11 rounded-full",
                      isLight
                        ? "bg-[#6b7280] shadow-sm ring-1 ring-black/10"
                        : "bg-white/40"
                    )}
                  />
                </div>
              </div>

              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-3 pb-3 scrollbar-hide">
                {tripMetaHeader}
                {tripDetails}
                {callMessageRow}
                {!tripSheetExpanded && (
                  <p
                    className={cn(
                      "pt-0.5 text-center text-[10px] font-semibold",
                      muted
                    )}
                  >
                    Swipe up to expand · swipe down to collapse
                  </p>
                )}
              </div>
            </div>
          </div>
          {disputeNode}
        </JobShell>
      );
    }

    /* ── Ready to go / On the road (unchanged flat layout) ── */
    return (
      <JobShell
        isLight={isLight}
        title={copy.title}
        compactHeader
        onBack={goJobsList}
        fullBleed={showMap}
        footer={footerBlock}
      >
        {showMap && (
          <div className="relative mx-0 h-[38vh] min-h-[220px] max-h-[320px] overflow-hidden">
            <LiveJobTrackMap job={job} isLight={isLight} viewer={viewer} />
          </div>
        )}

        <div
          className={cn(
            "space-y-4",
            showMap ? "relative z-10 -mt-4 px-3 pb-2" : "px-0 pb-2 pt-1"
          )}
        >
          {tripMetaHeader}
          {tripDetails}
          {callMessageRow}
        </div>
        {disputeNode}
      </JobShell>
    );
  }

  /* ─── COMPLETED → satisfied ─── */
  if (job.status === "completed") {
    return (
      <JobShell
        isLight={isLight}
        title="Job completed"
        compactHeader
        onBack={goJobsList}
        footer={
          viewer === "motorist" ? (
            <CopperButton
              disabled={busy}
              onClick={() =>
                void run(() =>
                  apiTransition({
                    jobId: job.id,
                    event: "SATISFIED",
                    actor: "motorist",
                    actorId,
                  })
                )
              }
            >
              I am satisfied
            </CopperButton>
          ) : (
            <p className={cn("text-center text-[13px] font-semibold", muted)}>
              Waiting for motorist confirmation…
            </p>
          )
        }
      >
        <JobCard isLight={isLight} className="text-center">
          <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-500" />
          <p className={cn("mt-3 text-[18px] font-black", ink)}>
            Work marked complete
          </p>
          <p className={cn("mt-1 text-[13px]", muted)}>
            Escrow releases 95% to {job.repairProName} only after you confirm.
          </p>
          {job.agreedMajor != null && (
            <p className="mt-4 text-[24px] font-black text-[#e07a3d]">
              {formatMoney(job.agreedMajor, job.currency)}
            </p>
          )}
        </JobCard>
        <button
          type="button"
          onClick={() => setDisputeOpen(true)}
          className="mt-4 w-full text-center text-[12px] font-bold text-red-500"
        >
          Open dispute instead
        </button>
        {disputeOpen && (
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
        )}
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
          interactive ? "Rate the Repair Pro" : `Rated ${value} out of 5`
        }
      >
        {[1, 2, 3, 4, 5].map((n) => {
          const on = value >= n;
          if (!interactive) {
            return (
              <Star
                key={n}
                className={cn(
                  "h-8 w-8",
                  on
                    ? "fill-[#e07a3d] text-[#e07a3d]"
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
                    ? "fill-[#e07a3d] text-[#e07a3d]"
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

    return (
      <JobShell
        isLight={isLight}
        title="Payment released"
        compactHeader
        onBack={goHome}
        footer={
          // Pure history when already reviewed / pro view — motorist may still leave review once
          viewer === "motorist" && !alreadyLeft ? (
            <CopperButton
              disabled={busy}
              onClick={() => void submitReview()}
            >
              {busy ? "Saving…" : "Leave review"}
            </CopperButton>
          ) : undefined
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
            <p className="mt-3 text-[32px] font-black tabular-nums tracking-tight text-[#e07a3d]">
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
                        ? "bg-transparent text-slate-900 ring-black/15 focus:ring-[#e07a3d]/50"
                        : "bg-transparent text-white ring-white/20 focus:ring-[#e07a3d]/50"
                    )}
                  />
                  <p
                    className={cn(
                      "mt-1 text-right text-[11px] font-semibold tabular-nums",
                      reviewChars >= REVIEW_MAX ? "text-[#e07a3d]" : muted
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
                    ? "Motorist rating"
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
              <p className="mt-2 text-center text-[12px] font-bold text-[#e07a3d]">
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
            className="mt-8 w-full text-center text-[12px] font-bold text-[#e07a3d]"
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
        <div className="mb-3 flex items-center gap-2 rounded-2xl bg-amber-500/15 px-3 py-3 text-amber-700 dark:text-amber-300">
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
          onClick={() => openJobChat(job)}
        >
          Open chat
        </GhostButton>
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
            (job.status === "cancelled"
              ? "This job was cancelled. If escrow was held, the full amount returns to the motorist."
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
      ? "bg-amber-500/20 text-amber-800 dark:text-amber-300"
      : tone === "copper"
        ? "bg-[#e07a3d]/20 text-[#e07a3d]"
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
        <label className="mt-4 block text-[11px] font-bold uppercase tracking-wide text-[#e07a3d]">
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
