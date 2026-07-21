/**
 * Customer vehicle catalog — Make → Model → Year (offline JSON).
 * Source: scripts/download-vehicle-catalog.mjs (NHTSA vPIC + global seeds).
 */

import catalogJson from "@/lib/data/vehicles-catalog.json";

export type VehicleCatalogData = {
  version: number;
  source?: string;
  generatedAt?: string;
  yearStart: number;
  yearEnd: number;
  makes: string[];
  modelsByMake: Record<string, string[]>;
  yearsByMakeModel: Record<string, number[]>;
  defaultYears: number[];
};

const catalog = catalogJson as VehicleCatalogData;

function norm(s: string): string {
  return s.trim().toLowerCase();
}

/** Resolve make key case-insensitively against catalog. */
export function resolveMakeKey(make: string): string | null {
  if (!make.trim()) return null;
  const n = norm(make);
  const hit = catalog.makes.find((m) => norm(m) === n);
  return hit || null;
}

export function getAllMakes(): string[] {
  // Prefer makes that have models so cascade never dead-ends
  const withModels = catalog.makes.filter(
    (m) => (catalog.modelsByMake[m] || []).length > 0
  );
  return withModels.length ? withModels : catalog.makes;
}

export function getModelsForMake(make: string): string[] {
  const key = resolveMakeKey(make);
  if (!key) return [];
  return catalog.modelsByMake[key] || [];
}

export function getYearsForMakeModel(make: string, model: string): number[] {
  const key = resolveMakeKey(make);
  if (!key || !model.trim()) {
    return catalog.defaultYears?.length
      ? catalog.defaultYears
      : defaultYearList();
  }
  const mapKey = `${key}|${model.trim()}`;
  // exact
  if (catalog.yearsByMakeModel[mapKey]?.length) {
    return catalog.yearsByMakeModel[mapKey];
  }
  // case-insensitive model match
  const models = catalog.modelsByMake[key] || [];
  const modelHit = models.find((m) => norm(m) === norm(model));
  if (modelHit) {
    const k2 = `${key}|${modelHit}`;
    if (catalog.yearsByMakeModel[k2]?.length) {
      return catalog.yearsByMakeModel[k2];
    }
  }
  return catalog.defaultYears?.length
    ? catalog.defaultYears
    : defaultYearList();
}

function defaultYearList(): number[] {
  const end = catalog.yearEnd || new Date().getFullYear() + 1;
  const start = catalog.yearStart || 1980;
  const years: number[] = [];
  for (let y = end; y >= start; y--) years.push(y);
  return years;
}

export function filterOptions(
  options: string[],
  query: string,
  limit = 80
): string[] {
  const q = norm(query);
  if (!q) return options.slice(0, limit);
  const starts: string[] = [];
  const includes: string[] = [];
  for (const opt of options) {
    const n = norm(opt);
    if (n.startsWith(q)) starts.push(opt);
    else if (n.includes(q)) includes.push(opt);
    if (starts.length + includes.length >= limit * 2) break;
  }
  return [...starts, ...includes].slice(0, limit);
}

export function catalogMeta(): {
  makes: number;
  models: number;
  yearMaps: number;
} {
  let models = 0;
  for (const m of Object.values(catalog.modelsByMake)) models += m.length;
  return {
    makes: catalog.makes.length,
    models,
    yearMaps: Object.keys(catalog.yearsByMakeModel || {}).length,
  };
}
