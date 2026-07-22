import { PROBLEM_MATCHES } from "@/lib/data/technicians";
import { DOCS_PENDING_MAX_RADIUS_KM } from "@/lib/skill-questions";
import type { AppFilters, ServiceCategory, Technician } from "@/lib/types";

/** Max techs returned in any search (keep load reasonable) */
export const MAX_TECHNICIANS = 24;
/** Hard max search radius in km — pros farther away are never listed or mapped */
export const MAX_RADIUS_KM = 10;
/** Default search radius (motorist pin and book-for-someone meet pin) */
export const DEFAULT_RADIUS_KM = 10;
/** Map camera zoom for ~1 km street view (radius still uses MAX_RADIUS_KM) */
export const MAP_NEAR_ZOOM = 15;

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
  // New Artisan: lower ranking (Tier 1–2 badge)
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
 * Trade tab match — strict.
 * Battery tab = battery pros only (never show mechanics as battery).
 * Mechanic tab = mechanic only, etc.
 */
function matchesCategory(tech: Technician, category: ServiceCategory): boolean {
  if (category === "all") return true;
  // Primary registration skill only
  return tech.serviceType === category;
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
  }
): Technician[] {
  const { radiusKm, category, query, filters, specialtyFilter } = options;
  // Always cap at 10 km — never show pros outside this (self or book-for-someone).
  const radius = Math.min(Math.max(radiusKm, 0), MAX_RADIUS_KM);

  // Pass 1: hard gates only (Live · tier · distance · trade later)
  let eligible = technicians.filter((t) => {
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
    // Tier discovery radius caps (T2=1 · T3=3 · T4=10)
    const tierCap =
      tier === 2 ? 1 : tier === 3 ? 3 : tier >= 4 ? MAX_RADIUS_KM : 0;
    // Cert under review / rejected → only visible within 2 km
    const docsPending =
      t.docsStatus === "under_review" || t.docsStatus === "rejected";
    const docsCap = docsPending ? DOCS_PENDING_MAX_RADIUS_KM : MAX_RADIUS_KM;
    const proCap = Math.min(radius, tierCap || MAX_RADIUS_KM, docsCap);
    return d <= proCap;
  });

  // Pass 2: visibility % lottery — skip when few nearby (common empty-list blocker)
  // Sparse markets: always show every Live T2+ in range so customers can find pros.
  const SPARSE_SKIP_LOTTERY = 5;
  let list =
    eligible.length <= SPARSE_SKIP_LOTTERY
      ? eligible
      : eligible.filter((t) => {
          const tier = t.visibilityTier ?? 4;
          const visPct =
            typeof t.visibilityPercent === "number"
              ? t.visibilityPercent
              : tier === 2
                ? 30
                : tier === 3
                  ? 70
                  : 100;
          if (visPct >= 100) return true;
          const hourBucket = Math.floor(Date.now() / (60 * 60 * 1000));
          let h = 0;
          const s = `${t.id}:${hourBucket}`;
          for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
          return (h % 10000) / 100 < visPct;
        });

  if (category !== "all") {
    list = list.filter((t) => matchesCategory(t, category));
  }

  if (specialtyFilter && specialtyFilter.trim()) {
    const want = specialtyFilter.trim().toLowerCase();
    list = list.filter((t) => {
      const specs = Array.isArray(t.specialties) ? t.specialties : [];
      // Pros with no specialty listed still appear (legacy profiles)
      if (specs.length === 0) return true;
      return specs.some((s) => {
        const n = String(s).toLowerCase();
        return n === want || n.includes(want) || want.includes(n);
      });
    });
  }

  // Available = Live with a real GPS pin (not a stale/offline placeholder)
  if (filters.availableNow) {
    list = list.filter(
      (t) => t.status === "available" && t.hasLiveLocation !== false
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
          t.responseSpeedScore >= 0.75)
    );
  }

  list = [...list].sort((a, b) => {
    // Nearest: pure distance first (chip on by default)
    if (filters.nearest) {
      const d = a.distanceKm - b.distanceKm;
      if (Math.abs(d) > 0.02) return d;
      // Tie-break by score when nearly equal distance
      return scoreTechnician(b, query) - scoreTechnician(a, query);
    }
    // Nearest off: rank by overall score, then distance
    const scoreDiff = scoreTechnician(b, query) - scoreTechnician(a, query);
    if (Math.abs(scoreDiff) > 0.5) return scoreDiff;
    return a.distanceKm - b.distanceKm;
  });

  // Strict radius only — empty list means no Live pros within radius
  // (including when booking for someone else at their meet pin).
  return list.slice(0, MAX_TECHNICIANS);
}
