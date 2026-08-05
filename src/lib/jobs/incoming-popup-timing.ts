/**
 * Repair Pro service-request popup timing.
 * - Stay visible 66s (progress line only — no second display)
 * - Always surface each new open request (C1 — no 10-minute throttle)
 * - New requests during the 66s window pile (stack count)
 */

import type { JobRecord } from "@/lib/jobs/types";

export const INCOMING_POPUP_VISIBLE_MS = 66_000;
/** Seconds counterpart for UI progress line */
export const INCOMING_POPUP_VISIBLE_SEC = 66;

/**
 * SSPE pairing stages a pro can act on from the incoming popup.
 * `sequential_pairing` is excluded: it is a transient server-side advance
 * (the previous pro is briefly still `repairProId`) and surfacing it would
 * cause churn.
 */
export const PAIRING_ACTION_STAGES = new Set<string>([
  "waiting_for_selected",
  "selected_review",
  "waiting_for_pro",
  "reserved",
]);

/**
 * True while a job is still actionable for this pro (popup panel / badge /
 * dashboard incoming). The job's actual status must still be live: a stale
 * pairing stage left behind after cancel / decline / complete / expire must
 * never keep the request visible.
 */
export function isIncomingJobOpen(
  j: JobRecord,
  proId: string,
  now: number
): boolean {
  if (j.repairProId !== proId) return false;
  if (!j.motoristId || !j.problem?.trim()) return false;
  const status = j.status ?? "";
  const stage = j.pairingStage ?? "";
  if (PAIRING_ACTION_STAGES.has(stage)) {
    // Stale pairing stage must not outlive a terminal / post-job status.
    if (!PAIRING_ACTION_STAGES.has(status)) return false;
    // D3: pairing_deadline is the single timer source.
    if (j.pairingDeadline && now > new Date(j.pairingDeadline).getTime()) {
      return false;
    }
    return true;
  }
  if (status !== "negotiating" && status !== "agreed") return false;
  if (
    status === "negotiating" &&
    j.negotiateEndsAt &&
    now > new Date(j.negotiateEndsAt).getTime()
  ) {
    return false;
  }
  return true;
}

const SHOWN_KEY = "om-job-request-shown";

/** Shown-set is scoped per Repair Pro so a job rerouted to a different pro
 *  can surface again for them (the previous pro's "shown" must not block it). */
function shownKeyFor(proId?: string): string {
  return proId ? `${SHOWN_KEY}:${proId}` : SHOWN_KEY;
}

export function readShownJobIds(proId?: string): Set<string> {
  try {
    const raw = sessionStorage.getItem(shownKeyFor(proId));
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

export function markJobShown(id: string, proId?: string): void {
  try {
    const s = readShownJobIds(proId);
    s.add(id);
    sessionStorage.setItem(
      shownKeyFor(proId),
      JSON.stringify([...s].slice(-60))
    );
  } catch {
    /* */
  }
}

/** Clear shown flag so a reassigned/rerouted job can surface again after 66s wave */
export function clearJobShown(id: string, proId?: string): void {
  try {
    const s = readShownJobIds(proId);
    if (!s.has(id)) return;
    s.delete(id);
    sessionStorage.setItem(shownKeyFor(proId), JSON.stringify([...s]));
  } catch {
    /* */
  }
}

export type IncomingGate =
  | { allow: true; reason: "new_wave" | "pile" }
  | { allow: false; reason: "already_shown" };

/**
 * Can we auto-surface this job as a popup?
 * - Never re-show a job already marked shown this session (until reassigned)
 * - Always allow new jobs (no 10-minute throttle)
 * - During an open wave, pile additional new jobs
 */
export function canSurfaceIncomingJob(
  jobId: string,
  opts?: { waveOpen?: boolean; proId?: string }
): IncomingGate {
  if (readShownJobIds(opts?.proId).has(jobId)) {
    return { allow: false, reason: "already_shown" };
  }
  if (opts?.waveOpen) {
    return { allow: true, reason: "pile" };
  }
  return { allow: true, reason: "new_wave" };
}
