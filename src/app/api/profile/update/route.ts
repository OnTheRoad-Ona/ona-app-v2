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
  faceLivenessVerified: z.boolean().optional(),
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
    return apiFail("Session expired", 401);
  }

  const userId = userData.user.id;
  const admin = createServiceSupabase();
  const b = parsed.data;

  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  const role = profile?.role as string | undefined;

  await admin
    .from("profiles")
    .update({
      ...(b.fullName != null ? { full_name: b.fullName } : {}),
      ...(b.phone != null ? { phone: b.phone } : {}),
      ...(b.city != null ? { city: b.city } : {}),
      ...(b.area != null ? { area: b.area } : {}),
      ...(b.avatarUrl != null ? { avatar_url: b.avatarUrl } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (role === "motorist" || b.vehicleMake != null || b.plateNumber != null) {
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
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
  }

  if (role === "repair_pro" || b.labourPrices || b.businessName != null) {
    const labourPrices: Record<string, number> = {};
    if (b.labourPrices) {
      for (const [k, v] of Object.entries(b.labourPrices)) {
        const n =
          typeof v === "number" ? v : Number(String(v).replace(/[^\d.]/g, ""));
        if (Number.isFinite(n) && n > 0) labourPrices[k] = n;
      }
    }
    const services = b.services
      ?.filter((s): s is ProService => isProService(s))
      .slice(0, 9);
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
        ...(b.bio !== undefined ? { bio: b.bio || null } : {}),
        ...(b.yearsExperience !== undefined
          ? { years_experience: b.yearsExperience || null }
          : {}),
        ...(b.serviceRadiusKm !== undefined
          ? { service_radius_km: b.serviceRadiusKm }
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
        ...(b.faceLivenessVerified != null
          ? {
              face_liveness_verified: b.faceLivenessVerified,
              face_liveness_at: b.faceLivenessVerified
                ? new Date().toISOString()
                : null,
            }
          : {}),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
  }

  return apiOk({ updated: true });
}
