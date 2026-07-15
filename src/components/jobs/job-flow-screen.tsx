"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Loader2,
  MessageCircle,
  Navigation,
  Phone,
  ShieldAlert,
} from "lucide-react";
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
import { StarRatingDisplay } from "@/components/ui/star-rating";
import {
  apiAcceptOffer,
  apiGetJob,
  apiOpenAppeal,
  apiOpenDispute,
  apiPayJob,
  apiPlaceOffer,
  apiPushProLocation,
  apiTransition,
  getCurrentPosition,
} from "@/lib/jobs/client";
import {
  DISPUTE_REASONS,
  PRO_TRIP_STATUS_COPY,
  TRIP_STATUS_COPY,
} from "@/lib/jobs/constants";
import { negotiationUiStatus } from "@/lib/jobs/state-machine";
import type { DisputeReason, JobRecord } from "@/lib/jobs/types";
import { avatarInitials, DEFAULT_VENDOR_PHOTO } from "@/lib/brand";
import { formatMoney, LABOUR_SPLIT_LINE } from "@/lib/pricing";
import { PRO_SERVICE_LABELS } from "@/lib/services";
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
  const [flash, setFlash] = useState<string | null>(null);
  const [locHint, setLocHint] = useState<string | null>(null);

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

  // Fast poll while negotiating so motorist sees pro offers quickly
  useEffect(() => {
    void load();
    const ms =
      job?.status === "negotiating" || job?.status === "agreed" ? 1000 : 2500;
    const id = window.setInterval(() => void load(), ms);
    return () => window.clearInterval(id);
  }, [load, job?.status]);

  /** My jobs list — stay on open negotiation without cancelling */
  const goJobsList = useCallback(() => {
    router.push("/jobs");
  }, [router]);

  // Repair Pro: continuous real GPS while trip is active → Google ETA on server
  useEffect(() => {
    if (viewer !== "repair_pro" || !job) return;
    const tracking = [
      "paid_booked",
      "en_route",
      "arrived",
      "in_progress",
    ].includes(job.status);
    if (!tracking || !navigator.geolocation) return;

    let cancelled = false;
    const push = async (lat: number, lng: number) => {
      if (cancelled) return;
      const res = await apiPushProLocation({
        jobId: job.id,
        lat,
        lng,
        actorId,
      });
      if (res.ok) {
        commitJob(res.data.job);
        setLocHint(null);
      }
    };

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        void push(pos.coords.latitude, pos.coords.longitude);
      },
      (e) => {
        setLocHint(
          e.code === e.PERMISSION_DENIED
            ? "Enable location so motorists see your live ETA."
            : "Waiting for GPS fix…"
        );
      },
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 20000 }
    );

    // Also poll getCurrentPosition every 12s as backup
    const poll = window.setInterval(() => {
      void getCurrentPosition()
        .then((p) => push(p.coords.latitude, p.coords.longitude))
        .catch(() => undefined);
    }, 12000);

    return () => {
      cancelled = true;
      navigator.geolocation.clearWatch(watchId);
      window.clearInterval(poll);
    };
  }, [viewer, job?.id, job?.status, actorId, commitJob]);

  const ink = isLight ? "text-slate-900" : "text-white";
  const muted = isLight ? "text-slate-500" : "text-white/55";

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
    const res = await fn();
    setBusy(false);
    if (!res.ok) {
      setErr(res.message);
      return;
    }
    applyJob(res.data.job);
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

  /* ─── EXPIRED ─── */
  if (job.status === "expired" || negStatus === "expired") {
    const grayBtn = cn(
      "inline-flex h-12 w-full items-center justify-center rounded-md border-0 text-[14px] font-bold transition active:scale-[0.99]",
      isLight ? "bg-[#a8a9ae] text-slate-900" : "bg-[#2c2c2e] text-white"
    );
    const isPro = viewer === "repair_pro";

    return (
      <JobShell
        isLight={isLight}
        title="Negotiation expired"
        compactHeader
        onBack={isPro ? () => router.push("/dashboard") : goJobsList}
        footer={
          <div className="flex flex-col gap-2">
            {isPro ? (
              <button
                type="button"
                className={grayBtn}
                onClick={() => router.push("/dashboard")}
              >
                Back to dashboard
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className={grayBtn}
                  onClick={() =>
                    router.push(`/request?tech=${job.repairProId}`)
                  }
                >
                  Request again
                </button>
                <button
                  type="button"
                  className={grayBtn}
                  onClick={() => router.push("/")}
                >
                  Choose another pro
                </button>
              </>
            )}
          </div>
        }
      >
        <JobCard isLight={isLight}>
          <p className={cn("text-[14px] font-medium leading-snug", muted)}>
            {isPro
              ? `This negotiation ended between you and ${job.motoristName}. No agreement was reached.`
              : `No agreement was reached with ${job.repairProName}. You can request the same pro again or pick someone else nearby.`}
          </p>
        </JobCard>
      </JobShell>
    );
  }

  /* ─── NEGOTIATING ─── */
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

    return (
      <JobShell
        isLight={isLight}
        title="Negotiate labour"
        compactHeader
        onBack={goJobsList}
        footer={
          <div className="space-y-1.5">
            {canAccept && last && (
              <StageButton
                isLight={isLight}
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
              </StageButton>
            )}
            {canOffer && (
              <div className="flex gap-1.5">
                <input
                  inputMode="decimal"
                  value={offerInput}
                  onChange={(e) => setOfferInput(e.target.value)}
                  placeholder={
                    mySide === "repair_pro"
                      ? "Your labour price"
                      : "Your counter (max 50% off)"
                  }
                  className={cn(
                    "h-11 flex-1 rounded-md border-0 px-3 text-[14px] font-bold outline-none",
                    isLight
                      ? "bg-[#bebfc4] text-slate-900"
                      : "bg-[#1c1c1c] text-white"
                  )}
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      const res = await apiPlaceOffer({
                        jobId: job.id,
                        side: mySide,
                        actorId,
                        amountMajor: Number(offerInput.replace(/[^\d.]/g, "")),
                      });
                      if (res.ok) setOfferInput("");
                      return res;
                    })
                  }
                  className={cn(
                    "h-11 shrink-0 rounded-md border-0 px-4 text-[13px] font-bold",
                    isLight
                      ? "bg-[#a8a9ae] text-slate-900"
                      : "bg-[#2c2c2e] text-white"
                  )}
                >
                  Send
                </button>
              </div>
            )}
            <GhostButton
              isLight={isLight}
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
            </GhostButton>
          </div>
        }
      >
        <div className="space-y-1.5">
          <JobCard isLight={isLight}>
            <CountdownTimer
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
            <div className="mt-2 flex flex-wrap gap-1.5">
              <StatusPill
                label={
                  negStatus === "waiting"
                    ? "Waiting"
                    : negStatus === "countered"
                      ? "Countered"
                      : negStatus
                }
                tone={negStatus === "waiting" ? "amber" : "copper"}
              />
              <StatusPill
                label={`${job.offers.length} / ${job.maxOffers} offers`}
                tone="neutral"
              />
            </div>
          </JobCard>

          {theirOffer && (
            <JobCard isLight={isLight}>
              <p className={cn("text-[11px] font-bold", muted)}>
                {theirOffer.side === "repair_pro"
                  ? "Repair Pro offered"
                  : "Motorist offered"}
              </p>
              <p className="mt-0.5 text-[20px] font-black text-[#e07a3d]">
                {formatMoney(theirOffer.amountMajor, job.currency)}
              </p>
              <p className={cn("mt-0.5 text-[11px] font-medium", muted)}>
                Labour only. Spare parts not included.
              </p>
            </JobCard>
          )}

          <JobCard isLight={isLight}>
            <p className={cn("text-[11px] font-bold", muted)}>Problem</p>
            <p className={cn("mt-0.5 text-[13px] font-semibold leading-snug", ink)}>
              {job.problem}
            </p>
            {job.voiceNote && (
              <p className="mt-1 text-[11px] font-semibold text-[#e07a3d]">
                Voice note attached ({job.voiceNote.durationSec || "?"}s)
              </p>
            )}
          </JobCard>

          <JobCard isLight={isLight}>
            <p className={cn("mb-1.5 text-[11px] font-bold", muted)}>
              Offer history
            </p>
            {job.offers.length === 0 ? (
              <p className={cn("text-[12px] font-medium", muted)}>
                {viewer === "repair_pro"
                  ? "Set your labour price to start. Spare parts are never included."
                  : "Waiting for Repair Pro to open with a labour price…"}
              </p>
            ) : (
              <ul className="space-y-1">
                {job.offers.map((o) => (
                  <li
                    key={o.id}
                    className={cn(
                      "flex items-center justify-between rounded-md px-2.5 py-2",
                      isLight ? "bg-black/10" : "bg-[#0a0a0a]"
                    )}
                  >
                    <span className={cn("text-[11px] font-bold", muted)}>
                      #{o.offerIndex}{" "}
                      {o.side === "repair_pro" ? "Repair Pro" : "Motorist"}
                    </span>
                    <span className={cn("text-[14px] font-black", ink)}>
                      {formatMoney(o.amountMajor, o.currency)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </JobCard>
        </div>
        {err && (
          <p className="mt-2 text-center text-[12px] font-semibold text-red-500">
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
      en_route: "On the way",
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
        const pos = await getCurrentPosition({
          enableHighAccuracy: true,
          timeout: 8000,
          maximumAge: 15000,
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
            "Location is limited — trip continues. Enable GPS for live ETA."
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
      setBusy(false);
      if (!res.ok) {
        setErr(res.message || "Could not update trip status. Try again.");
        return;
      }
      // Force apply — never let a stale poll undo the advance
      commitJob(res.data.job, true);
      setFlash(
        event === "START_TRIP"
          ? "Trip started — you’re on the way"
          : event === "MARK_ARRIVED"
            ? "Marked arrived"
            : event === "START_WORK"
              ? "Work started"
              : "Job marked complete"
      );
      window.setTimeout(() => setFlash(null), 3500);
    };

    return (
      <JobShell
        isLight={isLight}
        title={copy.title}
        compactHeader
        onBack={goJobsList}
        fullBleed
        footer={
          <div className="space-y-2">
            {flash && (
              <p className="text-center text-[12px] font-bold text-[#e07a3d]">
                {flash}
              </p>
            )}
            {locHint && viewer === "repair_pro" && (
              <p className="text-center text-[11px] font-semibold text-amber-500">
                {locHint}
              </p>
            )}
            {err && (
              <p className="text-center text-[12px] font-semibold text-red-500">
                {err}
              </p>
            )}
            {viewer === "repair_pro" && nextPro && (
              <StageButton
                isLight={isLight}
                disabled={busy}
                onClick={() => void proAdvance(nextPro.event)}
              >
                {busy ? "Updating trip…" : nextPro.label}
              </StageButton>
            )}
            {viewer === "motorist" && job.status === "en_route" && (
              <p
                className={cn(
                  "text-center text-[12px] font-semibold",
                  isLight ? "text-slate-700" : "text-[#c8c9cd]"
                )}
              >
                Repair Pro is on the way
                {job.etaMinutes != null
                  ? ` · ETA ${job.etaMinutes} min`
                  : ""}
              </p>
            )}
            {viewer === "motorist" && (
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
        }
      >
        {/* Real Google Maps live track */}
        <div className="relative mx-0 h-[46vh] min-h-[260px] overflow-hidden">
          <LiveJobTrackMap job={job} isLight={isLight} />
        </div>

        {/* Bottom sheet — counterpart by role */}
        <div className="relative z-10 -mt-4 px-4">
          <JobCard isLight={isLight}>
            <div className="mb-2.5 flex items-center justify-between gap-2">
              <span
                className={cn(
                  "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-black uppercase tracking-wide",
                  job.status === "en_route" || job.status === "in_progress"
                    ? "bg-[#e07a3d] text-white"
                    : isLight
                      ? "bg-slate-800 text-white"
                      : "bg-[#3a3a3c] text-white"
                )}
              >
                {statusLabel[job.status] || job.status}
              </span>
              {(job.status === "en_route" || job.status === "paid_booked") &&
                job.etaMinutes != null && (
                  <span className={cn("text-[12px] font-bold", muted)}>
                    ETA {job.etaMinutes} min
                  </span>
                )}
            </div>
            <div className="flex items-center gap-3">
              <Avatar className="h-12 w-12 rounded-full">
                <AvatarImage
                  src={
                    viewer === "motorist"
                      ? job.repairProPhoto || DEFAULT_VENDOR_PHOTO
                      : DEFAULT_VENDOR_PHOTO
                  }
                  className="object-cover"
                />
                <AvatarFallback>
                  {avatarInitials(
                    viewer === "motorist"
                      ? job.repairProName
                      : job.motoristName
                  )}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className={cn("truncate text-[15px] font-black", ink)}>
                  {viewer === "motorist"
                    ? job.repairProName
                    : job.motoristName}
                </p>
                <p className={cn("text-[12px] font-semibold", muted)}>
                  {viewer === "motorist"
                    ? PRO_SERVICE_LABELS[job.serviceType]
                    : "Motorist"}
                  {job.agreedMajor != null
                    ? ` · ${formatMoney(job.agreedMajor, job.currency)}`
                    : ""}
                </p>
              </div>
              <div className="flex gap-2">
                <IconRound isLight={isLight} label="Call">
                  <Phone className="h-4 w-4" />
                </IconRound>
                <IconRound
                  isLight={isLight}
                  label="Chat"
                  onClick={() => router.push("/messages")}
                >
                  <MessageCircle className="h-4 w-4" />
                </IconRound>
              </div>
            </div>
            <p
              className={cn(
                "mt-2 flex items-center gap-1.5 text-[12px] font-semibold",
                muted
              )}
            >
              <Navigation className="h-3.5 w-3.5 text-[#e07a3d]" />
              {job.locationLabel}
            </p>
          </JobCard>
        </div>

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
        {err && (
          <p className="px-4 pt-2 text-center text-[12px] font-semibold text-red-500">
            {err}
          </p>
        )}
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
    return (
      <JobShell
        isLight={isLight}
        title="Payment released"
        compactHeader
        onBack={goJobsList}
        footer={
          <CopperButton onClick={goJobsList}>Done</CopperButton>
        }
      >
        <JobCard isLight={isLight} className="text-center">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15">
            <CheckCircle2 className="h-9 w-9 text-emerald-500" />
          </div>
          <p className={cn("text-[20px] font-black", ink)}>Success</p>
          <p className={cn("mt-1 text-[13px]", muted)}>
            95% → Repair Pro · 5% → platform
          </p>
          {job.agreedMajor != null && (
            <p className="mt-3 text-[26px] font-black text-[#e07a3d]">
              {formatMoney(job.agreedMajor, job.currency)}
            </p>
          )}
          <div
            className={cn(
              "mt-4 rounded-xl px-3 py-2 text-left text-[12px]",
              isLight ? "bg-black/[0.04]" : "bg-white/[0.05]"
            )}
          >
            <p className={cn("font-bold", ink)}>Receipt</p>
            <p className={muted}>Ref: {job.paymentReference || job.id}</p>
            <p className={muted}>
              Escrow: {job.escrowStatus || "released"} · Labour only
            </p>
          </div>
        </JobCard>

        <JobCard isLight={isLight} className="mt-3">
          <p className={cn("mb-2 text-[13px] font-bold", ink)}>Rate this job</p>
          <div className="mb-2 flex justify-center gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setRating(n)}
                className={cn(
                  "h-10 w-10 rounded-xl text-[16px] font-black",
                  rating >= n
                    ? "bg-[#e07a3d] text-white"
                    : isLight
                      ? "bg-black/8 text-slate-400"
                      : "bg-white/10 text-white/40"
                )}
              >
                {n}
              </button>
            ))}
          </div>
          <StarRatingDisplay rating={rating} className="justify-center" />
        </JobCard>

        {job.dispute?.decision && !job.dispute.appeal && (
          <button
            type="button"
            className="mt-3 w-full text-center text-[12px] font-bold text-[#e07a3d]"
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
            Appeal decision (48h window · loser only)
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
          onClick={() => router.push("/messages")}
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
          <GhostButton isLight={isLight} onClick={() => router.push("/")}>
            Choose another pro
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

function IconRound({
  children,
  isLight,
  label,
  onClick,
}: {
  children: React.ReactNode;
  isLight: boolean;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        "flex h-10 w-10 items-center justify-center rounded-2xl",
        isLight ? "bg-slate-900/8 text-slate-900" : "bg-white/10 text-white"
      )}
    >
      {children}
    </button>
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
