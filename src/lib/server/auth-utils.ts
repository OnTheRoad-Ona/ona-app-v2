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

/**
 * Cookie session fallback — browser client (@supabase/ssr) stores tokens in
 * cookies. Job pages can race Bearer attach; cookie auth still proves login.
 */
async function getUserFromCookies(): Promise<{
  user: User;
  token: string;
} | null> {
  if (!url || !anon) return null;
  try {
    const { createServerSupabase } = await import("@/lib/supabase/server");
    const sb = await createServerSupabase();
    const { data, error } = await sb.auth.getUser();
    if (error || !data?.user) return null;
    const { data: sess } = await sb.auth.getSession();
    const token = sess.session?.access_token || "";
    return { user: data.user, token };
  } catch {
    return null;
  }
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

  const fromCookie = await getUserFromCookies();
  return fromCookie?.user ?? null;
}

export type AuthUser = { userId: string; email?: string | null; token: string };

/**
 * Require a valid session. Returns auth context or a ready-to-return error Response.
 * Order: Bearer / x-access-token → body access_token → cookie session.
 */
export async function requireUser(
  req: Request,
  opts?: { bodyToken?: string | null }
): Promise<
  | { ok: true; userId: string; email?: string | null; token: string; user: User }
  | { ok: false; response: Response }
> {
  const token = getBearerToken(req) || opts?.bodyToken || null;

  if (token) {
    const user = await getUserFromToken(token);
    if (user) {
      return {
        ok: true,
        userId: user.id,
        email: user.email,
        token,
        user,
      };
    }
  }

  // Body token path (POST only; clone-safe)
  if (!token) {
    try {
      const clone = req.clone();
      const body = (await clone.json().catch(() => null)) as Record<
        string,
        unknown
      > | null;
      const t = body?.access_token;
      if (typeof t === "string" && t.length >= 10) {
        const user = await getUserFromToken(t);
        if (user) {
          return {
            ok: true,
            userId: user.id,
            email: user.email,
            token: t,
            user,
          };
        }
      }
    } catch {
      /* ignore */
    }
  }

  // Cookie session (SSR browser client)
  const fromCookie = await getUserFromCookies();
  if (fromCookie) {
    return {
      ok: true,
      userId: fromCookie.user.id,
      email: fromCookie.user.email,
      token: fromCookie.token,
      user: fromCookie.user,
    };
  }

  return {
    ok: false,
    response: apiFail("Not authenticated", 401, "auth"),
  };
}

/** True when caller is a party on the job (motorist or assigned pro). */
export function isJobParty(
  userId: string,
  job: { motoristId?: string | null; repairProId?: string | null; status?: string }
): boolean {
  if (userId === job.motoristId || userId === job.repairProId) return true;
  if (job.status === "searching" || job.status === "negotiating") return true;
  return false;
}
