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
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Loader2,
  Menu,
  Minimize2,
  Navigation,
  ShieldAlert,
  Star,
  Wrench,
  X,
} from "lucide-react";
import { useInAppCall } from "@/components/call/in-app-call";
import { AppMenu } from "@/components/layout/app-menu";
import { useNotificationsOptional } from "@/components/notifications/notification-provider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CountdownTimer } from "@/components/jobs/countdown-timer";
import { LiveJobTrackMap } from "@/components/jobs/live-job-track-map";
import { SearchingMap } from "@/components/jobs/searching-map";
import {
  CopperButton,
  GhostButton,
  JobCard,
  JobShell,
  StageButton,
} from "@/components/jobs/job-shell";
import { VoiceNotePlayer } from "@/components/jobs/voice-note-player";
import { JobProblemQA } from "@/components/jobs/job-problem-qa";
import { CalloutFeeLines } from "@/components/jobs/callout-fee-lines";
import { useJobCallout } from "@/lib/callout/use-job-callout";
import { composeCustomerPayableMajor } from "@/lib/callout/payable";
import { isWithinArrivalProximity } from "@/lib/callout/arrival";
import { ExpiredDialog } from "@/components/ui/expired-dialog";
import {
  CONVERSATION_ENDED_MESSAGE,
  JOB_CLOSED_MESSAGE,
  isJobEndedStatus,
  isJobHistoryOnlyStatus,
} from "@/lib/chat-expired";
import {
  apiAcceptOffer,
  apiCreateJob,
  apiDeferJob,
  apiDispatchScheduled,
  apiGetJob,
  apiOpenAppeal,
  apiOpenDispute,
  apiPlaceOffer,
  apiPushTripLocation,
  apiRateJob,
  apiRetrySearch,
  apiTransition,
  getCurrentPosition,
} from "@/lib/jobs/client";
import { AddressAutocomplete } from "@/components/map/address-autocomplete";
import type { PickedLocation } from "@/components/map/location-picker-map";
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
  nearbyProsStatusLine,
  PAIRING_WINDOW_MS,
  paymentEndsAtIso,
  PRO_TRIP_STATUS_COPY,
  satisfiedReleaseEndsAtIso,
  TRIP_STATUS_COPY,
} from "@/lib/jobs/constants";
import { negotiationUiStatus } from "@/lib/jobs/state-machine";
import type { DisputeReason, JobRecord } from "@/lib/jobs/types";
import { logPayGate } from "@/lib/pay-telemetry";
import { avatarInitials, DEFAULT_VENDOR_PHOTO } from "@/lib/brand";
import { tradeIconDataUrl } from "@/lib/map-trade-icons";
import {
  buildCustomerChargeMajor,
  formatMoney,
  fromMinorUnits,
  LABOUR_SPLIT_LINE_PRO,
} from "@/lib/pricing";
import {
  clearJobShown,
  isProPanelOnlyPairingStatus,
  requestForceIncomingPanel,
} from "@/lib/jobs/incoming-popup-timing";
import {
  homePathForForbidden,
  isForbiddenMessage,
} from "@/lib/navigation";
import { PRO_SERVICE_LABELS } from "@/lib/services";
import { useApp } from "@/lib/store";
import type { ServiceRequest } from "@/lib/types";
import { cn, firstNameOnly } from "@/lib/utils";

/** Decline reasons shown to a pro who cannot take a request (SSPE + legacy). */
const CANCEL_REASONS = [
  "Currently unavailable",
  "Too far away",
  "Busy with another customer",
  "Outside my service area",
  "Vehicle issue",
  "Emergency",
  "Other",
] as const;

/** ☰ header button (same look as the Dashboard) portaled into the phone shell.
 * Self-contained so opening the menu never re-renders the whole job screen. */
function HeaderMenu({ isLight }: { isLight: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [mount, setMount] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setMount(document.getElementById("ona-phone"));
  }, []);
  return (
    <>
      <button
        type="button"
        onClick={() => setMenuOpen(true)}
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border-0",
          isLight ? "bg-[#c8c9cd]" : "bg-black"
        )}
        style={{ backgroundColor: isLight ? "#c8c9cd" : "#000000" }}
        aria-label="Open menu"
        aria-expanded={menuOpen}
      >
        <Menu className="h-[18px] w-[18px]" strokeWidth={2.35} style={{ color: "#FF6B35" }} />
      </button>
      {mount &&
        createPortal(
          <AppMenu open={menuOpen} onClose={() => setMenuOpen(false)} />,
          mount
        )}
    </>
  );
}

/** Customer photos in a single non-scrolling row that shrinks to fit.
 *  Tapping a thumbnail opens a full-screen lightbox (arrows + swipe + counter),
 *  matching the incoming-job panel preview.
 *  When no job photos: show customer profile picture in the placeholder slot. */
function PhotoStrip({
  photos,
  isLight,
  profilePhotoUrl,
  profileName,
}: {
  photos: { id: string; url: string; name?: string | null }[];
  isLight: boolean;
  /** Customer profile picture — fills the image placeholder when no job photos */
  profilePhotoUrl?: string | null;
  profileName?: string | null;
}) {
  const [lightbox, setLightbox] = useState<{
    photos: { id: string; url: string; name?: string | null }[];
    index: number;
  } | null>(null);
  const touchX = useRef<number | null>(null);

  const displayPhotos =
    photos.length > 0
      ? photos
      : profilePhotoUrl?.trim()
        ? [
            {
              id: "customer-profile",
              url: profilePhotoUrl.trim(),
              name: profileName?.trim() || "Customer",
            },
          ]
        : [];

  if (!displayPhotos.length) {
    // Empty visual placeholder (initials) when no photo at all
    return (
      <div className="mt-1 flex items-stretch gap-1.5 overflow-hidden">
        <div
          className={cn(
            "flex h-20 w-20 shrink-0 items-center justify-center rounded-lg text-[18px] font-black",
            isLight ? "bg-black/10 text-slate-700" : "bg-white/12 text-white"
          )}
          aria-label="Customer photo placeholder"
        >
          {avatarInitials(profileName, "CU")}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="mt-1 flex items-stretch gap-1.5 overflow-hidden">
        {displayPhotos.map((p, i) => (
          <button
            key={p.id}
            type="button"
            aria-label={p.name || "View photo"}
            onClick={() => setLightbox({ photos: displayPhotos, index: i })}
            className="min-w-0 flex-1 basis-0 overflow-hidden rounded-lg border-0 p-0"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img loading="lazy" decoding="async"
              src={p.url}
              alt={p.name || "Job photo"}
              className="h-20 w-full object-cover"
            />
          </button>
        ))}
      </div>

      {lightbox && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90"
          role="dialog"
          aria-modal
          aria-label="Job photo"
          onClick={() => setLightbox(null)}
          onTouchStart={(e) => {
            touchX.current = e.touches[0].clientX;
          }}
          onTouchEnd={(e) => {
            const start = touchX.current;
            touchX.current = null;
            if (start == null) return;
            const dx = e.changedTouches[0].clientX - start;
            if (Math.abs(dx) < 48) return;
            setLightbox((lb) => {
              if (!lb) return lb;
              const dir = dx < 0 ? 1 : -1;
              return {
                ...lb,
                index: (lb.index + dir + lb.photos.length) % lb.photos.length,
              };
            });
          }}
        >
          <button
            type="button"
            aria-label="Close photo"
            onClick={() => setLightbox(null)}
            className={cn(
              "absolute right-4 top-[max(1rem,env(safe-area-inset-top))] rounded-full border-0 p-2 text-white",
              !isLight && "bg-white/10"
            )}
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
                    lb
                      ? { ...lb, index: (lb.index + 1) % lb.photos.length }
                      : lb
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
    </>
  );
}

/** Confirm-before-cancel bottom sheet (destructive action guard). */
function CancelConfirmSheet({
  open,
  isLight,
  onClose,
  onConfirm,
}: {
  open: boolean;
  isLight: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[500] flex items-end justify-center bg-black/50 p-3">
      <div
        className={cn(
          "w-full max-w-md overflow-hidden rounded-2xl shadow-2xl",
          isLight ? "bg-white" : "bg-[#1c1c1e]"
        )}
        role="dialog"
        aria-modal
        aria-label="Confirm cancel"
      >
        <div className="px-4 pb-2 pt-4">
          <p
            className={cn(
              "text-center text-[15px] font-black",
              isLight ? "text-slate-900" : "text-white"
            )}
          >
            Cancel this request?
          </p>
          <p
            className={cn(
              "mt-1 text-center text-[12px] font-medium",
              isLight ? "text-slate-500" : "text-white/55"
            )}
          >
            The request will be closed and the other party will be notified. Are
            you sure you want to cancel?
          </p>
        </div>
        <button
          type="button"
          onClick={onConfirm}
          className={cn(
            "flex h-12 w-full items-center justify-center border-0 text-[14px] font-bold text-red-500"
          )}
        >
          Yes, cancel
        </button>
        <button
          type="button"
          onClick={onClose}
          className={cn(
            "flex h-12 w-full items-center justify-center border-0 text-[14px] font-bold",
            isLight ? "text-slate-900" : "text-white"
          )}
        >
          Keep request
        </button>
      </div>
    </div>,
    document.getElementById("ona-phone") || document.body
  );
}

/** Prefer newer job snapshots so stale polls never undo Start trip etc. */
function isJobNewer(next: JobRecord, prev: JobRecord | null): boolean {
  if (!prev) return true;
  if (next.id !== prev.id) return true;
  const nt = Date.parse(next.updatedAt || "") || 0;
  const pt = Date.parse(prev.updatedAt || "") || 0;
  if (nt !== pt) return nt >= pt;
  // Same timestamp: allow forward status progression only
  const order = [
    "waiting_for_selected",
    "selected_review",
    "sequential_pairing",
    "waiting_for_pro",
    "reserved",
    "negotiating",
    "searching",
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
  const notif = useNotificationsOptional();
  const notifRef = useRef(notif);
  notifRef.current = notif;
  const {
    technicians,
    ensureChatForRequestAsync,
    visibleMessageThreads,
    userProfile,
    accountType,
    backendUserId,
    authReady,
    isAuthenticated,
    setCategory,
  } = useApp();
  const [job, setJob] = useState<JobRecord | null>(null);
  const jobRef = useRef<JobRecord | null>(null);
  /**
   * Job id actually in flight. Starts as the URL param; for `/jobs/new` it is
   * swapped to the real id the moment the background create resolves, so all
   * loaders/pollers pick up the real job without re-mounting.
   */
  const activeJobIdRef = useRef(jobId);
  useEffect(() => {
    activeJobIdRef.current = jobId;
  }, [jobId]);
  const [err, setErr] = useState<string | null>(null);
  const [redirecting, setRedirecting] = useState(false);
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

  const [retryingSearch, setRetryingSearch] = useState(false);
  /** Live pros of this trade in customer radius — pairing status under timer */
  const [nearbyLiveCount, setNearbyLiveCount] = useState<number | null>(null);
  /** Arrived / Work in progress: home-style swipe sheet */
  const [tripSheetExpanded, setTripSheetExpanded] = useState(false);
  const tripGestureY = useRef<number | null>(null);
  /** Pay screen: single Cancel → choose payment vs request */
  const [payCancelOpen, setPayCancelOpen] = useState(false);
  /** Pro cancel reason modal */
  const [showCancelReasons, setShowCancelReasons] = useState(false);
  const [cancelReason, setCancelReason] = useState<string | null>(null);
  /** Confirm-before-cancel: actor stored until the user confirms */
  const [confirmCancel, setConfirmCancel] = useState<{
    actor: "motorist" | "repair_pro";
  } | null>(null);
  /** Reroute notification overlay */
  const [rerouteAlert, setRerouteAlert] = useState<string | null>(null);

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

  /* Auto-close: terminal status → customer & pro both go straight to their
   * dashboard (no summary page). A pro whose request has been passed to another
   * pro stays on the explicit "Request passed on" screen (see SSPE block). */
  useEffect(() => {
    if (!job) return;
    const isPro = viewer === "repair_pro";
    // Exhausted requests (no pro available after all rounds) must keep showing
    // the explicit "No pro available / Request again" screen — including after
    // a refresh — instead of auto-closing to the dashboard.
    const isExhausted = job.statusHistory.some(
      (h) => h.by === "pairing_exhausted" || h.by === "reroute_exhausted"
    );
    if (isExhausted) return;
    if (isJobHistoryOnlyStatus(job.status)) {
      const path = window.location.pathname || "";
      if (path.startsWith("/jobs/")) {
        setRedirecting(true);
        router.replace(isPro ? "/dashboard" : "/");
      }
    }
  }, [job, viewer, router]);

  // Opening a job clears its pending Service Request notifications so the
  // unread badge (bell) doesn't stay stuck after the pro has read the request.
  useEffect(() => {
    if (!job || !notif) return;
    const ids = notif.notifications
      .filter((n) => !n.readAt && n.jobId === job.id)
      .map((n) => n.id);
    if (ids.length) void notif.markRead(ids);
  }, [job?.id, notif?.notifications, notif?.markRead]); // eslint-disable-line react-hooks/exhaustive-deps

  const REVIEW_MAX = 144;

  const commitJob = useCallback((next: JobRecord, force = false) => {
    setJob((prev) => {
      if (!force && prev && !isJobNewer(next, prev)) return prev;
      jobRef.current = next;
      return next;
    });
  }, []);

  // Instant paint: the help flow hands us the just-created job via
  // sessionStorage so the searching screen shows before the first GET.
  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(`ona-seed-job:${jobId}`);
      if (!raw) return;
      window.sessionStorage.removeItem(`ona-seed-job:${jobId}`);
      const seed = JSON.parse(raw) as JobRecord;
      if (seed?.id !== jobId) return;
      setJob((prev) => {
        if (prev && isJobNewer(prev, seed)) return prev;
        jobRef.current = seed;
        return seed;
      });
    } catch {
      /* ignore */
    }
  }, [jobId]);

  // `/jobs/new` two-phase: the help flow navigated here with the full request
  // payload instead of waiting on POST. Paint the searching screen from an
  // optimistic job instantly, then create the real job in the background.
  const isNewRequest = jobId === "new";
  const createdNewRef = useRef(false);
  useEffect(() => {
    if (!isNewRequest) return;
    try {
      const raw = window.sessionStorage.getItem("ona-new-request");
      if (!raw) {
        // Already created earlier this session (user refreshed mid-search):
        // point loaders at the real job id.
        const created = window.sessionStorage.getItem("ona-new-job:new");
        if (created) activeJobIdRef.current = created;
        return;
      }
      // A fresh pending request supersedes any previously-created mapping.
      window.sessionStorage.removeItem("ona-new-job:new");
      const payload = JSON.parse(raw) as Record<string, unknown>;
      const ts = new Date().toISOString();
      const optimistic: JobRecord = {
        id: `pending-${Math.random().toString(36).slice(2, 10)}`,
        motoristId: String(payload.motoristId ?? ""),
        motoristName: String(payload.motoristName ?? "Customer"),
        motoristPhoto: (payload.motoristPhoto as string | null) ?? null,
        motoristVehicle: (payload.motoristVehicle as string | null) ?? null,
        repairProId: "",
        repairProName: "",
        serviceType: String(payload.serviceType) as JobRecord["serviceType"],
        problem: String(payload.problem ?? ""),
        voiceNote: (payload.voiceNote as JobRecord["voiceNote"]) ?? null,
        photos: Array.isArray(payload.photos)
          ? (payload.photos as JobRecord["photos"])
          : [],
        status: "sequential_pairing",
        currency: String(payload.currency ?? "NGN") as JobRecord["currency"],
        proBaseMajor: null,
        agreedMajor: null,
        offers: [],
        negotiateEndsAt: ts,
        maxOffers: 6,
        locationLabel: String(payload.locationLabel ?? ""),
        motoristLocation: {
          lat: Number(payload.lat ?? 0),
          lng: Number(payload.lng ?? 0),
        },
        statusHistory: [
          { status: "sequential_pairing", at: ts, by: "motorist" },
        ],
        createdAt: ts,
        updatedAt: ts,
      };
      setJob((prev) => {
        if (prev) return prev;
        jobRef.current = optimistic;
        return optimistic;
      });
    } catch {
      /* ignore — fall back to the normal loading + poll path */
    }
  }, [isNewRequest]);

  // Background create once auth is ready; swap activeJobIdRef to the real id
  // so the existing poll/loader machinery takes over seamlessly. We stay on
  // /jobs/new — swapping the URL mid-search suspends the page (Suspense
  // "Loading…" flash).
  useEffect(() => {
    if (!isNewRequest) return;
    if (!authReady || !isAuthenticated) return;
    if (createdNewRef.current) return;
    createdNewRef.current = true;
    const create = async () => {
      try {
        const raw = window.sessionStorage.getItem("ona-new-request");
        if (!raw) return;
        const payload = JSON.parse(raw) as Record<string, unknown>;
        const res = await apiCreateJob(payload);
        if (!res.ok) {
          // Search screen stays visible with the error; Cancel returns home.
          setErr(res.message || "Could not send your request. Try again.");
          return;
        }
        // Record the real id so a refresh on /jobs/new still resolves to the
        // live job, then hand over to the poll machinery with no URL change.
        try {
          window.sessionStorage.setItem("ona-new-job:new", res.data.job.id);
        } catch {
          /* ignore */
        }
        window.sessionStorage.removeItem("ona-new-request");
        activeJobIdRef.current = res.data.job.id;
        commitJob(res.data.job, true);
      } catch {
        setErr("Could not send your request. Try again.");
      }
    };
    void create();
  }, [isNewRequest, authReady, isAuthenticated, commitJob]);

  const load = useCallback(async () => {
    // `/jobs/new`: the real job is created in the background; never GET while
    // it doesn't exist yet (a 404 would bounce us home before paint).
    const id = activeJobIdRef.current;
    if (!id || id === "new" || id.startsWith("pending-")) return;
    // Ensure JWT is present before first hit (local isAuthenticated can lag session)
    try {
      const { ensureAppSession } = await import("@/lib/supabase/session");
      await ensureAppSession({ waitForSessionMs: 4000 });
    } catch {
      /* continue — apiGetJob retries */
    }
    const res = await apiGetJob(id);
    if (!res.ok) {
      if (res.message === "Job not found") {
        const current = notifRef.current;
        if (current) {
          const ids = current.notifications
            .filter((n) => !n.readAt && n.jobId === id)
            .map((n) => n.id);
          if (ids.length) void current.markRead(ids);
        }
        router.replace(accountType === "professional" ? "/jobs" : "/");
        return;
      }
      // Never park on a Forbidden error screen — role home immediately
      if (isForbiddenMessage(res.message)) {
        router.replace(homePathForForbidden(accountType));
        return;
      }
      // Soft auth failure: keep spinner, let poll retry — don't stick forever
      const authish = /not authenticated|session|sign in|refresh/i.test(
        res.message
      );
      if (authish && !jobRef.current) {
        setErr(res.message);
        return;
      }
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
  }, [jobId, commitJob, stickyReleaseErr, accountType, router]); // eslint-disable-line react-hooks/exhaustive-deps

  // If Forbidden ever lands in UI state, leave immediately (no stuck screen)
  useEffect(() => {
    if (!err || !isForbiddenMessage(err)) return;
    setErr(null);
    router.replace(homePathForForbidden(accountType));
  }, [err, accountType, router]);

  // Pro pairing request = lower panel only. Never keep a full /jobs page.
  // Bounce to dashboard and force the incoming panel to open.
  useEffect(() => {
    if (viewer !== "repair_pro" || !job) return;
    if (!isProPanelOnlyPairingStatus(job.status)) return;
    try {
      clearJobShown(job.id, backendUserId || undefined);
      requestForceIncomingPanel(job.id);
    } catch {
      /* */
    }
    router.replace("/dashboard");
  }, [viewer, job?.id, job?.status, backendUserId, router]);

  // Telemetry: if `busy` sticks true > 5s every job CTA (incl. "Pay now to
  // book") renders disabled and taps do nothing. Log once so we can tell a
  // dead tap from a stuck-updating flag.
  useEffect(() => {
    if (!busy || !job) return;
    const t = window.setTimeout(() => {
      if (busy) {
        void logPayGate("busy-stuck", {
          jobId: job.id,
          status: job.status,
          viewer,
        });
      }
    }, 5000);
    return () => window.clearTimeout(t);
  }, [busy, job, viewer]);

  // Client backup: sweep overdue jobs + retry PENDING_SETTLEMENT payouts while open
  useEffect(() => {
    if (!authReady || !isAuthenticated) return;
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
    // PENDING_SETTLEMENT: poll moderately; otherwise rare backup only
    const intervalMs = pendingPayout ? 45_000 : 180_000;
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
    authReady,
    isAuthenticated,
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

  // Poll job state; faster while trip active / awaiting satisfaction.
  // Wait for authReady so we never hit /api/jobs with no Bearer after create→navigate.
  // While still loading (no job), poll every 2s so auth race recovers quickly.
  useEffect(() => {
    if (!authReady) return;
    if (!isAuthenticated) {
      setErr("Please sign in to view this job.");
      return;
    }
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      await load();
    };
    void tick();
    // Pairing must poll fast so customer picks up the same pairing_deadline
    // as the pro (pro popup was starting first with a 12s customer lag).
    const pairingLive =
      job &&
      (job.status === "waiting_for_selected" ||
        job.status === "selected_review" ||
        job.status === "sequential_pairing" ||
        job.status === "waiting_for_pro" ||
        job.status === "reserved");
    const ms = !job
      ? 2_000
      : pairingLive
        ? 2_500
        : job.status === "negotiating" ||
            job.status === "searching" ||
            job.status === "agreed"
          ? 8_000
          : job.status === "completed"
            ? 15_000
            : ["paid_booked", "en_route", "arrived", "in_progress"].includes(
                  job.status
                )
            ? 15_000
            : job.status === "released" || job.status === "satisfied"
              ? 45_000
              : 60_000;
    const id = window.setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      void tick();
    }, ms);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [load, job?.status, job, authReady, isAuthenticated]);

  // Realtime job row → customer/pro share the same pairing_deadline instantly
  // (fixes pro timer starting before customer ring updates).
  useEffect(() => {
    if (!authReady || !isAuthenticated || !actorId) return;
    let unsub: (() => void) | null = null;
    let cancelled = false;
    void import("@/lib/supabase/app-api").then(({ backendSubscribeJobs }) => {
      if (cancelled) return;
      unsub = backendSubscribeJobs(actorId, () => {
        void load();
      });
    });
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [authReady, isAuthenticated, actorId, load]);

  // Live nearby count for customer while pairing only (hide on Retry/expired).
  // Can increase mid-wave if more pros go Live in radius.
  useEffect(() => {
    const pairing =
      job &&
      viewer === "motorist" &&
      (job.status === "waiting_for_selected" ||
        job.status === "selected_review" ||
        job.status === "sequential_pairing" ||
        job.status === "waiting_for_pro" ||
        job.status === "reserved" ||
        job.status === "searching");
    if (!pairing || !job?.motoristLocation) {
      setNearbyLiveCount(null);
      return;
    }
    let cancelled = false;
    const lat = job.motoristLocation.lat;
    const lng = job.motoristLocation.lng;
    const radius =
      typeof job.radiusKm === "number" && job.radiusKm > 0
        ? job.radiusKm
        : 10;
    const trade = job.serviceType;
    const tick = async () => {
      try {
        const { backendFetchPros } = await import("@/lib/supabase/app-api");
        const list = await backendFetchPros({ lat, lng });
        if (cancelled) return;
        const n = list.filter((t) => {
          if (t.serviceType !== trade) return false;
          const d =
            typeof t.distanceKm === "number" && Number.isFinite(t.distanceKm)
              ? t.distanceKm
              : Infinity;
          return d <= radius + 0.75;
        }).length;
        setNearbyLiveCount(n);
      } catch {
        /* keep last count */
      }
    };
    void tick();
    const id = window.setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      void tick();
    }, 8_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [
    job?.id,
    job?.status,
    job?.motoristLocation?.lat,
    job?.motoristLocation?.lng,
    job?.radiusKm,
    job?.serviceType,
    viewer,
  ]);

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
  const calloutQuote = useJobCallout(job?.id);

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

  /**
   * Cancel request: close UI instantly (optimistic), API in background.
   * Avoids hanging on network for CANCEL during pairing / negotiate / agreed.
   */
  const cancelRequestInstant = useCallback(
    (actor: "motorist" | "repair_pro") => {
      const j = jobRef.current;
      if (!j) return;
      setConfirmCancel(null);
      setBusy(false);
      setErr(null);
      const ts = new Date().toISOString();
      commitJob(
        {
          ...j,
          status: "cancelled",
          pairingStage: null,
          pairingDeadline: null,
          updatedAt: ts,
          statusHistory: [
            ...(j.statusHistory || []),
            { status: "cancelled", at: ts, by: actor },
          ],
        },
        true
      );
      // Leave the screen immediately — no wait for server
      if (actor === "repair_pro") {
        router.replace("/dashboard");
      } else {
        setCategory("none");
        router.replace("/");
      }
      void apiTransition({
        jobId: j.id,
        event: "CANCEL",
        actor,
        actorId: actorId || undefined,
      })
        .then((res) => {
          if (res.ok) commitJob(res.data.job, true);
        })
        .catch(() => {
          /* optimistic cancel already applied */
        });
    },
    [actorId, commitJob, router]
  );

  const run = async (fn: () => Promise<{ ok: true; data: { job: JobRecord } } | { ok: false; message: string }>) => {
    setBusy(true);
    setErr(null);
    const prevStatus = jobRef.current?.status;
    try {
      const res = await fn();
      if (!res.ok) {
        // Raced SSPE action: the pairing sweep already moved this request on
        // (passed to another pro or expired). Reload so the UI shows the real
        // state — "Request passed on" / expired — instead of a bare error.
        if (
          /Request is not awaiting confirmation|Request is not open for this action|Not assigned to this request/i.test(
            res.message
          )
        ) {
          setErr(null);
          void load();
          return;
        }
        if (isForbiddenMessage(res.message)) {
          setErr(null);
          router.replace(homePathForForbidden(accountType));
          return;
        }
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

      // Detect reroute — pro cancelled and system found another
      const lastHistory = res.data.job.statusHistory?.at(-1);
      const hasReroute = lastHistory?.by?.startsWith("reroute:");
      const wasCancelled = res.data.job.statusHistory?.some(
        (h) => h.note?.startsWith("pro_declined")
      );
      if (hasReroute && wasCancelled && viewer === "motorist") {
        const note = res.data.job.statusHistory.find(
          (h) => h.note?.startsWith("pro_declined")
        );
        setRerouteAlert(note?.note || "pro_declined");
        return;
      }
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
      const msg = e instanceof Error ? e.message : "Something went wrong. Try again.";
      if (isForbiddenMessage(msg)) {
        setErr(null);
        router.replace(homePathForForbidden(accountType));
        return;
      }
      setErr(msg);
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
  if (redirecting) {
    return (
      <JobShell
        isLight={isLight}
        title="Job closed"
        compactHeader
        onBack={viewer === "repair_pro" ? () => router.replace("/dashboard") : () => router.replace("/")}
        rightSlot={<HeaderMenu isLight={isLight} />}
      >
        <p className={cn("px-0.5 pt-4 text-[14px] font-medium", ink)}>
          {JOB_CLOSED_MESSAGE}
        </p>
        <p className={cn("mt-2 text-[12px]", muted)}>Opening dashboard…</p>
      </JobShell>
    );
  }

  /* ─── EXPIRED — pure history, no action buttons ─── */
  if (job.status === "expired" || negStatus === "expired") {
    const isPro = viewer === "repair_pro";
    const tradeLabel =
      PRO_SERVICE_LABELS[job.serviceType as keyof typeof PRO_SERVICE_LABELS] ||
      "Repair Pro";
    const isRerouteExhausted = job.statusHistory.some(
      (h) => h.by === "reroute_exhausted" || h.by === "pairing_exhausted"
    );
    const retriesUsed = job.statusHistory.filter(
      (h) => h.by === "retry_search"
    ).length;
    const retriesLeft = Math.max(0, 3 - retriesUsed);
    const gaveUp = isRerouteExhausted && retriesLeft <= 0;

    const onRetry = async () => {
      if (retryingSearch || retriesLeft <= 0) return;
      setRetryingSearch(true);
      setErr(null);
      try {
        const { playAppSound } = await import("@/lib/sound-tone");
        playAppSound("request_new");
      } catch {
        /* */
      }
      // Stay on the same job shell — no navigation. Server restarts pairing and
      // dispatches the first of up to 6 pros in the customer radius immediately.
      const res = await apiRetrySearch(job.id);
      if (res.ok && res.data.job) {
        commitJob(res.data.job, true);
        setErr(null);
        // Immediate second fetch so pairing_deadline / waiting_for_pro paint without lag
        window.setTimeout(() => {
          void load();
        }, 200);
      } else if (!res.ok) {
        setErr(res.message || "Could not retry search");
      }
      setRetryingSearch(false);
    };

    return (
      <JobShell
        isLight={isLight}
        title={
          isRerouteExhausted
            ? `No ${tradeLabel} available`
            : "Negotiation expired"
        }
        compactHeader
        onBack={
          isPro
            ? () => router.push("/dashboard")
            : gaveUp
              ? () => router.replace("/")
              : goJobsList
        }
        rightSlot={<HeaderMenu isLight={isLight} />}
        footer={
          isPro || !isRerouteExhausted ? undefined : (
            <div className="space-y-2">
              {gaveUp ? (
                <CopperButton onClick={() => router.replace("/")}>
                  Back to Dashboard
                </CopperButton>
              ) : (
                <CopperButton
                  onClick={onRetry}
                  disabled={retryingSearch || retriesLeft <= 0}
                >
                  {retryingSearch ? "Searching…" : "Retry search"}
                </CopperButton>
              )}
            </div>
          )
        }
      >
        <p className={cn("px-0.5 pt-4 text-[14px] font-medium leading-relaxed", ink)}>
          {isRerouteExhausted
            ? isPro
              ? "This request was rerouted but no pro accepted in time."
              : gaveUp
                ? `No ${tradeLabel} found at this time. Request other help or try again later.`
                : "No Pro Available, retry search"
            : isPro
              ? `This request ended between you and ${job.motoristName}. No agreement was reached.`
              : `No agreement was reached with ${job.repairProName}.`}
        </p>
      </JobShell>
    );
  }

  /* ─── SCHEDULED — add-another-repair-pro (Tow) ───
   * A linked second request created at booking time, armed 60 min after the
   * first pro accepts. The sweep pinged the motorist to enter their current
   * address; this panel books the trade pro there.
   */
  if (job.status === "scheduled") {
    if (viewer === "repair_pro") {
      return (
        <JobShell isLight={isLight} title="Scheduled" compactHeader>
          <p
            className={cn(
              "px-0.5 pt-8 text-center text-[13px] font-medium",
              muted
            )}
          >
            Waiting to be dispatched
          </p>
        </JobShell>
      );
    }
    return (
      <ScheduledDispatchScreen
        job={job}
        isLight={isLight}
        onBack={goJobsList}
        onDispatched={(updated) => {
          setJob(updated);
          setErr(null);
        }}
        onError={(msg) => setErr(msg)}
      />
    );
  }

  /* ─── SSPE DISPATCH STATES ───
   * waiting_for_selected / selected_review / sequential_pairing /
   * waiting_for_pro / reserved. All countdowns render pairing_deadline
   * (display-only, D3) — the server sweep owns timing.
   * Repair Pro: full-page UI deleted for these — panel only (see useEffect).
   */
  if (
    job.status === "waiting_for_selected" ||
    job.status === "selected_review" ||
    job.status === "sequential_pairing" ||
    job.status === "waiting_for_pro" ||
    job.status === "reserved"
  ) {
    // Pro never sees this full page — redirect effect sends them to dashboard.
    if (viewer === "repair_pro") {
      return (
        <JobShell isLight={isLight} title="Service Request" compactHeader>
          <p className={cn("px-0.5 pt-8 text-center text-[13px] font-medium", muted)}>
            Opening request…
          </p>
        </JobShell>
      );
    }

    const deadline = job.pairingDeadline || null;
    const reviewing =
      job.status === "selected_review" || job.status === "reserved";
    const finding = job.status === "sequential_pairing";
    const proLabel = PRO_SERVICE_LABELS[job.serviceType] || job.serviceType;
    const nearbyLine =
      viewer === "motorist"
        ? nearbyProsStatusLine(
            nearbyLiveCount ?? 0,
            proLabel
          )
        : null;

    // Customer: sequential pairing actively pings pros → full search screen.
    if (viewer === "motorist" && finding) {
      return (
        <SearchingScreen
          job={job}
          viewer={viewer}
          backendUserId={backendUserId}
          isLight={isLight}
          err={err}
          onBack={goJobsList}
          nearbyLine={nearbyLine}
        />
      );
    }

    // Customer-only full page (pro uses lower panel exclusively)
    const title =
      job.status === "waiting_for_selected"
        ? `Waiting for ${proLabel}`
        : reviewing
          ? "Repair Pro reviewing your request"
          : `Finding a ${proLabel} near you`;

    const subtitle =
      job.status === "waiting_for_selected"
        ? `${firstNameOnly(
            job.repairProName === "Repair Pro" ? null : job.repairProName,
            proLabel
          )} has received your request and will respond shortly.`
        : reviewing
          ? "The Repair Pro is reviewing your request and will respond shortly."
          : finding
            ? "We’re finding another pro with the same skill."
            : "A pro is checking your request.";

    const body = (
      <div className="flex min-h-0 flex-col bg-transparent px-0.5 pt-1">
        <div className="shrink-0 space-y-3 bg-transparent">
          <div>
            <p className={cn("text-[11px] font-semibold uppercase tracking-wide", muted)}>
              Problem description
            </p>
            <p className={cn("mt-1 text-[15px] font-medium leading-relaxed", ink)}>
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
        </div>

        <div className="flex min-h-[40vh] flex-1 flex-col items-center justify-center bg-transparent py-5">
          {deadline && !finding ? (
            <CountdownTimer
              variant="ring"
              endsAt={deadline}
              totalMs={PAIRING_WINDOW_MS}
              onExpire={() => {
                // Keep the expired ring at 0s — do NOT null pairingDeadline
                // (that made the customer timer "skip" while pro already had
                // the next shared deadline). Run the LIGHT pairing sweep (no
                // 30s throttle like expire-stale), then load picks up the
                // next pro's pairing_deadline or expired/Retry without
                // blanking first.
                void (async () => {
                  try {
                    const { apiPairingSweep } = await import(
                      "@/lib/jobs/client"
                    );
                    await apiPairingSweep();
                  } catch {
                    /* */
                  }
                  await load();
                })();
              }}
              className={ink}
            />
          ) : (
            <div className="mb-4 h-10 w-10 animate-spin rounded-full border-2 border-[#FF6B35] border-t-transparent" />
          )}
          {viewer === "motorist" && nearbyLine ? (
            <p
              className={cn(
                "mt-3 max-w-[280px] text-center text-[13px] font-bold leading-snug",
                ink
              )}
            >
              {nearbyLine}
            </p>
          ) : null}
          <p
            className={cn(
              "mt-2 max-w-[280px] text-center text-[13px] font-semibold leading-snug",
              muted
            )}
          >
            {subtitle}
          </p>
        </div>
      </div>
    );

    const footer = (
      <div className="space-y-2">
        {err && (
          <p className="text-center text-[12px] font-semibold text-red-500">
            {err}
          </p>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => setConfirmCancel({ actor: "motorist" })}
          className={cn(
            "inline-flex h-11 w-full items-center justify-center rounded-md border-0 text-[13px] font-semibold",
            isLight
              ? "bg-black/10 text-slate-900"
              : "bg-[#2c2c2e] text-white"
          )}
        >
          Cancel request
        </button>
      </div>
    );

    return (
      <>
        <JobShell
          isLight={isLight}
          title={title}
          compactHeader
          onBack={goJobsList}
          footer={footer}
        >
          {body}
        </JobShell>

        <CancelConfirmSheet
          open={!!confirmCancel}
          isLight={isLight}
          onClose={() => setConfirmCancel(null)}
          onConfirm={() => {
            const a = confirmCancel;
            if (!a) return;
            cancelRequestInstant(a.actor);
          }}
        />
      </>
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

    return (
    <>
      <JobShell
        isLight={isLight}
        title={viewer === "repair_pro" ? "Service Request" : "Negotiate labour"}
        compactHeader
        onBack={goJobsList}
        backIcon={viewer === "motorist" ? <Minimize2 className="h-4 w-4" /> : undefined}
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
                        ? `Labour price (min ${formatMoney(MIN_OFFER_AMOUNT_MAJOR)})`
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
                          const msg = `Minimum service charge is ${formatMoney(MIN_OFFER_AMOUNT_MAJOR)}.`;
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
                setConfirmCancel({
                  actor: viewer === "repair_pro" ? "repair_pro" : "motorist",
                })
              }
            >
              Cancel request
            </button>
          </div>
        }
      >
        {/* Top: vehicle/service/problem + offers · Middle: ring timer */}
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
                  <JobProblemQA problem={job.problem} isLight={isLight} />
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
                <div>
                  <p
                    className={cn(
                      "text-[11px] font-semibold uppercase tracking-wide",
                      muted
                    )}
                  >
                    {job.photos.length > 0 ? "Customer photos" : "Customer"}
                  </p>
                  <PhotoStrip
                    photos={job.photos}
                    isLight={isLight}
                    profilePhotoUrl={job.motoristPhoto}
                    profileName={job.motoristName}
                  />
                </div>
              </div>
            ) : (
              <div className="bg-transparent">
                <p
                  className={cn(
                    "text-[11px] font-semibold uppercase tracking-wide",
                    muted
                  )}
                >
                  Problem description
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
                {job.photos.length > 0 && (
                  <div className="mt-2.5">
                    <p
                      className={cn(
                        "text-[11px] font-semibold uppercase tracking-wide",
                        muted
                      )}
                    >
                      Your photos
                    </p>
                    <PhotoStrip photos={job.photos} isLight={isLight} />
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
                  // Instant UI → expired; server expire in background
                  const j = jobRef.current;
                  if (j) {
                    const ts = new Date().toISOString();
                    commitJob(
                      {
                        ...j,
                        status: "expired",
                        updatedAt: ts,
                        statusHistory: [
                          ...(j.statusHistory || []),
                          { status: "expired", at: ts, by: "system" },
                        ],
                      },
                      true
                    );
                  }
                  void apiTransition({
                    jobId: job.id,
                    event: "EXPIRE_NEGOTIATION",
                    actor: "system",
                  })
                    .then((res) => {
                      if (res.ok) commitJob(res.data.job, true);
                    })
                    .catch(() => {
                      /* optimistic expired already applied */
                    });
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

      {/* Reroute notification overlay for motorist */}
      {rerouteAlert && viewer === "motorist" && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 pb-12">
          <div
            className={cn(
              "w-full max-w-[390px] rounded-t-2xl px-5 pb-6 pt-5",
              isLight ? "bg-[#c8c9cd]" : "bg-[#1c1c1e]"
            )}
          >
            <h2 className={cn("mb-2 text-[18px] font-bold", ink)}>
              Repair Pro Unavailable
            </h2>
            <p className={cn("mb-6 text-[14px] font-medium leading-relaxed", muted)}>
              The selected pro is currently unavailable and has declined your
              request. We&rsquo;re finding another pro with the same skill.
            </p>
            <CopperButton
              onClick={() => setRerouteAlert(null)}
            >
              Continue Searching
            </CopperButton>
          </div>
        </div>
      )}

      <CancelConfirmSheet
        open={!!confirmCancel}
        isLight={isLight}
        onClose={() => setConfirmCancel(null)}
        onConfirm={() => {
          const a = confirmCancel;
          if (!a) return;
          cancelRequestInstant(a.actor);
        }}
      />
    </>
    );
  }

  /* ─── SEARCHING (pro cancelled, finding another) ─── */
  if (job.status === "searching") {
    return (
      <SearchingScreen
        job={job}
        viewer={viewer}
        backendUserId={backendUserId}
        isLight={isLight}
        err={err}
        onBack={goJobsList}
        nearbyLine={
          viewer === "motorist"
            ? nearbyProsStatusLine(
                nearbyLiveCount ?? 0,
                PRO_SERVICE_LABELS[job.serviceType] || job.serviceType
              )
            : null
        }
      />
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
        : job.motoristPhoto || DEFAULT_VENDOR_PHOTO;
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
                  // Telemetry: a fired tap proves the CTA is clickable; a
                  // missing log means an overlay swallows the tap.
                  void logPayGate("pay-cta-tapped", {
                    jobId: job.id,
                    status: job.status,
                    hasPaymentSessionEndsAt: Boolean(
                      job.paymentSessionEndsAt
                    ),
                  });
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
                onClick={() => {
                  void logPayGate("pay-cancel-tapped", {
                    jobId: job.id,
                    status: job.status,
                  });
                  setPayCancelOpen(true);
                }}
                className={cn(
                  "inline-flex h-11 w-full items-center justify-center rounded-md border-0 text-[13px] font-semibold",
                  "relative z-10",
                  isLight
                    ? "bg-black/10 text-slate-900"
                    : "bg-[#2c2c2e] text-white"
                )}
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex w-full flex-col gap-2">
              <p
                className={cn(
                  "text-center text-[13px] font-semibold",
                  isLight ? "text-slate-700" : "text-[#c8c9cd]"
                )}
              >
                Waiting for customer to pay into escrow…
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirmCancel({ actor: "repair_pro" })}
                className={cn(
                  "inline-flex h-11 w-full items-center justify-center rounded-md border-0 text-[13px] font-semibold",
                  isLight
                    ? "bg-black/10 text-slate-900"
                    : "bg-[#2c2c2e] text-white"
                )}
              >
                Cancel request
              </button>
            </div>
          )
        }
      >
        <div className="mb-3 flex flex-col items-center py-3 text-center">
          <p className={cn("text-[26px] font-black tracking-tight", ink)}>
            {job.agreedMajor != null
              ? formatMoney(
                  viewer === "motorist"
                    ? composeCustomerPayableMajor(
                        buildCustomerChargeMajor(job.agreedMajor).totalMajor,
                        calloutQuote
                      ).totalMajor
                    : job.agreedMajor,
                  job.currency
                )
              : "Not set"}
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
          <div className="mt-2">
            <CalloutFeeLines
              quote={calloutQuote}
              currency={job.currency}
              ink={ink}
              muted={muted}
              compact
            />
          </div>
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
          createPortal(
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
                  cancelRequestInstant("motorist");
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
            </div>,
            document.getElementById("ona-phone") || document.body
          )
        ) : null}

        <CancelConfirmSheet
          open={!!confirmCancel}
          isLight={isLight}
          onClose={() => setConfirmCancel(null)}
          onConfirm={() => {
            const a = confirmCancel;
            if (!a) return;
            cancelRequestInstant(a.actor);
          }}
        />
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
    /** Short catalog trade — Mechanic, Vulcanizer, Tow, etc. */
    const tradeLabel =
      PRO_SERVICE_LABELS[job.serviceType] || job.serviceType || "Repair Pro";
    /**
     * Customer track-trip header: trade name, not generic "Repair Pro".
     * e.g. "Mechanic is OnTheRoad"
     */
    const trackTripTitle =
      viewer === "motorist" && job.status === "en_route"
        ? `${tradeLabel} is OnTheRoad`
        : copy.title;
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

    const arrivalOk = job.proLocation
      ? isWithinArrivalProximity(job.proLocation, job.motoristLocation).ok
      : false;
    const arrivedBlocked =
      nextPro?.event === "MARK_ARRIVED" && !arrivalOk;

    const proAdvance = async (
      event: "START_TRIP" | "MARK_ARRIVED" | "START_WORK" | "MARK_COMPLETED"
    ) => {
      if (event === "MARK_ARRIVED" && !arrivalOk) return;
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
          }
          if (event === "START_TRIP" || event === "MARK_ARRIVED") {
            setLocHint(
              "Location is limited. Enable GPS so we can confirm you are with the customer."
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
        <div className="mt-1">
          <CalloutFeeLines
            quote={calloutQuote}
            currency={job.currency}
            ink={ink}
            muted={muted}
            compact
          />
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
                disabled={busy || arrivedBlocked}
                onClick={() => void proAdvance(nextPro.event)}
              >
                {busy ? "Updating job…" : nextPro.label}
              </CopperButton>
            ) : (
              <StageButton
                isLight={isLight}
                disabled={busy || arrivedBlocked}
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
            {tradeLabel} is OnTheRoad
            {job.etaMinutes != null ? ` · ETA ${job.etaMinutes} min` : ""}
          </p>
        )}
        {viewer === "motorist" && job.status === "paid_booked" && (
          <button
            type="button"
            onClick={() => cancelRequestInstant("motorist")}
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
              onClick={() => cancelRequestInstant("motorist")}
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
      <>
        <JobShell
          isLight={isLight}
          title={trackTripTitle}
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

        {/* Reroute notification overlay for motorist */}
        {rerouteAlert && viewer === "motorist" && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 pb-12">
            <div
              className={cn(
                "w-full max-w-[390px] rounded-t-2xl px-5 pb-6 pt-5",
                isLight ? "bg-[#c8c9cd]" : "bg-[#1c1c1e]"
              )}
            >
              <h2 className={cn("mb-2 text-[18px] font-bold", ink)}>
                Repair Pro Unavailable
              </h2>
              <p className={cn("mb-6 text-[14px] font-medium leading-relaxed", muted)}>
                The selected pro is currently unavailable and has declined your
                request. We&rsquo;re finding another pro with the same skill.
              </p>
              <CopperButton
                onClick={() => setRerouteAlert(null)}
              >
                Continue Searching
              </CopperButton>
            </div>
          </div>
        )}
      </>
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
      // Optimistic: flip to pending_settlement instantly so the 6h auto-release
      // countdown and the static “Confirming…” disappear at swipe time. The
      // server is the source of truth; the re-fetch below reconciles (and on a
      // real hard failure the screen flips back to completed with the error).
      commitJob(
        {
          ...job,
          status: "satisfied",
          escrowStatus: "pending_settlement",
          satisfiedAt: new Date().toISOString(),
        },
        true
      );
      // Keep previous sticky until we know result
      void (async () => {
        try {
          const res = await apiTransition({
            jobId: job.id,
            event: "SATISFIED",
            actor: "motorist",
            actorId: motoristActor,
          });
          // Always re-fetch — release may have finished even if the response raced.
          try {
            const again = await apiGetJob(job.id);
            if (again.ok && again.data.job) {
              commitJob(again.data.job, true);
              if (!res.ok) {
                const j = again.data.job;
                if (
                  j.status === "released" ||
                  j.status === "satisfied" ||
                  j.releasedAt ||
                  j.escrowStatus === "released" ||
                  j.escrowStatus === "pending_settlement" ||
                  j.escrowStatus === "release_pending"
                ) {
                  setStickyReleaseErr(null);
                  setErr(null);
                  applyJob(j);
                  try {
                    const { playAppSound } = await import("@/lib/sound-tone");
                    playAppSound("success_soft");
                  } catch {
                    /* */
                  }
                  // Stay on job → review screen (do not bounce to dashboard).
                  return;
                }
              }
            }
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
          // Stay on this job shell → rating + text review, then completion.
          // (Do not router.replace dashboard — that skipped the review flow.)
        } catch (e) {
          // Abort/timeout: poll once more before showing failure.
          try {
            const again = await apiGetJob(job.id);
            if (again.ok && again.data.job) {
              const j = again.data.job;
              if (
                j.status === "released" ||
                j.status === "satisfied" ||
                j.releasedAt ||
                j.escrowStatus === "released" ||
                j.escrowStatus === "pending_settlement" ||
                j.escrowStatus === "release_pending"
              ) {
                setStickyReleaseErr(null);
                setErr(null);
                applyJob(j);
                return;
              }
            }
          } catch {
            /* */
          }
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
                isLight={isLight}
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
              </div>
            ) : null}
          {showSatisfiedCta && autoReleaseEndsAt ? (
            <div className="mt-4 px-1">
              <p className="mb-1 text-center text-[11px] font-semibold text-black">
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

  /* ─── PENDING SETTLEMENT (pro view only — customer goes to review first) ─── */
  if (
    isPayoutPendingSettlement(job) &&
    job.status !== "released" &&
    viewer === "repair_pro"
  ) {
    return (
      <JobShell
        isLight={isLight}
        title="Payout processing"
        compactHeader
        onBack={() => router.replace("/settings/payments")}
        footer={
          <button
            type="button"
            onClick={() => router.replace("/settings/payments")}
            className="inline-flex h-12 w-full items-center justify-center rounded-md border-0 bg-[#FF6B35] text-[14px] font-black text-white"
          >
            Payment status
          </button>
        }
      >
        <JobCard isLight={isLight} className="text-center">
          <Loader2 className="mx-auto h-12 w-12 animate-spin text-[#FF6B35]" />
          <p className={cn("mt-3 text-[17px] font-black", ink)}>
            Payout processing
          </p>
          <p className={cn("mt-2 text-[13px] leading-snug", muted)}>
            Your payout is being processed automatically. You’ll be notified
            when it’s released to your bank.
          </p>
          {job.agreedMajor != null ? (
            <p className={cn("mt-4 text-[22px] font-black tabular-nums", ink)}>
              {formatMoney(job.agreedMajor, job.currency)}
            </p>
          ) : null}
          <div className="mt-1">
            <CalloutFeeLines
              quote={calloutQuote}
              currency={job.currency}
              ink={ink}
              muted={muted}
              compact
            />
          </div>
        </JobCard>
      </JobShell>
    );
  }

  /* ─── RELEASED / SATISFIED → customer review, then job completion ─── */
  if (job.status === "released" || job.status === "satisfied") {
    // Only motorist rates the Repair Pro. Both sides can view the result.
    const hasRating = job.rating != null && job.rating > 0;
    const alreadyLeft = reviewLeft || hasRating;
    const displayRating = hasRating ? Number(job.rating) : rating;
    const displayNote = (job.ratingNote || "").trim();
    const reviewChars = reviewText.length;
    const payoutPending =
      isPayoutPendingSettlement(job) && job.status !== "released";

    const submitReview = async () => {
      if (viewer !== "motorist") return;
      if (!rating || rating < 1) {
        setErr("Tap a star rating first");
        return;
      }
      setBusy(true);
      setErr(null);
      const note = reviewText.trim().slice(0, REVIEW_MAX);
      // Save job-level rating (existing)
      const res = await apiRateJob({
        jobId: job.id,
        rating,
        note: note || undefined,
        actor: "motorist",
      });
      if (!res.ok) {
        setBusy(false);
        setErr(res.message || "Could not save review");
        return;
      }
      commitJob(res.data.job, true);
      // rateJob server path already publishes pro profile review aggregates.
      // Do not dual-write /api/reviews here (diverged stats).
      setReviewLeft(true);
      setFlash("Thanks for your review");
      window.setTimeout(() => setFlash(null), 2500);
      setBusy(false);
      try {
        const { playAppSound } = await import("@/lib/sound-tone");
        playAppSound("job_complete");
      } catch {
        /* */
      }
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
    /** Customer: stars + text first, then job completion ceremony. */
    const showReviewForm = viewer === "motorist" && !alreadyLeft;
    const showJobComplete =
      viewer === "motorist" ? alreadyLeft : true;

    return (
      <JobShell
        isLight={isLight}
        title={
          showReviewForm
            ? "Rate & review"
            : payoutPending
              ? "Job complete"
              : job.status === "released"
                ? "Job complete"
                : "Job complete"
        }
        compactHeader
        onBack={
          viewer === "repair_pro"
            ? () => router.replace("/settings/payments")
            : goHome
        }
        footer={
          <div className="flex w-full flex-col gap-2">
            {showReviewForm ? (
              <CopperButton
                disabled={busy || rating < 1}
                onClick={() => void submitReview()}
              >
                {busy ? "Saving…" : "Submit review"}
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
            {showJobComplete && viewer === "motorist" ? (
              <button
                type="button"
                onClick={() => router.replace("/dashboard")}
                className="inline-flex h-12 w-full items-center justify-center rounded-md border-0 bg-[#FF6B35] text-[14px] font-black text-white"
              >
                Done · Home
              </button>
            ) : null}
            {viewer === "repair_pro" ? (
              <button
                type="button"
                onClick={() => router.replace("/settings/payments")}
                className={cn(
                  "w-full text-center text-[12px] font-semibold",
                  muted
                )}
              >
                Payment status
              </button>
            ) : null}
          </div>
        }
      >
        {/* ── Step 1: customer review (stars + text) ── */}
        {showReviewForm ? (
          <div className="flex flex-col items-center px-2 pt-5 text-center">
            <p className={cn("text-[20px] font-black tracking-tight", ink)}>
              How was the job?
            </p>
            <p className={cn("mt-1.5 text-[13px] font-medium leading-snug", muted)}>
              Rate your {PRO_SERVICE_LABELS[job.serviceType] || "Repair Pro"} and
              leave a short review
            </p>
            {payoutPending ? (
              <p className="mt-3 rounded-md bg-[#FF6B35]/15 px-3 py-1.5 text-[11px] font-bold text-[#FF6B35]">
                Payment confirmed · payout processing
              </p>
            ) : (
              <p className="mt-3 rounded-md bg-emerald-500/15 px-3 py-1.5 text-[11px] font-bold text-emerald-600">
                Payment released
              </p>
            )}
            <div className="mt-8 w-full max-w-md text-left">
              <p className={cn("mb-3 text-center text-[14px] font-bold", ink)}>
                Star rating
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
                  rows={4}
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
              {err && (
                <p className="mt-3 text-center text-[12px] font-semibold text-red-500">
                  {err}
                </p>
              )}
            </div>
          </div>
        ) : (
          /* ── Step 2: job completion / execution complete ── */
          <div className="flex flex-col items-center px-2 pt-6 text-center">
            <CheckCircle2
              className="h-14 w-14 text-emerald-500"
              strokeWidth={1.75}
              aria-hidden
            />
            <p className={cn("mt-4 text-[22px] font-black tracking-tight", ink)}>
              Job complete
            </p>
            <p className={cn("mt-1.5 text-[13px] font-medium leading-snug", muted)}>
              {payoutPending
                ? "Thanks — your payment is confirmed. Payout is processing."
                : "Thanks — payment released and job closed."}
            </p>
            {job.agreedMajor != null && (
              <p
                className={cn(
                  "mt-3 text-[32px] font-black tabular-nums tracking-tight",
                  ink
                )}
              >
                {formatMoney(job.agreedMajor, job.currency)}
              </p>
            )}
            <p className={cn("mt-1 text-[12px] font-semibold", muted)}>
              Labour only
            </p>
            <div className="mt-1">
              <CalloutFeeLines
                quote={calloutQuote}
                currency={job.currency}
                ink={ink}
                muted={muted}
              />
            </div>

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

            <div className="mt-10 w-full max-w-md text-left">
              {hasRating || alreadyLeft ? (
                <>
                  <p className={cn("mb-3 text-center text-[14px] font-bold", ink)}>
                    {viewer === "repair_pro"
                      ? "Customer rating"
                      : "Your review"}
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
                  ) : viewer === "motorist" ? (
                    <p
                      className={cn(
                        "mt-3 text-center text-[12px] font-semibold",
                        muted
                      )}
                    >
                      No written review
                    </p>
                  ) : null}
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
                    : "Review saved."}
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
        )}

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
        viewer === "repair_pro" ? (
          <div className="space-y-2">
            <GhostButton
              isLight={isLight}
              onClick={() => router.push("/dashboard")}
            >
              Home
            </GhostButton>
          </div>
        ) : (
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
        )
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

/** Total reroute window a search can run before the request expires (3 minutes). */
const SEARCH_REROUTE_WINDOW_MS = 3 * 60_000;

function searchingEndsAtIso(job: JobRecord): string {
  let start = 0;
  for (const h of job.statusHistory || []) {
    if (h.status === "searching") {
      const t = Date.parse(h.at);
      if (Number.isFinite(t) && t > start) start = t;
    }
  }
  if (!start) start = Date.now();
  return new Date(start + SEARCH_REROUTE_WINDOW_MS).toISOString();
}

/**
 * "Add another repair pro" (Tow): a linked second request was created at
 * booking time and armed 60 min after the first pro accepts. The motorist was
 * pinged to enter their current address; this panel collects it and dispatches
 * the trade pro there (books the first pro immediately).
 */
function ScheduledDispatchScreen({
  job,
  isLight,
  onBack,
  onDispatched,
  onError,
}: {
  job: JobRecord;
  isLight: boolean;
  onBack: () => void;
  onDispatched: (job: JobRecord) => void;
  onError: (message: string) => void;
}) {
  const ink = isLight ? "text-slate-900" : "text-white";
  const muted = isLight ? "text-slate-700" : "text-white/75";
  const proLabel = PRO_SERVICE_LABELS[job.serviceType] || job.serviceType;
  const [picked, setPicked] = useState<PickedLocation | null>(null);
  const [auto, setAuto] = useState<{ lat: number; lng: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getCurrentPosition()
      .then((pos) => {
        if (!alive) return;
        setAuto({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      })
      .catch(() => {
        /* user can type the address instead */
      });
    return () => {
      alive = false;
    };
  }, []);

  const send = async () => {
    if (!picked) return;
    setBusy(true);
    setErr(null);
    const res = await apiDispatchScheduled({
      jobId: job.id,
      locationLabel: picked.label,
      lat: picked.lat,
      lng: picked.lng,
    });
    setBusy(false);
    if (!res.ok) {
      setErr(res.message || "Could not dispatch. Try again.");
      onError(res.message || "Could not dispatch. Try again.");
      return;
    }
    onDispatched(res.data.job);
  };

  return (
    <JobShell
      isLight={isLight}
      title={`Your ${proLabel} is ready`}
      compactHeader
      onBack={onBack}
      footer={
        <div className="space-y-2">
          {err && (
            <p className="text-center text-[12px] font-semibold text-red-500">
              {err}
            </p>
          )}
          <CopperButton disabled={busy || !picked} onClick={() => void send()}>
            {busy ? "Booking…" : "Send"}
          </CopperButton>
        </div>
      }
    >
      <div className="flex min-h-0 flex-col bg-transparent px-0.5 pt-1">
        <p
          className={cn(
            "text-[11px] font-semibold uppercase tracking-wide",
            muted
          )}
        >
          Your current address
        </p>
        <p className={cn("mt-1 text-[15px] font-medium leading-relaxed", ink)}>
          Enter where you are now — a {proLabel.toLowerCase()} will be
          dispatched to meet you there.
        </p>
        <div className="mt-3">
          <AddressAutocomplete
            className="-mx-3"
            value={picked}
            autoLocate={auto}
            onChange={setPicked}
          />
        </div>
        <div className="mt-4 shrink-0">
          <p
            className={cn(
              "text-[11px] font-semibold uppercase tracking-wide",
              muted
            )}
          >
            Job details
          </p>
          <p className={cn("mt-1 text-[13px] font-medium leading-snug", muted)}>
            {job.problem}
          </p>
        </div>
      </div>
    </JobShell>
  );
}

function SearchingScreen({
  job,
  viewer,
  backendUserId,
  isLight,
  err,
  onBack,
  nearbyLine,
}: {
  job: JobRecord;
  viewer: "motorist" | "repair_pro";
  backendUserId?: string | null;
  isLight: boolean;
  err: string | null;
  onBack: () => void;
  /** e.g. "2 Mechanics are near you" under the search feedback */
  nearbyLine?: string | null;
}) {
  const router = useRouter();
  const ink = isLight ? "text-slate-900" : "text-white";
  const muted = isLight ? "text-slate-700" : "text-white/75";
  const skillLabel =
    (PRO_SERVICE_LABELS[job.serviceType] || "Pro").replace(/\s*Pro$/i, "").trim() ||
    "Pro";
  const [idx, setIdx] = useState(0);
  const messages = useMemo(
    () => [
      `Searching for the nearest ${skillLabel} near you…`,
      `Checking ${skillLabel}s available right now…`,
      `Still looking for an available ${skillLabel}…`,
      `Widening the search to more ${skillLabel}s…`,
    ],
    [skillLabel]
  );
  useEffect(() => {
    const id = window.setInterval(
      () => setIdx((i) => (i + 1) % messages.length),
      2600
    );
    return () => window.clearInterval(id);
  }, [messages.length]);

  const cancelSearch = useCallback(
    (auto: boolean) => {
      // Pending (/jobs/new) has no server job yet — just go home, no CANCEL.
      if (job.id.startsWith("pending-")) {
        router.replace("/");
        return;
      }
      // Navigate first — no hang waiting on CANCEL network
      router.replace(auto ? `/requests/${job.id}` : "/");
      void apiTransition({
        jobId: job.id,
        event: "CANCEL",
        actor: "motorist",
        actorId: job.motoristId,
        reason: "motorist_cancelled_search",
      }).catch(() => {
        /* ignore */
      });
    },
    [job.id, job.motoristId, router]
  );

  // Manual cancel (user-initiated) — go home.
  const handleCancelSearch = useCallback(
    () => void cancelSearch(false),
    [cancelSearch]
  );

  // 3-minute auto-cancel timer → auto-close: customer to job details page.
  useEffect(() => {
    const t = window.setTimeout(
      () => void cancelSearch(true),
      SEARCH_REROUTE_WINDOW_MS
    );
    return () => window.clearTimeout(t);
  }, [cancelSearch]);

  // Pro never uses this full-page searching UI for requests — panel only
  if (viewer === "repair_pro") {
    router.replace("/dashboard");
    return (
      <JobShell isLight={isLight} title="Service Request" compactHeader>
        <p className={cn("px-0.5 pt-8 text-center text-[13px] font-medium", muted)}>
          Opening dashboard…
        </p>
      </JobShell>
    );
  }

  return (
    <JobShell
      isLight={isLight}
      title={`Finding ${skillLabel} near you`}
      compactHeader
      fullBleed
      fillBody
      onBack={onBack}
      backIcon={<Minimize2 className="h-4 w-4" />}
    >
      <div className="relative flex h-full min-h-0 flex-1 flex-col">
        {/* 60% — real Google Map anchored on the motorist location */}
        <div className="relative min-h-0 flex-[3]">
          <SearchingMap job={job} isLight={isLight} />
        </div>

        {/* 40% — bottom sheet with live searching feedback */}
        <div
          className={cn(
            "relative z-20 flex min-h-0 flex-[2] flex-col rounded-t-[1.5rem] px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2.5",
            "shadow-[0_-10px_30px_rgba(0,0,0,0.35)]",
            isLight ? "bg-[#c8c9cd] text-slate-900" : "bg-black text-white"
          )}
        >
          <div
            className={cn(
              "mx-auto h-1 w-10 shrink-0 rounded-full",
              isLight ? "bg-black/15" : "bg-white/20"
            )}
          />
          <p className="mt-3 text-center text-[10px] font-black uppercase tracking-[0.14em] text-[#FF6B35]">
            Searching for the nearest {skillLabel}
          </p>
          {nearbyLine ? (
            <p className={cn("mt-2 text-center text-[14px] font-bold", ink)}>
              {nearbyLine}
            </p>
          ) : null}
          <h2
            key={idx}
            className={cn(
              "mt-2 text-center text-[15px] font-bold leading-snug",
              ink
            )}
          >
            {messages[idx]}
          </h2>
          <div className="mt-auto pb-2">
            <button
              type="button"
              onClick={() => void handleCancelSearch()}
              className={cn(
                "h-11 w-full rounded-xl border-0 text-[13px] font-bold transition-colors",
                isLight
                  ? "bg-red-500/15 text-red-700 hover:bg-red-500/25"
                  : "bg-red-500/20 text-red-400 hover:bg-red-500/30"
              )}
            >
              Cancel Request
            </button>
          </div>
        </div>
      </div>
      {err && (
        <p className="mt-4 text-center text-[12px] font-medium text-red-500">
          {err}
        </p>
      )}
    </JobShell>
  );
}
