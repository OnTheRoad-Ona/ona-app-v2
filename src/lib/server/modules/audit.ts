/**
 * Full audit log for admin / Customer Care actions.
 */

import { createServiceSupabase } from "@/lib/supabase/server";

export type AuditMeta = Record<string, unknown>;

export async function writeAuditLog(input: {
  adminId: string;
  action: string;
  targetUserId?: string | null;
  targetJobId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  sensitive?: boolean;
  meta?: AuditMeta;
}): Promise<void> {
  try {
    const supabase = createServiceSupabase();
    await supabase.from("admin_actions").insert({
      admin_id: input.adminId,
      action: input.action,
      target_user_id: input.targetUserId ?? null,
      meta: {
        ...(input.meta || {}),
        target_job_id: input.targetJobId ?? null,
        ip: input.ip ?? null,
        user_agent: input.userAgent ?? null,
        sensitive: input.sensitive === true,
        at: new Date().toISOString(),
      },
    });
  } catch (e) {
    console.error("[audit] write failed", e);
  }
}

export async function listAuditLog(limit = 50) {
  const supabase = createServiceSupabase();
  const { data, error } = await supabase
    .from("admin_actions")
    .select("id, admin_id, action, target_user_id, meta, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}
