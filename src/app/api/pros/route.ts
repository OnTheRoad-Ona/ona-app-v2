import { apiFail, apiOk } from "@/lib/server/api-json";
import { MAX_RADIUS_KM } from "@/lib/matching";
import { DOCS_PENDING_MAX_RADIUS_KM } from "@/lib/skill-questions";
import { createServiceSupabase } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { mapProToTechnician } from "@/lib/supabase/mappers";
import type { ProfileRow, RepairProRow } from "@/lib/supabase/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public marketplace feed for Motorists.
 * Only Repair Pros who are:
 *  - approved
 *  - currently in professional role (profiles.role = repair_pro)
 *  - Live / online (is_online = true)
 *  - within MAX_RADIUS_KM (10 km) of the request lat/lng
 *    (motorist GPS or “help someone else” meet pin)
 *
 * Away pros and users switched to Customer mode are hidden.
 */
export async function GET(req: Request) {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Supabase is not configured", 503, "supabase_not_configured");
  }

  const { searchParams } = new URL(req.url);
  const lat = Number(searchParams.get("lat"));
  const lng = Number(searchParams.get("lng"));
  const userCoords = {
    lat: Number.isFinite(lat) ? lat : 6.5244,
    lng: Number.isFinite(lng) ? lng : 3.3792,
  };

  try {
    const supabase = createServiceSupabase();
    // Live only — not suspended/rejected. Pending+approved both OK when Live.
    // Slim columns only: never pull certification_file_url / skills base64 (multi-MB thrash).
    const proColumns = [
      "user_id",
      "business_name",
      "primary_service",
      "services",
      "status",
      "is_online",
      "rating_avg",
      "rating_count",
      "lat",
      "lng",
      "location_updated_at",
      "service_radius_km",
      "years_experience",
      "bio",
      "verified",
      "labour_prices",
      "pricing_currency",
      "vehicle_focus",
      "jobs_completed",
      "avg_response_minutes",
      "completion_rate",
      "docs_status",
      "face_liveness_verified",
      "in_person_verified",
      "visibility_tier",
      "is_new_artisan",
      "go_live_window_ends_at",
    ].join(",");

    // Live + not suspended/rejected. Tier filter applied in JS so null tier
    // after T2 approve (or lag) still appears when verified/approved.
    let prosQuery = supabase
      .from("repair_pro_profiles")
      .select(proColumns)
      .eq("is_online", true)
      .neq("status", "suspended")
      .neq("status", "rejected")
      .order("rating_avg", { ascending: false })
      .limit(40);

    let { data: pros, error } = await prosQuery;

    // Pre-migration fallback: no visibility_tier column yet
    if (error && /visibility_tier|location_updated_at|column/i.test(error.message)) {
      const fallback = await supabase
        .from("repair_pro_profiles")
        .select(
          [
            "user_id",
            "business_name",
            "primary_service",
            "services",
            "status",
            "is_online",
            "rating_avg",
            "rating_count",
            "lat",
            "lng",
            "service_radius_km",
            "years_experience",
            "bio",
            "verified",
            "labour_prices",
            "pricing_currency",
            "vehicle_focus",
            "jobs_completed",
            "avg_response_minutes",
            "completion_rate",
            "docs_status",
            "face_liveness_verified",
            "in_person_verified",
          ].join(",")
        )
        .eq("is_online", true)
        .neq("status", "suspended")
        .neq("status", "rejected")
        .order("rating_avg", { ascending: false })
        .limit(80);
      pros = fallback.data;
      error = fallback.error;
    }

    if (error) return apiFail(error.message, 500);

    const list = ((pros ?? []) as unknown as RepairProRow[]).filter((p) => {
      if (p.status === "suspended" || p.status === "rejected") return false;
      const tier = Number(p.visibility_tier);
      // T1 never appears. Null tier + approved/verified counts as marketplace-ready (T2+)
      if (Number.isFinite(tier) && tier >= 1 && tier < 2) return false;
      if (!Number.isFinite(tier) || tier < 1) {
        const verified = Boolean(p.verified);
        const okStatus = p.status === "approved" || p.status === "pending";
        if (!verified && p.status !== "approved") return false;
        if (!okStatus && !verified) return false;
      }
      return true;
    });
    if (!list.length) {
      return apiOk({ technicians: [], count: 0 });
    }

    // Prefer active repair_pro role, but do not hide Live pros if role lag
    const ids = list.map((p) => p.user_id);
    const { data: profiles } = await supabase
      .from("profiles")
      .select(
        "id,role,full_name,phone,email,avatar_url,city,area,is_active,phone_verified,email_verified"
      )
      .in("id", ids)
      .eq("is_active", true);

    const byId = new Map(
      ((profiles ?? []) as unknown as ProfileRow[]).map((p) => [p.id, p])
    );

    const technicians = list
      .filter((p) => {
        const profile = byId.get(p.user_id);
        // Hide only if profile missing/inactive; role may lag behind Live toggle
        if (!profile) return false;
        // Prefer repair_pro role, but if they are Live (is_online) still show
        // even when role lag/switch briefly says motorist — reduces empty lists.
        if (profile.role === "motorist" && !p.is_online) return false;
        return true;
      })
      .filter((p) => {
        // Must have real backend coordinates to appear
        const plat = p.lat;
        const plng = p.lng;
        return (
          typeof plat === "number" &&
          typeof plng === "number" &&
          Number.isFinite(plat) &&
          Number.isFinite(plng) &&
          !(plat === 0 && plng === 0)
        );
      })
      .filter((p) => {
        // Tier 2 30-day window: hide if Live window expired
        const tier = Number(p.visibility_tier ?? 4);
        if (tier === 2 && p.go_live_window_ends_at) {
          const ends = Date.parse(String(p.go_live_window_ends_at));
          if (Number.isFinite(ends) && ends < Date.now()) return false;
        }
        return true;
      })
      .map((pro) =>
        mapProToTechnician(pro, byId.get(pro.user_id) ?? null, userCoords)
      )
      // Pre-filter with haversine + tier radius caps
      .filter((t) => {
        if (
          !t.hasLiveLocation ||
          typeof t.distanceKm !== "number" ||
          !Number.isFinite(t.distanceKm)
        ) {
          return false;
        }
        const tier = t.visibilityTier ?? 4;
        // Match client matching: T2=5 · T3=8 · T4=10 (Live pros must be findable)
        const tierCap =
          tier === 2 ? 5 : tier === 3 ? 8 : tier >= 4 ? MAX_RADIUS_KM : 0;
        const docsPending =
          t.docsStatus === "under_review" || t.docsStatus === "rejected";
        const docsCap = docsPending
          ? Math.min(MAX_RADIUS_KM, DOCS_PENDING_MAX_RADIUS_KM)
          : MAX_RADIUS_KM;
        const cap = Math.min(MAX_RADIUS_KM, tierCap || MAX_RADIUS_KM, docsCap);
        return t.distanceKm <= cap + 0.75;
      });

    // DATA FIX: haversine only for marketplace list.
    // Google Distance Matrix on every home refresh was a top mobile-data consumer.
    // Road ETA can be added later on single-pro detail if needed.
    const techniciansFinal = technicians
      .filter((t) => {
        if (typeof t.distanceKm !== "number" || !Number.isFinite(t.distanceKm)) {
          return false;
        }
        const docsPending =
          t.docsStatus === "under_review" || t.docsStatus === "rejected";
        const cap = docsPending
          ? Math.min(MAX_RADIUS_KM, DOCS_PENDING_MAX_RADIUS_KM)
          : MAX_RADIUS_KM;
        return t.distanceKm <= cap;
      })
      .sort((a, b) => (a.distanceKm ?? 99) - (b.distanceKm ?? 99))
      .slice(0, 16);

    return apiOk({
      technicians: techniciansFinal,
      count: techniciansFinal.length,
      meta: {
        origin: userCoords,
        maxRadiusKm: MAX_RADIUS_KM,
        docsPendingRadiusKm: DOCS_PENDING_MAX_RADIUS_KM,
        liveProsInDb: list.length,
        afterRadius: techniciansFinal.length,
        etaSource: "haversine_fast",
      },
    });
  } catch (e) {
    console.error(e);
    return apiFail("Failed to load repair pros", 500);
  }
}
