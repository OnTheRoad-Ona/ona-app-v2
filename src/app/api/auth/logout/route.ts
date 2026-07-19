import { z } from "zod";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { createServiceSupabase } from "@/lib/supabase/server";
import {
  getSupabaseAnonKey,
  getSupabaseUrl,
  isSupabaseAdminConfigured,
} from "@/lib/supabase/env";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  access_token: z.string().min(10).optional(),
  userId: z.string().uuid().optional(),
});

/**
 * Server-side logout: force Go Live OFF before session ends.
 * Prevents ghost "online" Repair Pros after logout or account switch.
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

  let userId = parsed.data.userId || null;
  if (parsed.data.access_token) {
    const url = getSupabaseUrl();
    const anon = getSupabaseAnonKey();
    const userClient = createClient(url, anon, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data } = await userClient.auth.getUser(parsed.data.access_token);
    if (data.user) userId = data.user.id;
  }

  if (!userId) {
    return apiOk({ cleared: false, reason: "no_user" });
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
