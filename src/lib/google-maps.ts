/**
 * Shared Google Maps config for the whole app.
 *
 * CRITICAL: Every useJsApiLoader call must use the same id + apiKey +
 * libraries + version. Passing "disabled" in one place and the real key
 * elsewhere throws: "Loader must not be called again with different options"
 * and crashes the customer searching screen after pro decline/later.
 *
 * Prefer `useOnaGoogleMaps()` from `@/lib/google-maps-loader` in components.
 */

/** Bump when loader options change (forces clean Maps script reload). */
export const GOOGLE_MAPS_LOADER_ID = "ona-google-maps-v4-raster-styles";

/**
 * Pinned version so all loaders match. Prefer quarterly over weekly —
 * weekly vector maps often ignore JSON `styles` unless RASTER is forced.
 */
export const GOOGLE_MAPS_LOADER_VERSION = "quarterly" as const;

/**
 * Places is required for Uber-style address suggestions
 * (“Help someone else” + location pickers).
 * Module-level array — same reference for every loader call.
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
  /**
   * Immediate human address for all users — e.g.
   * "Dr. Frank Okafor Cl, Lekki, Lagos"
   * Never lat/lng coordinates.
   */
  label: string;
  city: string;
  area: string;
  /** Street line e.g. "Dr. Frank Okafor Cl" */
  street?: string;
  /** Area line e.g. "Lekki, Lagos" */
  localityLine?: string;
  country?: string;
  countryCode?: string;
};

/** Google Plus Code ("FG2R+RJM") Google sometimes appends to a formatted
 *  address — remove it so the label is the real address only. */
export const PLUS_CODE_RE = /\b[A-Z0-9]{4,8}\+[A-Z0-9]{2,3}\b/g;

export function cleanAddressLabel(value: string): string {
  return value
    .replace(PLUS_CODE_RE, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+,/g, ",")
    .replace(/,\s*,/g, ",")
    .replace(/^[,;\s]+|[,;\s]+$/g, "")
    .trim();
}

/** Drop country / postal noise; never emit raw coordinates as a label. */
export function formatImmediateAddress(parts: {
  street?: string;
  area?: string;
  city?: string;
  state?: string;
  formatted?: string;
}): string {
  const street = (parts.street || "").trim();
  const area = (parts.area || "").trim();
  const city = (parts.city || "").trim();
  const state = (parts.state || "").trim();

  const localityBits: string[] = [];
  if (area && !street.toLowerCase().includes(area.toLowerCase())) {
    localityBits.push(area);
  }
  // Prefer city (Lagos) over state if same; avoid duplicate Lekki Lekki
  const cityOrState = city || state;
  if (
    cityOrState &&
    !localityBits.some((b) => b.toLowerCase() === cityOrState.toLowerCase()) &&
    !street.toLowerCase().includes(cityOrState.toLowerCase())
  ) {
    localityBits.push(cityOrState);
  }

  if (street) {
    return [street, ...localityBits].join(", ");
  }

  // Fall back to formatted, strip country / postal codes
  let fb = (parts.formatted || "").trim();
  if (fb) {
    fb = fb
      .replace(/,\s*Nigeria\s*$/i, "")
      .replace(/,\s*\d{4,6}\s*$/g, "")
      .replace(/,\s*NG\s*$/i, "")
      .trim();
    // If still looks like coordinates, drop
    if (/^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(fb)) return "";
    return fb;
  }
  return "";
}

/**
 * Reverse geocode via Google Geocoding REST.
 * Label = immediate address (street + area + city), never coordinates.
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
      get("point_of_interest") ||
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
      "";
    const state = get("administrative_area_level_1") || "";
    const country = get("country") || "";
    const countryCode = getShort("country") || "";
    const label =
      formatImmediateAddress({
        street,
        area,
        city: city || state,
        state,
        formatted: r.formatted_address,
      }) ||
      formatImmediateAddress({
        formatted: r.formatted_address,
      });
    if (!label) return null;
    const localityLine =
      [area, city || state].filter(Boolean).join(", ") || city || area || "";
    return {
      label,
      city: city || state || area || "",
      area: area || city || "",
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
        "User-Agent": "Ona/1.0 (https://ona.app; maps street labels)",
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
    const street = (addr.road || addr.pedestrian || "").trim();
    const area =
      addr.neighbourhood || addr.suburb || addr.city_district || "";
    const city =
      addr.city || addr.town || addr.village || addr.county || "";
    const state = addr.state || "";
    const label = formatImmediateAddress({
      street,
      area,
      city: city || state,
      state,
      formatted: data.display_name,
    });
    if (!label) return null;
    const localityLine = [area, city || state].filter(Boolean).join(", ");
    return {
      label,
      city: city || state || area || "",
      area: area || city || "",
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
