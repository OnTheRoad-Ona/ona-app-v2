import { z } from "zod";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { requireUser } from "@/lib/server/auth-utils";
import { createServiceSupabase } from "@/lib/supabase/server";
import { isVapidConfigured } from "@/lib/push/env";

export const runtime = "nodejs";

const subscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

const bodySchema = z.object({
  subscription: subscriptionSchema,
});

/** Save (and refresh) the current device's web-push subscription for the user. */
export async function POST(req: Request) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;
  if (!isVapidConfigured()) return apiFail("Push not configured", 503);

  let parsed;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch {
    return apiFail("Invalid subscription", 400);
  }

  const { endpoint, keys } = parsed.subscription;
  const sb = createServiceSupabase();
  const { error } = await sb.from("push_subscriptions").upsert(
    {
      user_id: auth.userId,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" }
  );
  if (error) return apiFail(error.message, 500);
  return apiOk({ ok: true });
}