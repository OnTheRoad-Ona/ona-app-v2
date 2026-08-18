"use client";

import { clearSession } from "@/lib/session-restore";

/**
 * Central map of trade → cascading-flow session key.
 * Single source of truth so closing a flow (re-tap toggle or logout)
 * forgets its saved position for every flow trade, present and future.
 */
export const FLOW_SESSION_KEYS: Record<string, string> = {
  mechanic: "ona-mech-flow-session",
  vulcanizer: "ona-vulc-flow-session",
  towing: "ona-tow-flow-session",
  battery: "ona-battery-flow-session",
  ac: "ona-ac-flow-session",
  body: "ona-body-flow-session",
  electrical: "ona-electrical-flow-session",
  diagnostics: "ona-diagnostics-flow-session",
  fashion: "ona-fashion-flow-session",
  plumber: "ona-plumber-flow-session",
  carpenter: "ona-carpenter-flow-session",
  painter: "ona-painter-flow-session",
  solar: "ona-solar-flow-session",
  generator: "ona-generator-flow-session",
};

export function flowSessionKeyFor(trade: string): string | null {
  return FLOW_SESSION_KEYS[trade] ?? null;
}

/** Forget the saved position of a trade's cascading flow (no-op if none). */
export function clearTradeFlowSession(trade: string): void {
  const key = flowSessionKeyFor(trade);
  if (key) clearSession(key);
}