/**
 * Shared Google Maps config for homepage + pickers.
 * Homepage only needs Maps JavaScript API (no Places library required).
 */

export const GOOGLE_MAPS_LOADER_ID = "oga-mecho-google-maps";

/** Keep empty so homepage works with only Maps JavaScript API enabled. */
export const GOOGLE_MAPS_LIBRARIES: (
  | "places"
  | "geometry"
  | "drawing"
  | "visualization"
)[] = [];

export function getGoogleMapsApiKey(): string {
  if (typeof process === "undefined") return "";
  return (
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||
    process.env.GOOGLE_MAPS_API_KEY ||
    ""
  ).trim();
}

/** Live maps unless explicitly disabled. */
export function shouldUseLiveMaps(): boolean {
  if (process.env.NEXT_PUBLIC_USE_LIVE_MAPS === "false") return false;
  const key = getGoogleMapsApiKey();
  return Boolean(key && !key.includes("your_google") && key.length > 10);
}

export type ReverseGeocodeResult = {
  label: string;
  city: string;
  area: string;
};

/**
 * Reverse geocode via Google Geocoding REST.
 * Often fails with REQUEST_DENIED when the key only allows Maps JavaScript API.
 */
async function reverseGeocodeGoogle(
  lat: number,
  lng: number
): Promise<ReverseGeocodeResult | null> {
  const key = getGoogleMapsApiKey();
  if (!key) return null;
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${encodeURIComponent(key)}`;
    const res = await fetch(url);
    const data = (await res.json()) as {
      status: string;
      results?: Array<{
        formatted_address?: string;
        address_components?: Array<{
          long_name: string;
          types: string[];
        }>;
      }>;
      error_message?: string;
    };
    if (data.status !== "OK" || !data.results?.[0]) return null;
    const r = data.results[0];
    const comps = r.address_components ?? [];
    const get = (type: string) =>
      comps.find((c) => c.types.includes(type))?.long_name ?? "";
    const area =
      get("neighborhood") ||
      get("sublocality") ||
      get("sublocality_level_1") ||
      get("route") ||
      get("administrative_area_level_2") ||
      "";
    const city =
      get("locality") ||
      get("administrative_area_level_1") ||
      get("country") ||
      "";
    return {
      label: r.formatted_address || `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
      city: city || "Near you",
      area: area || city || "Near you",
    };
  } catch {
    return null;
  }
}

/**
 * OpenStreetMap Nominatim fallback when Google Geocoding is blocked by key restrictions.
 * Usage policy requires a descriptive User-Agent.
 */
async function reverseGeocodeNominatim(
  lat: number,
  lng: number
): Promise<ReverseGeocodeResult | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`;
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "OgaMecho/1.0 (https://ogamecho.app; maps street labels)",
      },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      display_name?: string;
      address?: {
        road?: string;
        pedestrian?: string;
        neighbourhood?: string;
        suburb?: string;
        city_district?: string;
        city?: string;
        town?: string;
        village?: string;
        county?: string;
        state?: string;
        country?: string;
      };
    };
    const addr = data.address ?? {};
    const area =
      addr.neighbourhood ||
      addr.suburb ||
      addr.city_district ||
      addr.road ||
      addr.pedestrian ||
      "";
    const city =
      addr.city || addr.town || addr.village || addr.county || addr.state || "";
    const label =
      data.display_name ||
      [addr.road || addr.pedestrian, area, city].filter(Boolean).join(", ") ||
      `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    if (!label) return null;
    return {
      label,
      city: city || "Near you",
      area: area || city || "Near you",
    };
  } catch {
    return null;
  }
}

/**
 * Server-side reverse geocode: Google first, then Nominatim.
 * Use from API routes so Nominatim gets a proper User-Agent.
 */
export async function reverseGeocodeLatLngServer(
  lat: number,
  lng: number
): Promise<ReverseGeocodeResult | null> {
  const fromGoogle = await reverseGeocodeGoogle(lat, lng);
  if (fromGoogle) return fromGoogle;
  return reverseGeocodeNominatim(lat, lng);
}

/**
 * Reverse geocode lat/lng for pin street labels.
 * In the browser, calls /api/reverse-geocode (Google → Nominatim).
 * On the server, runs the same chain directly.
 */
export async function reverseGeocodeLatLng(
  lat: number,
  lng: number
): Promise<ReverseGeocodeResult | null> {
  if (typeof window !== "undefined") {
    try {
      const res = await fetch(
        `/api/reverse-geocode?lat=${encodeURIComponent(String(lat))}&lng=${encodeURIComponent(String(lng))}`
      );
      if (!res.ok) return null;
      return (await res.json()) as ReverseGeocodeResult;
    } catch {
      return null;
    }
  }
  return reverseGeocodeLatLngServer(lat, lng);
}

export const MAPS_SETUP_HELP =
  "Turn on billing and enable Maps JavaScript API for this key. Street labels fall back to OpenStreetMap if Geocoding API is not on the key.";
