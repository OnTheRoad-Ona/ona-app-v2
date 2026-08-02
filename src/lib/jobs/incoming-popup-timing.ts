/**
 * Repair Pro service-request popup timing (inDrive-style).
 * - Stay visible 66s then fully hide
 * - Auto-show at most one wave every 10 minutes
 * - New requests during the 66s window pile (stack count)
 */

export const INCOMING_POPUP_VISIBLE_MS = 66_000;
export const INCOMING_POPUP_THROTTLE_MS = 10 * 60 * 1000;

const WAVE_KEY = "om-incoming-popup-wave-at";
const SHOWN_KEY = "om-job-request-shown";

export function readShownJobIds(): Set<string> {
  try {
    const raw = sessionStorage.getItem(SHOWN_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

export function markJobShown(id: string): void {
  try {
    const s = readShownJobIds();
    s.add(id);
    sessionStorage.setItem(SHOWN_KEY, JSON.stringify([...s].slice(-60)));
  } catch {
    /* */
  }
}

export function readLastWaveAt(): number {
  try {
    const n = Number(localStorage.getItem(WAVE_KEY) || "0");
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

export function writeLastWaveAt(atMs: number = Date.now()): void {
  try {
    localStorage.setItem(WAVE_KEY, String(atMs));
  } catch {
    /* */
  }
}

export type IncomingGate =
  | { allow: true; reason: "new_wave" | "pile" }
  | { allow: false; reason: "throttled" | "already_shown" };

/**
 * Can we auto-surface this job as a popup?
 * - Never re-show a job already marked shown this session
 * - New wave only if ≥10 min since last wave start
 * - During 66s after wave start, allow pile (new jobs only)
 */
export function canSurfaceIncomingJob(
  jobId: string,
  nowMs: number = Date.now()
): IncomingGate {
  if (readShownJobIds().has(jobId)) {
    return { allow: false, reason: "already_shown" };
  }
  const last = readLastWaveAt();
  if (!last || last <= 0) {
    return { allow: true, reason: "new_wave" };
  }
  const age = nowMs - last;
  if (age < INCOMING_POPUP_VISIBLE_MS) {
    return { allow: true, reason: "pile" };
  }
  if (age < INCOMING_POPUP_THROTTLE_MS) {
    return { allow: false, reason: "throttled" };
  }
  return { allow: true, reason: "new_wave" };
}
