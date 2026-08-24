/**
 * Admin session + multi-level staff authorization.
 * Builds on modular security (roles, sensitive unlock, idle timeout, audit).
 */

import { createHash, createHmac, timingSafeEqual } from "crypto";
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
  PASSWORD_GATED,
} from "@/lib/server/modules/admin-roles";
import { readUnlockFromCookies } from "@/lib/server/modules/sensitive-unlock";
import { writeAuditLog } from "@/lib/server/modules/audit";
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
    const dot = raw.lastIndexOf(".");
    if (dot <= 0) return null;
    const payload = raw.slice(0, dot);
    const sig = raw.slice(dot + 1);
    const secret = sessionSigningSecret();
    if (!secret) return null;
    const expected = createHmac("sha256", secret)
      .update(payload)
      .digest("base64url");
    if (!safeEqual(expected, sig)) {
      jar.set(ADMIN_SESSION_COOKIE, "", {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 0,
      });
      return null;
    }
    const parsed = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as AdminSession;
    if (!parsed?.userId || !parsed?.accessToken) return null;

    // Idle timeout (30 min default)
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

/** HMAC secret for the admin session cookie explicit env or derived, never a hardcoded constant. */
function sessionSigningSecret(): string | null {
  const explicit = process.env.ADMIN_SESSION_SIGNING_SECRET?.trim();
  if (explicit) return explicit;
  const roleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (roleKey) return createHash("sha256").update(roleKey).digest("hex");
  return null;
}

function safeEqual(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

export function encodeAdminSession(session: AdminSession): string {
  const secret = sessionSigningSecret();
  if (!secret) {
    throw new Error(
      "ADMIN_SESSION_SIGNING_SECRET or SUPABASE_SERVICE_ROLE_KEY is required",
    );
  }
  const payload = Buffer.from(
    JSON.stringify({
      ...session,
      lastActivityAt: Date.now(),
    }),
    "utf8",
  ).toString("base64url");
  const sig = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${sig}`;
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
      },
    );
  } catch {
    /* ignore cookie write failures in edge cases */
  }
}

const STAFF_PROFILE_ROLES = new Set([
  "admin",
  "customer_care",
  "support",
  "senior_support",
  "operations",
  "manager",
  "super_admin",
]);

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

  const role = String(profile.role || "");
  const isStaff = STAFF_PROFILE_ROLES.has(role);
  if (!isStaff || !profile.is_active) {
    throw new AdminAuthError("Admin access required", 403);
  }

  const adminRole = normalizeAdminRole(
    (profile as AdminProfile).admin_role ||
      (role === "customer_care"
        ? "customer_care"
        : role === "support" || role === "senior_support"
          ? "senior_support"
          : role === "operations"
            ? "operations"
            : role === "manager"
              ? "manager"
              : "super_admin"),
  );

  await touchAdminSession(session);

  return {
    session: { ...session, adminRole },
    profile: profile as AdminProfile,
    adminRole,
  };
}

export async function requirePermission(perm: CarePermission): Promise<{
  session: AdminSession;
  profile: AdminProfile;
  adminRole: AdminRole;
}> {
  const ctx = await requireAdmin();
  if (!roleHasPermission(ctx.adminRole, perm)) {
    throw new AdminAuthError(
      `Permission denied (${perm}). Your access level cannot perform this action.`,
      403,
      "permission_denied",
    );
  }
  return ctx;
}

/**
 * Require temporary staff unlock for gated actions.
 * Super Admin skips unlock for most actions, but escrow cancel/refund
 * always requires unlock (temporary access code) for all levels including L5.
 */
export async function requireSensitiveAction(
  perm: CarePermission,
  req: Request,
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
      429,
    );
  }

  const alwaysUnlock: CarePermission[] = ["escrow_refund", "escrow_release"];
  const needsUnlock =
    PASSWORD_GATED.includes(perm) &&
    (alwaysUnlock.includes(perm) || ctx.adminRole !== "super_admin");

  if (needsUnlock) {
    const unlock = await readUnlockFromCookies(ctx.session.userId);
    if (!unlock.unlocked) {
      throw new AdminAuthError(
        "Sensitive action locked. Enter the temporary staff access code to unlock.",
        403,
        "sensitive_locked",
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
  meta: Record<string, unknown> = {},
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
