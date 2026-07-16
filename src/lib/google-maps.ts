/**
 * Shared Google Maps config for homepage + pickers.
 * Homepage only needs Maps JavaScript API (no Places library required).
 */

/** Bump when the Maps API key or libraries change so the JS loader reloads cleanly. */
export const GOOGLE_MAPS_LOADER_ID = "oga-mecho-google-maps-v3-places";

/**
 * Places is required for Uber-style address suggestions
 * (“Help someone else” + location pickers).
 */
export const GOOGLE_MAPS_LIBRARIES: (
  | "places"
  | "geometry"
  | "drawing"
  | "visualization"
)[] = ["places"];

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
  /** Full formatted address (always prefer this for jobs + maps) */
  label: string;
  city: string;
  area: string;
  /** Street line e.g. "7b Oye Balogun Street" */
  street?: string;
  /** Area line under street e.g. "Lekki, Lagos" */
  localityLine?: string;
  country?: string;
  countryCode?: string;
};

/**
 * Reverse geocode via Google Geocoding REST.
 * Always returns full formatted_address as label.
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
          short_name?: string;
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
    const getShort = (type: string) =>
      comps.find((c) => c.types.includes(type))?.short_name ?? "";
    const streetNum = get("street_number");
    const route = get("route");
    const street =
      [streetNum, route].filter(Boolean).join(" ") ||
      get("premise") ||
      get("establishment") ||
      "";
    const area =
      get("neighborhood") ||
      get("sublocality") ||
      get("sublocality_level_1") ||
      get("sublocality_level_2") ||
      "";
    const city =
      get("locality") ||
      get("administrative_area_level_2") ||
      get("administrative_area_level_1") ||
      "";
    const country = get("country") || "";
    const countryCode = getShort("country") || "";
    const full =
      (r.formatted_address || "").trim() ||
      [street, area, city, country].filter(Boolean).join(", ") ||
      `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    const localityLine =
      [area, city].filter(Boolean).join(", ") || city || area || "";
    return {
      label: full,
      city: city || area || "Near you",
      area: area || city || "Near you",
      street: street || undefined,
      localityLine: localityLine || undefined,
      country: country || undefined,
      countryCode: countryCode || undefined,
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
        country_code?: string;
      };
    };
    const addr = data.address ?? {};
    const street =
      [addr.road || addr.pedestrian, addr.neighbourhood]
        .filter(Boolean)
        .join(", ") || "";
    const area = addr.suburb || addr.city_district || addr.neighbourhood || "";
    const city =
      addr.city || addr.town || addr.village || addr.county || addr.state || "";
    // Prefer full display_name (street + area + city)
    const label =
      (data.display_name || "").trim() ||
      [street || addr.road, area, city, addr.country]
        .filter(Boolean)
        .join(", ") ||
      `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    if (!label) return null;
    const localityLine = [area, city].filter(Boolean).join(", ");
    return {
      label,
      city: city || area || "Near you",
      area: area || city || "Near you",
      street: street || undefined,
      localityLine: localityLine || undefined,
      country: addr.country || undefined,
      countryCode: addr.country_code?.toUpperCase() || undefined,
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
