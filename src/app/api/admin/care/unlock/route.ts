import { z } from "zod";
import {
  AdminAuthError,
  requireAdmin,
  clientIp,
  userAgent,
  logAdminAction,
} from "@/lib/server/admin-auth";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { rateLimit } from "@/lib/server/modules/rate-limit";
import {
  clearUnlockCookie,
  setUnlockCookie,
  verifyPasswordAndCreateToken,
} from "@/lib/server/modules/sensitive-unlock";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { SENSITIVE_UNLOCK_TTL_MS } from "@/lib/server/modules/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  password: z.string().min(1),
});

/** POST — unlock sensitive actions with temporary password 336699 */
export async function POST(req: Request) {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Supabase is not configured", 503, "supabase_not_configured");
  }
  try {
    const { session } = await requireAdmin();
    const ip = clientIp(req);
    const rl = rateLimit({
      key: `unlock:${session.userId}:${ip}`,
      limit: 8,
      windowMs: 5 * 60_000,
    });
    if (!rl.ok) {
      return apiFail(
        `Too many unlock attempts. Wait ${rl.retryAfterSec}s`,
        429,
        "rate_limited"
      );
    }

    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) return apiFail("Password required", 400);

    const check = verifyPasswordAndCreateToken(
      parsed.data.password,
      session.userId
    );
    if (!check.ok) {
      await logAdminAction(session.userId, "sensitive_unlock_failed", null, {
        sensitive: true,
        ip,
        user_agent: userAgent(req),
      });
      return apiFail("Invalid temporary password", 403, "bad_password");
    }

    const exp = await setUnlockCookie(session.userId);
    await logAdminAction(session.userId, "sensitive_unlock_ok", null, {
      sensitive: true,
      ip,
      user_agent: userAgent(req),
      expiresAt: exp,
    });

    return apiOk({
      unlocked: true,
      expiresAt: exp,
      ttlMs: SENSITIVE_UNLOCK_TTL_MS,
      message: "Sensitive actions unlocked for 10 minutes",
    });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return apiFail(e.message, e.status, e.code || "auth");
    }
    return apiFail("Unlock failed", 500);
  }
}

/** DELETE — clear unlock */
export async function DELETE() {
  try {
    await requireAdmin();
    await clearUnlockCookie();
    return apiOk({ unlocked: false });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return apiFail(e.message, e.status, "auth");
    }
    return apiFail("Failed", 500);
  }
}
