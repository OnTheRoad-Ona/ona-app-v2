/**
 * Broader platform audit (app + admin). Complements admin_actions.
 */

import { createServiceSupabase } from "@/lib/supabase/server";

export async function writePlatformAudit(input: {
  actorId?: string | null;
  actorRole?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  ip?: string | null;
  userAgent?: string | null;
  meta?: Record<string, unknown>;
}): Promise<void> {
  try {
    const supabase = createServiceSupabase();
    await supabase.from("platform_audit_logs").insert({
      actor_id: input.actorId ?? null,
      actor_role: input.actorRole ?? null,
      action: input.action,
      target_type: input.targetType ?? null,
      target_id: input.targetId ?? null,
      old_value: input.oldValue ?? null,
      new_value: input.newValue ?? null,
      ip: input.ip ?? null,
      user_agent: input.userAgent ?? null,
      meta: input.meta ?? {},
    });
  } catch (e) {
    // Table may not exist until migration applied — never break request path
    console.error("[platform-audit] write failed", e);
  }
}
