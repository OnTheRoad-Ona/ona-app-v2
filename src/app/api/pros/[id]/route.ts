import { apiFail, apiOk } from "@/lib/server/api-json";
import { hasRecentLiveHeartbeat } from "@/lib/matching";
import {
  listProReviews,
  toProfileReview,
} from "@/lib/server/reviews";
import { createServiceSupabase } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { mapProToTechnician } from "@/lib/supabase/mappers";
import { isSyntheticAccount } from "@/lib/server/synthetic-accounts";
import type { ProfileRow, RepairProRow } from "@/lib/supabase/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/pros/[id] — single Live Repair Pro for motorist deep-links.
 * Only when: approved + is_online + profiles.role = repair_pro.
 * Includes live reviews so motorists can read before offering.
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

    const proRow = pro as RepairProRow;
    if (
      !proRow.is_online ||
      !hasRecentLiveHeartbeat(proRow.location_updated_at)
    ) {
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

    // Never expose a demo/audit pro to a real customer deep-link.
    if (
      isSyntheticAccount({
        email: (profile as ProfileRow).email,
        fullName: (profile as ProfileRow).full_name,
        businessName: proRow.business_name,
      })
    ) {
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

    const reviewRows = await listProReviews(id, 30);
    const reviews = reviewRows.map(toProfileReview);

    return apiOk({
      technician,
      reviews,
      ratingAvg: technician.rating,
      ratingCount: technician.reviewCount,
    });
  } catch (e) {
    console.error(e);
    return apiFail("Failed to load technician", 500);
  }
}
