/**
 * Server-side Google Distance Matrix for accurate drive ETA + distance.
 * Falls back to haversine if Maps key missing or API errors.
 */

import { getGoogleMapsApiKey } from "@/lib/google-maps";

export type RouteMetrics = {
  distanceKm: number;
  etaMinutes: number;
  source: "google_distance_matrix" | "haversine_fallback";
  durationText?: string;
  distanceText?: string;
};

function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Rough urban drive: ~22 km/h average + 2 min buffer */
function haversineEta(distanceKm: number): number {
  if (distanceKm <= 0.05) return 1;
  return Math.max(1, Math.round((distanceKm / 22) * 60 + 2));
}

export async function computeDriveMetrics(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number }
): Promise<RouteMetrics> {
  const key = getGoogleMapsApiKey();
  if (key) {
    try {
      const url = new URL(
        "https://maps.googleapis.com/maps/api/distancematrix/json"
      );
      url.searchParams.set("origins", `${origin.lat},${origin.lng}`);
      url.searchParams.set(
        "destinations",
        `${destination.lat},${destination.lng}`
      );
      url.searchParams.set("mode", "driving");
      url.searchParams.set("departure_time", "now");
      url.searchParams.set("traffic_model", "best_guess");
      url.searchParams.set("units", "metric");
      url.searchParams.set("key", key);

      const res = await fetch(url.toString(), {
        cache: "no-store",
        next: { revalidate: 0 },
      });
      const data = (await res.json()) as {
        status: string;
        rows?: Array<{
          elements?: Array<{
            status: string;
            distance?: { value: number; text: string };
            duration?: { value: number; text: string };
            duration_in_traffic?: { value: number; text: string };
          }>;
        }>;
        error_message?: string;
      };

      const el = data.rows?.[0]?.elements?.[0];
      if (data.status === "OK" && el?.status === "OK" && el.distance) {
        const seconds =
          el.duration_in_traffic?.value ?? el.duration?.value ?? 0;
        const meters = el.distance.value;
        return {
          distanceKm: Math.round((meters / 1000) * 100) / 100,
          etaMinutes: Math.max(1, Math.round(seconds / 60)),
          source: "google_distance_matrix",
          durationText:
            el.duration_in_traffic?.text || el.duration?.text || undefined,
          distanceText: el.distance.text,
        };
      }
    } catch {
      /* fallback */
    }
  }

  const distanceKm =
    Math.round(haversineKm(origin, destination) * 100) / 100;
  return {
    distanceKm,
    etaMinutes: haversineEta(distanceKm),
    source: "haversine_fallback",
  };
}
