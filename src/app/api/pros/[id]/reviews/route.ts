import { apiFail, apiOk } from "@/lib/server/api-json";
import {
  listProReviews,
  toProfileReview,
} from "@/lib/server/reviews";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { createServiceSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/pros/[id]/reviews — live motorist reviews for a Repair Pro profile.
 * Public so motorists can read before requesting / offering.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Supabase is not configured", 503);
  }
  try {
    const { id } = await ctx.params;
    if (!id) return apiFail("Missing pro id", 400);

    const rows = await listProReviews(id, 40);
    const reviews = rows.map(toProfileReview);

    // Fresh aggregates from pro profile (fallback compute from rows)
    let ratingAvg = 0;
    let ratingCount = reviews.length;
    try {
      const sb = createServiceSupabase();
      const { data: pro } = await sb
        .from("repair_pro_profiles")
        .select("rating_avg, rating_count")
        .eq("user_id", id)
        .maybeSingle();
      if (pro) {
        ratingAvg = Number(pro.rating_avg) || 0;
        ratingCount = Number(pro.rating_count) || reviews.length;
      } else if (rows.length) {
        const sum = rows.reduce((s, r) => s + r.rating, 0);
        ratingAvg = Math.round((sum / rows.length) * 100) / 100;
      }
    } catch {
      if (rows.length) {
        const sum = rows.reduce((s, r) => s + r.rating, 0);
        ratingAvg = Math.round((sum / rows.length) * 100) / 100;
      }
    }

    return apiOk({
      reviews,
      ratingAvg,
      ratingCount,
    });
  } catch (e) {
    return apiFail(
      e instanceof Error ? e.message : "Failed to load reviews",
      500
    );
  }
}
