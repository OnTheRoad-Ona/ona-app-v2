/**
 * Approved road-route distance for Call-Out billing.
 * Never meters GPS travel. Never uses driven kilometres.
 * Haversine is not a billable source.
 */

import { getGoogleMapsApiKey } from "@/lib/google-maps";
import { computeDriveMetrics } from "@/lib/server/google-eta";

export type ApprovedRoute = {
  distanceKm: number;
  source: "google_distance_matrix" | "google_directions";
  durationText?: string;
  distanceText?: string;
};

export type RouteAttempt =
  | { ok: true; route: ApprovedRoute }
  | { ok: false; reason: "no_road_route" | "invalid_coords" };

function valid(p: { lat: number; lng: number } | null | undefined): boolean {
  if (!p) return false;
  if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return false;
  if (p.lat === 0 && p.lng === 0) return false;
  if (Math.abs(p.lat) > 90 || Math.abs(p.lng) > 180) return false;
  return true;
}

async function tryDirections(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number }
): Promise<ApprovedRoute | null> {
  const key = getGoogleMapsApiKey();
  if (!key) return null;
  try {
    const url = new URL("https://maps.googleapis.com/maps/api/directions/json");
    url.searchParams.set("origin", `${origin.lat},${origin.lng}`);
    url.searchParams.set("destination", `${destination.lat},${destination.lng}`);
    url.searchParams.set("mode", "driving");
    url.searchParams.set("key", key);
    const res = await fetch(url.toString(), { cache: "no-store" });
    const data = (await res.json()) as {
      status?: string;
      routes?: Array<{
        legs?: Array<{
          distance?: { value: number; text: string };
          duration?: { text: string };
        }>;
      }>;
    };
    const leg = data.routes?.[0]?.legs?.[0];
    const meters = leg?.distance?.value;
    if (data.status !== "OK" || meters == null) return null;
    return {
      distanceKm: Math.round((meters / 1000) * 100) / 100,
      source: "google_directions",
      distanceText: leg?.distance?.text,
      durationText: leg?.duration?.text,
    };
  } catch {
    return null;
  }
}

/** Server-only road distance. Retries. Never bills a straight line. */
export async function computeApprovedRoadRoute(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number }
): Promise<RouteAttempt> {
  if (!valid(origin) || !valid(destination)) {
    return { ok: false, reason: "invalid_coords" };
  }
  for (let i = 0; i < 3; i++) {
    const metrics = await computeDriveMetrics(origin, destination);
    if (
      metrics.source === "google_distance_matrix" &&
      Number.isFinite(metrics.distanceKm) &&
      metrics.distanceKm >= 0
    ) {
      return {
        ok: true,
        route: {
          distanceKm: metrics.distanceKm,
          source: "google_distance_matrix",
          durationText: metrics.durationText,
          distanceText: metrics.distanceText,
        },
      };
    }
    const viaDir = await tryDirections(origin, destination);
    if (viaDir) return { ok: true, route: viaDir };
    if (i < 2) await new Promise((r) => setTimeout(r, 200 * (i + 1)));
  }
  return { ok: false, reason: "no_road_route" };
}
