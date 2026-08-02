import { z } from "zod";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { createServiceSupabase } from "@/lib/supabase/server";
import {
  getSupabaseAnonKey,
  getSupabaseUrl,
  isSupabaseAdminConfigured,
} from "@/lib/supabase/env";
import { createClient } from "@supabase/supabase-js";
import { getBearerToken, getUserFromToken } from "@/lib/server/auth-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  access_token: z.string().min(10).optional(),
  // Accept any string id; bare userId alone is ignored without a token
  userId: z.string().min(1).optional(),
}).passthrough();

/**
 * Server-side logout: force Go Live OFF before session ends.
 * Prevents ghost "online" Repair Pros after logout or account switch.
 * Requires a valid access_token — bare userId is ignored (DoS / force-offline).
 */
export async function POST(req: Request) {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Server not configured", 503);
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    json = {};
  }
  const parsed = bodySchema.safeParse(json ?? {});
  if (!parsed.success) return apiFail("Invalid body", 400);

  const headerToken = getBearerToken(req);
  const token = headerToken || parsed.data.access_token || null;

  if (!token) {
    return apiOk({ cleared: false, reason: "auth_required" });
  }

  let userId: string | null = null;
  const fromHelper = await getUserFromToken(token);
  if (fromHelper) {
    userId = fromHelper.id;
  } else {
    const url = getSupabaseUrl();
    const anon = getSupabaseAnonKey();
    const userClient = createClient(url, anon, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data } = await userClient.auth.getUser(token);
    if (data.user) userId = data.user.id;
  }

  // Ignore body.userId unless it matches the token subject
  if (
    parsed.data.userId &&
    userId &&
    parsed.data.userId !== userId
  ) {
    return apiFail("userId does not match session", 403);
  }

  if (!userId) {
    return apiOk({ cleared: false, reason: "invalid_token" });
  }

  const sb = createServiceSupabase();
  // Always force Away on logout (safe if no pro profile)
  await sb
    .from("repair_pro_profiles")
    .update({
      is_online: false,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  return apiOk({ cleared: true, userId });
}
