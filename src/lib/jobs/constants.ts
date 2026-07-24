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
/** Max total price offers (pro + motorist combined), up to 6 rounds */
export const MAX_NEGOTIATION_OFFERS = 6;
/** Price cannot be 0; max 6 numeric characters (e.g. 999999) */
export const MIN_OFFER_AMOUNT_MAJOR = 1;
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

/** Platform / pro split on release */
export const PLATFORM_FEE_PERCENT = 5;
export const PRO_PAYOUT_PERCENT = 95;

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
    subtitle: "Your vehicle is being fixed",
  },
  completed: {
    title: "Job completed",
    subtitle: "Confirm you are satisfied to release payment",
  },
  satisfied: {
    title: "Thank you",
    subtitle: "Releasing funds to Repair Pro",
  },
  released: {
    title: "Payment released",
    subtitle: "95% to Repair Pro · 5% platform",
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
    title: "New Request",
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
    subtitle: "95% to you 5% platform",
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
];

export const TERMINAL_STATUSES: JobFlowStatus[] = [
  "released",
  "refunded",
  "cancelled",
  "expired",
];
