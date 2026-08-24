/**
 * Repair Pro service-request popup timing.
 * - Stay visible 144s (progress line only no second display)
 * - Always surface each new open request (C1 no 10-minute throttle)
 * - New requests during the 144s window pile (stack count)
 */

import type { JobRecord } from "@/lib/jobs/types";
import { serverNow } from "@/lib/jobs/server-clock";
import { windowStillOpen } from "@/lib/jobs/deadline";
import { isAutomotiveTrade } from "@/lib/artisan/catalog";

export const INCOMING_POPUP_VISIBLE_MS = 144_000;
/** Seconds counterpart for UI progress line */
export const INCOMING_POPUP_VISIBLE_SEC = 144;

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
 * Pro must handle these only on the lower incoming panel never a full
 * /jobs/[id] page (redirect to dashboard and surface the panel instead).
 */
export function isProPanelOnlyPairingStatus(
  status: string | null | undefined,
): boolean {
  const s = status ?? "";
  return PAIRING_ACTION_STAGES.has(s) || s === "sequential_pairing";
}

/** Statuses that mean "still this pro's live request" (card-keep, incl. the
 * transient sequential_pairing advance). Pairing stages may be reported in
 * either pairingStage or status, so both are checked. */
export const PRO_CARD_KEEP_STATUSES = new Set<string>([
  ...PAIRING_ACTION_STAGES,
  "sequential_pairing",
  "negotiating",
  "agreed",
]);

/** True when a request card should stay visible for this pro: the server still
 * reports an actionable stage/status. Once the customer cancels/expires it or
 * it moves to another pro, this returns false so the card closes immediately
 * (realtime push or the fast status poll) never wait for the list refresh.
 * A stale pairing stage must not outlive a terminal status. */
export function isProRequestCardKeepable(
  status?: string | null,
  pairingStage?: string | null,
): boolean {
  const s = status ?? "";
  const stage = pairingStage ?? "";
  if (!s && !stage) return false;
  if (PRO_CARD_KEEP_STATUSES.has(s)) {
    // A terminal status wins over a leftover stage (customer cancelled but
    // pairing_stage still says waiting_for_pro) never keep a closed request.
    return !isProTerminalStatus(s);
  }
  return PRO_CARD_KEEP_STATUSES.has(stage) && !isProTerminalStatus(s);
}

/** Statuses that can never keep a card, no matter what pairing_stage says. */
function isProTerminalStatus(status: string): boolean {
  return (
    status === "cancelled" ||
    status === "expired" ||
    status === "refunded" ||
    status === "disputed" ||
    status === "under_appeal" ||
    status === "released" ||
    status === "completed"
  );
}

export type RequestCloseContext = {
  job?: Pick<
    JobRecord,
    "motoristName" | "motoristVehicle" | "serviceType"
  > | null;
  status?: string | null;
  /** Closed because the request moved to another pro (repair_pro_id changed). */
  movedOn?: boolean;
};

/** One-line, rich explanation for the pro when a request leaves their panel
 * shown as OS push body and in-app toast so it never "just disappears". */
export function requestCloseText(input: RequestCloseContext): string {
  const { job, status = "", movedOn = false } = input;
  const name = job?.motoristName?.split(/\s+/)[0];
  const subject =
    job && isAutomotiveTrade(job.serviceType) && job.motoristVehicle?.trim()
      ? job.motoristVehicle.trim()
      : null;

  if (movedOn) return "This request was assigned to another pro.";
  if (status === "cancelled") {
    if (name && subject) return `${name} cancelled the ${subject} request.`;
    if (name) return `${name} cancelled this request.`;
    return "A customer cancelled this request.";
  }
  if (status === "expired") {
    if (name) return `${name}'s request expired.`;
    return "This request expired.";
  }
  if (name) return `${name}'s request is no longer open.`;
  return "This request is no longer open.";
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
  now: number = serverNow(),
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
 * can surface again for them (the previous pro's "shown" must not block it). */
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
 * (Retry wave / new 144s window) surfaces again. Same deadline = already shown.
 */
export function shownOfferKey(
  jobId: string,
  pairingDeadline?: string | null,
): string {
  const d = pairingDeadline?.trim();
  return d ? `${jobId}@${d}` : jobId;
}

export function markJobShown(
  id: string,
  proId?: string,
  pairingDeadline?: string | null,
): void {
  try {
    const s = readShownJobIds(proId);
    // Always remember the bare jobId so a card WITHOUT a pairing deadline
    // (negotiating / agreed) stays "shown" and never re-surfaces on the next
    // poll or remount. Deadline-scoped keys are kept too so a genuinely new
    // offer window (new pairing_deadline) can still surface the job again.
    s.add(id);
    if (pairingDeadline?.trim()) {
      s.add(shownOfferKey(id, pairingDeadline));
    }
    sessionStorage.setItem(
      shownKeyFor(proId),
      JSON.stringify([...s].slice(-80)),
    );
  } catch {
    /* */
  }
}

/** Clear shown flag so a reassigned/rerouted job can surface again after 144s wave */
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
  },
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

/**
 * Module-level "incoming lower panel is open" signal.
 * The popup publishes its panel visibility; the dashboard hides its
 * "Incoming requests" list while the panel is up.
 */
let incomingPanelOpen = false;
const panelOpenListeners = new Set<(open: boolean) => void>();

export function setIncomingPanelOpen(open: boolean): void {
  if (incomingPanelOpen === open) return;
  incomingPanelOpen = open;
  for (const listener of [...panelOpenListeners]) listener(open);
}

export function subscribeIncomingPanelOpen(
  listener: (open: boolean) => void,
): () => void {
  panelOpenListeners.add(listener);
  return () => panelOpenListeners.delete(listener);
}
