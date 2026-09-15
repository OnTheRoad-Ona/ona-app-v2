import type { JobRecord } from "@/lib/jobs/types";

/** Decline reasons shown to a pro who cannot take a request (SSPE + legacy). */
export const CANCEL_REASONS = [
  "Currently unavailable",
  "Too far away",
  "Busy with another customer",
  "Outside my service area",
  "Vehicle issue",
  "Emergency",
  "Other",
] as const;

/** Prefer newer job snapshots so stale polls never undo Start trip etc. */
export function isJobNewer(next: JobRecord, prev: JobRecord | null): boolean {
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

/** Total reroute window a search can run before the request expires (3 minutes). */
export const SEARCH_REROUTE_WINDOW_MS = 3 * 60_000;

export function searchingEndsAtIso(job: JobRecord): string {
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
