import { createHash, randomInt } from "crypto";
import { z } from "zod";
import { apiFail, apiOk } from "@/lib/server/api-json";
import {
  isAfricaTalkingConfigured,
  normalizeNgPhone,
  sendLoginOtpSms,
} from "@/lib/server/africastalking";
import {
  phoneOrFilter,
  phonesMatch,
} from "@/lib/server/phone-match";
import { emailOtpKey, isDemoOtpAllowed } from "@/lib/auth/demo-otp";
import { createServiceSupabase } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  channel: z.enum(["phone", "email"]),
  /** Phone number or email depending on channel */
  target: z.string().min(3).max(120),
});

function hashCode(dest: string, code: string): string {
  return createHash("sha256")
    .update(`${dest}:${code}:${process.env.SUPABASE_SERVICE_ROLE_KEY || "om"}`)
    .digest("hex");
}

/**
 * Send login/signup OTP to phone or email.
 * Always succeeds in demo mode when SMS/email provider is missing —
 * user can enter DEMO_OTP_CODE (336699).
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
    return apiFail("Choose phone or email and enter a valid target", 400);
  }

  const channel = parsed.data.channel;
  const supabase = createServiceSupabase();

  let dest: string;
  let displayTarget: string;

  if (channel === "phone") {
    const phone = normalizeNgPhone(parsed.data.target);
    if (!phone) {
      return apiFail("Enter a valid phone number (e.g. +234…)", 400);
    }
    dest = phone;
    displayTarget = phone;

    // Login phone must match the number registered at signup (normalized).
    const orFilter = phoneOrFilter(phone);
    const { data: profiles, error: findErr } = await supabase
      .from("profiles")
      .select("id, phone, is_active")
      .eq("is_active", true)
      .or(orFilter)
      .limit(25);
    if (findErr) return apiFail(findErr.message, 500);

    const match = (profiles || []).find((p) => phonesMatch(p.phone, phone));

    if (!match) {
      return apiFail(
        "This phone is not registered. Use the exact number from signup.",
        404,
        "phone_not_registered"
      );
    }
  } else {
    const email = parsed.data.target.trim().toLowerCase();
    if (!email.includes("@") || email.length < 5) {
      return apiFail("Enter a valid email address", 400);
    }
    dest = emailOtpKey(email);
    displayTarget = email;

    const { data: profile, error: findErr } = await supabase
      .from("profiles")
      .select("id, email, is_active")
      .eq("is_active", true)
      .ilike("email", email)
      .maybeSingle();
    if (findErr) return apiFail(findErr.message, 500);
    if (!profile) {
      return apiFail(
        "No Ona account found for this email. Sign up first.",
        404,
        "email_not_registered"
      );
    }
  }

  /**
   * Cooldown only after 4+ failed verify attempts on the latest code.
   * First sends / normal resends are free of the wait message.
   */
  const { data: recent } = await supabase
    .from("phone_otps")
    .select("id, created_at, attempts, consumed_at")
    .eq("phone", dest)
    .order("created_at", { ascending: false })
    .limit(1);

  const last = recent?.[0] as
    | { id?: string; created_at?: string; attempts?: number; consumed_at?: string | null }
    | undefined;
  const failedAttempts = Number(last?.attempts ?? 0);
  if (failedAttempts >= 4 && last?.created_at && !last.consumed_at) {
    const COOLDOWN_MS = 45_000;
    const age = Date.now() - new Date(last.created_at).getTime();
    if (age < COOLDOWN_MS) {
      const wait = Math.ceil((COOLDOWN_MS - age) / 1000);
      return apiFail(
        `Please wait ${wait}s before requesting another code.`,
        429,
        "rate_limited",
        { waitSec: wait, failedAttempts }
      );
    }
  }

  // Always store a real random code; demo 336699 is also accepted on verify.
  // Email delivery uses the fixed demo code only outside production (dev / OTP_DEMO_MODE).
  const code =
    channel === "email" && !isAfricaTalkingConfigured() && isDemoOtpAllowed()
      ? "336699"
      : String(randomInt(100000, 999999));
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  await supabase
    .from("phone_otps")
    .update({ consumed_at: new Date().toISOString() })
    .eq("phone", dest)
    .is("consumed_at", null);

  const { error: insErr } = await supabase.from("phone_otps").insert({
    phone: dest,
    code_hash: hashCode(dest, code),
    expires_at: expiresAt,
  });
  if (insErr) return apiFail(insErr.message, 500);

  let delivery: "sms" | "demo" | "email_demo" = "demo";
  // Never expose "SMS not configured" / demo codes in the client message
  let deliveryNote = "Code sent. Enter it below.";

  if (channel === "phone" && isAfricaTalkingConfigured()) {
    const sms = await sendLoginOtpSms({ to: dest, code });
    if (sms.ok) {
      delivery = "sms";
      deliveryNote = "Code sent by SMS. Enter it below.";
    } else {
      deliveryNote = "Code sent. Enter it below.";
    }
  } else if (channel === "email") {
    // Real email provider not wired yet — demo path (UI stays neutral)
    delivery = "email_demo";
    deliveryNote = "Code sent. Enter it below.";
  }

  return apiOk({
    sent: true,
    channel,
    target: displayTarget,
    expiresInSec: 600,
    delivery,
    message: deliveryNote,
  });
}
