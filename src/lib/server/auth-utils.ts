import { createClient, type User } from "@supabase/supabase-js";
import { apiFail } from "@/lib/server/api-json";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

/** Extract Bearer token from Authorization header only (never consumes body). */
export function getBearerToken(req: Request): string | null {
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const t = authHeader.slice(7).trim();
    return t.length >= 10 ? t : null;
  }
  // Also accept x-access-token for clients that cannot set Authorization
  const alt = req.headers.get("x-access-token")?.trim();
  return alt && alt.length >= 10 ? alt : null;
}

/**
 * Resolve the authenticated Supabase user from the request.
 * Prefer Authorization: Bearer. Optionally pass token from already-parsed body.
 * Does NOT read req.json() — callers that only have body tokens should pass them.
 */
export async function getUserFromToken(
  token: string | null | undefined
): Promise<User | null> {
  if (!token || token.length < 10) return null;
  if (!url || !anon) return null;

  const sb = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });

  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

export async function getUserFromRequest(req: Request): Promise<User | null> {
  const headerToken = getBearerToken(req);
  if (headerToken) return getUserFromToken(headerToken);

  // Backward-compat: some older callers put access_token only in body.
  // Clone so we do not destroy the original request body for the route handler.
  try {
    const clone = req.clone();
    const body = (await clone.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    const t = body?.access_token;
    if (typeof t === "string" && t.length >= 10) {
      return getUserFromToken(t);
    }
  } catch {
    /* ignore */
  }
  return null;
}

export type AuthUser = { userId: string; email?: string | null; token: string };

/**
 * Require a valid session. Returns auth context or a ready-to-return error Response.
 */
export async function requireUser(
  req: Request,
  opts?: { bodyToken?: string | null }
): Promise<
  | { ok: true; userId: string; email?: string | null; token: string; user: User }
  | { ok: false; response: Response }
> {
  const token = getBearerToken(req) || opts?.bodyToken || null;
  const user = token
    ? await getUserFromToken(token)
    : await getUserFromRequest(req);

  if (!user) {
    return {
      ok: false,
      response: apiFail("Not authenticated", 401, "auth"),
    };
  }

  const resolvedToken = token || getBearerToken(req) || "";
  return {
    ok: true,
    userId: user.id,
    email: user.email,
    token: resolvedToken,
    user,
  };
}

/** True when caller is a party on the job (motorist or assigned pro). */
export function isJobParty(
  userId: string,
  job: { motoristId?: string | null; repairProId?: string | null }
): boolean {
  return userId === job.motoristId || userId === job.repairProId;
}
