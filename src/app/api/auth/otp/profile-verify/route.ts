import { createHash } from "crypto";
import { z } from "zod";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { normalizeNgPhone } from "@/lib/server/africastalking";
import { emailOtpKey, isDemoOtp, isDemoOtpAllowed } from "@/lib/auth/demo-otp";
import {
  phoneOrFilter,
  phonesMatch,
} from "@/lib/server/phone-match";
import { createServiceSupabase } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  channel: z.enum(["phone", "email"]),
  target: z.string().min(3).max(120),
  code: z.string().min(4).max(8),
});

function hashCode(dest: string, code: string): string {
  return createHash("sha256")
    .update(`${dest}:${code}:${process.env.SUPABASE_SERVICE_ROLE_KEY || "om"}`)
    .digest("hex");
}

/** Mark profiles + motorist + pro side-tables phone verified for this identity. */
async function markPhoneVerified(
  supabase: ReturnType<typeof createServiceSupabase>,
  destPhone: string
) {
  const ts = new Date().toISOString();
  const { data: found } = await supabase
    .from("profiles")
    .select("id, phone")
    .eq("is_active", true)
    .or(phoneOrFilter(destPhone))
    .limit(25);
  const list = (found || []) as { id: string; phone?: string | null }[];
  const row = list.find((p) => phonesMatch(p.phone, destPhone)) || null;
  if (!row?.id) return;

  await supabase
    .from("profiles")
    .update({
      phone_verified: true,
      phone_verified_at: ts,
      updated_at: ts,
    })
    .eq("id", row.id);

  try {
    await supabase
      .from("motorist_profiles")
      .update({ phone_verified: true, phone_verified_at: ts })
      .eq("user_id", row.id);
  } catch {
    /* optional columns */
  }
  try {
    await supabase
      .from("repair_pro_profiles")
      .update({ phone_verified: true, phone_verified_at: ts })
      .eq("user_id", row.id);
  } catch {
    /* optional columns */
  }
}

/**
 * Verify OTP for profile changes / post-switch re-OTP (NOT a new sign-in session).
 * Validates against phone_otps; demo 336699 when isDemoOtpAllowed().
 * On phone success, sets profiles + side-table phone_verified.
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
    return apiFail("Channel, target, and code are required", 400);
  }

  const { channel, code } = parsed.data;
  const codeClean = code.replace(/\D/g, "");
  if (codeClean.length < 4) {
    return apiFail("Enter the 6-digit code", 400);
  }

  const supabase = createServiceSupabase();
  const dest =
    channel === "phone"
      ? normalizeNgPhone(parsed.data.target)
      : emailOtpKey(parsed.data.target.trim().toLowerCase());

  if (!dest) return apiFail("Invalid target", 400);

  const demoOk = isDemoOtp(codeClean) && isDemoOtpAllowed();
  if (demoOk) {
    await supabase
      .from("phone_otps")
      .update({ consumed_at: new Date().toISOString() })
      .eq("phone", dest)
      .is("consumed_at", null);
    if (channel === "phone") {
      await markPhoneVerified(supabase, dest);
    }
    return apiOk({ verified: true, demoUsed: true });
  }

  const { data: rows, error } = await supabase
    .from("phone_otps")
    .select("*")
    .eq("phone", dest)
    .is("consumed_at", null)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) return apiFail(error.message, 500);
  const otp = rows?.[0];
  if (!otp) {
    return apiFail("No active code. Request a new one.", 400);
  }
  if (new Date(otp.expires_at).getTime() < Date.now()) {
    await supabase
      .from("phone_otps")
      .update({ consumed_at: new Date().toISOString() })
      .eq("id", otp.id);
    return apiFail("Code expired. Request a new one.", 400);
  }
  if ((otp.attempts ?? 0) >= 5) {
    await supabase
      .from("phone_otps")
      .update({ consumed_at: new Date().toISOString() })
      .eq("id", otp.id);
    return apiFail("Too many attempts. Request a new code.", 429);
  }

  const expected = hashCode(dest, codeClean);
  if (expected !== otp.code_hash) {
    const nextAttempts = (otp.attempts ?? 0) + 1;
    await supabase
      .from("phone_otps")
      .update({ attempts: nextAttempts })
      .eq("id", otp.id);
    return apiFail(
      nextAttempts >= 4
        ? "Too many incorrect codes. Please wait before requesting another."
        : "Incorrect code. Try again.",
      401
    );
  }

  await supabase
    .from("phone_otps")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", otp.id);

  if (channel === "phone") {
    await markPhoneVerified(supabase, dest);
  }

  return apiOk({ verified: true, demoUsed: false });
}
