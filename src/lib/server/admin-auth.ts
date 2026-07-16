/**
 * Admin session + Customer Care authorization.
 * Builds on modular security (roles, sensitive unlock, idle timeout, audit).
 */

import { cookies } from "next/headers";
import { createServiceSupabase } from "@/lib/supabase/server";
import type { ProfileRow } from "@/lib/supabase/types";
import {
  ADMIN_IDLE_TIMEOUT_MS,
  ADMIN_SESSION_COOKIE,
  clientIp,
  userAgent,
} from "@/lib/server/modules/security";
import {
  type AdminRole,
  type CarePermission,
  normalizeAdminRole,
  roleHasPermission,
} from "@/lib/server/modules/admin-roles";
import { readUnlockFromCookies } from "@/lib/server/modules/sensitive-unlock";
import { writeAuditLog } from "@/lib/server/modules/audit";
import { PASSWORD_GATED } from "@/lib/server/modules/admin-roles";
import { rateLimit } from "@/lib/server/modules/rate-limit";

export { ADMIN_SESSION_COOKIE };

export interface AdminSession {
  userId: string;
  email: string;
  fullName: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  /** Last activity (ms) for idle timeout */
  lastActivityAt?: number;
  adminRole?: AdminRole;
}

export type AdminProfile = ProfileRow & {
  admin_role?: string | null;
};

export async function readAdminSession(): Promise<AdminSession | null> {
  const jar = await cookies();
  const raw = jar.get(ADMIN_SESSION_COOKIE)?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(raw, "base64url").toString("utf8")
    ) as AdminSession;
    if (!parsed?.userId || !parsed?.accessToken) return null;

    // Idle timeout
    const last = parsed.lastActivityAt || parsed.expiresAt * 1000 || 0;
    if (last > 0 && Date.now() - last > ADMIN_IDLE_TIMEOUT_MS) {
      jar.set(ADMIN_SESSION_COOKIE, "", {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 0,
      });
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function encodeAdminSession(session: AdminSession): string {
  return Buffer.from(
    JSON.stringify({
      ...session,
      lastActivityAt: Date.now(),
    }),
    "utf8"
  ).toString("base64url");
}

/** Touch session activity (call on successful admin API use) */
export async function touchAdminSession(session: AdminSession): Promise<void> {
  try {
    const jar = await cookies();
    jar.set(
      ADMIN_SESSION_COOKIE,
      encodeAdminSession({ ...session, lastActivityAt: Date.now() }),
      {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 8, // 8h hard cap; idle still enforced
      }
    );
  } catch {
    /* ignore cookie write failures in edge cases */
  }
}

export async function requireAdmin(): Promise<{
  session: AdminSession;
  profile: AdminProfile;
  adminRole: AdminRole;
}> {
  const session = await readAdminSession();
  if (!session) {
    throw new AdminAuthError("Not authenticated", 401);
  }

  const supabase = createServiceSupabase();
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", session.userId)
    .maybeSingle();

  if (error || !profile) {
    throw new AdminAuthError("Profile not found", 401);
  }

  // Accept role admin OR explicit care staff flags
  const role = String(profile.role || "");
  const isStaff =
    role === "admin" ||
    role === "customer_care" ||
    role === "support" ||
    role === "super_admin";
  if (!isStaff || !profile.is_active) {
    throw new AdminAuthError("Admin access required", 403);
  }

  const adminRole = normalizeAdminRole(
    (profile as AdminProfile).admin_role ||
      (role === "customer_care"
        ? "customer_care"
        : role === "support"
          ? "support"
          : "super_admin")
  );

  await touchAdminSession(session);

  return {
    session,
    profile: profile as AdminProfile,
    adminRole,
  };
}

export async function requirePermission(
  perm: CarePermission
): Promise<{
  session: AdminSession;
  profile: AdminProfile;
  adminRole: AdminRole;
}> {
  const ctx = await requireAdmin();
  if (!roleHasPermission(ctx.adminRole, perm)) {
    throw new AdminAuthError(`Permission denied: ${perm}`, 403);
  }
  return ctx;
}

/**
 * Require sensitive unlock (password 336699) for gated actions.
 * Also enforces role permission + rate limit.
 */
export async function requireSensitiveAction(
  perm: CarePermission,
  req: Request
): Promise<{
  session: AdminSession;
  profile: AdminProfile;
  adminRole: AdminRole;
  ip: string;
}> {
  const ctx = await requirePermission(perm);
  const ip = clientIp(req);

  const rl = rateLimit({
    key: `sensitive:${ctx.session.userId}:${ip}`,
    limit: 30,
    windowMs: 60_000,
  });
  if (!rl.ok) {
    throw new AdminAuthError(
      `Too many sensitive attempts. Retry in ${rl.retryAfterSec}s`,
      429
    );
  }

  if (PASSWORD_GATED.includes(perm)) {
    const unlock = await readUnlockFromCookies(ctx.session.userId);
    if (!unlock.unlocked) {
      throw new AdminAuthError(
        "Sensitive action locked. Enter temporary password 336699 to unlock.",
        403,
        "sensitive_locked"
      );
    }
  }

  return { ...ctx, ip };
}

export class AdminAuthError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function logAdminAction(
  adminId: string,
  action: string,
  targetUserId: string | null,
  meta: Record<string, unknown> = {}
) {
  await writeAuditLog({
    adminId,
    action,
    targetUserId,
    meta,
    sensitive: Boolean(meta.sensitive),
  });
}

export { clientIp, userAgent };
