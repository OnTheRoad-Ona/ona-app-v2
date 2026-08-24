import { PROBLEM_MATCHES } from "@/lib/data/technicians";
import type { AppFilters, ServiceCategory, Technician } from "@/lib/types";

/** Max techs returned in any search (keep load reasonable) */
export const MAX_TECHNICIANS = 24;
/** Hard max search radius in km pros farther away are never listed or mapped */
export const MAX_RADIUS_KM = 5;
/** Default search radius (motorist pin and book-for-someone meet pin) */
export const DEFAULT_RADIUS_KM = 5;
/** Map camera zoom for ~1 km street view (radius still uses MAX_RADIUS_KM) */
export const MAP_NEAR_ZOOM = 15;

/**
 * Live marketplace pin is valid only while heartbeat is fresh.
 * Pros refresh location_updated_at while Live (~every 3 min); 5 min = one missed tick grace.
 */
export const LIVE_HEARTBEAT_MAX_MS = 5 * 60 * 1000;

/** True when Live pin was refreshed within LIVE_HEARTBEAT_MAX_MS. */
export function hasRecentLiveHeartbeat(
  locationUpdatedAt: string | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (!locationUpdatedAt) return false;
  const t = new Date(locationUpdatedAt).getTime();
  if (!Number.isFinite(t)) return false;
  return nowMs - t <= LIVE_HEARTBEAT_MAX_MS;
}

function problemPriority(tech: Technician, query: string): number {
  const q = query.toLowerCase().trim();
  if (!q) return 0;

  let boost = 0;
  for (const [keyword, categories] of Object.entries(PROBLEM_MATCHES)) {
    if (q.includes(keyword)) {
      const idx = categories.indexOf(tech.serviceType);
      if (idx === 0) boost += 30;
      else if (idx > 0) boost += 15;
    }
  }

  if (tech.name.toLowerCase().includes(q)) boost += 25;
  if (tech.roleLabel.toLowerCase().includes(q)) boost += 20;
  if (tech.specialties.some((s) => s.toLowerCase().includes(q))) boost += 18;
  if (tech.serviceType.includes(q as Technician["serviceType"])) boost += 22;

  return boost;
}

export function scoreTechnician(tech: Technician, query: string): number {
  if (tech.status === "offline") return -1000;

  const distanceScore = Math.max(0, 100 - tech.distanceKm * 8);
  const ratingScore = tech.rating * 12;
  const availabilityScore =
    tech.status === "available" ? 40 : tech.status === "nearby" ? 20 : 5;
  const responseScore = tech.responseSpeedScore * 25;
  const loadPenalty = tech.currentLoad * 8;
  const verifiedBonus = tech.verified ? 10 : 0;
  const fastBonus = tech.fastResponse ? 8 : 0;
  const matchBoost = problemPriority(tech, query);
  // New Artisan: lower ranking (Tier 1-2 badge)
  const newArtisanPenalty = tech.isNewArtisan ? 35 : 0;
  // Visibility tier: (A) multiply by %, (C) soft penalty for incomplete visibility
  const visPct =
    typeof tech.visibilityPercent === "number"
      ? tech.visibilityPercent
      : tech.visibilityTier === 1
        ? 0
        : tech.visibilityTier === 2
          ? 30
          : tech.visibilityTier === 3
            ? 70
            : 100;
  const visMult = Math.max(0, Math.min(100, visPct)) / 100;
  const visSoftPenalty = Math.max(0, 100 - visPct) * 0.35;

  const base =
    distanceScore +
    ratingScore +
    availabilityScore +
    responseScore +
    verifiedBonus +
    fastBonus +
    matchBoost -
    loadPenalty -
    newArtisanPenalty -
    visSoftPenalty;

  return base * visMult;
}

/**
 * Trade tab match strict.
 * Battery tab = battery pros only (never show mechanics as battery).
 * Mechanic tab = mechanic only, etc.
 */
function matchesCategory(tech: Technician, category: ServiceCategory): boolean {
  if (category === "all" || category === "none") return true;
  // Primary registration skill only
  return tech.serviceType === category;
}

/** True when free-text search matches this pro (name, trade, specialty, problem). */
export function technicianMatchesQuery(
  tech: Technician,
  query: string,
): boolean {
  const q = query.toLowerCase().trim();
  if (!q) return true;
  if (tech.name.toLowerCase().includes(q)) return true;
  if (tech.roleLabel.toLowerCase().includes(q)) return true;
  if (tech.serviceType.toLowerCase().includes(q)) return true;
  if (tech.specialties?.some((s) => s.toLowerCase().includes(q))) return true;
  // Problem-keyword map (flat tyre → vulcanizer, etc.)
  if (problemPriority(tech, q) > 0) return true;
  return false;
}

/**
 * Normalize Home / Office / Commercial / Industrial chips so
 * "Residential (Homes)" matches customer "Home" specialty filter, etc.
 */
export function specialtyAffinityTokens(raw: string): Set<string> {
  const n = String(raw || "")
    .toLowerCase()
    .trim();
  const set = new Set<string>();
  if (!n) return set;
  set.add(n);
  // Collapse punctuation for soft equality
  set.add(n.replace(/[^a-z0-9]+/g, " ").trim());
  if (
    n.includes("home") ||
    n.includes("residential") ||
    n.includes("house") ||
    n === "homes"
  ) {
    set.add("home");
    set.add("homes");
    set.add("residential");
    set.add("residential (homes)");
  }
  if (n.includes("office")) {
    set.add("office");
    set.add("offices");
  }
  if (
    n.includes("commercial") ||
    n.includes("shop") ||
    n.includes("business")
  ) {
    set.add("commercial");
  }
  if (
    n.includes("industrial") ||
    n.includes("factory") ||
    n.includes("plant")
  ) {
    set.add("industrial");
  }
  if (n.includes("vehicle") || n.includes("auto") || n === "car") {
    set.add("vehicle");
    set.add("auto");
  }
  if (
    n.includes("furniture") ||
    n.includes("fit-out") ||
    n.includes("fit out")
  ) {
    set.add("furniture");
  }
  if (n.includes("exterior") || n.includes("facade") || n.includes("façade")) {
    set.add("exterior");
  }
  if (n.includes("electronics") || n.includes("mobile")) {
    if (n.includes("electronics")) set.add("electronics");
    if (n.includes("mobile")) set.add("mobile");
  }
  return set;
}

/** Customer specialty chip vs pro focus soft match (never require exact string). */
export function proMatchesSpecialtyFilter(
  proSpecialties: string[] | null | undefined,
  want: string | null | undefined,
): boolean {
  const w = String(want || "").trim();
  if (!w) return true;
  const specs = Array.isArray(proSpecialties) ? proSpecialties : [];
  // Legacy / missing focus → still list (do not empty the marketplace)
  if (specs.length === 0) return true;

  const wantTokens = specialtyAffinityTokens(w);
  for (const s of specs) {
    const st = specialtyAffinityTokens(s);
    for (const t of wantTokens) {
      if (st.has(t)) return true;
    }
    const a = s.toLowerCase();
    const b = w.toLowerCase();
    if (a === b || a.includes(b) || b.includes(a)) return true;
  }
  return false;
}

export function filterAndRankTechnicians(
  technicians: Technician[],
  options: {
    radiusKm: number;
    category: ServiceCategory;
    query: string;
    filters: AppFilters;
    /** When set, only pros listing this specialty (or no specialty list) */
    specialtyFilter?: string | null;
    /**
     * Pros with an active job for this customer hide from discovery
     * (they stay on History / active job; reappear for a new request later).
     */
    excludeProIds?: Iterable<string> | null;
    /**
     * Recently booked by this customer 50% less radius ranking priority
     * so other pros surface first (effective distance ×2 for sort/score).
     */
    radiusDemoteProIds?: Iterable<string> | null;
  },
): Technician[] {
  const {
    radiusKm,
    category,
    query,
    filters,
    specialtyFilter,
    excludeProIds,
    radiusDemoteProIds,
  } = options;
  // Always cap at 5 km never show pros outside this (self or book-for-someone).
  const radius = Math.min(Math.max(radiusKm, 0), MAX_RADIUS_KM);
  const exclude = new Set(
    Array.from(excludeProIds || []).map((id) => String(id)),
  );
  const demote = new Set(
    Array.from(radiusDemoteProIds || []).map((id) => String(id)),
  );
  const rankDistance = (t: Technician) =>
    demote.has(String(t.id)) ? t.distanceKm * 2 : t.distanceKm;

  // Pass 1: hard gates only (Live · tier · distance · trade later)
  const eligible = technicians.filter((t) => {
    if (exclude.has(String(t.id))) return false;
    // Marketplace: Live only (Away / offline never listed)
    if (t.status !== "available") return false;
    // Tier 1: not in search
    const tier = t.visibilityTier ?? 4;
    if (tier <= 1) return false;
    const visPct =
      typeof t.visibilityPercent === "number"
        ? t.visibilityPercent
        : tier === 2
          ? 30
          : tier === 3
            ? 70
            : 100;
    if (visPct <= 0) return false;
    const d = t.distanceKm;
    if (typeof d !== "number" || !Number.isFinite(d)) return false;
    // Live + in customer radius (≤5 km). Tier still gates T1 above;
    // ranking (not hard hide) softens lower tiers via scoreTechnician.
    return d <= radius + 0.75;
  });

  // No lottery / no second radius gate empty lists were too common.
  let list = eligible;

  if (category !== "all") {
    list = list.filter((t) => matchesCategory(t, category));
  }

  if (specialtyFilter && specialtyFilter.trim()) {
    list = list.filter((t) =>
      proMatchesSpecialtyFilter(t.specialties, specialtyFilter),
    );
  }

  // Free-text search: only matching pros (name / trade / specialty / problem)
  if (query.trim()) {
    list = list.filter((t) => technicianMatchesQuery(t, query));
  }

  // Available = Live with a real GPS pin (not a stale/offline placeholder)
  if (filters.availableNow) {
    list = list.filter(
      (t) => t.status === "available" && t.hasLiveLocation !== false,
    );
  }
  // 4.5+ rating
  if (filters.rating45) {
    list = list.filter((t) => Number(t.rating) >= 4.5);
  }
  // Verified NIN/docs
  if (filters.verified) {
    list = list.filter((t) => Boolean(t.verified));
  }
  // Fast reply (mapped flag or strong response score)
  if (filters.fastResponse) {
    list = list.filter(
      (t) =>
        Boolean(t.fastResponse) ||
        (typeof t.responseSpeedScore === "number" &&
          t.responseSpeedScore >= 0.75),
    );
  }

  list = [...list].sort((a, b) => {
    // Nearest: pure distance first (chip on by default)
    // Recently booked pros use 2× distance (50% less radius priority).
    if (filters.nearest) {
      const d = rankDistance(a) - rankDistance(b);
      if (Math.abs(d) > 0.02) return d;
      // Tie-break by score when nearly equal distance
      return scoreTechnician(b, query) - scoreTechnician(a, query);
    }
    // Nearest off: rank by overall score, then distance (demoted last among peers)
    const scoreA =
      scoreTechnician(a, query) * (demote.has(String(a.id)) ? 0.5 : 1);
    const scoreB =
      scoreTechnician(b, query) * (demote.has(String(b.id)) ? 0.5 : 1);
    const scoreDiff = scoreB - scoreA;
    if (Math.abs(scoreDiff) > 0.5) return scoreDiff;
    return rankDistance(a) - rankDistance(b);
  });

  // Strict radius only empty list means no Live pros within radius
  // (including when booking for someone else at their meet pin).
  return list.slice(0, MAX_TECHNICIANS);
}
