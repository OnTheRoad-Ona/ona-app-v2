import { createHash, randomInt } from "crypto";
import { z } from "zod";
import { apiFail, apiOk } from "@/lib/server/api-json";
import {
  isAfricaTalkingConfigured,
  normalizeNgPhone,
  sendLoginOtpSms,
} from "@/lib/server/africastalking";
import { phoneOrFilter, phonesMatch } from "@/lib/server/phone-match";
import {
  DEMO_OTP_CODE,
  emailOtpKey,
  isDemoOtpAllowed,
} from "@/lib/auth/demo-otp";
import { createServiceSupabase } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { runIdempotent } from "@/lib/server/idempotency";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  channel: z.enum(["phone", "email"]),
  /** Phone number or email depending on channel */
  target: z.string().min(3).max(120),
  /**
   * Client idempotency sticker. Retrying with the SAME opKey after a lost
   * response replays the already-issued code (no second SMS, no code
   * rotation). A deliberate resend uses a FRESH opKey to rotate + re-send.
   */
  opKey: z.string().min(1).max(100).optional().nullable(),
  /** Client-echoed actor (echoed back on /api/ops/status verify). */
  opActorId: z.string().min(1).max(200).optional().nullable(),
});

function hashCode(dest: string, code: string): string {
  return createHash("sha256")
    .update(`${dest}:${code}:${process.env.SUPABASE_SERVICE_ROLE_KEY || "om"}`)
    .digest("hex");
}

/**
 * Send login/signup OTP to phone or email.
 * Always succeeds in demo mode when SMS/email provider is missing
 * user can enter DEMO_OTP_CODE (336699).
 *
 * The code-issue + delivery step is ledger-idempotent (runIdempotent):
 * the result is recorded so a retry with the same opKey returns the same
 * code status instead of consuming/rotating the code that already went out.
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

  try {
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
          "phone_not_registered",
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
          "email_not_registered",
        );
      }
    }

    const result = await runIdempotent({
      opKey: parsed.data.opKey || null,
      opType: `otp.send.${channel}`,
      actorKind: channel,
      actorId: parsed.data.opActorId || dest,
      run: async () => {
        // Rate limiting applies only to actually issuing a new code a
        // replay of an already-issued code must never be blocked.
        try {
          const { rateLimit } = await import("@/lib/server/modules/rate-limit");
          const ip =
            req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
            req.headers.get("x-real-ip") ||
            "unknown";
          const rl = rateLimit({
            key: `otp-send:${ip}:${channel}:${dest}`,
            limit: 8,
            windowMs: 10 * 60_000,
          });
          if (!rl.ok) {
            return {
              ok: false as const,
              error: `Too many code requests. Retry in ${rl.retryAfterSec}s.`,
            };
          }
        } catch {
          /* non-fatal */
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
          | {
              id?: string;
              created_at?: string;
              attempts?: number;
              consumed_at?: string | null;
            }
          | undefined;
        const failedAttempts = Number(last?.attempts ?? 0);
        if (failedAttempts >= 4 && last?.created_at && !last.consumed_at) {
          const COOLDOWN_MS = 45_000;
          const age = Date.now() - new Date(last.created_at).getTime();
          if (age < COOLDOWN_MS) {
            const wait = Math.ceil((COOLDOWN_MS - age) / 1000);
            return {
              ok: false as const,
              error: `Please wait ${wait}s before requesting another code.`,
            };
          }
        }

        // When demo mode is on (or no SMS provider for phone), store 336699
        // so hash path and demo path both succeed. Verify also accepts demo.
        const useDemoCode =
          isDemoOtpAllowed() &&
          (channel === "email" || !isAfricaTalkingConfigured());
        const code = useDemoCode
          ? DEMO_OTP_CODE
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
        if (insErr) return { ok: false as const, error: insErr.message };

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
          // Real email provider not wired yet demo path (UI stays neutral)
          delivery = "email_demo";
          deliveryNote = "Code sent. Enter it below.";
        }

        return {
          ok: true as const,
          result: {
            sent: true,
            channel,
            target: displayTarget,
            expiresInSec: 600,
            delivery,
            message: deliveryNote,
          },
        };
      },
    });

    if (result.status === "processing") {
      // A concurrent duplicate is still settling never report failure here.
      // The client verifies against /api/ops/status instead.
      return apiOk({
        sent: false,
        pending: true,
        channel,
      });
    }
    if (result.status === "error") {
      return apiFail(result.error, 400);
    }
    return apiOk(result.result);
  } catch (e) {
    return apiFail(e instanceof Error ? e.message : "Could not send code", 500);
  }
}
