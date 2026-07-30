import { apiFail, apiOk } from "@/lib/server/api-json";
import { createServiceSupabase } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { getUserFromRequest } from "@/lib/server/auth-utils";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  pushEnabled: z.boolean().optional(),
  emailEnabled: z.boolean().optional(),
  smsEnabled: z.boolean().optional(),
  jobAlerts: z.boolean().optional(),
  messageAlerts: z.boolean().optional(),
  promotionalAlerts: z.boolean().optional(),
  quietHoursStart: z.string().optional(),
  quietHoursEnd: z.string().optional(),
});

export async function PATCH(req: Request) {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Database not configured", 503, "no_db");
  }
  const user = await getUserFromRequest(req);
  if (!user) return apiFail("Unauthorized", 401);

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return apiFail("Invalid body", 400);

  const supabase = createServiceSupabase();
  const existing = await supabase
    .from("profiles")
    .select("notification_preferences")
    .eq("id", user.id)
    .single();

  const merged = {
    ...((existing.data?.notification_preferences as Record<string, unknown>) || {}),
    ...parsed.data,
  };

  const { error } = await supabase
    .from("profiles")
    .update({ notification_preferences: merged })
    .eq("id", user.id);

  if (error) return apiFail(error.message, 500);
  return apiOk({ saved: true });
}

export async function GET(req: Request) {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Database not configured", 503, "no_db");
  }
  const user = await getUserFromRequest(req);
  if (!user) return apiFail("Unauthorized", 401);

  const supabase = createServiceSupabase();
  const { data, error } = await supabase
    .from("profiles")
    .select("notification_preferences")
    .eq("id", user.id)
    .single();

  if (error) return apiFail(error.message, 500);
  return apiOk(data?.notification_preferences || {});
}
