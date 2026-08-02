"use client";

/**
 * Shared session helpers — prevent false “Session expired” on Go Live,
 * role switch, profile update, etc. Always try refresh before failing.
 *
 * Also guards concurrent refreshSession() (job page fires multiple API
 * calls at once; parallel refreshes can drop the token → 401).
 */

import { getAppSupabase } from "@/lib/supabase/app-client";

export type AppSession = {
  accessToken: string;
  refreshToken?: string;
  userId: string;
  expiresAt?: number;
};

/** Single-flight: only one refreshSession at a time across the app. */
let refreshInFlight: Promise<AppSession | null> | null = null;

function toAppSession(s: {
  access_token: string;
  refresh_token?: string;
  user?: { id?: string } | null;
  expires_at?: number;
} | null | undefined): AppSession | null {
  if (!s?.access_token || !s.user?.id) return null;
  return {
    accessToken: s.access_token,
    refreshToken: s.refresh_token,
    userId: s.user.id,
    expiresAt: s.expires_at ? s.expires_at * 1000 : undefined,
  };
}

async function readSession(): Promise<AppSession | null> {
  const sb = getAppSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return toAppSession(data.session);
}

/**
 * Wait briefly for storage rehydrate after navigation / cold start.
 * Supabase getSession can return null for a few hundred ms even when
 * the user is signed in.
 */
async function waitForSession(maxMs: number): Promise<AppSession | null> {
  const deadline = Date.now() + maxMs;
  let session = await readSession();
  while (!session && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 80));
    session = await readSession();
  }
  return session;
}

async function doRefresh(): Promise<AppSession | null> {
  const sb = getAppSupabase();
  if (!sb) return null;
  try {
    const { data, error } = await sb.auth.refreshSession();
    if (!error && data.session) {
      const next = toAppSession(data.session);
      if (next) return next;
    }
  } catch {
    /* fall through */
  }
  return readSession();
}

/**
 * Return a valid access token + user id.
 * 1) read session (optionally wait for rehydrate)
 * 2) if missing/near-expiry → refreshSession (single-flight)
 * 3) if still missing → null (caller may soft-fail or re-login)
 */
export async function ensureAppSession(opts?: {
  /** Refresh if token expires within this many ms (default 2 min) */
  refreshIfExpiresWithinMs?: number;
  /** Force refresh even when token still looks valid */
  forceRefresh?: boolean;
  /**
   * If getSession is empty, poll up to this many ms for storage rehydrate
   * (default 0 = no wait). Job create/load should pass ~1500–2500.
   */
  waitForSessionMs?: number;
}): Promise<AppSession | null> {
  const sb = getAppSupabase();
  if (!sb) return null;

  const skew = opts?.refreshIfExpiresWithinMs ?? 120_000;
  const waitMs = opts?.waitForSessionMs ?? 0;

  let session = waitMs > 0 ? await waitForSession(waitMs) : await readSession();

  const needsRefresh =
    opts?.forceRefresh ||
    !session ||
    (session.expiresAt != null && session.expiresAt - Date.now() < skew);

  if (needsRefresh) {
    if (!refreshInFlight) {
      refreshInFlight = doRefresh().finally(() => {
        refreshInFlight = null;
      });
    }
    session = (await refreshInFlight) || (await readSession());
  }

  return session;
}

/** User-facing copy — never imply the whole app is geo-blocked */
export const SESSION_RELOGIN_MESSAGE =
  "Your login session needs a refresh. Stay on this page and try again, or sign in once more.";
