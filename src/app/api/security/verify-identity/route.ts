import { createHash } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { createServiceSupabase } from "@/lib/supabase/server";
import { getSupabaseAnonKey, getSupabaseUrl, isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { emailOtpKey, isDemoOtp, isDemoOtpAllowed } from "@/lib/auth/demo-otp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function hashCode(dest: string, code: string): string {
  return createHash("sha256")
    .update(`${dest}:${code}:${process.env.SUPABASE_SERVICE_ROLE_KEY || "om"}`)
    .digest("hex");
}

const bodySchema = z.object({
  accessToken: z.string().min(10),
  password: z.string().min(1).optional(),
  emailCode: z.string().min(4).max(8).optional(),
  guarantorName: z.string().min(1).optional(),
});

export async function POST(req: Request) {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Server is not configured", 503);
  }

  let json: unknown;
  try { json = await req.json(); } catch { return apiFail("Invalid JSON", 400); }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return apiFail("Provide at least password plus one additional factor", 400);

  const { accessToken, password, emailCode, guarantorName } = parsed.data;

  // Resolve user via auth client (not service role)
  const url = getSupabaseUrl();
  const anon = getSupabaseAnonKey();
  const userClient = createClient(url, anon, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser(accessToken);
  if (userErr || !userData?.user) return apiFail("Session expired. Sign in again.", 401);

  const userId = userData.user.id;
  const userEmail = userData.user.email;
  if (!userEmail) return apiFail("No email on account", 400);

  const admin = createServiceSupabase();
  const results: { factor: string; passed: boolean }[] = [];

  // 1. Password verification
  if (password) {
    const { error: pwdErr } = await userClient.auth.signInWithPassword({ email: userEmail, password });
    const passed = !pwdErr;
    results.push({ factor: "password", passed });
    if (!passed) return apiFail("Current password is incorrect.", 403);
  } else {
    return apiFail("Password is required for identity verification.", 400);
  }

  // 2. Email OTP verification — use same key format as send route
  if (emailCode) {
    const dest = emailOtpKey(userEmail);

    const { data: otpRows } = await admin
      .from("phone_otps")
      .select("*")
      .eq("phone", dest)
      .is("consumed_at", null)
      .order("created_at", { ascending: false })
      .limit(1);

    const otp = otpRows?.[0];
    if (!otp) return apiFail("No code found. Request a new one first.", 400);
    if (new Date(otp.expires_at).getTime() < Date.now()) {
      await admin.from("phone_otps").update({ consumed_at: new Date().toISOString() }).eq("id", otp.id);
      return apiFail("Code expired. Request a new one.", 400);
    }

    const demoOk = isDemoOtp(emailCode) && isDemoOtpAllowed();
    if (demoOk) {
      results.push({ factor: "email_otp", passed: true });
      await admin.from("phone_otps").update({ consumed_at: new Date().toISOString() }).eq("id", otp.id);
    } else {
      const expected = hashCode(dest, emailCode);
      if (expected !== otp.code_hash) {
        await admin.from("phone_otps").update({ attempts: (otp.attempts || 0) + 1 }).eq("id", otp.id);
        return apiFail("Email code is incorrect.", 401);
      }
      results.push({ factor: "email_otp", passed: true });
      await admin.from("phone_otps").update({ consumed_at: new Date().toISOString() }).eq("id", otp.id);
    }
  } else {
    return apiFail("Email verification code is required.", 400);
  }

  // 3. Guarantor name verification
  if (guarantorName) {
    const { data: guarantor } = await admin
      .from("repair_pro_guarantors")
      .select("full_name")
      .eq("user_id", userId)
      .maybeSingle();

    const storedName = (guarantor as { full_name?: string } | null)?.full_name || "";
    const nameMatch = storedName.toLowerCase().trim() === guarantorName.toLowerCase().trim();
    results.push({ factor: "guarantor_name", passed: nameMatch });
    if (!nameMatch) return apiFail("Guarantor name does not match our records.", 403);
  } else {
    return apiFail("Guarantor name is required for verification.", 400);
  }

  return apiOk({ verified: true, factors: results });
}
