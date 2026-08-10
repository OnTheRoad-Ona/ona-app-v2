/**
 * ONA Shop trade-specific dynamic attributes (Phase 2).
 *
 * Shared server + client module. Each of the 14 trades has its own attribute
 * dictionary for validation, filters, and fixtures.
 *
 * Vehicle fitment attributes are ONLY valid for vehicle-based trades;
 * solar/plumber/carpenter/painter/generator/wash never require them.
 */

import type { ShopTradeKey } from "@/lib/shop/taxonomy";

export type TradeAttributeType = "number" | "text" | "enum" | "boolean";

export type TradeAttributeDef = {
  key: string;
  label: string;
  type: TradeAttributeType;
  unit?: string;
  /** Required when creating a product for this trade. */
  required?: boolean;
  /** Show as a filter facet in the shop UI. */
  filterable?: boolean;
  /** Enum options (when type === "enum"). */
  options?: string[];
  /** Optional explainer for admins/data sources. */
  hint?: string;
};

export type TradeAttributeSchema = {
  tradeKey: ShopTradeKey;
  /** Attributes valid for this trade. */
  attributes: TradeAttributeDef[];
  /** Subset of keys that make a fitment/vehicle claim. */
  vehicleFitmentKeys: string[];
  /** True when this trade must not carry any vehicle fitment data. */
  vehicleForbidden: boolean;
};

/** Shared vehicle fitment attribute defs. */
const VEHICLE_FITMENT: TradeAttributeDef[] = [
  { key: "vehicleMake", label: "Make", type: "text", filterable: true },
  { key: "vehicleModel", label: "Model", type: "text", filterable: true },
  { key: "vehicleYear", label: "Year", type: "number", filterable: true },
  { key: "position", label: "Position", type: "enum", filterable: true, options: ["Front", "Rear", "Left", "Right", "Driver", "Passenger", "Upper", "Lower"] },
  { key: "engine", label: "Engine", type: "text", filterable: false },
];

const HARDWARE: TradeAttributeDef[] = [
  { key: "material", label: "Material", type: "enum", filterable: true, options: ["Steel", "Aluminium", "Copper", "Brass", "Cast iron", "PVC", "Rubber", "Composite", "Wood", "Ceramic", "Glass"] },
  { key: "finish", label: "Finish", type: "text", filterable: false },
];

export const TRADE_ATTRIBUTE_SCHEMAS: TradeAttributeSchema[] = [
  {
    tradeKey: "mechanic",
    vehicleForbidden: false,
    vehicleFitmentKeys: ["vehicleMake", "vehicleModel", "vehicleYear", "position", "engine"],
    attributes: [
      ...VEHICLE_FITMENT,
      { key: "viscosity", label: "Viscosity", type: "enum", filterable: true, options: ["0W-20", "5W-30", "5W-40", "10W-30", "10W-40", "15W-40"] },
      { key: "capacity", label: "Capacity", type: "number", unit: "L", filterable: true },
      { key: "diameter", label: "Diameter", type: "number", unit: "mm", filterable: true },
      { key: "thread", label: "Thread size", type: "text", filterable: true },
      ...HARDWARE,
    ],
  },
  {
    tradeKey: "vulcanizer",
    vehicleForbidden: false,
    vehicleFitmentKeys: ["vehicleMake", "vehicleModel", "vehicleYear", "position", "engine"],
    attributes: [
      ...VEHICLE_FITMENT,
      { key: "rimSize", label: "Rim size", type: "number", unit: "in", filterable: true },
      { key: "tireWidth", label: "Tire width", type: "number", unit: "mm", filterable: true },
      { key: "aspectRatio", label: "Aspect ratio", type: "number", unit: "%", filterable: true },
      { key: "loadIndex", label: "Load index", type: "number", filterable: true },
      { key: "speedRating", label: "Speed rating", type: "enum", filterable: true, options: ["S", "T", "H", "V", "W", "Y"] },
      { key: "tubeType", label: "Tube type", type: "enum", filterable: true, options: ["Tubeless", "Tube", "Run-flat"] },
      // Vulcanizer shop equipment attributes (compressors, gauges, jacks, tools)
      { key: "voltage", label: "Voltage", type: "number", unit: "V", filterable: true },
      { key: "capacity", label: "Capacity", type: "number", unit: "L", filterable: true },
      { key: "powerW", label: "Power", type: "number", unit: "W", filterable: true },
      { key: "pressure", label: "Pressure", type: "number", unit: "PSI", filterable: true },
      ...HARDWARE,
    ],
  },
  {
    tradeKey: "towing",
    vehicleForbidden: false,
    vehicleFitmentKeys: ["vehicleMake", "vehicleModel", "vehicleYear", "position", "engine"],
    attributes: [
      ...VEHICLE_FITMENT,
      { key: "capacity", label: "Tow capacity", type: "number", unit: "kg", filterable: true, required: true },
      { key: "length", label: "Length", type: "number", unit: "m", filterable: true },
      { key: "winchType", label: "Winch type", type: "enum", filterable: true, options: ["Electric", "Hydraulic", "Manual"] },
      { key: "hookType", label: "Hook type", type: "text", filterable: false },
      ...HARDWARE,
    ],
  },
  {
    tradeKey: "ac",
    vehicleForbidden: false,
    vehicleFitmentKeys: ["vehicleMake", "vehicleModel", "vehicleYear", "position", "engine"],
    attributes: [
      ...VEHICLE_FITMENT,
      { key: "refrigerant", label: "Refrigerant", type: "enum", filterable: true, options: ["R-134a", "R-410A", "R-32", "R-22", "R-404A", "R-600a"] },
      { key: "btuCapacity", label: "Capacity", type: "number", unit: "BTU", filterable: true, required: true },
      { key: "voltage", label: "Voltage", type: "number", unit: "V", filterable: true },
      { key: "compressorType", label: "Compressor type", type: "enum", filterable: true, options: ["Rotary", "Scroll", "Reciprocating", "Screw"] },
      { key: "application", label: "Application", type: "enum", filterable: true, options: ["Vehicle A/C", "Commercial A/C", "Industrial A/C", "Residential A/C"] },
    ],
  },
  {
    tradeKey: "battery",
    vehicleForbidden: false,
    vehicleFitmentKeys: ["vehicleMake", "vehicleModel", "vehicleYear", "position", "engine"],
    attributes: [
      ...VEHICLE_FITMENT,
      { key: "voltage", label: "Voltage", type: "number", unit: "V", filterable: true, required: true },
      { key: "capacityAh", label: "Capacity", type: "number", unit: "Ah", filterable: true, required: true },
      { key: "batteryType", label: "Battery type", type: "enum", filterable: true, options: ["Lead-acid", "AGM", "Gel", "Lithium-ion", "LiFePO4"] },
      { key: "terminalType", label: "Terminal", type: "enum", filterable: true, options: ["Top post", "Side post", "L-terminal"] },
      { key: "crankingAmps", label: "CCA", type: "number", unit: "A", filterable: true },
    ],
  },
  {
    tradeKey: "body",
    vehicleForbidden: false,
    vehicleFitmentKeys: ["vehicleMake", "vehicleModel", "vehicleYear", "position", "engine"],
    attributes: [
      ...VEHICLE_FITMENT,
      { key: "panelType", label: "Panel type", type: "enum", filterable: true, options: ["Door", "Bonnet", "Trunk", "Fender", "Bumper", "Grille", "Mirror", "Panel", "Headlight", "Tail light", "Glass"] },
      { key: "paintCode", label: "Paint code", type: "text", filterable: false },
      ...HARDWARE,
    ],
  },
  {
    tradeKey: "electrical",
    vehicleForbidden: false,
    vehicleFitmentKeys: ["vehicleMake", "vehicleModel", "vehicleYear", "position", "engine"],
    attributes: [
      ...VEHICLE_FITMENT,
      { key: "voltage", label: "Voltage", type: "number", unit: "V", filterable: true },
      { key: "amperage", label: "Amperage", type: "number", unit: "A", filterable: true },
      { key: "wireGauge", label: "Wire gauge", type: "text", filterable: true },
      { key: "ipRating", label: "IP rating", type: "text", filterable: true },
      { key: "poleCount", label: "Poles", type: "number", filterable: true },
    ],
  },
  {
    tradeKey: "diagnostics",
    vehicleForbidden: false,
    vehicleFitmentKeys: ["vehicleMake", "vehicleModel", "vehicleYear", "position", "engine"],
    attributes: [
      ...VEHICLE_FITMENT,
      { key: "protocol", label: "Protocol", type: "enum", filterable: true, options: ["OBD-II", "CAN", "J1850", "ISO 9141", "KWP2000"] },
      { key: "connectivity", label: "Connectivity", type: "enum", filterable: true, options: ["Bluetooth", "Wi-Fi", "USB", "Wired"] },
      { key: "updateable", label: "Updateable", type: "boolean", filterable: true },
      { key: "displayType", label: "Display", type: "enum", filterable: true, options: ["Color", "Monochrome", "None (mobile app)"] },
    ],
  },
  {
    tradeKey: "wash",
    vehicleForbidden: true,
    vehicleFitmentKeys: [],
    attributes: [
      { key: "pressure", label: "Pressure", type: "number", unit: "PSI", filterable: true },
      { key: "flowRate", label: "Flow rate", type: "number", unit: "L/min", filterable: true },
      { key: "powerSource", label: "Power source", type: "enum", filterable: true, options: ["Electric", "Petrol", "Manual", "Battery"] },
      { key: "application", label: "Application", type: "enum", filterable: true, options: ["Vehicle wash", "Detailing", "Interior", "Exterior", "Commercial"] },
      { key: "capacity", label: "Capacity", type: "number", unit: "L", filterable: true },
    ],
  },
  {
    tradeKey: "plumber",
    vehicleForbidden: true,
    vehicleFitmentKeys: [],
    attributes: [
      { key: "diameter", label: "Diameter", type: "number", unit: "mm", filterable: true },
      { key: "connection", label: "Connection", type: "enum", filterable: true, options: ["Threaded", "Push-fit", "Solvent weld", "Compression", "Flanged"] },
      { key: "pressureRating", label: "Pressure rating", type: "number", unit: "bar", filterable: true },
      { key: "application", label: "Application", type: "enum", filterable: true, options: ["Potable water", "Drainage", "Gas", "Heating"] },
      ...HARDWARE,
    ],
  },
  {
    tradeKey: "carpenter",
    vehicleForbidden: true,
    vehicleFitmentKeys: [],
    attributes: [
      { key: "dimensions", label: "Dimensions", type: "text", filterable: false },
      { key: "thickness", label: "Thickness", type: "number", unit: "mm", filterable: true },
      { key: "application", label: "Application", type: "enum", filterable: true, options: ["Furniture", "Structural", "Doors", "Cabinetry", "Roofing"] },
      { key: "toolPower", label: "Power", type: "number", unit: "W", filterable: true },
      { key: "bladeSize", label: "Blade size", type: "number", unit: "in", filterable: true },
      ...HARDWARE,
    ],
  },
  {
    tradeKey: "painter",
    vehicleForbidden: true,
    vehicleFitmentKeys: [],
    attributes: [
      { key: "paintType", label: "Paint type", type: "enum", filterable: true, options: ["Emulsion", "Gloss", "Satin", "Matt", "Textured", "Epoxy", "Automotive", "Primer", "Industrial"] },
      { key: "coverage", label: "Coverage", type: "number", unit: "m²/L", filterable: true },
      { key: "volume", label: "Volume", type: "number", unit: "L", filterable: true },
      { key: "finish", label: "Finish", type: "enum", filterable: true, options: ["Matt", "Satin", "Gloss", "Silk"] },
      { key: "dryingTime", label: "Drying time", type: "number", unit: "hr", filterable: true },
    ],
  },
  {
    tradeKey: "solar",
    vehicleForbidden: true,
    vehicleFitmentKeys: [],
    attributes: [
      { key: "wattage", label: "Wattage", type: "number", unit: "W", filterable: true, required: true },
      { key: "voltage", label: "Voltage", type: "number", unit: "V", filterable: true },
      { key: "panelType", label: "Panel type", type: "enum", filterable: true, options: ["Monocrystalline", "Polycrystalline", "Thin-film", "PERC", "Bifacial"] },
      { key: "inverterType", label: "Inverter type", type: "enum", filterable: true, options: ["Hybrid", "Off-grid", "On-grid", "String", "Micro"] },
      { key: "capacity", label: "Capacity", type: "number", unit: "kVA", filterable: true },
      { key: "efficiency", label: "Efficiency", type: "number", unit: "%", filterable: true },
    ],
  },
  {
    tradeKey: "generator",
    vehicleForbidden: true,
    vehicleFitmentKeys: [],
    attributes: [
      { key: "kva", label: "Power", type: "number", unit: "kVA", filterable: true, required: true },
      { key: "fuelType", label: "Fuel type", type: "enum", filterable: true, options: ["Petrol", "Diesel", "Gas", "Solar hybrid"] },
      { key: "phase", label: "Phase", type: "enum", filterable: true, options: ["Single", "Three"] },
      { key: "runTime", label: "Run time", type: "number", unit: "hr", filterable: true },
      { key: "tankCapacity", label: "Tank capacity", type: "number", unit: "L", filterable: true },
      { key: "startType", label: "Start type", type: "enum", filterable: true, options: ["Recoil", "Electric", "Remote", "Auto"] },
    ],
  },
];

const SCHEMA_BY_TRADE = new Map<string, TradeAttributeSchema>(
  TRADE_ATTRIBUTE_SCHEMAS.map((s) => [s.tradeKey, s])
);

export function getTradeAttributeSchema(tradeKey: string): TradeAttributeSchema | null {
  return SCHEMA_BY_TRADE.get(tradeKey) ?? null;
}

export function isVehicleFitmentAttribute(key: string): boolean {
  return [
    "vehicleMake",
    "vehicleModel",
    "vehicleYear",
    "position",
    "engine",
  ].includes(key);
}

/** All attribute keys valid for a trade. */
export function tradeAttributeKeys(tradeKey: string): Set<string> {
  return new Set((getTradeAttributeSchema(tradeKey)?.attributes ?? []).map((a) => a.key));
}

/**
 * Trade-aware attribute validation.
 * Returns errors for: unknown attributes, forbidden vehicle fitment on
 * non-vehicle trades, required-but-missing attributes.
 */
export function validateTradeAttributes(
  tradeKey: string,
  attributes: Record<string, unknown>
): { valid: boolean; errors: string[] } {
  const schema = getTradeAttributeSchema(tradeKey);
  if (!schema) return { valid: false, errors: [`Unknown trade: ${tradeKey}`] };

  const errors: string[] = [];
  const allowed = new Set(schema.attributes.map((a) => a.key));

  for (const [key, value] of Object.entries(attributes || {})) {
    if (value === undefined || value === null || value === "") continue;
    if (!allowed.has(key)) {
      errors.push(`Attribute "${key}" is not valid for trade "${tradeKey}"`);
    }
  }

  if (schema.vehicleForbidden) {
    for (const key of Object.keys(attributes || {})) {
      if (isVehicleFitmentAttribute(key)) {
        errors.push(
          `Vehicle fitment attribute "${key}" is not allowed for trade "${tradeKey}"`
        );
      }
    }
  }

  for (const def of schema.attributes) {
    if (!def.required) continue;
    const v = attributes?.[def.key];
    if (v === undefined || v === null || v === "") {
      errors.push(`Attribute "${def.key}" (${def.label}) is required for trade "${tradeKey}"`);
    }
  }

  return { valid: errors.length === 0, errors };
}
