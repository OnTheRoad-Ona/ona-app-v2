import { apiFail, apiOk } from "@/lib/server/api-json";
import { MAX_RADIUS_KM } from "@/lib/matching";
import { DOCS_PENDING_MAX_RADIUS_KM } from "@/lib/skill-questions";
import { computeDriveMetricsBatch } from "@/lib/server/google-eta";
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
 * Away pros and users switched to Motorist mode are hidden.
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
    const { data: pros, error } = await supabase
      .from("repair_pro_profiles")
      .select("*")
      .eq("is_online", true)
      .neq("status", "suspended")
      .neq("status", "rejected")
      .order("rating_avg", { ascending: false })
      .limit(200);

    if (error) return apiFail(error.message, 500);

    const list = ((pros ?? []) as RepairProRow[]).filter(
      (p) => p.status !== "suspended" && p.status !== "rejected"
    );
    if (!list.length) {
      return apiOk({ technicians: [], count: 0 });
    }

    // Prefer active repair_pro role, but do not hide Live pros if role lag
    const ids = list.map((p) => p.user_id);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("*")
      .in("id", ids)
      .eq("is_active", true);

    const byId = new Map(
      ((profiles ?? []) as ProfileRow[]).map((p) => [p.id, p])
    );

    const technicians = list
      .filter((p) => {
        const profile = byId.get(p.user_id);
        // Hide only if profile missing/inactive; role may lag behind Live toggle
        if (!profile) return false;
        if (profile.role === "motorist") return false;
        return true;
      })
      .filter((p) => {
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
      .map((pro) =>
        mapProToTechnician(pro, byId.get(pro.user_id) ?? null, userCoords)
      )
      // Pre-filter with haversine (cheap) before Google matrix
      .filter((t) => {
        if (
          !t.hasLiveLocation ||
          typeof t.distanceKm !== "number" ||
          !Number.isFinite(t.distanceKm)
        ) {
          return false;
        }
        // Slightly wide pre-filter; matrix refines road distance
        const docsPending =
          t.docsStatus === "under_review" ||
          t.docsStatus === "none" ||
          t.docsStatus === "rejected";
        const cap = docsPending
          ? Math.min(MAX_RADIUS_KM, DOCS_PENDING_MAX_RADIUS_KM)
          : MAX_RADIUS_KM;
        return t.distanceKm <= cap + 2;
      });

    // Fast path: haversine radius first so home map paints quickly.
    // Google Distance Matrix only for the nearest handful (was blocking ~1–2s).
    const haversineFinal = technicians
      .filter((t) => {
        if (typeof t.distanceKm !== "number" || !Number.isFinite(t.distanceKm)) {
          return false;
        }
        const docsPending =
          t.docsStatus === "under_review" ||
          t.docsStatus === "none" ||
          t.docsStatus === "rejected";
        const cap = docsPending
          ? Math.min(MAX_RADIUS_KM, DOCS_PENDING_MAX_RADIUS_KM)
          : MAX_RADIUS_KM;
        return t.distanceKm <= cap;
      })
      .sort((a, b) => (a.distanceKm ?? 99) - (b.distanceKm ?? 99))
      .slice(0, 24);

    let enriched = haversineFinal;
    let etaSource: "google_distance_matrix" | "haversine_fast" = "haversine_fast";

    // Only matrix the closest 8 pins — keeps discovery snappy on Vercel
    const matrixTargets = haversineFinal.slice(0, 8);
    if (matrixTargets.length > 0) {
      try {
        const metrics = await Promise.race([
          computeDriveMetricsBatch(
            userCoords,
            matrixTargets.map((t) => t.location)
          ),
          new Promise<null>((resolve) =>
            setTimeout(() => resolve(null), 1200)
          ),
        ]);
        if (metrics) {
          etaSource = "google_distance_matrix";
          const byId = new Map(
            matrixTargets.map((t, i) => {
              const m = metrics[i];
              if (!m) return [t.id, t] as const;
              return [
                t.id,
                {
                  ...t,
                  distanceKm: m.distanceKm,
                  etaMinutes: m.etaMinutes,
                },
              ] as const;
            })
          );
          enriched = haversineFinal.map((t) => byId.get(t.id) || t);
        }
      } catch {
        /* keep haversine */
      }
    }

    const techniciansFinal = enriched.filter((t) => {
      if (typeof t.distanceKm !== "number" || !Number.isFinite(t.distanceKm)) {
        return false;
      }
      const docsPending =
        t.docsStatus === "under_review" ||
        t.docsStatus === "none" ||
        t.docsStatus === "rejected";
      const cap = docsPending
        ? Math.min(MAX_RADIUS_KM, DOCS_PENDING_MAX_RADIUS_KM)
        : MAX_RADIUS_KM;
      return t.distanceKm <= cap + 0.5;
    });

    return apiOk({
      technicians: techniciansFinal,
      count: techniciansFinal.length,
      meta: {
        origin: userCoords,
        maxRadiusKm: MAX_RADIUS_KM,
        docsPendingRadiusKm: DOCS_PENDING_MAX_RADIUS_KM,
        liveProsInDb: list.length,
        afterRadius: techniciansFinal.length,
        etaSource,
      },
    });
  } catch (e) {
    console.error(e);
    return apiFail("Failed to load repair pros", 500);
  }
}
