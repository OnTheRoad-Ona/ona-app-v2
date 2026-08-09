import type { DisputeReason, JobFlowStatus } from "@/lib/jobs/types";

/** Copper brand accent used in job UI */
export const JOB_COPPER = "#FF6B35";
export const JOB_NAVY = "#0f172a";

/**
 * Negotiation product rules (do not hardcode elsewhere).
 * See docs/ANTI_REGRESSION.md §5.
 */
/** Negotiation window — 20 minutes for price back-and-forth */
export const NEGOTIATE_WINDOW_MS = 20 * 60 * 1000;
/**
 * SSPE dispatch window — each pro has 66 seconds to Open a request before the
 * server sweep advances to the next ranked pro (see docs/SSPE_REFACTOR_PLAN.md).
 * Clients only render `pairing_deadline`; the server owns enforcement.
 */
export const PAIRING_WINDOW_MS = 66 * 1000;
/**
 * Max unique Live pro offers in one customer search wave. After this many
 * (or sooner if the Live pool is smaller), show Retry search. Not “6 retries”
 * of the same pro — one offer per pro, up to 6 pros per wave.
 */
export const MAX_PAIRING_OFFERS_PER_WAVE = 6;

/**
 * Customer pairing status line under the timer.
 * e.g. "1 Mechanic is near you" / "3 Mechanics are near you"
 */
export function nearbyProsStatusLine(
  count: number,
  tradeLabel: string
): string | null {
  if (count <= 0) return null;
  const base =
    String(tradeLabel || "pro")
      .replace(/\s*Pro$/i, "")
      .trim() || "pro";
  if (count === 1) return `1 ${base} is near you`;
  const plural = /s$/i.test(base) ? base : `${base}s`;
  return `${count} ${plural} are near you`;
}
/**
 * After a payment session starts (Pay / Pay again), customer has this long
 * to complete Flutterwave. Only a full unpaid window counts as one attempt.
 */
/** Open pay session length (11 minutes) — UI must match this, not a stale “20 min”. */
export const PAYMENT_WINDOW_MS = 11 * 60 * 1000;
/** Max unpaid payment windows before system cancels the booking */
export const MAX_PAYMENT_ATTEMPTS = 3;

/** statusHistory.by markers for pay-to-book lifecycle */
export const PAY_HISTORY = {
  SESSION_START: "payment_session_start",
  /** Customer closed/cancelled Flutterwave — does NOT count as an attempt; timer restarts on next Pay */
  SESSION_CANCELLED: "payment_session_cancelled",
  WINDOW_EXPIRED: "payment_window_expired",
  MAX_ATTEMPTS_CANCEL: "payment_max_attempts_cancel",
} as const;
/** Max total price offers (pro + motorist combined), up to 6 rounds */
export const MAX_NEGOTIATION_OFFERS = 6;
/**
 * Minimum service charge (major units, ₦).
 * Ensures pro 87.5% ≥ Flutterwave’s ₦100 bank-transfer minimum
 * (120 × 0.875 = 105) so payouts never stick on micro-amounts.
 */
export const MIN_OFFER_AMOUNT_MAJOR = 120;
export const MAX_OFFER_DIGITS = 6;
export const MAX_OFFER_AMOUNT_MAJOR = 999_999;

/** Motorist counter cannot go below this % of pro base */
export const MAX_DISCOUNT_PERCENT = 50;

/** GPS arrived verification threshold */
export const ARRIVAL_DISTANCE_METERS = 150;

/** Appeal window after first dispute decision */
export const APPEAL_WINDOW_MS = 48 * 60 * 60 * 1000;

/**
 * After payment (Booked), job must reach completed within this window.
 * Otherwise auto-cancel + full refund to customer.
 * Timer starts at paidAt (PAYMENT_SUCCESS → paid_booked).
 */
export const BOOKED_COMPLETION_WINDOW_MS = 6 * 60 * 60 * 1000;

/**
 * After Repair Pro marks job complete: if customer neither taps
 * “I am Satisfied” nor opens a dispute within this window,
 * escrow auto-releases (pro 87.5% · Ona 5% · VAT 7.5% on FLW).
 * Timer starts at first `completed` status history entry.
 */
export const COMPLETED_AUTO_RELEASE_WINDOW_MS = 6 * 60 * 60 * 1000;

/** Persistent “I’m Satisfied” card buzz interval while completed + unpaid release */
export const SATISFIED_REMINDER_INTERVAL_MS = 60 * 60 * 1000;

/** Statuses that are still “open” after payment and subject to the 6h rule */
export const BOOKED_AUTO_CANCEL_STATUSES = [
  "paid_booked",
  "en_route",
  "arrived",
  "in_progress",
] as const;

export type BookedAutoCancelStatus =
  (typeof BOOKED_AUTO_CANCEL_STATUSES)[number];

export function isBookedAutoCancelStatus(
  status: string | null | undefined
): status is BookedAutoCancelStatus {
  return (BOOKED_AUTO_CANCEL_STATUSES as readonly string[]).includes(
    String(status || "")
  );
}

/**
 * When payment hit the clock for the 6h completion window.
 * Prefer paidAt; else first paid_booked history entry.
 */
export function bookedPaymentStartMs(job: {
  paidAt?: string | null;
  status?: string;
  updatedAt?: string;
  createdAt?: string;
  statusHistory?: { status: string; at: string }[];
}): number | null {
  if (job.paidAt) {
    const t = new Date(job.paidAt).getTime();
    if (Number.isFinite(t)) return t;
  }
  const hit = job.statusHistory?.find((h) => h.status === "paid_booked");
  if (hit?.at) {
    const t = new Date(hit.at).getTime();
    if (Number.isFinite(t)) return t;
  }
  // Legacy rows without paid_at: only if still sitting on Booked
  if (job.status === "paid_booked" && job.updatedAt) {
    const t = new Date(job.updatedAt).getTime();
    if (Number.isFinite(t)) return t;
  }
  return null;
}

/** True when paid job is still mid-trip and past 6h from payment */
export function isBookedPastCompletionDeadline(
  job: {
    status: string;
    paidAt?: string | null;
    statusHistory?: { status: string; at: string }[];
  },
  nowMs: number = Date.now()
): boolean {
  if (!isBookedAutoCancelStatus(job.status)) return false;
  const start = bookedPaymentStartMs(job);
  if (start == null) return false;
  return nowMs - start >= BOOKED_COMPLETION_WINDOW_MS;
}

type Hist = { status: string; at: string; by?: string };

/** How many unpaid 20‑min windows have expired on this job */
export function paymentWindowsExpiredCount(job: {
  statusHistory?: Hist[];
  paymentAttemptCount?: number;
}): number {
  if (typeof job.paymentAttemptCount === "number" && job.paymentAttemptCount >= 0) {
    return Math.min(MAX_PAYMENT_ATTEMPTS, job.paymentAttemptCount);
  }
  return (job.statusHistory || []).filter(
    (h) => h.by === PAY_HISTORY.WINDOW_EXPIRED
  ).length;
}

/**
 * Open pay session = last payment_session_start with no later
 * cancel / window_expired / paid_booked.
 * Closing Flutterwave (SESSION_CANCELLED) ends the session so the next Pay gets a fresh payment window.
 */
export function getOpenPaymentSessionStartMs(job: {
  status?: string;
  statusHistory?: Hist[];
}): number | null {
  if (job.status !== "agreed") return null;
  const hist = [...(job.statusHistory || [])].sort(
    (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()
  );
  let openStart: number | null = null;
  for (const h of hist) {
    if (h.by === PAY_HISTORY.SESSION_START) {
      const t = new Date(h.at).getTime();
      if (Number.isFinite(t)) openStart = t;
    }
    if (
      h.by === PAY_HISTORY.SESSION_CANCELLED ||
      h.by === PAY_HISTORY.WINDOW_EXPIRED ||
      h.by === PAY_HISTORY.MAX_ATTEMPTS_CANCEL ||
      h.status === "paid_booked" ||
      h.status === "cancelled" ||
      h.status === "released"
    ) {
      openStart = null;
    }
  }
  return openStart;
}

/**
 * When the current pay-to-book window started.
 * Prefer open payment_session_start; else null (no active countdown until Pay).
 */
export function agreedPaymentStartMs(job: {
  status?: string;
  updatedAt?: string;
  createdAt?: string;
  statusHistory?: Hist[];
}): number | null {
  return getOpenPaymentSessionStartMs(job);
}

/** ISO end of open Flutterwave session, or null if none open (cancelled = no timer) */
export function paymentEndsAtIso(job: {
  status?: string;
  updatedAt?: string;
  createdAt?: string;
  statusHistory?: Hist[];
  paymentSessionEndsAt?: string | null;
}): string | null {
  if (job.status !== "agreed") return null;
  // Must have an open session; cancelled pay clears this even if endsAt was cached
  const start = getOpenPaymentSessionStartMs(job);
  if (start == null) return null;
  if (job.paymentSessionEndsAt) {
    const t = new Date(job.paymentSessionEndsAt).getTime();
    if (Number.isFinite(t) && t > start) return job.paymentSessionEndsAt;
  }
  return new Date(start + PAYMENT_WINDOW_MS).toISOString();
}

/** True when an open pay session has passed PAYMENT_WINDOW_MS unpaid */
export function isAgreedPastPaymentDeadline(
  job: {
    status: string;
    updatedAt?: string;
    createdAt?: string;
    statusHistory?: Hist[];
    paymentSessionEndsAt?: string | null;
  },
  nowMs: number = Date.now()
): boolean {
  if (job.status !== "agreed") return false;
  const ends = paymentEndsAtIso(job);
  if (!ends) return false;
  return nowMs >= new Date(ends).getTime();
}

/** Attempts remaining before auto-cancel (0 = next expiry cancels) */
export function paymentAttemptsRemaining(job: {
  statusHistory?: Hist[];
  paymentAttemptCount?: number;
}): number {
  return Math.max(
    0,
    MAX_PAYMENT_ATTEMPTS - paymentWindowsExpiredCount(job)
  );
}

/**
 * When pro marked the job complete (start of 6h satisfaction window).
 * Prefer first `completed` history entry; else updatedAt while completed.
 */
export function completedAtMs(job: {
  status?: string;
  updatedAt?: string;
  statusHistory?: { status: string; at: string }[];
}): number | null {
  const hits = (job.statusHistory || []).filter((h) => h.status === "completed");
  if (hits.length) {
    hits.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
    const t = new Date(hits[0]!.at).getTime();
    if (Number.isFinite(t)) return t;
  }
  if (job.status === "completed" && job.updatedAt) {
    const t = new Date(job.updatedAt).getTime();
    if (Number.isFinite(t)) return t;
  }
  return null;
}

/** ISO end of “I’m Satisfied” window, or null if not completed */
export function satisfiedReleaseEndsAtIso(job: {
  status?: string;
  updatedAt?: string;
  statusHistory?: { status: string; at: string }[];
}): string | null {
  if (job.status !== "completed") return null;
  const start = completedAtMs(job);
  if (start == null) return null;
  return new Date(start + COMPLETED_AUTO_RELEASE_WINDOW_MS).toISOString();
}

/**
 * True when job is completed, still awaiting customer satisfaction,
 * and past the 6h auto-release deadline (no dispute — caller must ensure).
 */
export function isCompletedPastAutoReleaseDeadline(
  job: {
    status: string;
    updatedAt?: string;
    statusHistory?: { status: string; at: string }[];
    dispute?: { status?: string } | null;
  },
  nowMs: number = Date.now()
): boolean {
  // Only while still `completed`. Open dispute moves status → disputed (frozen).
  if (job.status !== "completed") return false;
  // Any open/under-appeal dispute freezes auto-release until admin resolves
  // (pro favour → release, customer favour → refund).
  if (job.dispute) {
    const ds = String(job.dispute.status || "").toLowerCase();
    if (ds !== "resolved" && ds !== "final") return false;
  }
  const start = completedAtMs(job);
  if (start == null) return false;
  return nowMs - start >= COMPLETED_AUTO_RELEASE_WINDOW_MS;
}

/**
 * True when customer still needs the “I am Satisfied” UI.
 * Only hide when payout truly finished — not a false satisfiedAt stamp.
 */
export function needsCustomerReleaseConfirm(job: {
  id?: string;
  status?: string;
  motoristId?: string;
  satisfiedAt?: string | null;
  releasedAt?: string | null;
  escrowStatus?: string | null;
}): boolean {
  if (!job.id) return false;
  if (job.status === "released" || job.status === "satisfied") return false;
  if (job.status === "refunded" || job.status === "cancelled" || job.status === "expired")
    return false;
  if (job.status !== "completed") return false;
  if (job.releasedAt) return false;
  // Customer already confirmed — payout may be pending settlement (auto-retry)
  if (job.satisfiedAt) return false;
  const esc = String(job.escrowStatus || "").toLowerCase();
  if (
    esc === "released" ||
    esc === "refunded" ||
    esc === "pending_settlement" ||
    esc === "release_pending"
  ) {
    return false;
  }
  return true;
}

/**
 * True only while payout is actively auto-retrying.
 * Do NOT treat cancelled/held/satisfied as “processing forever” — that left the
 * UI stuck on the spinner even after FLW paid the pro (or admin cancelled).
 */
export function isPayoutPendingSettlement(job: {
  status?: string;
  releasedAt?: string | null;
  escrowStatus?: string | null;
  satisfiedAt?: string | null;
}): boolean {
  if (job.releasedAt) return false;
  if (job.status === "released") return false;
  const esc = String(job.escrowStatus || "").toLowerCase();
  if (esc === "released" || esc === "refunded") return false;
  // Spinner only for active settlement queue — not held/cancelled
  return esc === "pending_settlement" || esc === "release_pending";
}

/** Platform / pro split on release */
/** Ona platform fee share of service charge S (VAT 7.5% is held on FLW separately). */
export const PLATFORM_FEE_PERCENT = 5;
/**
 * @deprecated Misleading name — pro net is 87.5% of S (not 95%).
 * Prefer PRO_NET_PAYOUT_PERCENT from @/lib/pricing (0.875).
 * Kept numeric only for legacy readers; do not use for new math.
 */
export const PRO_PAYOUT_PERCENT = 87.5;

export const DISPUTE_REASONS: {
  id: DisputeReason;
  label: string;
}[] = [
  { id: "work_incomplete", label: "Work not done / incomplete" },
  { id: "poor_quality", label: "Poor quality" },
  { id: "wrong_service", label: "Wrong service" },
  { id: "no_show", label: "No-show" },
  { id: "price_disagreement", label: "Price disagreement" },
  { id: "other", label: "Other" },
];

export const TRIP_STATUS_COPY: Partial<
  Record<JobFlowStatus, { title: string; subtitle: string }>
> = {
  paid_booked: {
    title: "Booked",
    subtitle: "Repair Pro will start the trip soon",
  },
  en_route: {
    title: "Repair Pro is OnTheRoad",
    subtitle: "Heading to your location",
  },
  arrived: {
    title: "Repair Pro has arrived",
    subtitle: "",
  },
  in_progress: {
    title: "Work in progress",
    subtitle: "Job in progress — on site",
  },
  completed: {
    title: "Confirm Job & Release Payment",
    subtitle:
      "Release payment, open a dispute, or auto-release after 6 hours — job cannot be closed",
  },
  satisfied: {
    title: "Thank you",
    subtitle: "Releasing funds to Repair Pro",
  },
  released: {
    title: "Payment released",
    subtitle: "87.5% to Repair Pro · 5% Ona · 7.5% VAT on FLW",
  },
  disputed: {
    title: "Dispute active",
    subtitle: "Funds stay locked until resolution",
  },
  under_appeal: {
    title: "Under appeal",
    subtitle: "Senior review in progress · funds locked",
  },
};

/** Repair Pro–facing titles (same statuses, clear action feedback) */
export const PRO_TRIP_STATUS_COPY: Partial<
  Record<JobFlowStatus, { title: string; subtitle: string }>
> = {
  negotiating: {
    title: "Service Request",
    subtitle: "Review the job and send or accept a labour price",
  },
  agreed: {
    title: "Price agreed",
    subtitle: "Waiting for customer payment",
  },
  paid_booked: {
    title: "Ready to go",
    subtitle: "",
  },
  en_route: {
    title: "OnTheRoad",
    subtitle: "Drive to the customer · mark arrived when there",
  },
  arrived: {
    title: "You’ve arrived",
    subtitle: "Start work when you begin the repair",
  },
  in_progress: {
    title: "Work in progress",
    subtitle: "Mark complete when the job is done",
  },
  completed: {
    title: "Job marked complete",
    subtitle: "Waiting for customer to confirm and release pay",
  },
  satisfied: {
    title: "Customer confirmed",
    subtitle: "Releasing your payout",
  },
  released: {
    title: "Payment released",
    subtitle: "87.5% to you · 5% Ona · 7.5% VAT on FLW",
  },
  disputed: {
    title: "Dispute active",
    subtitle: "Funds stay locked until resolution",
  },
  under_appeal: {
    title: "Under appeal",
    subtitle: "Senior review in progress funds locked",
  },
};

export const ACTIVE_TRACKING_STATUSES: JobFlowStatus[] = [
  "paid_booked",
  "en_route",
  "arrived",
  "in_progress",
];

export const DISPUTABLE_STATUSES: JobFlowStatus[] = [
  "paid_booked",
  "en_route",
  "arrived",
  "in_progress",
  "completed",
  "satisfied",
  /** Closed jobs: only within POST_RELEASE_DISPUTE_WINDOW_MS of satisfiedAt */
  "released",
];

/** After I’m Satisfied (incl. pending settlement), either party may dispute for 48h */
export const POST_RELEASE_DISPUTE_WINDOW_MS = 48 * 60 * 60 * 1000;

export const TERMINAL_STATUSES: JobFlowStatus[] = [
  "released",
  "refunded",
  "cancelled",
  "expired",
];

/**
 * Can open a dispute now?
 * - Active job statuses: yes
 * - released/satisfied: only within 48h of satisfiedAt
 */
export function canOpenDisputeNow(job: {
  status?: string;
  satisfiedAt?: string | null;
  releasedAt?: string | null;
  dispute?: { status?: string } | null;
  nowMs?: number;
}): boolean {
  const status = String(job.status || "");
  if (job.dispute) {
    const ds = String(job.dispute.status || "").toLowerCase();
    if (ds && ds !== "resolved" && ds !== "final") return false;
  }
  if (
    status === "paid_booked" ||
    status === "en_route" ||
    status === "arrived" ||
    status === "in_progress" ||
    status === "completed"
  ) {
    return true;
  }
  if (status === "satisfied" || status === "released") {
    const start = job.satisfiedAt
      ? Date.parse(job.satisfiedAt)
      : job.releasedAt
        ? Date.parse(job.releasedAt)
        : NaN;
    if (!Number.isFinite(start)) return false;
    const now = job.nowMs ?? Date.now();
    return now - start <= POST_RELEASE_DISPUTE_WINDOW_MS;
  }
  return false;
}

/** Negotiation timer not running until pro accepts (“I can fix this”) */
export function isNegotiationTimerArmed(job: {
  negotiateEndsAt?: string | null;
  statusHistory?: { by?: string; status?: string }[];
  offers?: unknown[];
}): boolean {
  // Armed when ends-at is in the near future window (not far sentinel)
  const ends = job.negotiateEndsAt ? Date.parse(job.negotiateEndsAt) : NaN;
  if (!Number.isFinite(ends)) return false;
  // Sentinel: > 30 days from now means “not started”
  if (ends - Date.now() > 30 * 24 * 60 * 60 * 1000) return false;
  // Or explicitly started
  if (
    job.statusHistory?.some(
      (h) =>
        h.by === "pro_can_fix" ||
        h.by === "negotiation_timer_start"
    )
  ) {
    return true;
  }
  // First pro offer also arms
  if (Array.isArray(job.offers) && job.offers.length > 0) return true;
  // If end is within negotiate window * 2 of now, treat as armed
  return ends - Date.now() <= NEGOTIATE_WINDOW_MS * 2;
}
