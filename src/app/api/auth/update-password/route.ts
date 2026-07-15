import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { apiFail, apiOk } from "@/lib/server/api-json";
import {
  getSupabaseAnonKey,
  getSupabaseUrl,
  isSupabaseConfigured,
} from "@/lib/supabase/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  access_token: z.string().min(10),
  refresh_token: z.string().min(10),
  password: z.string().min(6),
});

/**
 * POST /api/auth/update-password
 * Completes recovery: client passes session tokens from the email link hash,
 * server sets the new password.
 */
export async function POST(req: Request) {
  if (!isSupabaseConfigured()) {
    return apiFail("Server is not configured", 503);
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return apiFail("Invalid JSON", 400);
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return apiFail(
      "Invalid reset session or password (min 6 characters).",
      400
    );
  }

  const url = getSupabaseUrl();
  const anon = getSupabaseAnonKey();
  const sb = createClient(url, anon, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error: sessErr } = await sb.auth.setSession({
    access_token: parsed.data.access_token,
    refresh_token: parsed.data.refresh_token,
  });
  if (sessErr) {
    return apiFail(
      "Reset link expired or invalid. Request a new password reset.",
      401
    );
  }

  const { error } = await sb.auth.updateUser({
    password: parsed.data.password,
  });
  if (error) {
    return apiFail(error.message, 400);
  }

  return apiOk({
    updated: true,
    message: "Password updated. You can log in with your new password.",
  });
}
