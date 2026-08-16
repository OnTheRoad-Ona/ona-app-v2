import { apiFail, apiOk } from "@/lib/server/api-json";
import { getUserFromRequest } from "@/lib/server/auth-utils";
import { hasRecentLiveHeartbeat, MAX_RADIUS_KM } from "@/lib/matching";
import { DOCS_PENDING_MAX_RADIUS_KM } from "@/lib/skill-questions";
import { createServiceSupabase } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { getMeritScoresForPros } from "@/lib/server/merit/merit-engine";
import { isSyntheticAccount } from "@/lib/server/synthetic-accounts";
import { mapProToTechnician } from "@/lib/supabase/mappers";
import { resolveMarketViewer } from "@/lib/server/market-scope";
import type { ProfileRow, RepairProRow } from "@/lib/supabase/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public marketplace feed for Motorists.
 * Only Repair Pros who are:
 *  - approved / marketplace-ready tier
 *  - signed-in active profile (prefer repair_pro role)
 *  - Live: is_online = true + location_updated_at within 5 min
 *  - within MAX_RADIUS_KM (5 km) of the request lat/lng
 *
 * Away, stale heartbeat, and signed-out ghost pins are hidden.
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
    // Dual-role: never list the signed-in user as a pro for themselves
    // (even when Live on the Repair Pro side).
    const viewer = await getUserFromRequest(req);
    const excludeSelfId = viewer?.id ? String(viewer.id) : null;

    // Role-aware market: an ACTIVE Repair Pro only ever sees their own
    // primary trade's Live pros. Derived from the session — not a client param.
    const marketViewer = await resolveMarketViewer(req, supabase);
    const viewerTrade = marketViewer.trade ?? null;

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
      // Needed so Home/Office/Industrial specialty filters work (solar, plumber, …)
      "skills",
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
    const prosQuery = supabase
      .from("repair_pro_profiles")
      .select(proColumns)
      .eq("is_online", true)
      .neq("status", "suspended")
      .neq("status", "rejected")
      .order("rating_avg", { ascending: false })
      .limit(120);
    if (viewerTrade) prosQuery.eq("primary_service", viewerTrade);

    let { data: pros, error } = await prosQuery;

    // Pre-migration fallback: no visibility_tier column yet
    if (error && /visibility_tier|location_updated_at|column/i.test(error.message)) {
      let fallbackBuilder = supabase
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
        .neq("status", "rejected");
      if (viewerTrade) {
        fallbackBuilder = fallbackBuilder.eq("primary_service", viewerTrade);
      }
      const fallback = await fallbackBuilder
        .order("rating_avg", { ascending: false })
        .limit(80);
      pros = fallback.data;
      error = fallback.error;
    }

    if (error) return apiFail(error.message, 500);

    const nowMs = Date.now();
    const list = ((pros ?? []) as unknown as RepairProRow[]).filter((p) => {
      if (excludeSelfId && String(p.user_id) === excludeSelfId) return false;
      if (p.status === "suspended" || p.status === "rejected") return false;
      // Live only with fresh heartbeat (signed-out / stale pin never listed)
      if (!p.is_online || !hasRecentLiveHeartbeat(p.location_updated_at, nowMs)) {
        return false;
      }
      // Approved/verified pros are marketplace-ready (T2+) even when a stale
      // write left visibility_tier=1 — never hide them from the customer feed
      // (same class as the "approved for Tier 2 but shown Tier 1" bug).
      const rawTier = Number(p.visibility_tier);
      const marketplaceReady =
        (Number.isFinite(rawTier) && rawTier >= 2) ||
        p.gov_id_review_status === "approved" ||
        Boolean(p.verified) ||
        p.status === "approved";
      if (!marketplaceReady) return false;
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
        // Never surface demo/audit pros to real customers.
        if (
          isSyntheticAccount({
            email: profile.email,
            fullName: profile.full_name,
            businessName: p.business_name,
          })
        ) {
          return false;
        }
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
      // Live + GPS: show within marketplace radius (5 km).
      // Do NOT hard-hide on go_live_window expiry while is_online — that caused
      // "I'm Live but customers see empty" after the 30-day T2 window.
      .map((pro) =>
        mapProToTechnician(pro, byId.get(pro.user_id) ?? null, userCoords)
      )
      .filter((t) => {
        if (
          !t.hasLiveLocation ||
          typeof t.distanceKm !== "number" ||
          !Number.isFinite(t.distanceKm)
        ) {
          return false;
        }
        // One simple rule: Live + real pin + within 5 km of customer
        return t.distanceKm <= MAX_RADIUS_KM + 0.75;
      });

    const techniciansFinal = technicians
      .sort((a, b) => (a.distanceKm ?? 99) - (b.distanceKm ?? 99))
      .slice(0, 40);

    // sort=merit → rank by stored merit score, distance as tiebreak.
    // Default remains nearest-first for the marketplace (plan §13.3).
    const sort = searchParams.get("sort");
    if (sort === "merit" && techniciansFinal.length > 1) {
      const scores = await getMeritScoresForPros(
        techniciansFinal.map((t) => String(t.id))
      );
      techniciansFinal.sort((a, b) => {
        const sa = scores.get(String(a.id)) ?? 0;
        const sb = scores.get(String(b.id)) ?? 0;
        if (sb !== sa) return sb - sa;
        return (a.distanceKm ?? 99) - (b.distanceKm ?? 99);
      });
    }

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
        sort: sort === "merit" ? "merit" : "nearest",
        marketScope: viewerTrade ? `trade:${viewerTrade}` : "all",
      },
    });
  } catch (e) {
    console.error(e);
    return apiFail("Failed to load repair pros", 500);
  }
}
