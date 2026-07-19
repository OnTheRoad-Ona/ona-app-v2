/**
 * Quiet Hours — suppress non-critical toasts overnight.
 * Critical / high (safety, new request, arrived) always break through.
 */

export type QuietHoursConfig = {
  enabled: boolean;
  /** Local hour 0–23 */
  startHour: number;
  endHour: number;
};

const DEFAULT: QuietHoursConfig = {
  enabled: true,
  startHour: 22,
  endHour: 7,
};

const KEY = "oga-mecho-quiet-hours";

export function getQuietHours(): QuietHoursConfig {
  if (typeof window === "undefined") return DEFAULT;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT;
    const p = JSON.parse(raw) as Partial<QuietHoursConfig>;
    return {
      enabled: p.enabled !== false,
      startHour: Number.isFinite(p.startHour) ? Number(p.startHour) : 22,
      endHour: Number.isFinite(p.endHour) ? Number(p.endHour) : 7,
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
