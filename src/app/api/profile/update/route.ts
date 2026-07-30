import { z } from "zod";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { createServiceSupabase } from "@/lib/supabase/server";
import {
  getSupabaseAnonKey,
  getSupabaseUrl,
  isSupabaseAdminConfigured,
} from "@/lib/supabase/env";
import { createClient } from "@supabase/supabase-js";
import { isProService } from "@/lib/services";
import type { ProService } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AdminClient = ReturnType<typeof createServiceSupabase>;

/** True if another user already saved this bank code + NUBAN */
async function isBankAccountTakenByOtherUser(
  admin: AdminClient,
  userId: string,
  bankCode: string,
  accountNumber: string
): Promise<boolean> {
  const code = bankCode.trim();
  const num = accountNumber.replace(/\D/g, "");
  if (!code || num.length !== 10) return false;

  const matchRow = (row: {
    user_id?: string;
    bank_code?: string | null;
    bank_account_number?: string | null;
  }) => {
    if (!row || row.user_id === userId) return false;
    const rCode = String(row.bank_code || "").trim();
    const rNum = String(row.bank_account_number || "").replace(/\D/g, "");
    return rCode === code && rNum === num;
  };

  try {
    // Filter by account number first (most selective); code checked in JS
    const [motRes, proRes] = await Promise.all([
      admin
        .from("motorist_profiles")
        .select("user_id, bank_code, bank_account_number")
        .eq("bank_account_number", num)
        .neq("user_id", userId)
        .limit(20),
      admin
        .from("repair_pro_profiles")
        .select("user_id, bank_code, bank_account_number")
        .eq("bank_account_number", num)
        .neq("user_id", userId)
        .limit(20),
    ]);

    const motHits = (motRes.data || []).some(matchRow);
    const proHits = (proRes.data || []).some(matchRow);
    if (motHits || proHits) return true;

    // Fallback: some rows may store number with spaces/dashes — scan by bank_code
    const [motByCode, proByCode] = await Promise.all([
      admin
        .from("motorist_profiles")
        .select("user_id, bank_code, bank_account_number")
        .eq("bank_code", code)
        .neq("user_id", userId)
        .limit(50),
      admin
        .from("repair_pro_profiles")
        .select("user_id, bank_code, bank_account_number")
        .eq("bank_code", code)
        .neq("user_id", userId)
        .limit(50),
    ]);
    return (
      (motByCode.data || []).some(matchRow) ||
      (proByCode.data || []).some(matchRow)
    );
  } catch {
    return false;
  }
}

/**
 * Persist profile fields from the app (labour prices, vehicle, bank, etc.).
 * Auth: Bearer access_token in body.
 */
const bodySchema = z.object({
  access_token: z.string().min(10),
  fullName: z.string().optional(),
  phone: z.string().optional(),
  city: z.string().optional(),
  area: z.string().optional(),
  avatarUrl: z.string().optional(),
  /** UI language: en | pcm | yo | ig | ha | fr | pt | ar | es | sw | zh */
  preferredLocale: z
    .enum([
      "en",
      "pcm",
      "yo",
      "ig",
      "ha",
      "fr",
      "pt",
      "ar",
      "es",
      "sw",
      "zh",
    ])
    .optional(),
  businessName: z.string().optional(),
  bio: z.string().max(144).optional(),
  yearsExperience: z.string().optional(),
  serviceRadiusKm: z.number().optional(),
  services: z.array(z.string()).optional(),
  labourPrices: z.record(z.string(), z.union([z.number(), z.string()])).optional(),
  pricingCurrency: z
    .enum(["NGN", "USD", "GBP", "ZAR", "EUR", "GHS", "KES", "CAD", "AUD"])
    .optional(),
  vehicleMake: z.string().optional(),
  vehicleModel: z.string().optional(),
  vehicleYear: z.string().optional(),
  plateNumber: z.string().optional(),
  vehiclePhoto: z.string().optional(),
  vehicleCommonIssues: z.array(z.string()).optional(),
  vehicles: z
    .array(
      z.object({
        id: z.string(),
        make: z.string(),
        model: z.string(),
        year: z.string().optional(),
        plate: z.string().optional(),
        photo: z.string().optional(),
        commonIssues: z.array(z.string()).optional(),
      })
    )
    .optional(),
  emergencyContact: z
    .object({ name: z.string(), phone: z.string() })
    .nullable()
    .optional(),
  savedLocations: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
        address: z.string(),
        lat: z.number(),
        lng: z.number(),
      })
    )
    .optional(),
  bankName: z.string().optional(),
  bankAccountName: z.string().optional(),
  bankAccountNumber: z.string().optional(),
  bankCode: z.string().optional(),
  password: z.string().min(6).optional(),
  faceLivenessVerified: z.boolean().optional(),
  phoneVerified: z.boolean().optional(),
  guarantor: z
    .object({
      fullName: z.string(),
      phone: z.string(),
      address: z.string().optional(),
      occupation: z.string().optional(),
      relationship: z.string(),
    })
    .optional(),
  gender: z.enum(["male", "female", "prefer_not_to_say"]).optional(),
  /** ISO YYYY-MM-DD */
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  servedVehicleType: z.string().optional(),
  servedBrand: z.string().optional(),
  servedModel: z.string().optional(),
  servedCountry: z.string().optional(),
  servedLocation: z.string().optional(),
  skillAnswers: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(req: Request) {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Server not configured", 503);
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return apiFail("Invalid JSON", 400);
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return apiFail("Invalid profile payload", 400);

  const url = getSupabaseUrl();
  const anon = getSupabaseAnonKey();
  const userClient = createClient(url, anon, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser(
    parsed.data.access_token
  );
  if (userErr || !userData.user) {
    return apiFail(
      "Your login session needs a refresh. Save again, or sign in once more.",
      401,
      "session_expired"
    );
  }

  const userId = userData.user.id;
  const admin = createServiceSupabase();
  const b = parsed.data;

  const { data: profile } = await admin
    .from("profiles")
    .select("role, full_name")
    .eq("id", userId)
    .maybeSingle();

  const role = profile?.role as string | undefined;
  const isRepairPro = role === "repair_pro";

  // DOB age gate (same rules as signup) when client sends a date
  if (b.dateOfBirth != null) {
    const raw = b.dateOfBirth;
    const dob = new Date(`${raw}T12:00:00`);
    const today = new Date();
    if (Number.isNaN(dob.getTime())) {
      return apiFail("Use a valid date of birth.", 400, "validation");
    }
    const [y, month, day] = raw.split("-").map(Number);
    if (
      dob.getFullYear() !== y ||
      dob.getMonth() + 1 !== month ||
      dob.getDate() !== day
    ) {
      return apiFail("Use a valid date of birth.", 400, "validation");
    }
    if (dob.getTime() > today.getTime()) {
      return apiFail(
        "Date of birth cannot be in the future.",
        400,
        "validation"
      );
    }
    let age = today.getFullYear() - dob.getFullYear();
    const m = today.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age -= 1;
    if (age < 16 || age > 120) {
      return apiFail(
        "You must be at least 16 years old.",
        400,
        "validation"
      );
    }
  }

  // Name is immutable for all roles after signup (business name is separate for pros)
  await admin
    .from("profiles")
    .update({
      // full_name is never updated — locked at signup
      ...(b.phone != null ? { phone: b.phone } : {}),
      ...(b.gender != null ? { gender: b.gender } : {}),
      ...(b.dateOfBirth != null
        ? { date_of_birth: b.dateOfBirth }
        : {}),
      ...(b.city != null ? { city: b.city } : {}),
      ...(b.area != null ? { area: b.area } : {}),
      ...(b.avatarUrl != null ? { avatar_url: b.avatarUrl } : {}),
      ...(b.preferredLocale != null
        ? { preferred_locale: b.preferredLocale }
        : {}),
      ...(b.phoneVerified != null
        ? {
            phone_verified: b.phoneVerified,
            ...(b.phoneVerified
              ? { phone_verified_at: new Date().toISOString() }
              : {}),
          }
        : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  // Mirror Tier 1 phone flag onto role tables (admin Care reads motorist_profiles.phone_verified)
  if (b.phoneVerified === true) {
    const ts = new Date().toISOString();
    try {
      await admin
        .from("motorist_profiles")
        .update({ phone_verified: true, phone_verified_at: ts })
        .eq("user_id", userId);
    } catch {
      /* column may be missing on old DBs */
    }
    try {
      await admin
        .from("repair_pro_profiles")
        .update({ phone_verified: true })
        .eq("user_id", userId);
    } catch {
      /* optional */
    }
  }

  const hasBankPatch =
    b.bankName !== undefined ||
    b.bankAccountName !== undefined ||
    b.bankAccountNumber !== undefined ||
    b.bankCode !== undefined;

  // One bank account (code + NUBAN) may only belong to one Ona user
  if (hasBankPatch && (b.bankAccountNumber !== undefined || b.bankCode !== undefined)) {
    let bankCode = (b.bankCode || "").trim();
    let accountNumber = (b.bankAccountNumber || "").replace(/\D/g, "");

    // Merge with existing profile bank if patch is partial
    if (!bankCode || accountNumber.length !== 10) {
      try {
        const [motB, proB] = await Promise.all([
          admin
            .from("motorist_profiles")
            .select("bank_code, bank_account_number")
            .eq("user_id", userId)
            .maybeSingle(),
          admin
            .from("repair_pro_profiles")
            .select("bank_code, bank_account_number")
            .eq("user_id", userId)
            .maybeSingle(),
        ]);
        const existing = isRepairPro ? proB.data : motB.data;
        if (!bankCode) bankCode = String(existing?.bank_code || "").trim();
        if (accountNumber.length !== 10) {
          accountNumber = String(existing?.bank_account_number || "").replace(
            /\D/g,
            ""
          );
          if (b.bankAccountNumber !== undefined) {
            accountNumber = String(b.bankAccountNumber).replace(/\D/g, "");
          }
        }
      } catch {
        /* proceed with provided fields */
      }
    }

    if (bankCode && accountNumber.length === 10) {
      const taken = await isBankAccountTakenByOtherUser(
        admin,
        userId,
        bankCode,
        accountNumber
      );
      if (taken) {
        return apiFail(
          "This bank account is already linked to another Ona account. Use a different account.",
          409,
          "bank_account_in_use"
        );
      }
    }
  }

  // Motorist vehicle + bank (refunds)
  if (
    role === "motorist" ||
    !isRepairPro ||
    b.vehicleMake != null ||
    b.plateNumber != null ||
    (hasBankPatch && !isRepairPro)
  ) {
    await admin.from("motorist_profiles").upsert(
      {
        user_id: userId,
        ...(b.vehicleMake !== undefined
          ? { vehicle_make: b.vehicleMake || null }
          : {}),
        ...(b.vehicleModel !== undefined
          ? { vehicle_model: b.vehicleModel || null }
          : {}),
        ...(b.vehicleYear !== undefined
          ? { vehicle_year: b.vehicleYear || null }
          : {}),
        ...(b.plateNumber !== undefined
          ? { plate_number: b.plateNumber || null }
          : {}),
        ...(b.vehiclePhoto !== undefined
          ? { vehicle_photo: b.vehiclePhoto || null }
          : {}),
        ...(b.vehicleCommonIssues !== undefined
          ? { vehicle_common_issues: b.vehicleCommonIssues }
          : {}),
        ...(b.vehicles !== undefined ? { vehicles: b.vehicles } : {}),
        ...(b.emergencyContact !== undefined
          ? { emergency_contact: b.emergencyContact }
          : {}),
        ...(b.savedLocations !== undefined
          ? { saved_locations: b.savedLocations }
          : {}),
        ...(!isRepairPro
          ? {
              ...(b.bankName !== undefined
                ? { bank_name: b.bankName || null }
                : {}),
              ...(b.bankAccountName !== undefined
                ? { bank_account_name: b.bankAccountName || null }
                : {}),
              ...(b.bankAccountNumber !== undefined
                ? { bank_account_number: b.bankAccountNumber || null }
                : {}),
              ...(b.bankCode !== undefined
                ? { bank_code: b.bankCode || null }
                : {}),
            }
          : {}),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
  }

  if (
    role === "repair_pro" ||
    b.labourPrices ||
    b.businessName != null ||
    (hasBankPatch && isRepairPro)
  ) {
    const labourPrices: Record<string, number> = {};
    if (b.labourPrices) {
      for (const [k, v] of Object.entries(b.labourPrices)) {
        const n =
          typeof v === "number" ? v : Number(String(v).replace(/[^\d.]/g, ""));
        if (Number.isFinite(n) && n > 0) labourPrices[k] = n;
      }
    }

    // Existing pro row — lock skill + years; clamp radius to 10 km
    const { data: existingPro } = await admin
      .from("repair_pro_profiles")
      .select("services, primary_service, years_experience, service_radius_km")
      .eq("user_id", userId)
      .maybeSingle();

    const existingServices = Array.isArray(existingPro?.services)
      ? (existingPro!.services as string[]).filter((s): s is ProService =>
          isProService(s)
        )
      : [];
    const lockedPrimary: ProService | undefined =
      (existingPro?.primary_service &&
      isProService(String(existingPro.primary_service))
        ? (String(existingPro.primary_service) as ProService)
        : undefined) || existingServices[0];

    // Pros may not change trade skills after signup (single primary only)
    const services: ProService[] | undefined = isRepairPro
      ? lockedPrimary
        ? [lockedPrimary]
        : b.services
            ?.filter((s): s is ProService => isProService(s))
            .slice(0, 1)
      : b.services
          ?.filter((s): s is ProService => isProService(s))
          .slice(0, 9);

    // Hard max 10 km for all pros
    const PRO_MAX_RADIUS = 10;
    const clampedRadius =
      b.serviceRadiusKm !== undefined
        ? Math.min(
            PRO_MAX_RADIUS,
            Math.max(1, Number(b.serviceRadiusKm) || 10)
          )
        : undefined;

    const vehicleFocus: Record<string, unknown> = {};
    if (b.servedVehicleType) vehicleFocus.servedVehicleType = b.servedVehicleType;
    if (b.servedBrand) vehicleFocus.servedBrand = b.servedBrand;
    if (b.servedModel) vehicleFocus.servedModel = b.servedModel;
    if (b.servedCountry) vehicleFocus.servedCountry = b.servedCountry;
    if (b.servedLocation) vehicleFocus.servedLocation = b.servedLocation;

    await admin.from("repair_pro_profiles").upsert(
      {
        user_id: userId,
        ...(b.businessName !== undefined
          ? { business_name: b.businessName || null }
          : {}),
        ...(b.bio !== undefined && isRepairPro ? { bio: b.bio || null } : {}),
        // Pros: years only if never set (one-time from My Profile)
        ...(() => {
          if (b.yearsExperience === undefined) return {};
          if (!isRepairPro) {
            return { years_experience: b.yearsExperience || null };
          }
          const raw = existingPro?.years_experience;
          const unset =
            raw == null ||
            String(raw).trim() === "" ||
            String(raw).trim() === "0" ||
            String(raw).trim() === "—";
          if (!unset) return {};
          const next = String(b.yearsExperience).trim();
          if (!next) return {};
          return { years_experience: next };
        })(),
        ...(clampedRadius !== undefined
          ? { service_radius_km: clampedRadius }
          : {}),
        ...(services?.length
          ? {
              services,
              primary_service: services[0],
            }
          : {}),
        ...(b.labourPrices ? { labour_prices: labourPrices } : {}),
        ...(b.pricingCurrency
          ? { pricing_currency: b.pricingCurrency }
          : {}),
        ...(Object.keys(vehicleFocus).length
          ? { vehicle_focus: vehicleFocus }
          : {}),
        ...(b.skillAnswers ? { skills: b.skillAnswers } : {}),
        ...(b.bankName !== undefined ? { bank_name: b.bankName || null } : {}),
        ...(b.bankAccountName !== undefined
          ? { bank_account_name: b.bankAccountName || null }
          : {}),
        ...(b.bankAccountNumber !== undefined
          ? { bank_account_number: b.bankAccountNumber || null }
          : {}),
        ...(b.bankCode !== undefined ? { bank_code: b.bankCode || null } : {}),
        ...(b.faceLivenessVerified != null
          ? {
              face_liveness_verified: b.faceLivenessVerified,
              face_liveness_at: b.faceLivenessVerified
                ? new Date().toISOString()
                : null,
              liveness_passed_at: b.faceLivenessVerified
                ? new Date().toISOString()
                : null,
            }
          : {}),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

    // Auto visibility: liveness + BVN (with T2) → T3; + skill docs → T4
    if (b.faceLivenessVerified) {
      try {
        const { recomputeProVisibility } = await import(
          "@/lib/server/pro-visibility"
        );
        await recomputeProVisibility(admin, userId);
      } catch {
        /* non-fatal */
      }
    }
  }

  // Persist guarantor for Repair Pro
  if (b.guarantor) {
    try {
      await admin.from("repair_pro_guarantors").upsert(
        {
          user_id: userId,
          full_name: b.guarantor.fullName,
          phone: b.guarantor.phone,
          address: b.guarantor.address || null,
          occupation: b.guarantor.occupation || null,
          relationship: b.guarantor.relationship,
        },
        { onConflict: "user_id" }
      );
    } catch {
      /* non-fatal */
    }
  }

  if (b.password) {
    try {
      const { error: pwdErr } = await admin.auth.admin.updateUserById(userId, {
        password: b.password,
      });
      if (pwdErr) {
        console.error("password update failed", pwdErr.message);
      }
    } catch (e) {
      console.error("password update exception", e);
    }
  }

  return apiOk({ updated: true });
}
