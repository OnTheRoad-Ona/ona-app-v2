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
    // Live only — motorists must not discover Away / offline pros
    const { data: pros, error } = await supabase
      .from("repair_pro_profiles")
      .select("*")
      .eq("status", "approved")
      .eq("is_online", true)
      .order("rating_avg", { ascending: false })
      .limit(200);

    if (error) return apiFail(error.message, 500);

    const list = (pros ?? []) as RepairProRow[];
    if (!list.length) {
      return apiOk({ technicians: [], count: 0 });
    }

    // Active accounts that are currently signed in as Repair Pro (not Motorist)
    const ids = list.map((p) => p.user_id);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("*")
      .in("id", ids)
      .eq("is_active", true)
      .eq("role", "repair_pro");

    const byId = new Map(
      ((profiles ?? []) as ProfileRow[]).map((p) => [p.id, p])
    );

    const technicians = list
      .filter((p) => byId.has(p.user_id))
      .map((pro) =>
        mapProToTechnician(pro, byId.get(pro.user_id) ?? null, userCoords)
      )
      // Strict 10 km marketplace; docs pending → 2 km only
      .filter((t) => {
        if (
          typeof t.distanceKm !== "number" ||
          !Number.isFinite(t.distanceKm)
        ) {
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
      });

    return apiOk({ technicians, count: technicians.length });
  } catch (e) {
    console.error(e);
    return apiFail("Failed to load repair pros", 500);
  }
}
