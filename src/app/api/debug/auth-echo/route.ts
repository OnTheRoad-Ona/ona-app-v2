import { apiOk } from "@/lib/server/api-json";
import { getBearerToken, getUserFromToken, requireUser } from "@/lib/server/auth-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Temporary diagnostic — remove after job auth fix ships.
 * GET /api/debug/auth-echo
 */
export async function GET(req: Request) {
  const token = getBearerToken(req);
  const hasAuthHeader = Boolean(req.headers.get("authorization"));
  const hasXAccess = Boolean(req.headers.get("x-access-token"));
  const tokenLen = token?.length || 0;
  const tokenPrefix = token ? token.slice(0, 12) + "…" : null;

  let getUserOk = false;
  let getUserErr: string | null = null;
  let userId: string | null = null;
  if (token) {
    try {
      const u = await getUserFromToken(token);
      getUserOk = Boolean(u);
      userId = u?.id || null;
      if (!u) getUserErr = "getUserFromToken returned null";
    } catch (e) {
      getUserErr = e instanceof Error ? e.message : "getUser threw";
    }
  }

  const auth = await requireUser(req);

  return apiOk({
    hasAuthHeader,
    hasXAccess,
    tokenLen,
    tokenPrefix,
    getUserOk,
    getUserErr,
    userId,
    requireUserOk: auth.ok,
    requireUserId: auth.ok ? auth.userId : null,
    envUrlSet: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    envAnonSet: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    path: new URL(req.url).pathname,
  });
}
