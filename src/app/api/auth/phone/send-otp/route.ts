import { createHash, randomInt } from "crypto";
import { z } from "zod";
import { apiFail, apiOk } from "@/lib/server/api-json";
import {
  isAfricaTalkingConfigured,
  normalizeNgPhone,
  sendLoginOtpSms,
} from "@/lib/server/africastalking";
import { createServiceSupabase } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  phone: z.string().min(7).max(32),
});

function hashCode(phone: string, code: string): string {
  return createHash("sha256")
    .update(`${phone}:${code}:${process.env.SUPABASE_SERVICE_ROLE_KEY || "om"}`)
    .digest("hex");
}

export async function POST(req: Request) {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Server is not configured", 503);
  }
  if (!isAfricaTalkingConfigured()) {
    return apiFail(
      "Phone login is not configured yet. Add Africa's Talking keys (AT_USERNAME, AT_API_KEY).",
      503,
      "at_not_configured"
    );
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return apiFail("Invalid JSON", 400);
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return apiFail("Enter a valid phone number", 400);

  const phone = normalizeNgPhone(parsed.data.phone);
  if (!phone) return apiFail("Enter a valid phone number (e.g. +234…)", 400);

  const supabase = createServiceSupabase();

  // Match registered phone (stored formats vary: +234… / 0… / 234…)
  const local0 = phone.startsWith("+234")
    ? `0${phone.slice(4)}`
    : phone.startsWith("+")
      ? phone.slice(1)
      : phone;
  const bare = phone.replace(/\D/g, "");

  const { data: profiles, error: findErr } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, is_active, phone")
    .eq("is_active", true)
    .or(
      `phone.eq.${phone},phone.eq.${local0},phone.eq.${bare},phone.eq.+${bare}`
    )
    .limit(10);

  if (findErr) return apiFail(findErr.message, 500);

  const match =
    (profiles || []).find((p) => {
      const pNorm = p.phone ? normalizeNgPhone(String(p.phone)) : null;
      return pNorm === phone;
    }) || profiles?.[0];

  if (!match) {
    return apiFail(
      "No OgaMecho account found for this phone. Sign up first with this number.",
      404,
      "phone_not_registered"
    );
  }

  // Rate limit: one unconsumed code per phone per 45s
  const { data: recent } = await supabase
    .from("phone_otps")
    .select("id, created_at, consumed_at")
    .eq("phone", phone)
    .is("consumed_at", null)
    .order("created_at", { ascending: false })
    .limit(1);

  const last = recent?.[0];
  if (last?.created_at) {
    const age = Date.now() - new Date(last.created_at).getTime();
    if (age < 45_000) {
      const wait = Math.ceil((45_000 - age) / 1000);
      return apiFail(
        `Please wait ${wait}s before requesting another code.`,
        429,
        "rate_limited"
      );
    }
  }

  const code = String(randomInt(100000, 999999));
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  // Invalidate previous open codes
  await supabase
    .from("phone_otps")
    .update({ consumed_at: new Date().toISOString() })
    .eq("phone", phone)
    .is("consumed_at", null);

  const { error: insErr } = await supabase.from("phone_otps").insert({
    phone,
    code_hash: hashCode(phone, code),
    expires_at: expiresAt,
  });
  if (insErr) return apiFail(insErr.message, 500);

  const sms = await sendLoginOtpSms({ to: phone, code });
  if (!sms.ok) {
    return apiFail(
      `Could not send SMS: ${sms.error}. Check Africa's Talking balance/sandbox.`,
      502,
      "sms_failed"
    );
  }

  return apiOk({
    sent: true,
    phone,
    expiresInSec: 600,
    // Dev/sandbox helper only when explicitly enabled
    ...(process.env.OTP_DEBUG === "1" ? { debugCode: code } : {}),
  });
}
