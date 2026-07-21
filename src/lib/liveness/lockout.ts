/**
 * Liveness attempt lockout — max 6 failures then cool-down.
 * Stores only counters + timestamps (no media).
 */

const KEY = "ona-liveness-attempts-v1";
export const LIVENESS_MAX_FAILS = 6;
/** Cool-down after max fails (ms) — 30 minutes, data-light */
export const LIVENESS_LOCKOUT_MS = 30 * 60 * 1000;

type Store = {
  fails: number;
  lockUntil: number | null;
};

function read(userKey: string): Store {
  try {
    const raw = localStorage.getItem(`${KEY}:${userKey}`);
    if (!raw) return { fails: 0, lockUntil: null };
    const p = JSON.parse(raw) as Partial<Store>;
    return {
      fails: Number(p.fails) || 0,
      lockUntil: p.lockUntil ? Number(p.lockUntil) : null,
    };
  } catch {
    return { fails: 0, lockUntil: null };
  }
}

function write(userKey: string, s: Store) {
  try {
    localStorage.setItem(`${KEY}:${userKey}`, JSON.stringify(s));
  } catch {
    /* quota */
  }
}

export function getLivenessLock(userKey: string): {
  locked: boolean;
  fails: number;
  remainingMs: number;
} {
  const s = read(userKey);
  const now = Date.now();
  if (s.lockUntil && s.lockUntil > now) {
    return {
      locked: true,
      fails: s.fails,
      remainingMs: s.lockUntil - now,
    };
  }
  if (s.lockUntil && s.lockUntil <= now) {
    write(userKey, { fails: 0, lockUntil: null });
    return { locked: false, fails: 0, remainingMs: 0 };
  }
  return { locked: false, fails: s.fails, remainingMs: 0 };
}

export function recordLivenessFail(userKey: string): {
  locked: boolean;
  fails: number;
  remainingMs: number;
} {
  const s = read(userKey);
  const fails = s.fails + 1;
  if (fails >= LIVENESS_MAX_FAILS) {
    const lockUntil = Date.now() + LIVENESS_LOCKOUT_MS;
    write(userKey, { fails, lockUntil });
    return {
      locked: true,
      fails,
      remainingMs: LIVENESS_LOCKOUT_MS,
    };
  }
  write(userKey, { fails, lockUntil: null });
  return { locked: false, fails, remainingMs: 0 };
}

export function clearLivenessFails(userKey: string) {
  write(userKey, { fails: 0, lockUntil: null });
}

export function formatRemaining(ms: number): string {
  const m = Math.ceil(ms / 60000);
  return m <= 1 ? "about 1 minute" : `${m} minutes`;
}
