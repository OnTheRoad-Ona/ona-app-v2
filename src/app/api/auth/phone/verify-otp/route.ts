import { createHash } from "crypto";
import { z } from "zod";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { normalizeNgPhone } from "@/lib/server/africastalking";
import { createServiceSupabase } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { profileToUserProfile } from "@/lib/supabase/mappers";
import type { ProfileRow, RepairProRow } from "@/lib/supabase/types";
import type { AccountType, ProService } from "@/lib/types";
import { isProService } from "@/lib/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  phone: z.string().min(7).max(32),
  code: z.string().min(4).max(8),
  preferType: z.enum(["motorist", "professional"]).optional(),
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

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return apiFail("Invalid JSON", 400);
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return apiFail("Phone and 6-digit code are required", 400);
  }

  const phone = normalizeNgPhone(parsed.data.phone);
  if (!phone) return apiFail("Invalid phone number", 400);
  const code = parsed.data.code.replace(/\D/g, "");
  if (code.length < 4) return apiFail("Enter the code from your SMS", 400);

  const supabase = createServiceSupabase();

  const { data: rows, error } = await supabase
    .from("phone_otps")
    .select("*")
    .eq("phone", phone)
    .is("consumed_at", null)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) return apiFail(error.message, 500);
  const otp = rows?.[0];
  if (!otp) {
    return apiFail("No active code for this phone. Request a new one.", 400);
  }
  if (new Date(otp.expires_at).getTime() < Date.now()) {
    await supabase
      .from("phone_otps")
      .update({ consumed_at: new Date().toISOString() })
      .eq("id", otp.id);
    return apiFail("Code expired. Request a new one.", 400, "otp_expired");
  }
  if ((otp.attempts ?? 0) >= 5) {
    await supabase
      .from("phone_otps")
      .update({ consumed_at: new Date().toISOString() })
      .eq("id", otp.id);
    return apiFail("Too many attempts. Request a new code.", 429);
  }

  const expected = hashCode(phone, code);
  if (expected !== otp.code_hash) {
    await supabase
      .from("phone_otps")
      .update({ attempts: (otp.attempts ?? 0) + 1 })
      .eq("id", otp.id);
    return apiFail("Incorrect code. Try again.", 401, "otp_invalid");
  }

  // Consume code
  await supabase
    .from("phone_otps")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", otp.id);

  // Find profile by phone (formats: +234… / 0… / bare)
  const local0 = phone.startsWith("+234")
    ? `0${phone.slice(4)}`
    : phone.startsWith("+")
      ? phone.slice(1)
      : phone;
  const bare = phone.replace(/\D/g, "");
  const { data: found } = await supabase
    .from("profiles")
    .select("*")
    .eq("is_active", true)
    .or(
      `phone.eq.${phone},phone.eq.${local0},phone.eq.${bare},phone.eq.+${bare}`
    )
    .limit(10);

  const profileRow =
    ((found || []) as ProfileRow[]).find((p) => {
      const pNorm = p.phone ? normalizeNgPhone(String(p.phone)) : null;
      return pNorm === phone;
    }) || ((found || [])[0] as ProfileRow | undefined);

  if (!profileRow?.email) {
    return apiFail(
      "No registered account for this phone. Sign up first.",
      404
    );
  }

  if (
    parsed.data.preferType === "motorist" &&
    profileRow.role === "repair_pro"
  ) {
    return apiFail(
      "This phone is a Repair Pro account. Choose Repair Pro to log in.",
      403
    );
  }
  if (
    parsed.data.preferType === "professional" &&
    profileRow.role === "motorist"
  ) {
    return apiFail(
      "This phone is a Motorist account. Choose Motorist to log in.",
      403
    );
  }

  // Issue session via magiclink OTP from admin generateLink
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
      "Phone verified, but session could not be started. Try email login.",
      500
    );
  }

  // Build profile payload for client
  const accountType: AccountType =
    profileRow.role === "repair_pro" ? "professional" : "motorist";

  let extras: {
    services?: ProService[];
    businessName?: string;
    vehicleMake?: string;
    vehicleModel?: string;
    vehicleYear?: string;
  } = {};

  if (accountType === "professional") {
    const { data: pro } = await supabase
      .from("repair_pro_profiles")
      .select("*")
      .eq("user_id", profileRow.id)
      .maybeSingle();
    const pr = pro as RepairProRow | null;
    extras = {
      services: (pr?.services as ProService[]) ||
        (pr?.primary_service && isProService(pr.primary_service)
          ? [pr.primary_service]
          : undefined),
      businessName: pr?.business_name || undefined,
    };
  } else {
    const { data: mot } = await supabase
      .from("motorist_profiles")
      .select("*")
      .eq("user_id", profileRow.id)
      .maybeSingle();
    extras = {
      vehicleMake: mot?.vehicle_make || undefined,
      vehicleModel: mot?.vehicle_model || undefined,
      vehicleYear: mot?.vehicle_year || undefined,
    };
  }

  const profile = profileToUserProfile(profileRow, {
    accountType,
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
      role: profileRow.role,
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
  });
}
