import type { DisputeReason, JobFlowStatus } from "@/lib/jobs/types";

/** Copper brand accent used in job UI */
export const JOB_COPPER = "#e07a3d";
export const JOB_NAVY = "#0f172a";

/** Negotiation window */
export const NEGOTIATE_WINDOW_MS = 10 * 60 * 1000;
export const MAX_NEGOTIATION_OFFERS = 3;

/** Motorist counter cannot go below this % of pro base */
export const MAX_DISCOUNT_PERCENT = 50;

/** GPS arrived verification threshold */
export const ARRIVAL_DISTANCE_METERS = 150;

/** Appeal window after first dispute decision */
export const APPEAL_WINDOW_MS = 48 * 60 * 60 * 1000;

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
    title: "Repair Pro is on the way",
    subtitle: "Heading to your location",
  },
  arrived: {
    title: "Repair Pro has arrived",
    subtitle: "They are at your location",
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
  paid_booked: {
    title: "Ready to go",
    subtitle: "Start trip when you leave for the motorist",
  },
  en_route: {
    title: "On the road",
    subtitle: "Drive to the motorist mark arrived when there",
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
    subtitle: "Waiting for motorist to confirm and release pay",
  },
  satisfied: {
    title: "Motorist confirmed",
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
