/**
 * Repair Pro service-request popup timing.
 * - Stay visible 66s (progress line only — no second display)
 * - Always surface each new open request (C1 — no 10-minute throttle)
 * - New requests during the 66s window pile (stack count)
 */

import type { JobRecord } from "@/lib/jobs/types";
import { serverNow } from "@/lib/jobs/server-clock";
import { windowStillOpen } from "@/lib/jobs/deadline";

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
 * Pro must handle these only on the lower incoming panel — never a full
 * /jobs/[id] page (redirect to dashboard and surface the panel instead).
 */
export function isProPanelOnlyPairingStatus(status: string | null | undefined): boolean {
  const s = status ?? "";
  return PAIRING_ACTION_STAGES.has(s) || s === "sequential_pairing";
}

/** sessionStorage: force IncomingJobPopup to open this job id on next poll */
export const FORCE_PANEL_JOB_KEY = "om-panel-focus-job";

export function requestForceIncomingPanel(jobId: string): void {
  try {
    if (jobId) sessionStorage.setItem(FORCE_PANEL_JOB_KEY, jobId);
  } catch {
    /* */
  }
}

export function takeForceIncomingPanelJobId(): string | null {
  try {
    const id = sessionStorage.getItem(FORCE_PANEL_JOB_KEY);
    if (id) sessionStorage.removeItem(FORCE_PANEL_JOB_KEY);
    return id;
  } catch {
    return null;
  }
}

/**
 * True while a job is still actionable for this pro (popup panel / badge /
 * dashboard incoming). The job's actual status must still be live: a stale
 * pairing stage left behind after cancel / decline / complete / expire must
 * never keep the request visible.
 */
export function isIncomingJobOpen(
  j: JobRecord,
  proId: string,
  now: number = serverNow()
): boolean {
  if (j.repairProId !== proId) return false;
  if (!j.motoristId || !j.problem?.trim()) return false;
  const status = j.status ?? "";
  const stage = j.pairingStage ?? "";
  if (PAIRING_ACTION_STAGES.has(stage)) {
    // Stale pairing stage must not outlive a terminal / post-job status.
    if (!PAIRING_ACTION_STAGES.has(status)) return false;
    // D3: pairing_deadline is the single timer source.
    if (j.pairingDeadline && !windowStillOpen(j.pairingDeadline, now)) {
      return false;
    }
    return true;
  }
  if (status !== "negotiating" && status !== "agreed") return false;
  if (
    status === "negotiating" &&
    j.negotiateEndsAt &&
    !windowStillOpen(j.negotiateEndsAt, now)
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

/**
 * Shown key is jobId + pairing deadline so a re-offer of the same job
 * (Retry wave / new 66s window) surfaces again. Same deadline = already shown.
 */
export function shownOfferKey(
  jobId: string,
  pairingDeadline?: string | null
): string {
  const d = pairingDeadline?.trim();
  return d ? `${jobId}@${d}` : jobId;
}

export function markJobShown(
  id: string,
  proId?: string,
  pairingDeadline?: string | null
): void {
  try {
    const s = readShownJobIds(proId);
    s.add(shownOfferKey(id, pairingDeadline));
    // Drop bare jobId entries so only deadline-scoped keys matter
    s.delete(id);
    sessionStorage.setItem(
      shownKeyFor(proId),
      JSON.stringify([...s].slice(-80))
    );
  } catch {
    /* */
  }
}

/** Clear shown flag so a reassigned/rerouted job can surface again after 66s wave */
export function clearJobShown(id: string, proId?: string): void {
  try {
    const s = readShownJobIds(proId);
    let changed = false;
    for (const k of [...s]) {
      if (k === id || k.startsWith(`${id}@`)) {
        s.delete(k);
        changed = true;
      }
    }
    if (!changed) return;
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
 * - Block only the same offer window (jobId + pairingDeadline)
 * - New pairing_deadline (next pro wave / Retry) → allow again
 * - During an open wave, pile additional new jobs
 */
export function canSurfaceIncomingJob(
  jobId: string,
  opts?: {
    waveOpen?: boolean;
    proId?: string;
    pairingDeadline?: string | null;
  }
): IncomingGate {
  const key = shownOfferKey(jobId, opts?.pairingDeadline);
  const shown = readShownJobIds(opts?.proId);
  if (shown.has(key) || (!opts?.pairingDeadline && shown.has(jobId))) {
    return { allow: false, reason: "already_shown" };
  }
  if (opts?.waveOpen) {
    return { allow: true, reason: "pile" };
  }
  return { allow: true, reason: "new_wave" };
}
