"use client";

/**
 * Shared session helpers — prevent false “Session expired” on Go Live,
 * role switch, profile update, etc. Always try refresh before failing.
 */

import { getAppSupabase } from "@/lib/supabase/app-client";

export type AppSession = {
  accessToken: string;
  refreshToken?: string;
  userId: string;
  expiresAt?: number;
};

/**
 * Return a valid access token + user id.
 * 1) read session
 * 2) if missing/near-expiry → refreshSession
 * 3) if still missing → null (caller may soft-fail or re-login)
 */
export async function ensureAppSession(opts?: {
  /** Refresh if token expires within this many ms (default 2 min) */
  refreshIfExpiresWithinMs?: number;
}): Promise<AppSession | null> {
  const sb = getAppSupabase();
  if (!sb) return null;

  const skew = opts?.refreshIfExpiresWithinMs ?? 120_000;

  const read = async (): Promise<AppSession | null> => {
    const { data } = await sb.auth.getSession();
    const s = data.session;
    if (!s?.access_token || !s.user?.id) return null;
    return {
      accessToken: s.access_token,
      refreshToken: s.refresh_token,
      userId: s.user.id,
      expiresAt: s.expires_at
        ? s.expires_at * 1000
        : undefined,
    };
  };

  let session = await read();
  const needsRefresh =
    !session ||
    (session.expiresAt != null && session.expiresAt - Date.now() < skew);

  if (needsRefresh) {
    try {
      const { data, error } = await sb.auth.refreshSession();
      if (!error && data.session?.access_token && data.session.user?.id) {
        session = {
          accessToken: data.session.access_token,
          refreshToken: data.session.refresh_token,
          userId: data.session.user.id,
          expiresAt: data.session.expires_at
            ? data.session.expires_at * 1000
            : undefined,
        };
      } else {
        // refresh failed — try getSession once more (storage race)
        session = await read();
      }
    } catch {
      session = await read();
    }
  }

  return session;
}

/** User-facing copy — never imply the whole app is geo-blocked */
export const SESSION_RELOGIN_MESSAGE =
  "Your login session needs a refresh. Stay on this page and try again, or sign in once more.";
