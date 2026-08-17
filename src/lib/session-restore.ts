"use client";

/**
 * Session-scoped snapshot helpers for refresh-restore.
 * Kept in sessionStorage so the position survives a refresh but is
 * discarded the moment the tab is closed.
 */

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function readSession<T>(key: string): T | null {
  try {
    return safeParse<T>(window.sessionStorage.getItem(key));
  } catch {
    return null;
  }
}

export function writeSession(key: string, value: unknown): boolean {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function clearSession(key: string): void {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
