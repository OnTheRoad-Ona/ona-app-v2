"use client";

/**
 * Shared Bearer headers for APIs that enforce requireUser().
 * Prefer ensureAppSession so near-expiry tokens refresh first.
 */

import { ensureAppSession } from "@/lib/supabase/session";

export async function authHeaders(
  extra?: Record<string, string>
): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    ...(extra || {}),
  };
  try {
    const session = await ensureAppSession();
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
  extra?: Record<string, string>
): Promise<Record<string, string>> {
  const h = await authHeaders(extra);
  // GET often omits content-type; keep Accept + auth
  return h;
}

/** Convenience: fetch with session Bearer attached. */
export async function authFetch(
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<Response> {
  const method = (init.method || "GET").toUpperCase();
  const base =
    method === "GET" || method === "HEAD" || method === "DELETE"
      ? await authHeadersGet()
      : await authHeaders();
  const headers = {
    ...base,
    ...(init.headers as Record<string, string> | undefined),
  };
  return fetch(input, { ...init, headers });
}
