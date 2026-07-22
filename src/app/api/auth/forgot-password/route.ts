import { z } from "zod";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { createServiceSupabase } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { insertHealthLog } from "@/lib/server/health-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  email: z.string().email(),
});

/**
 * POST /api/auth/forgot-password
 * Sends Supabase recovery email (uses project Auth email / custom SMTP / Resend if configured on Supabase).
 */
export async function POST(req: Request) {
  if (!isSupabaseAdminConfigured()) {
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
    return apiFail("Enter a valid email address", 400);
  }

  const email = parsed.data.email.trim().toLowerCase();
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://ona.vercel.app";
  const redirectTo = `${appUrl}/login/reset-password`;

  const supabase = createServiceSupabase();

  // Always return generic success to avoid email enumeration
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo,
  });

  if (error) {
    console.error("[forgot-password]", error.message);
    void insertHealthLog({
      type: "Auth Error",
      severity: "warning",
      message: `Password reset email failed for ${email}: ${error.message}`,
      source: "auth",
      metadata: { email },
    });
    // Still generic message to client
  }

  return apiOk({
    sent: true,
    message:
      "If an account exists for that email, a reset link has been sent. Check your inbox and spam folder.",
  });
}
