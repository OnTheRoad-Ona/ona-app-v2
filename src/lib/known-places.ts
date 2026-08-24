/**
 * Curated Lagos places for SEARCH SUGGESTIONS only.
 * Never snap GPS / reverse-geocode / map pins to these names only when
 * the user explicitly picks a suggestion or types a matching query.
 */

export type KnownPlace = {
  id: string;
  /** Primary map / session label (stays on the pin) */
  name: string;
  /** Street / locality line for subtitles */
  address: string;
  city: string;
  lat: number;
  lng: number;
  /**
   * Strings that should surface this place (company + address variants).
   * Matching is case-insensitive substring / token based.
   */
  aliases: string[];
};

/**
 * 1st Price Furniture Company
 * 31 Ikorodu Road, Thomas bus-stop, Ajegunle, Lagos
 * Coords: Ajegunle · Ikorodu Rd corridor (OSM Ajegunle landmarks).
 */
export const FIRST_PRICE_FURNITURE: KnownPlace = {
  id: "1st-price-furniture-company",
  name: "1st Price Furniture Company",
  address: "31 Ikorodu Road, Thomas bus-stop, Ajegunle, Lagos",
  city: "Lagos",
  lat: 6.60685,
  lng: 3.43065,
  aliases: [
    "1st price furniture company",
    "1st price furniture",
    "1st price",
    "first price furniture company",
    "first price furniture",
    "first price",
    "1stprice",
    "firstprice",
    "31 ikorodu road thomas bus-stop ajegunle lagos",
    "31 ikorodu road thomas bus stop ajegunle lagos",
    "31 ikorodu road, thomas bus-stop, ajegunle lagos",
    "31 ikorodu road, thomas bus stop, ajegunle, lagos",
    "31 ikorodu road, lagos nigeria",
    "31 ikorodu road lagos nigeria",
    "31 ikorodu road lagos",
    "31 ikorodu rd, ajegunle",
    "31 ikorodu rd ajegunle lagos",
    "31 ikorodu road ajegunle",
    "31 ikorodu road, ajegunle lagos",
    "thomas bus-stop ajegunle",
    "thomas bus stop ajegunle",
    "thomas bus-stop",
    "thomas bus stop",
  ],
};

/** All curated places (extend here for more Lagos POIs). */
export const KNOWN_PLACES: KnownPlace[] = [FIRST_PRICE_FURNITURE];

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Token set for loose matching (order-independent). */
function tokens(s: string): string[] {
  return normalize(s)
    .split(" ")
    .filter((t) => t.length > 1);
}

/**
 * Score how well `query` matches a known place.
 * Higher = better. 0 = no match.
 */
export function scoreKnownPlace(query: string, place: KnownPlace): number {
  const q = normalize(query);
  if (!q || q.length < 2) return 0;

  const nameN = normalize(place.name);
  const addrN = normalize(place.address);

  // Exact / strong substring on name or full address
  if (nameN === q || addrN === q) return 100;
  if (nameN.startsWith(q) || q.startsWith(nameN)) return 95;
  if (nameN.includes(q)) return 90;
  if (addrN.includes(q) || q.includes(addrN)) return 88;

  // Alias exact / substring
  for (const a of place.aliases) {
    const an = normalize(a);
    if (an === q) return 92;
    if (an.startsWith(q) || q.startsWith(an)) return 86;
    if (an.includes(q) || q.includes(an)) return 80;
  }

  // Token overlap (e.g. "furniture company ajegunle", "31 ikorodu thomas")
  const qTok = tokens(query);
  if (qTok.length === 0) return 0;
  const corpus = new Set([
    ...tokens(place.name),
    ...tokens(place.address),
    ...place.aliases.flatMap((a) => tokens(a)),
  ]);
  let hits = 0;
  for (const t of qTok) {
    if (corpus.has(t)) hits += 1;
    else {
      // partial token (e.g. "furnitur")
      for (const c of corpus) {
        if (c.startsWith(t) || t.startsWith(c)) {
          hits += 0.6;
          break;
        }
      }
    }
  }
  const ratio = hits / qTok.length;
  if (ratio >= 0.75 && hits >= 2) return Math.round(50 + ratio * 30);
  if (ratio >= 0.55 && hits >= 2) return Math.round(35 + ratio * 25);
  // Single distinctive tokens for this POI
  if (
    qTok.length === 1 &&
    (qTok[0] === "1stprice" ||
      qTok[0] === "firstprice" ||
      (qTok[0].includes("1st") && q.includes("price")) ||
      qTok[0] === "thomas")
  ) {
    return 40;
  }
  return 0;
}

/** Ranked known-place matches for a typed query (best first). */
export function matchKnownPlaces(
  query: string,
  limit = 5,
): { place: KnownPlace; score: number }[] {
  const q = query.trim();
  if (q.length < 2) return [];
  return KNOWN_PLACES.map((place) => ({
    place,
    score: scoreKnownPlace(q, place),
  }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** Best single known place, or null. */
export function resolveKnownPlace(query: string): KnownPlace | null {
  const hits = matchKnownPlaces(query, 1);
  if (!hits.length || hits[0].score < 35) return null;
  return hits[0].place;
}

/** Distance in metres (haversine). */
export function metresBetween(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371000;
  const toR = (d: number) => (d * Math.PI) / 180;
  const dLat = toR(b.lat - a.lat);
  const dLng = toR(b.lng - a.lng);
  const la1 = toR(a.lat);
  const la2 = toR(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * @deprecated Do not use for GPS or reverse-geocode labels.
 * Curated places are search-suggestion only. Always returns null so callers
 * cannot accidentally overwrite a real street address with a POI name.
 */
export function knownPlaceNear(
  _lat: number,
  _lng: number,
  _radiusM = 120,
): KnownPlace | null {
  return null;
}

/** Map / session label for a known place (name stays on the pin). */
export function knownPlaceLabel(place: KnownPlace): string {
  return place.name;
}

export type KnownPlacePick = {
  lat: number;
  lng: number;
  label: string;
  city: string;
  area: string;
};

export function knownPlaceToPick(place: KnownPlace): KnownPlacePick {
  return {
    lat: place.lat,
    lng: place.lng,
    label: knownPlaceLabel(place),
    city: place.city,
    area: place.address,
  };
}
