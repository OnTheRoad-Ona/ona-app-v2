/**
 * Quiet Hours — suppress non-critical toasts overnight.
 * Critical / high (safety, new request, arrived) always break through.
 *
 * startHour / endHour use -1 for "Anytime" (no quiet window on that side
 * → never suppress for the quiet-hours rule).
 */

/** Sentinel: From or Until set to Anytime */
export const QUIET_HOURS_ANYTIME = -1;

export type QuietHoursConfig = {
  enabled: boolean;
  /** Local hour 0–23, or -1 = Anytime */
  startHour: number;
  endHour: number;
};

const DEFAULT: QuietHoursConfig = {
  enabled: true,
  startHour: 22,
  endHour: 7,
};

const KEY = "ona-quiet-hours";

function normalizeHour(v: unknown, fallback: number): number {
  const n = Number(v);
  if (n === QUIET_HOURS_ANYTIME) return QUIET_HOURS_ANYTIME;
  if (Number.isFinite(n) && n >= 0 && n <= 23) return n;
  return fallback;
}

export function getQuietHours(): QuietHoursConfig {
  if (typeof window === "undefined") return DEFAULT;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT;
    const p = JSON.parse(raw) as Partial<QuietHoursConfig>;
    return {
      enabled: p.enabled !== false,
      startHour: normalizeHour(p.startHour, 22),
      endHour: normalizeHour(p.endHour, 7),
    };
  } catch {
    return DEFAULT;
  }
}

export function setQuietHours(cfg: Partial<QuietHoursConfig>): QuietHoursConfig {
  const next = { ...getQuietHours(), ...cfg };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}

export function isInQuietHours(cfg: QuietHoursConfig = getQuietHours()): boolean {
  if (!cfg.enabled) return false;
  // Anytime on From or Until → no quiet window
  if (
    cfg.startHour === QUIET_HOURS_ANYTIME ||
    cfg.endHour === QUIET_HOURS_ANYTIME
  ) {
    return false;
  }
  const h = new Date().getHours();
  if (cfg.startHour === cfg.endHour) return false;
  if (cfg.startHour > cfg.endHour) {
    return h >= cfg.startHour || h < cfg.endHour;
  }
  return h >= cfg.startHour && h < cfg.endHour;
}

/** Toasts during quiet hours: critical/high always show */
export function shouldShowToast(
  priority: "low" | "normal" | "high" | "critical"
): boolean {
  if (priority === "critical" || priority === "high") return true;
  return !isInQuietHours();
}
