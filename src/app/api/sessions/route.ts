/**
 * User session registry (device / login history) — DB-backed.
 */

import { z } from "zod";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { createServiceSupabase } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { writePlatformAudit } from "@/lib/server/modules/platform-audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const postSchema = z.object({
  userId: z.string().uuid(),
  deviceLabel: z.string().max(120).optional(),
  userAgent: z.string().max(500).optional(),
});

export async function GET(req: Request) {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Database not configured", 503, "no_db");
  }
  const userId = new URL(req.url).searchParams.get("userId");
  if (!userId) return apiFail("userId required", 400);
  const supabase = createServiceSupabase();
  const { data, error } = await supabase
    .from("user_sessions")
    .select("id, device_label, user_agent, ip, last_seen_at, revoked_at, created_at")
    .eq("user_id", userId)
    .is("revoked_at", null)
    .order("last_seen_at", { ascending: false })
    .limit(40);
  if (error) return apiFail(error.message, 500);
  return apiOk({ sessions: data ?? [] });
}

export async function POST(req: Request) {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Database not configured", 503, "no_db");
  }
  const parsed = postSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiFail("Invalid body", 400, "invalid_body");
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null;
  const supabase = createServiceSupabase();
  const { data, error } = await supabase
    .from("user_sessions")
    .insert({
      user_id: parsed.data.userId,
      device_label: parsed.data.deviceLabel || "Web",
      user_agent:
        parsed.data.userAgent || req.headers.get("user-agent") || null,
      ip,
      last_seen_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error) return apiFail(error.message, 500);
  await writePlatformAudit({
    actorId: parsed.data.userId,
    action: "session.register",
    targetType: "user_session",
    targetId: data?.id,
    ip,
  });
  return apiOk({ sessionId: data?.id });
}

export async function DELETE(req: Request) {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Database not configured", 503, "no_db");
  }
  const url = new URL(req.url);
  const sessionId = url.searchParams.get("sessionId");
  const userId = url.searchParams.get("userId");
  if (!sessionId || !userId) {
    return apiFail("sessionId and userId required", 400);
  }
  const supabase = createServiceSupabase();
  const { error } = await supabase
    .from("user_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", sessionId)
    .eq("user_id", userId);
  if (error) return apiFail(error.message, 500);
  return apiOk({ revoked: true });
}
