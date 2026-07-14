import { PROBLEM_MATCHES } from "@/lib/data/technicians";
import type { AppFilters, ServiceCategory, Technician } from "@/lib/types";

/** Max techs returned in any search (keep low to save map/list load) */
export const MAX_TECHNICIANS = 12;
/** Max search radius in kilometers — nearby map tracks skilled workers within 1 km */
export const MAX_RADIUS_KM = 1;
/** Default live map radius */
export const DEFAULT_RADIUS_KM = 1;

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
  const radius = Math.min(Math.max(radiusKm, 0), MAX_RADIUS_KM);

  let list = technicians.filter((t) => t.distanceKm <= radius);

  if (category !== "all") {
    list = list.filter((t) => matchesCategory(t, category));
  }

  if (filters.availableNow) {
    list = list.filter((t) => t.status === "available" || t.status === "nearby");
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
    return scoreTechnician(b, query) - scoreTechnician(a, query);
  });

  return list.slice(0, MAX_TECHNICIANS);
}
