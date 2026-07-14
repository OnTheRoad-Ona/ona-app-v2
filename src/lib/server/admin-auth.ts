import { cookies } from "next/headers";
import { createServiceSupabase } from "@/lib/supabase/server";
import type { ProfileRow } from "@/lib/supabase/types";

export const ADMIN_SESSION_COOKIE = "ogamecho_admin_session";

export interface AdminSession {
  userId: string;
  email: string;
  fullName: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export async function readAdminSession(): Promise<AdminSession | null> {
  const jar = await cookies();
  const raw = jar.get(ADMIN_SESSION_COOKIE)?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(raw, "base64url").toString("utf8")
    ) as AdminSession;
    if (!parsed?.userId || !parsed?.accessToken) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function encodeAdminSession(session: AdminSession): string {
  return Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
}

export async function requireAdmin(): Promise<{
  session: AdminSession;
  profile: ProfileRow;
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
  if (profile.role !== "admin" || !profile.is_active) {
    throw new AdminAuthError("Admin access required", 403);
  }

  return { session, profile: profile as ProfileRow };
}

export class AdminAuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function logAdminAction(
  adminId: string,
  action: string,
  targetUserId: string | null,
  meta: Record<string, unknown> = {}
) {
  const supabase = createServiceSupabase();
  await supabase.from("admin_actions").insert({
    admin_id: adminId,
    action,
    target_user_id: targetUserId,
    meta,
  });
}
