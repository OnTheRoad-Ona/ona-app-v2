"use client";

/**
 * Shared Bearer headers for APIs that enforce requireUser().
 * Prefer ensureAppSession so near-expiry tokens refresh first.
 * Retries once on 401 after a forced refresh (common after navigation).
 */

import {
  ensureAppSession,
  SESSION_RELOGIN_MESSAGE,
} from "@/lib/supabase/session";

export async function authHeaders(
  extra?: Record<string, string>,
  opts?: { waitForSessionMs?: number; forceRefresh?: boolean }
): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    ...(extra || {}),
  };
  try {
    const session = await ensureAppSession({
      waitForSessionMs: opts?.waitForSessionMs ?? 1500,
      forceRefresh: opts?.forceRefresh,
    });
    if (session?.accessToken) {
      headers.Authorization = `Bearer ${session.accessToken}`;
      headers["x-access-token"] = session.accessToken;
    }
  } catch {
    /* unauthenticated — server returns 401 */
  }
  return headers;
}

/** Auth headers without forcing Content-Type (GET/DELETE). */
export async function authHeadersGet(
  extra?: Record<string, string>,
  opts?: { waitForSessionMs?: number; forceRefresh?: boolean }
): Promise<Record<string, string>> {
  const h = await authHeaders(extra, opts);
  return h;
}

/** Convenience: fetch with session Bearer attached + one 401 retry. */
export async function authFetch(
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<Response> {
  const method = (init.method || "GET").toUpperCase();
  const isGet =
    method === "GET" || method === "HEAD" || method === "DELETE";

  const buildHeaders = async (forceRefresh?: boolean) => {
    const base = isGet
      ? await authHeadersGet(undefined, {
          waitForSessionMs: 2000,
          forceRefresh,
        })
      : await authHeaders(undefined, {
          waitForSessionMs: 2000,
          forceRefresh,
        });
    return {
      ...base,
      ...(init.headers as Record<string, string> | undefined),
    };
  };

  let headers = await buildHeaders(false);
  let res = await fetch(input, { ...init, headers });

  if (res.status === 401) {
    headers = await buildHeaders(true);
    if (headers.Authorization) {
      res = await fetch(input, { ...init, headers });
    }
  }

  return res;
}

export { SESSION_RELOGIN_MESSAGE };
