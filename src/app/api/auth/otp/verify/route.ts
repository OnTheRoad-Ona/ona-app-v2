import { createHash } from "crypto";
import { z } from "zod";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { normalizeNgPhone } from "@/lib/server/africastalking";
import {
  phoneOrFilter,
  phonesMatch,
} from "@/lib/server/phone-match";
import {
  DEMO_OTP_CODE,
  emailOtpKey,
  isDemoOtp,
} from "@/lib/auth/demo-otp";
import { createServiceSupabase } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { profileToUserProfile } from "@/lib/supabase/mappers";
import type { ProfileRow } from "@/lib/supabase/types";
import type { AccountType, ProService } from "@/lib/types";
import { isProService } from "@/lib/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  channel: z.enum(["phone", "email"]),
  target: z.string().min(3).max(120),
  code: z.string().min(4).max(8),
  preferType: z.enum(["motorist", "professional"]).optional(),
});

function hashCode(dest: string, code: string): string {
  return createHash("sha256")
    .update(`${dest}:${code}:${process.env.SUPABASE_SERVICE_ROLE_KEY || "om"}`)
    .digest("hex");
}

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
    return apiFail("Target and 6-digit code are required", 400);
  }

  const channel = parsed.data.channel;
  const code = parsed.data.code.replace(/\D/g, "");
  if (code.length < 4) {
    return apiFail(`Enter the 6-digit code (demo: ${DEMO_OTP_CODE})`, 400);
  }

  const supabase = createServiceSupabase();
  let dest: string;
  let profileRow: ProfileRow | null = null;

  if (channel === "phone") {
    const phone = normalizeNgPhone(parsed.data.target);
    if (!phone) return apiFail("Invalid phone number", 400);
    dest = phone;

    // Must be the exact signup number (after normalize) — never fall back to a random OR hit
    const { data: found } = await supabase
      .from("profiles")
      .select("*")
      .eq("is_active", true)
      .or(phoneOrFilter(phone))
      .limit(25);

    const list = (found || []) as ProfileRow[];
    profileRow =
      list.find((p) => phonesMatch(p.phone, phone)) || null;
  } else {
    const email = parsed.data.target.trim().toLowerCase();
    if (!email.includes("@")) return apiFail("Invalid email", 400);
    dest = emailOtpKey(email);

    const { data: found } = await supabase
      .from("profiles")
      .select("*")
      .eq("is_active", true)
      .ilike("email", email)
      .maybeSingle();
    profileRow = (found as ProfileRow | null) || null;
  }

  if (!profileRow?.email || !profileRow.id) {
    return apiFail(
      channel === "phone"
        ? "This phone is not registered. Use the exact number from signup."
        : "No registered account for this email. Sign up first.",
      404
    );
  }

  // Demo code always works (until real SMS/email delivery is production-ready)
  const demoOk = isDemoOtp(code);

  if (!demoOk) {
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
      return apiFail(
        `No active code. Tap Send code, or use demo ${DEMO_OTP_CODE}.`,
        400
      );
    }
    if (new Date(otp.expires_at).getTime() < Date.now()) {
      await supabase
        .from("phone_otps")
        .update({ consumed_at: new Date().toISOString() })
        .eq("id", otp.id);
      return apiFail(
        `Code expired. Request a new one or use demo ${DEMO_OTP_CODE}.`,
        400,
        "otp_expired"
      );
    }
    if ((otp.attempts ?? 0) >= 5) {
      await supabase
        .from("phone_otps")
        .update({ consumed_at: new Date().toISOString() })
        .eq("id", otp.id);
      return apiFail("Too many attempts. Request a new code.", 429);
    }

    const expected = hashCode(dest, code);
    if (expected !== otp.code_hash) {
      const nextAttempts = (otp.attempts ?? 0) + 1;
      await supabase
        .from("phone_otps")
        .update({ attempts: nextAttempts })
        .eq("id", otp.id);
      return apiFail(
        nextAttempts >= 4
          ? "Too many incorrect codes. Please wait before requesting another code."
          : "Incorrect code. Try again.",
        401,
        "otp_invalid",
        { failedAttempts: nextAttempts, cooldownAfter: 4 }
      );
    }

    await supabase
      .from("phone_otps")
      .update({ consumed_at: new Date().toISOString() })
      .eq("id", otp.id);
  } else {
    await supabase
      .from("phone_otps")
      .update({ consumed_at: new Date().toISOString() })
      .eq("phone", dest)
      .is("consumed_at", null);
  }

  if (
    parsed.data.preferType === "motorist" &&
    profileRow.role === "repair_pro"
  ) {
    const { data: mot } = await supabase
      .from("motorist_profiles")
      .select("user_id")
      .eq("user_id", profileRow.id)
      .maybeSingle();
    if (!mot) {
      return apiFail(
        "This login has no Customer account. Choose Repair Pro, or sign up as Customer.",
        403
      );
    }
  }
  if (
    parsed.data.preferType === "professional" &&
    profileRow.role === "motorist"
  ) {
    const { data: pro } = await supabase
      .from("repair_pro_profiles")
      .select("user_id")
      .eq("user_id", profileRow.id)
      .maybeSingle();
    if (!pro) {
      return apiFail(
        "This login has no Repair Pro account. Choose Customer, or sign up as Repair Pro.",
        403
      );
    }
  }

  const { data: linkData, error: linkErr } =
    await supabase.auth.admin.generateLink({
      type: "magiclink",
      email: profileRow.email,
    });

  if (linkErr || !linkData?.properties) {
    return apiFail(
      linkErr?.message || "Could not create login session",
      500
    );
  }

  const emailOtp = linkData.properties.email_otp;
  const hashedToken = linkData.properties.hashed_token;

  let access_token: string | null = null;
  let refresh_token: string | null = null;
  let expires_at: number | null = null;

  if (emailOtp) {
    const verified = await supabase.auth.verifyOtp({
      email: profileRow.email,
      token: emailOtp,
      type: "email",
    });
    if (verified.data.session) {
      access_token = verified.data.session.access_token;
      refresh_token = verified.data.session.refresh_token;
      expires_at = verified.data.session.expires_at ?? null;
    }
  }

  if (!access_token && hashedToken) {
    const verified = await supabase.auth.verifyOtp({
      token_hash: hashedToken,
      type: "email",
    });
    if (verified.data.session) {
      access_token = verified.data.session.access_token;
      refresh_token = verified.data.session.refresh_token;
      expires_at = verified.data.session.expires_at ?? null;
    }
  }

  if (!access_token || !refresh_token) {
    return apiFail(
      "Code accepted, but session could not be started. Try password login.",
      500
    );
  }

  if (channel === "phone") {
    const ts = new Date().toISOString();
    await supabase
      .from("profiles")
      .update({
        phone_verified: true,
        phone_verified_at: ts,
        updated_at: ts,
      })
      .eq("id", profileRow.id);
    // Admin Care Tier 1 badge reads motorist_profiles.phone_verified
    try {
      await supabase
        .from("motorist_profiles")
        .update({ phone_verified: true, phone_verified_at: ts })
        .eq("user_id", profileRow.id);
    } catch {
      /* optional columns */
    }
  }

  let role = profileRow.role;
  if (parsed.data.preferType === "professional") {
    role = "repair_pro";
  } else if (parsed.data.preferType === "motorist") {
    role = "motorist";
  }
  if (role !== profileRow.role) {
    await supabase
      .from("profiles")
      .update({ role, updated_at: new Date().toISOString() })
      .eq("id", profileRow.id);
  }

  const accountType: AccountType =
    role === "repair_pro" ? "professional" : "motorist";

  type Bankish = {
    bank_name?: string | null;
    bank_account_name?: string | null;
    bank_account_number?: string | null;
    bank_code?: string | null;
    services?: ProService[] | null;
    primary_service?: string | null;
    business_name?: string | null;
    vehicle_make?: string | null;
    vehicle_model?: string | null;
    vehicle_year?: string | null;
  };

  let extras: {
    services?: ProService[];
    businessName?: string;
    vehicleMake?: string;
    vehicleModel?: string;
    vehicleYear?: string;
    bankName?: string;
    bankAccountName?: string;
    bankAccountNumber?: string;
    bankCode?: string;
  } = {};

  if (accountType === "professional") {
    const { data: pro } = await supabase
      .from("repair_pro_profiles")
      .select("*")
      .eq("user_id", profileRow.id)
      .maybeSingle();
    const pr = pro as Bankish | null;
    extras = {
      services: (pr?.services as ProService[]) ||
        (pr?.primary_service && isProService(pr.primary_service)
          ? [pr.primary_service]
          : undefined),
      businessName: pr?.business_name || undefined,
      bankName: pr?.bank_name || undefined,
      bankAccountName: pr?.bank_account_name || undefined,
      bankAccountNumber: pr?.bank_account_number || undefined,
      bankCode: pr?.bank_code || undefined,
    };
  } else {
    const { data: mot } = await supabase
      .from("motorist_profiles")
      .select("*")
      .eq("user_id", profileRow.id)
      .maybeSingle();
    const m = mot as Bankish | null;
    extras = {
      vehicleMake: m?.vehicle_make || undefined,
      vehicleModel: m?.vehicle_model || undefined,
      vehicleYear: m?.vehicle_year || undefined,
      bankName: m?.bank_name || undefined,
      bankAccountName: m?.bank_account_name || undefined,
      bankAccountNumber: m?.bank_account_number || undefined,
      bankCode: m?.bank_code || undefined,
    };
  }

  const finalProfile: ProfileRow = {
    ...profileRow,
    role,
  };

  const profile = profileToUserProfile(finalProfile, {
    accountType,
    phoneVerified: channel === "phone" ? true : undefined,
    ...extras,
  });

  return apiOk({
    userId: profileRow.id,
    session: {
      access_token,
      refresh_token,
      expires_at,
    },
    profile: {
      id: profileRow.id,
      role,
      full_name: profileRow.full_name,
      phone: profileRow.phone,
      email: profileRow.email,
      city: profileRow.city,
      area: profileRow.area,
      is_active: profileRow.is_active,
      created_at: profileRow.created_at,
      updated_at: profileRow.updated_at,
      avatar_url: profileRow.avatar_url,
    },
    accountType,
    userProfile: profile,
    demoUsed: demoOk,
  });
}
