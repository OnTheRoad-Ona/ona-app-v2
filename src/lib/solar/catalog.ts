/**
 * Nigeria-first solar system catalog Type → Brand → Model (offline JSON).
 * Browse + search in the Solar help flow first screen.
 */

import catalogJson from "@/lib/data/solar-catalog.json";

export type SolarSystemTypeId = "inverter" | "hybrid" | "off-grid";

export type SolarCatalogData = {
  version: number;
  source?: string;
  generatedAt?: string;
  types: { id: SolarSystemTypeId; label: string }[];
  brandsByType: Record<string, string[]>;
  modelsByTypeBrand: Record<string, string[]>;
};

const catalog = catalogJson as SolarCatalogData;

function norm(s: string): string {
  return s.trim().toLowerCase();
}

export const SOLAR_CATALOG_TYPES = catalog.types;

export function solarSystemTypeLabel(id: string): string {
  return catalog.types.find((t) => t.id === id)?.label || id;
}

export function getSolarBrandsForType(typeId: string): string[] {
  if (!typeId) return [];
  return catalog.brandsByType[typeId] || [];
}

export function resolveSolarBrandKey(
  typeId: string,
  brand: string,
): string | null {
  if (!brand.trim()) return null;
  const n = norm(brand);
  const hit = getSolarBrandsForType(typeId).find((b) => norm(b) === n);
  return hit || null;
}

export function getSolarModelsForTypeBrand(
  typeId: string,
  brand: string,
): string[] {
  const key = resolveSolarBrandKey(typeId, brand);
  if (!key) return [];
  return catalog.modelsByTypeBrand[`${typeId}|${key}`] || [];
}

export function filterSolarOptions(
  options: string[],
  query: string,
  limit = 80,
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

export function composeSolarMachineLabel(input: {
  mode: "catalog" | "none" | "other";
  typeId?: string;
  brand?: string;
  model?: string;
  other?: string;
}): string {
  if (input.mode === "none") return "I don't have one yet / buying new";
  if (input.mode === "other") return (input.other || "").trim() || "Not listed";
  const type = solarSystemTypeLabel(input.typeId || "");
  const parts = [type, input.brand?.trim(), input.model?.trim()].filter(
    Boolean,
  );
  return parts.join(" · ");
}

export function solarCatalogMeta(): {
  types: number;
  brands: number;
  models: number;
} {
  let brands = 0;
  let models = 0;
  for (const list of Object.values(catalog.brandsByType)) brands += list.length;
  for (const list of Object.values(catalog.modelsByTypeBrand))
    models += list.length;
  return { types: catalog.types.length, brands, models };
}
