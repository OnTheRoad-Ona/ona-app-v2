/**
 * ONA Shop dynamic filter engine (Phase 2).
 *
 * Shared server + client module (no "use client") so /api/shop/filters can
 * import it. Filters are generated PER TRADE from the trade's attribute schema.
 */

import { getTradeAttributeSchema, type TradeAttributeDef } from "@/lib/shop/trade-attributes";
import { SHOP_TRADE_KEYS, type ShopTradeKey } from "@/lib/shop/taxonomy";

export type TradeFilter =
  | { kind: "category"; key: "category"; label: string }
  | { kind: "price"; key: "price"; label: string }
  | { kind: "availability"; key: "availability"; label: string }
  | { kind: "attribute"; key: string; label: string; type: "number" | "text" | "enum" | "boolean"; unit?: string; options?: string[] };

export type TradeFilterConfig = {
  tradeKey: ShopTradeKey;
  filters: TradeFilter[];
  /** True when this trade may surface vehicle fitment filters (Make/Model/Year). */
  hasVehicleFitment: boolean;
};

/** Standard filters every trade gets (category, price, availability). */
const STANDARD_FILTERS: TradeFilter[] = [
  { kind: "category", key: "category", label: "Category" },
  { kind: "price", key: "price", label: "Price" },
  { kind: "availability", key: "availability", label: "Availability" },
];

const VEHICLE_FITMENT_FILTERS: TradeFilter[] = [
  { kind: "attribute", key: "vehicleMake", label: "Make", type: "text" },
  { kind: "attribute", key: "vehicleModel", label: "Model", type: "text" },
  { kind: "attribute", key: "vehicleYear", label: "Year", type: "number" },
];

function attrToFilter(def: TradeAttributeDef): TradeFilter | null {
  if (!def.filterable) return null;
  return {
    kind: "attribute",
    key: def.key,
    label: def.label,
    type: def.type,
    unit: def.unit,
    options: def.options,
  };
}

export function getTradeFilters(tradeKey: string): TradeFilter[] {
  const schema = getTradeAttributeSchema(tradeKey);
  if (!schema) return STANDARD_FILTERS;

  const filters: TradeFilter[] = [...STANDARD_FILTERS];

  if (!schema.vehicleForbidden) {
    filters.push(...VEHICLE_FITMENT_FILTERS);
  }

  for (const def of schema.attributes) {
    const f = attrToFilter(def);
    if (f) filters.push(f);
  }

  return filters;
}

export function getTradeFilterConfig(tradeKey: string): TradeFilterConfig | null {
  const schema = getTradeAttributeSchema(tradeKey);
  if (!schema) return null;
  return {
    tradeKey: tradeKey as ShopTradeKey,
    filters: getTradeFilters(tradeKey),
    hasVehicleFitment: !schema.vehicleForbidden,
  };
}

export function getFilterConfigs(): TradeFilterConfig[] {
  return SHOP_TRADE_KEYS.map((t) => ({
    tradeKey: t,
    filters: getTradeFilters(t),
    hasVehicleFitment: !getTradeAttributeSchema(t)?.vehicleForbidden,
  }));
}

/**
 * Build a predicate used by the catalog query from raw filter selections.
 * Keeps only filters that exist for the given trade — irrelevant filters are
 * silently dropped, never applied.
 */
export function applyTradeFilters(
  tradeKey: string,
  selected: Record<string, string | number | boolean | undefined>
): {
  categorySlug?: string;
  availability?: "in_stock" | "all";
  attributes: Record<string, string | number | boolean>;
} {
  const allowed = new Map(
    getTradeFilters(tradeKey)
      .filter((f) => f.kind === "attribute")
      .map((f) => [f.key, f])
  );

  const attributes: Record<string, string | number | boolean> = {};
  let categorySlug: string | undefined;
  let availability: "in_stock" | "all" | undefined;

  for (const [key, raw] of Object.entries(selected || {})) {
    if (raw === undefined || raw === null || raw === "") continue;
    if (key === "category") {
      categorySlug = String(raw);
      continue;
    }
    if (key === "availability") {
      availability = raw === "in_stock" ? "in_stock" : "all";
      continue;
    }
    if (key === "price" || key === "q") continue;
    if (!allowed.has(key)) continue; // drop irrelevant filters
    attributes[key] = raw;
  }

  return {
    categorySlug,
    availability: availability ?? "all",
    attributes,
  };
}
