/**
 * Nigeria-first generator catalog Type → Brand → Model (offline JSON).
 * Browse + search in the Generator help flow first screen.
 */

import catalogJson from "@/lib/data/generators-catalog.json";

export type GeneratorTypeId = "petrol" | "diesel" | "inverter";

export type GeneratorCatalogData = {
  version: number;
  source?: string;
  generatedAt?: string;
  types: { id: GeneratorTypeId; label: string }[];
  brandsByType: Record<string, string[]>;
  modelsByTypeBrand: Record<string, string[]>;
};

const catalog = catalogJson as GeneratorCatalogData;

function norm(s: string): string {
  return s.trim().toLowerCase();
}

export const GEN_CATALOG_TYPES = catalog.types;

export const GEN_TYPE_IDS: GeneratorTypeId[] = ["petrol", "diesel", "inverter"];

export function isGeneratorTypeId(v: string): v is GeneratorTypeId {
  return (GEN_TYPE_IDS as string[]).includes(v);
}

export function generatorTypeLabel(id: string): string {
  return catalog.types.find((t) => t.id === id)?.label || id;
}

export function getBrandsForType(typeId: string): string[] {
  if (!typeId) return [];
  return catalog.brandsByType[typeId] || [];
}

export function resolveBrandKey(typeId: string, brand: string): string | null {
  if (!brand.trim()) return null;
  const n = norm(brand);
  const hit = getBrandsForType(typeId).find((b) => norm(b) === n);
  return hit || null;
}

export function getModelsForTypeBrand(typeId: string, brand: string): string[] {
  const key = resolveBrandKey(typeId, brand);
  if (!key) return [];
  return catalog.modelsByTypeBrand[`${typeId}|${key}`] || [];
}

export function filterGeneratorOptions(
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

/**
 * Fuel used to skip later “petrol or diesel?” screens.
 * Inverter is petrol-engined.
 */
export function inferGeneratorFuel(typeId: string): "petrol" | "diesel" | null {
  if (typeId === "petrol" || typeId === "inverter") return "petrol";
  if (typeId === "diesel") return "diesel";
  return null;
}

export function knownGeneratorFuel(
  answers: Record<string, string>,
): "petrol" | "diesel" | null {
  const explicit = answers.machine_fuel;
  if (explicit === "petrol" || explicit === "diesel") return explicit;
  return inferGeneratorFuel(answers.machine_type || "");
}

export function composeGeneratorMachineLabel(input: {
  mode: "catalog" | "none" | "other";
  typeId?: string;
  brand?: string;
  model?: string;
  other?: string;
}): string {
  if (input.mode === "none") return "I don't have one yet / buying new";
  if (input.mode === "other") return (input.other || "").trim() || "Not listed";
  const type = generatorTypeLabel(input.typeId || "");
  const parts = [type, input.brand?.trim(), input.model?.trim()].filter(
    Boolean,
  );
  return parts.join(" · ");
}

export function catalogMeta(): {
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
