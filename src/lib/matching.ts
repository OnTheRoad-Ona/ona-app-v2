import { PROBLEM_MATCHES } from "@/lib/data/technicians";
import type { AppFilters, ServiceCategory, Technician } from "@/lib/types";

/** Max techs returned in any search */
export const MAX_TECHNICIANS = 50;
/** Max search radius in kilometers */
export const MAX_RADIUS_KM = 10;

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
    list = list.filter((t) => t.serviceType === category);
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
