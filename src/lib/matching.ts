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

  return (
    distanceScore +
    ratingScore +
    availabilityScore +
    responseScore +
    verifiedBonus +
    fastBonus +
    matchBoost -
    loadPenalty
  );
}

/** Specialty keyword buckets for extended home categories */
const CATEGORY_KEYWORDS: Partial<Record<ServiceCategory, string[]>> = {
  battery: ["battery", "jump", "start", "charging"],
  ac: ["ac", "air", "cool", "climate", "gas"],
  body: ["body", "panel", "dent", "paint", "spray"],
  electrical: ["electric", "wiring", "alternator", "ecu", "sensor"],
  diagnostics: ["diag", "scan", "obd", "fault", "computer"],
  wash: ["wash", "detail", "clean", "polish", "valeting"],
};

function matchesCategory(tech: Technician, category: ServiceCategory): boolean {
  if (category === "all") return true;
  // Exact primary trade match (all 9 home trades)
  if (tech.serviceType === category) return true;
  const keys = CATEGORY_KEYWORDS[category] ?? [];
  const hay = `${tech.roleLabel} ${tech.description} ${tech.specialties.join(" ")}`.toLowerCase();
  if (keys.some((k) => hay.includes(k))) return true;
  // Fallback: specialty services often sit under general mechanics
  if (
    category === "battery" ||
    category === "ac" ||
    category === "body" ||
    category === "electrical" ||
    category === "diagnostics"
  ) {
    return tech.serviceType === "mechanic";
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
  }
): Technician[] {
  const { radiusKm, category, query, filters } = options;
  // Always cap at 10 km — never show pros outside this (self or book-for-someone).
  const radius = Math.min(Math.max(radiusKm, 0), MAX_RADIUS_KM);

  let list = technicians.filter((t) => {
    const d = t.distanceKm;
    if (typeof d !== "number" || !Number.isFinite(d)) return false;
    // Docs not yet approved → only visible within 2 km
    const docsPending =
      t.docsStatus === "under_review" ||
      t.docsStatus === "none" ||
      t.docsStatus === "rejected";
    const proCap = docsPending
      ? Math.min(radius, DOCS_PENDING_MAX_RADIUS_KM)
      : radius;
    return d <= proCap;
  });

  if (category !== "all") {
    list = list.filter((t) => matchesCategory(t, category));
  }

  if (filters.availableNow) {
    list = list.filter(
      (t) => t.status === "available" || t.status === "nearby"
    );
  }
  if (filters.rating45) {
    list = list.filter((t) => t.rating >= 4.5);
  }
  if (filters.verified) {
    list = list.filter((t) => t.verified);
  }
  if (filters.fastResponse) {
    list = list.filter((t) => t.fastResponse);
  }

  list = [...list].sort((a, b) => {
    if (filters.nearest) {
      const d = a.distanceKm - b.distanceKm;
      if (Math.abs(d) > 0.05) return d;
    }
    // Always prefer nearer when scores are close
    const scoreDiff = scoreTechnician(b, query) - scoreTechnician(a, query);
    if (Math.abs(scoreDiff) > 2) return scoreDiff;
    return a.distanceKm - b.distanceKm;
  });

  // Strict radius only — empty list means no Live pros within radius
  // (including when booking for someone else at their meet pin).
  return list.slice(0, MAX_TECHNICIANS);
}
