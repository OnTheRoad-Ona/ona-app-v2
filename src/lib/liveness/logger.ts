/**
 * Lightweight liveness debug logs (no PII, no frames).
 * In production, swap sink for remote logger if needed.
 */

type Level = "info" | "warn" | "error" | "debug";

const PREFIX = "[ona-liveness]";

export function livenessLog(
  level: Level,
  event: string,
  data?: Record<string, unknown>
): void {
  if (typeof window === "undefined") return;
  const payload = data ? { event, ...data, t: Date.now() } : { event, t: Date.now() };
  try {
    // eslint-disable-next-line no-console
    const fn = level === "error" ? console.error : level === "warn" ? console.warn : console.info;
    fn(PREFIX, payload);
  } catch {
    /* ignore */
  }
}
