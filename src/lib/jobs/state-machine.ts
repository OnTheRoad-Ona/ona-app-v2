/**
 * Pure escrow job state machine — no I/O.
 * Enforces legal transitions for Ona premium job flow.
 */

import type { JobFlowStatus, OfferSide } from "@/lib/jobs/types";
import {
  DISPUTABLE_STATUSES,
  MAX_DISCOUNT_PERCENT,
  MAX_NEGOTIATION_OFFERS,
  MAX_OFFER_AMOUNT_MAJOR,
  MIN_OFFER_AMOUNT_MAJOR,
} from "@/lib/jobs/constants";

export type TransitionActor = "motorist" | "repair_pro" | "system" | "admin";

export type TransitionEvent =
  | { type: "EXPIRE_NEGOTIATION" }
  | { type: "CANCEL"; by: TransitionActor; reason?: "pro_declined" | string }
  | { type: "ACCEPT_OFFER"; by: TransitionActor }
  | { type: "PAYMENT_SUCCESS" }
  | { type: "START_TRIP" } // pro → en_route
  | { type: "MARK_ARRIVED" }
  | { type: "START_WORK" }
  | { type: "MARK_COMPLETED" }
  | { type: "SATISFIED" } // motorist → release path
  | { type: "RELEASE" } // system after satisfied
  /** Repair Pro tapped “I can fix this” — starts 20 min negotiate clock */
  | { type: "START_NEGOTIATION" }
  | { type: "OPEN_DISPUTE"; by: "motorist" | "repair_pro" }
  | { type: "RESOLVE_DISPUTE"; outcome: "release" | "refund" | "split" }
  | { type: "OPEN_APPEAL"; by: "motorist" | "repair_pro" }
  | { type: "RESOLVE_APPEAL"; outcome: "release" | "refund" | "split" }
  | { type: "REFUND" };

const ALLOWED: Record<JobFlowStatus, Partial<Record<TransitionEvent["type"], JobFlowStatus>>> = {
  negotiating: {
    ACCEPT_OFFER: "agreed",
    EXPIRE_NEGOTIATION: "expired",
    CANCEL: "searching",
    START_NEGOTIATION: "negotiating",
  },
  searching: {
    START_NEGOTIATION: "negotiating",
    EXPIRE_NEGOTIATION: "expired",
    CANCEL: "cancelled",
  },
  agreed: {
    PAYMENT_SUCCESS: "paid_booked",
    CANCEL: "cancelled",
  },
  paid_booked: {
    START_TRIP: "en_route",
    CANCEL: "cancelled",
    OPEN_DISPUTE: "disputed",
  },
  en_route: {
    MARK_ARRIVED: "arrived",
    OPEN_DISPUTE: "disputed",
    CANCEL: "cancelled",
  },
  arrived: {
    START_WORK: "in_progress",
    /** Allow finish without separate “Start work” so customer gets I’m Satisfied sooner */
    MARK_COMPLETED: "completed",
    OPEN_DISPUTE: "disputed",
    /** System 6h auto-cancel or motorist cancel → full refund */
    CANCEL: "cancelled",
  },
  in_progress: {
    MARK_COMPLETED: "completed",
    OPEN_DISPUTE: "disputed",
    CANCEL: "cancelled",
  },
  completed: {
    /** Customer confirms → pro 87.5% · Ona 5% · VAT 7.5% on FLW */
    SATISFIED: "satisfied",
    /** Dispute freezes 6h auto-release until admin resolve (release or refund) */
    OPEN_DISPUTE: "disputed",
    // No CANCEL — after pro marks complete, only Release / Dispute / 6h auto-release
  },
  satisfied: {
    RELEASE: "released",
    OPEN_DISPUTE: "disputed",
  },
  released: {
    OPEN_DISPUTE: "disputed",
  },
  cancelled: {},
  expired: {},
  disputed: {
    RESOLVE_DISPUTE: "released", // patched by outcome
    OPEN_APPEAL: "under_appeal",
  },
  under_appeal: {
    RESOLVE_APPEAL: "released",
  },
  refunded: {},
};

export function canTransition(
  from: JobFlowStatus,
  event: TransitionEvent
): boolean {
  if (event.type === "OPEN_DISPUTE") {
    return DISPUTABLE_STATUSES.includes(from);
  }
  if (event.type === "RESOLVE_DISPUTE" && from === "disputed") {
    return true;
  }
  if (event.type === "RESOLVE_APPEAL" && from === "under_appeal") {
    return true;
  }
  if (event.type === "REFUND") {
    return from === "paid_booked" || from === "en_route" || from === "disputed" || from === "under_appeal" || from === "cancelled";
  }
  // Actor guards
  if (event.type === "START_TRIP" || event.type === "MARK_ARRIVED" || event.type === "START_WORK" || event.type === "MARK_COMPLETED") {
    // only pro (caller enforces actor)
  }
  if (event.type === "SATISFIED") {
    // only motorist
  }
  return Boolean(ALLOWED[from]?.[event.type]);
}

export function nextStatus(
  from: JobFlowStatus,
  event: TransitionEvent
): JobFlowStatus | null {
  if (!canTransition(from, event)) return null;

  if (event.type === "RESOLVE_DISPUTE" || event.type === "RESOLVE_APPEAL") {
    if (event.outcome === "refund") return "refunded";
    return "released"; // full release or split still ends as released (split stored on dispute)
  }
  if (
    event.type === "CANCEL" &&
    (from === "paid_booked" ||
      from === "en_route" ||
      from === "arrived" ||
      from === "in_progress")
  ) {
    // Money returns to motorist (full refund path in job-store)
    return "cancelled";
  }
  if (event.type === "OPEN_DISPUTE") return "disputed";
  if (event.type === "OPEN_APPEAL") return "under_appeal";

  return ALLOWED[from]?.[event.type] ?? null;
}

export function assertTransition(
  from: JobFlowStatus,
  event: TransitionEvent
): JobFlowStatus {
  const next = nextStatus(from, event);
  if (!next) {
    throw new Error(`Illegal transition: ${from} + ${event.type}`);
  }
  return next;
}

/** Pro must place offer #1. Max 6 offers total (back-and-forth). */
export function canPlaceOffer(input: {
  status: JobFlowStatus;
  offerCount: number;
  side: OfferSide;
  negotiateEndsAt: string;
  now?: number;
  /** When false, timer not started yet (pro has not accepted) */
  timerArmed?: boolean;
}): { ok: true } | { ok: false; reason: string } {
  if (input.status !== "negotiating") {
    return { ok: false, reason: "Negotiation is closed." };
  }
  const now = input.now ?? Date.now();
  // Only enforce expiry after pro armed the negotiate clock
  if (
    input.timerArmed !== false &&
    now > new Date(input.negotiateEndsAt).getTime()
  ) {
    // Far-future sentinel = unarmed
    const ends = new Date(input.negotiateEndsAt).getTime();
    if (ends - now < 30 * 24 * 60 * 60 * 1000) {
      return { ok: false, reason: "Negotiation timer expired." };
    }
  }
  if (input.offerCount >= MAX_NEGOTIATION_OFFERS) {
    return {
      ok: false,
      reason: `Maximum of ${MAX_NEGOTIATION_OFFERS} offers reached.`,
    };
  }
  if (input.offerCount === 0 && input.side !== "repair_pro") {
    return {
      ok: false,
      reason: "Repair Pro must set the labour price first.",
    };
  }
  return { ok: true };
}

/**
 * Motorist counter must be ≥ 50% of pro base (max 50% discount).
 * Pro labour price: min ₦120 (Flutterwave payout floor), max 6 digits.
 */
export function validateOfferAmount(input: {
  side: OfferSide;
  amountMajor: number;
  proBaseMajor: number | null;
  lastProOfferMajor: number | null;
}): { ok: true } | { ok: false; reason: string } {
  if (!Number.isFinite(input.amountMajor)) {
    return { ok: false, reason: "Enter a valid labour price." };
  }
  if (input.amountMajor < MIN_OFFER_AMOUNT_MAJOR) {
    return {
      ok: false,
      reason: `Minimum service charge is ₦${MIN_OFFER_AMOUNT_MAJOR.toLocaleString("en-NG")} so payout can complete.`,
    };
  }
  if (input.amountMajor > MAX_OFFER_AMOUNT_MAJOR) {
    return {
      ok: false,
      reason: `Price can be at most ${MAX_OFFER_AMOUNT_MAJOR.toLocaleString()} (6 digits).`,
    };
  }
  // Reject fractional inputs that aren't whole major units beyond digit cap
  const digits = String(Math.floor(input.amountMajor)).replace(/\D/g, "");
  if (digits.length > 6) {
    return { ok: false, reason: "Price is limited to 6 digits." };
  }
  if (input.side === "motorist") {
    const base =
      input.lastProOfferMajor ?? input.proBaseMajor;
    if (base == null || base <= 0) {
      return { ok: false, reason: "Wait for the Repair Pro to set a price." };
    }
    const minAllowed = base * (1 - MAX_DISCOUNT_PERCENT / 100);
    if (input.amountMajor < minAllowed - 0.001) {
      return {
        ok: false,
        reason: `Counter cannot be more than ${MAX_DISCOUNT_PERCENT}% below the Repair Pro price.`,
      };
    }
  }
  return { ok: true };
}

export function negotiationUiStatus(input: {
  status: JobFlowStatus;
  offerCount: number;
  lastSide?: OfferSide | null;
  negotiateEndsAt: string;
  now?: number;
}): "waiting" | "countered" | "agreed" | "expired" {
  if (input.status === "expired") return "expired";
  if (
    input.status === "agreed" ||
    input.status === "paid_booked" ||
    input.status === "released"
  ) {
    return "agreed";
  }
  const now = input.now ?? Date.now();
  if (
    input.status === "negotiating" &&
    now > new Date(input.negotiateEndsAt).getTime()
  ) {
    return "expired";
  }
  if (input.offerCount === 0) return "waiting";
  if (input.lastSide) return "countered";
  return "waiting";
}

export function actorMay(
  event: TransitionEvent["type"],
  actor: TransitionActor
): boolean {
  switch (event) {
    case "START_TRIP":
    case "MARK_ARRIVED":
    case "START_WORK":
    case "MARK_COMPLETED":
      return actor === "repair_pro";
    case "SATISFIED":
      // motorist confirms; system auto-releases after 6h with no dispute
      return actor === "motorist" || actor === "system";
    case "START_NEGOTIATION":
      return actor === "repair_pro" || actor === "system" || actor === "admin";
    case "PAYMENT_SUCCESS":
    case "RELEASE":
    case "EXPIRE_NEGOTIATION":
      return actor === "system" || actor === "motorist" || actor === "admin";
    case "CANCEL":
      // system = 6h booked auto-cancel + refund
      return (
        actor === "motorist" ||
        actor === "repair_pro" ||
        actor === "admin" ||
        actor === "system"
      );
    case "OPEN_DISPUTE":
      return actor === "motorist" || actor === "repair_pro";
    case "RESOLVE_DISPUTE":
    case "RESOLVE_APPEAL":
      return actor === "admin";
    case "OPEN_APPEAL":
      return actor === "motorist" || actor === "repair_pro";
    case "ACCEPT_OFFER":
      return actor === "motorist" || actor === "repair_pro";
    case "REFUND":
      return actor === "system" || actor === "admin";
    default:
      return false;
  }
}
