import { apiFail, apiOk } from "@/lib/server/api-json";
import { createServiceSupabase } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { mapProToTechnician } from "@/lib/supabase/mappers";
import type { ProfileRow, RepairProRow } from "@/lib/supabase/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/pros/[id] — single Live Repair Pro for motorist deep-links.
 * Only when: approved + is_online + profiles.role = repair_pro.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Supabase is not configured", 503);
  }

  const { id } = await ctx.params;
  if (!id) return apiFail("Missing pro id", 400);

  const { searchParams } = new URL(req.url);
  const lat = Number(searchParams.get("lat"));
  const lng = Number(searchParams.get("lng"));
  const userCoords = {
    lat: Number.isFinite(lat) ? lat : 6.5244,
    lng: Number.isFinite(lng) ? lng : 3.3792,
  };

  try {
    const supabase = createServiceSupabase();
    const { data: pro, error } = await supabase
      .from("repair_pro_profiles")
      .select("*")
      .eq("user_id", id)
      .eq("status", "approved")
      .eq("is_online", true)
      .maybeSingle();

    if (error) return apiFail(error.message, 500);
    if (!pro) {
      return apiFail(
        "This Repair Pro is Away or not available right now.",
        404,
        "pro_offline"
      );
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", id)
      .eq("is_active", true)
      .eq("role", "repair_pro")
      .maybeSingle();

    if (!profile) {
      return apiFail(
        "This Repair Pro is Away or not available right now.",
        404,
        "pro_offline"
      );
    }

    const technician = mapProToTechnician(
      pro as RepairProRow,
      profile as ProfileRow,
      userCoords
    );

    return apiOk({ technician });
  } catch (e) {
    console.error(e);
    return apiFail("Failed to load technician", 500);
  }
}
