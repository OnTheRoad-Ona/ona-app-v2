/**
 * Pure escrow job state machine — no I/O.
 * Enforces legal transitions for OgaMecho premium job flow.
 */

import type { JobFlowStatus, OfferSide } from "@/lib/jobs/types";
import {
  DISPUTABLE_STATUSES,
  MAX_DISCOUNT_PERCENT,
  MAX_NEGOTIATION_OFFERS,
} from "@/lib/jobs/constants";

export type TransitionActor = "motorist" | "repair_pro" | "system" | "admin";

export type TransitionEvent =
  | { type: "EXPIRE_NEGOTIATION" }
  | { type: "CANCEL"; by: TransitionActor }
  | { type: "ACCEPT_OFFER"; by: TransitionActor }
  | { type: "PAYMENT_SUCCESS" }
  | { type: "START_TRIP" } // pro → en_route
  | { type: "MARK_ARRIVED" }
  | { type: "START_WORK" }
  | { type: "MARK_COMPLETED" }
  | { type: "SATISFIED" } // motorist → release path
  | { type: "RELEASE" } // system after satisfied
  | { type: "OPEN_DISPUTE"; by: "motorist" | "repair_pro" }
  | { type: "RESOLVE_DISPUTE"; outcome: "release" | "refund" | "split" }
  | { type: "OPEN_APPEAL"; by: "motorist" | "repair_pro" }
  | { type: "RESOLVE_APPEAL"; outcome: "release" | "refund" | "split" }
  | { type: "REFUND" };

const ALLOWED: Record<JobFlowStatus, Partial<Record<TransitionEvent["type"], JobFlowStatus>>> = {
  negotiating: {
    ACCEPT_OFFER: "agreed",
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
    OPEN_DISPUTE: "disputed",
  },
  in_progress: {
    MARK_COMPLETED: "completed",
    OPEN_DISPUTE: "disputed",
  },
  completed: {
    SATISFIED: "satisfied",
    OPEN_DISPUTE: "disputed",
  },
  satisfied: {
    RELEASE: "released",
  },
  released: {},
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
  if (event.type === "CANCEL" && (from === "paid_booked" || from === "en_route")) {
    // Money returns to motorist
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

/** Pro must place offer #1. Max 3 offers total. */
export function canPlaceOffer(input: {
  status: JobFlowStatus;
  offerCount: number;
  side: OfferSide;
  negotiateEndsAt: string;
  now?: number;
}): { ok: true } | { ok: false; reason: string } {
  if (input.status !== "negotiating") {
    return { ok: false, reason: "Negotiation is closed." };
  }
  const now = input.now ?? Date.now();
  if (now > new Date(input.negotiateEndsAt).getTime()) {
    return { ok: false, reason: "Negotiation timer expired." };
  }
  if (input.offerCount >= MAX_NEGOTIATION_OFFERS) {
    return { ok: false, reason: "Maximum of 3 offers reached." };
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
 * Pro can set any positive labour price.
 */
export function validateOfferAmount(input: {
  side: OfferSide;
  amountMajor: number;
  proBaseMajor: number | null;
  lastProOfferMajor: number | null;
}): { ok: true } | { ok: false; reason: string } {
  if (!Number.isFinite(input.amountMajor) || input.amountMajor <= 0) {
    return { ok: false, reason: "Enter a valid labour price." };
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
      return actor === "motorist";
    case "PAYMENT_SUCCESS":
    case "RELEASE":
    case "EXPIRE_NEGOTIATION":
      return actor === "system" || actor === "motorist" || actor === "admin";
    case "CANCEL":
      return actor === "motorist" || actor === "repair_pro" || actor === "admin";
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
