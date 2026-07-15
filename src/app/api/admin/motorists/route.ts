import { AdminAuthError, requireAdmin } from "@/lib/server/admin-auth";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { createServiceSupabase } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * List motorists with vehicle + identity fields from motorist_profiles.
 * Query: q (search), active (true|false), verified (full|partial|none)
 */
export async function GET(req: Request) {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Supabase is not configured", 503, "supabase_not_configured");
  }
  try {
    await requireAdmin();
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();
    const active = searchParams.get("active");
    const verified = searchParams.get("verified");

    const supabase = createServiceSupabase();

    let query = supabase
      .from("profiles")
      .select(
        `id, role, full_name, phone, email, city, area, is_active, created_at, updated_at,
         motorist_profiles(
           vehicle_make, vehicle_model, vehicle_year, plate_number,
           address_text, default_lat, default_lng,
           nin_last4, bvn_last4, nin_verified, bvn_verified, identity_verified_at
         )`
      )
      .eq("role", "motorist")
      .order("created_at", { ascending: false })
      .limit(300);

    if (active === "true") query = query.eq("is_active", true);
    if (active === "false") query = query.eq("is_active", false);

    if (q) {
      query = query.or(
        `full_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%,city.ilike.%${q}%`
      );
    }

    const { data, error } = await query;
    if (error) return apiFail(error.message, 500);

    type MotEmbed = {
      vehicle_make: string | null;
      vehicle_model: string | null;
      vehicle_year: string | null;
      plate_number: string | null;
      address_text: string | null;
      default_lat: number | null;
      default_lng: number | null;
      nin_last4: string | null;
      bvn_last4: string | null;
      nin_verified: boolean;
      bvn_verified: boolean;
      identity_verified_at: string | null;
    };

    let motorists = (data ?? []).map((row) => {
      const raw = row.motorist_profiles as MotEmbed | MotEmbed[] | null;
      const mot = Array.isArray(raw) ? raw[0] : raw;
      const ninOk = Boolean(mot?.nin_verified);
      const bvnOk = Boolean(mot?.bvn_verified);
      const verifyLevel =
        ninOk && bvnOk ? "full" : ninOk || bvnOk ? "partial" : "none";
      return {
        ...row,
        motorist: mot ?? null,
        verifyLevel,
      };
    });

    if (verified === "full" || verified === "partial" || verified === "none") {
      motorists = motorists.filter((m) => m.verifyLevel === verified);
    }

    const totals = {
      total: motorists.length,
      active: motorists.filter((m) => m.is_active).length,
      inactive: motorists.filter((m) => !m.is_active).length,
      fullyVerified: motorists.filter((m) => m.verifyLevel === "full").length,
      partial: motorists.filter((m) => m.verifyLevel === "partial").length,
      unverified: motorists.filter((m) => m.verifyLevel === "none").length,
    };

    return apiOk({ motorists, totals });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return apiFail(e.message, e.status, "auth");
    }
    return apiFail("Failed to list motorists", 500);
  }
}
