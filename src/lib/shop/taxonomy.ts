/**
 * ONA Shop taxonomy — single source of truth for the 14 Repair Pro trades.
 *
 * Shared server + client module (no "use client"). Each trade maps to its own
 * category tree. Vehicle fitment is only for vehicle-based trades.
 *
 * Trade keys match PRO_TRADE_OPTIONS ids in @/lib/services.
 */

export const SHOP_TRADE_KEYS = [
  "mechanic",
  "vulcanizer",
  "towing",
  "ac",
  "battery",
  "body",
  "electrical",
  "diagnostics",
  "fashion",
  "plumber",
  "carpenter",
  "painter",
  "solar",
  "generator",
] as const;

export type ShopTradeKey = (typeof SHOP_TRADE_KEYS)[number];

/** Trades that may use vehicle fitment (Make/Model/Year/Engine/Garage). */
export const VEHICLE_BASED_TRADES: ReadonlySet<ShopTradeKey> = new Set([
  "mechanic",
  "vulcanizer",
  "towing",
  "ac",
  "battery",
  "body",
  "electrical",
  "diagnostics",
]);

export function isVehicleTrade(tradeKey: string | null | undefined): boolean {
  if (!tradeKey) return false;
  return VEHICLE_BASED_TRADES.has(tradeKey as ShopTradeKey);
}

export function isShopTrade(tradeKey: string | null | undefined): boolean {
  if (!tradeKey) return false;
  return (SHOP_TRADE_KEYS as readonly string[]).includes(tradeKey);
}

export type TradeCategorySeed = {
  /** Unique within trade. kebab-case slug. */
  slug: string;
  name: string;
  /** Optional children (depth 2) — currently flat roots only in Phase 1. */
  children?: TradeCategorySeed[];
};

export type TradeSeed = {
  key: ShopTradeKey;
  name: string;
  vehicleBased: boolean;
  roots: TradeCategorySeed[];
};

/** Root category taxonomy per trade (Phase 1 scope). */
export const SHOP_TRADE_TAXONOMY: TradeSeed[] = [
  {
    key: "mechanic",
    name: "Mechanic",
    vehicleBased: true,
    // Live Automedics 17-category tree (mechanic-taxonomy.ts).
    roots: [
      { slug: "batteries", name: "Batteries" },
      { slug: "engine-oil", name: "Engine Oil" },
      { slug: "transmission-fluid", name: "Transmission Fluid" },
      { slug: "brake-fluid", name: "Brake Fluid" },
      { slug: "coolant", name: "Coolant" },
      { slug: "oil-filters", name: "Oil Filters" },
      { slug: "air-filters", name: "Air Filters" },
      { slug: "cabin-filters", name: "Cabin Filters" },
      { slug: "brake-pads", name: "Brake Pads" },
      { slug: "brake-discs", name: "Brake Discs" },
      { slug: "brake-linings", name: "Brake Linings" },
      { slug: "shock-absorbers", name: "Shock Absorbers" },
      { slug: "ball-joints", name: "Ball Joints" },
      { slug: "stabilizer-linkages", name: "Stabilizer Linkages" },
      { slug: "stabilizer-rubbers-bushings", name: "Stabilizer Rubbers & Bushings" },
      { slug: "tie-rod-ends-sockets", name: "Tie Rod Ends & Sockets" },
      { slug: "other-accessories", name: "Other / Accessories" },
    ],
  },
  {
    key: "vulcanizer",
    name: "Vulcanizer",
    vehicleBased: true,
    // Full Vulcanizer Shop taxonomy lives in vulcanizer-taxonomy.ts
    // (34 branches + subcategories). Roots listed here for UI fallbacks.
    roots: [
      { slug: "tires", name: "Tires & Tyres" },
      { slug: "truck-bus-tires", name: "Truck & Bus Tyres" },
      { slug: "motorcycle-tires", name: "Motorcycle & Scooter Tyres" },
      { slug: "bicycle-tires", name: "Bicycle Tyres" },
      { slug: "speciality-tires", name: "Speciality & Off-Road Tyres" },
      { slug: "tubes", name: "Inner Tubes" },
      { slug: "rims", name: "Rims & Alloy Wheels" },
      { slug: "wheels", name: "Complete Wheels" },
      { slug: "hub-caps-accessories", name: "Hub Caps & Wheel Accessories" },
      { slug: "tires-fasteners", name: "Wheel Nuts, Studs & Hardware" },
      { slug: "valves", name: "Valves & Valve Cores" },
      { slug: "tpms", name: "TPMS & Sensors" },
      { slug: "patches", name: "Repair Patches & Plugs" },
      { slug: "tire-repair", name: "Tyre Repair Kits & Tools" },
      { slug: "tubeless-sealant", name: "Tubeless Conversion & Sealant" },
      { slug: "vulcanizing-materials", name: "Vulcanizing Materials" },
      { slug: "vulcanizing-equipment", name: "Vulcanizing Equipment" },
      { slug: "tire-changers", name: "Tyre Changers & Dismantling" },
      { slug: "bead-breakers", name: "Bead Breakers" },
      { slug: "compressors", name: "Air Compressors" },
      { slug: "air-accessories", name: "Air Systems & Fittings" },
      { slug: "tire-inflation", name: "Inflation & Pressure Gauges" },
      { slug: "balancing", name: "Wheel Balancing" },
      { slug: "balance-weights", name: "Balance Weights" },
      { slug: "alignment", name: "Wheel Alignment" },
      { slug: "tire-levers", name: "Tyre Levers & Mounting Tools" },
      { slug: "tire-buffers", name: "Buffing & Grinding" },
      { slug: "power-tools", name: "Power Tools" },
      { slug: "garage-equipment", name: "Garage & Lifting Equipment" },
      { slug: "tire-care-chemicals", name: "Tyre Care & Chemicals" },
      { slug: "safety-ppe", name: "Safety & PPE" },
    ],
  },
  {
    key: "towing",
    name: "Tow",
    vehicleBased: true,
    roots: [
      { slug: "tow-straps", name: "Tow Straps" },
      { slug: "chains", name: "Chains" },
      { slug: "winches", name: "Winches" },
      { slug: "tow-bars", name: "Tow Bars" },
      { slug: "dollies", name: "Dollies" },
      { slug: "recovery-equipment", name: "Recovery Equipment" },
      { slug: "warning-equipment", name: "Warning Equipment" },
      { slug: "trailer-equipment", name: "Trailer Equipment" },
      { slug: "towing-accessories", name: "Towing Accessories" },
    ],
  },
  {
    key: "ac",
    name: "A/C",
    vehicleBased: true,
    roots: [
      { slug: "vehicle-ac", name: "Vehicle A/C" },
      { slug: "commercial-ac", name: "Commercial A/C" },
      { slug: "industrial-ac", name: "Industrial A/C" },
      { slug: "compressors", name: "Compressors" },
      { slug: "condensers", name: "Condensers" },
      { slug: "evaporators", name: "Evaporators" },
      { slug: "blowers", name: "Blowers" },
      { slug: "fans", name: "Fans" },
      { slug: "controls", name: "Controls" },
      { slug: "sensors", name: "Sensors" },
      { slug: "refrigeration-equipment", name: "Refrigeration Equipment" },
      { slug: "ac-tools", name: "A/C Tools" },
    ],
  },
  {
    key: "battery",
    name: "Battery",
    vehicleBased: true,
    roots: [
      { slug: "vehicle-batteries", name: "Vehicle Batteries" },
      { slug: "battery-chargers", name: "Battery Chargers" },
      { slug: "battery-testers", name: "Battery Testers" },
      { slug: "jump-starters", name: "Jump Starters" },
      { slug: "terminals", name: "Terminals" },
      { slug: "cables", name: "Cables" },
      { slug: "battery-boxes", name: "Battery Boxes" },
      { slug: "battery-accessories", name: "Battery Accessories" },
      { slug: "diagnostic-equipment", name: "Diagnostic Equipment" },
    ],
  },
  {
    key: "body",
    name: "Body",
    vehicleBased: true,
    roots: [
      { slug: "doors", name: "Doors" },
      { slug: "bonnets", name: "Bonnets" },
      { slug: "trunks", name: "Trunks" },
      { slug: "fenders", name: "Fenders" },
      { slug: "bumpers", name: "Bumpers" },
      { slug: "grilles", name: "Grilles" },
      { slug: "mirrors", name: "Mirrors" },
      { slug: "panels", name: "Panels" },
      { slug: "headlights", name: "Headlights" },
      { slug: "tail-lights", name: "Tail Lights" },
      { slug: "glass", name: "Glass" },
      { slug: "body-hardware", name: "Body Hardware" },
      { slug: "paint", name: "Paint" },
      { slug: "body-repair", name: "Body Repair" },
      { slug: "body-tools", name: "Body Tools" },
    ],
  },
  {
    key: "electrical",
    name: "Electric",
    vehicleBased: true,
    roots: [
      { slug: "cables", name: "Cables" },
      { slug: "wires", name: "Wires" },
      { slug: "switches", name: "Switches" },
      { slug: "sockets", name: "Sockets" },
      { slug: "breakers", name: "Breakers" },
      { slug: "contactors", name: "Contactors" },
      { slug: "relays", name: "Relays" },
      { slug: "transformers", name: "Transformers" },
      { slug: "motors", name: "Motors" },
      { slug: "panels", name: "Panels" },
      { slug: "distribution", name: "Distribution" },
      { slug: "lighting", name: "Lighting" },
      { slug: "testing-equipment", name: "Testing Equipment" },
      { slug: "industrial-electrical", name: "Industrial Electrical" },
      { slug: "automotive-electrical", name: "Automotive Electrical" },
    ],
  },
  {
    key: "diagnostics",
    name: "Scan",
    vehicleBased: true,
    roots: [
      { slug: "obd-scanners", name: "OBD Scanners" },
      { slug: "diagnostic-scanners", name: "Diagnostic Scanners" },
      { slug: "code-readers", name: "Code Readers" },
      { slug: "diagnostic-cables", name: "Diagnostic Cables" },
      { slug: "adapters", name: "Adapters" },
      { slug: "oscilloscopes", name: "Oscilloscopes" },
      { slug: "battery-testers", name: "Battery Testers" },
      { slug: "tpms-tools", name: "TPMS Tools" },
      { slug: "ecu-tools", name: "ECU Tools" },
      { slug: "diagnostic-accessories", name: "Diagnostic Accessories" },
      { slug: "vehicle-coverage", name: "Vehicle Coverage" },
    ],
  },
  {
    key: "fashion",
    name: "Fashion",
    vehicleBased: false,
    roots: [
      { slug: "fabrics-textiles", name: "Fabrics & Textiles" },
      { slug: "sewing-machines", name: "Sewing Machines" },
      { slug: "sewing-tools-accessories", name: "Sewing Tools & Accessories" },
      { slug: "threads", name: "Threads" },
      { slug: "buttons-fasteners", name: "Buttons & Fasteners" },
      { slug: "zippers", name: "Zippers" },
      { slug: "patterns", name: "Patterns" },
      { slug: "trims-laces", name: "Trims & Laces" },
      { slug: "embroidery-supplies", name: "Embroidery Supplies" },
      { slug: "mannequins-display", name: "Mannequins & Display" },
      { slug: "tailoring-equipment", name: "Tailoring Equipment" },
      { slug: "garments-uniforms", name: "Garments & Uniforms" },
    ],
  },
  {
    key: "plumber",
    name: "Plumber",
    vehicleBased: false,
    roots: [
      { slug: "pipes", name: "Pipes" },
      { slug: "fittings", name: "Fittings" },
      { slug: "valves", name: "Valves" },
      { slug: "pumps", name: "Pumps" },
      { slug: "taps", name: "Taps" },
      { slug: "toilets", name: "Toilets" },
      { slug: "sinks", name: "Sinks" },
      { slug: "water-heaters", name: "Water Heaters" },
      { slug: "connectors", name: "Connectors" },
      { slug: "seals", name: "Seals" },
      { slug: "adhesives", name: "Adhesives" },
      { slug: "drainage", name: "Drainage" },
      { slug: "water-storage", name: "Water Storage" },
      { slug: "pressure-equipment", name: "Pressure Equipment" },
      { slug: "plumbing-tools", name: "Plumbing Tools" },
    ],
  },
  {
    key: "carpenter",
    name: "Carpenter",
    vehicleBased: false,
    roots: [
      { slug: "timber", name: "Timber" },
      { slug: "boards", name: "Boards" },
      { slug: "plywood", name: "Plywood" },
      { slug: "mdf", name: "MDF" },
      { slug: "fasteners", name: "Fasteners" },
      { slug: "nails", name: "Nails" },
      { slug: "screws", name: "Screws" },
      { slug: "hinges", name: "Hinges" },
      { slug: "handles", name: "Handles" },
      { slug: "saws", name: "Saws" },
      { slug: "drills", name: "Drills" },
      { slug: "planers", name: "Planers" },
      { slug: "sanders", name: "Sanders" },
      { slug: "routers", name: "Routers" },
      { slug: "measuring-tools", name: "Measuring Tools" },
      { slug: "adhesives", name: "Adhesives" },
      { slug: "workshop-equipment", name: "Workshop Equipment" },
    ],
  },
  {
    key: "painter",
    name: "Painter",
    vehicleBased: false,
    roots: [
      { slug: "interior-paint", name: "Interior Paint" },
      { slug: "exterior-paint", name: "Exterior Paint" },
      { slug: "industrial-coatings", name: "Industrial Coatings" },
      { slug: "automotive-paint", name: "Automotive Paint" },
      { slug: "primer", name: "Primer" },
      { slug: "thinner", name: "Thinner" },
      { slug: "brushes", name: "Brushes" },
      { slug: "rollers", name: "Rollers" },
      { slug: "spray-guns", name: "Spray Guns" },
      { slug: "sandpaper", name: "Sandpaper" },
      { slug: "masking", name: "Masking" },
      { slug: "protective-equipment", name: "Protective Equipment" },
      { slug: "painting-equipment", name: "Painting Equipment" },
    ],
  },
  {
    key: "solar",
    name: "Solar",
    vehicleBased: false,
    roots: [
      { slug: "solar-panels", name: "Solar Panels" },
      { slug: "inverters", name: "Inverters" },
      { slug: "batteries", name: "Batteries" },
      { slug: "charge-controllers", name: "Charge Controllers" },
      { slug: "mppt", name: "MPPT" },
      { slug: "mounting", name: "Mounting" },
      { slug: "solar-cables", name: "Solar Cables" },
      { slug: "mc4", name: "MC4" },
      { slug: "combiner-boxes", name: "Combiner Boxes" },
      { slug: "dc-protection", name: "DC Protection" },
      { slug: "ac-protection", name: "AC Protection" },
      { slug: "monitoring", name: "Monitoring" },
      { slug: "solar-pumps", name: "Solar Pumps" },
      { slug: "solar-lighting", name: "Solar Lighting" },
      { slug: "installation-tools", name: "Installation Tools" },
      { slug: "accessories", name: "Accessories" },
    ],
  },
  {
    key: "generator",
    name: "Generator",
    vehicleBased: false,
    roots: [
      { slug: "portable-generators", name: "Portable Generators" },
      { slug: "standby-generators", name: "Standby Generators" },
      { slug: "industrial-generators", name: "Industrial Generators" },
      { slug: "diesel", name: "Diesel" },
      { slug: "petrol", name: "Petrol" },
      { slug: "engines", name: "Engines" },
      { slug: "alternators", name: "Alternators" },
      { slug: "avr", name: "AVR" },
      { slug: "control-panels", name: "Control Panels" },
      { slug: "starters", name: "Starters" },
      { slug: "fuel-systems", name: "Fuel Systems" },
      { slug: "cooling", name: "Cooling" },
      { slug: "exhaust", name: "Exhaust" },
      { slug: "filters", name: "Filters" },
      { slug: "batteries", name: "Batteries" },
      { slug: "sensors", name: "Sensors" },
      { slug: "transfer-switches", name: "Transfer Switches" },
      { slug: "generator-tools", name: "Generator Tools" },
      { slug: "maintenance-parts", name: "Maintenance Parts" },
    ],
  },
];

export function getRootCategoriesForTrade(tradeKey: string): TradeCategorySeed[] {
  return SHOP_TRADE_TAXONOMY.find((t) => t.key === tradeKey)?.roots ?? [];
}

export function getTradeSeed(tradeKey: string): TradeSeed | undefined {
  return SHOP_TRADE_TAXONOMY.find((t) => t.key === tradeKey);
}

export function getTradeDisplayName(tradeKey: string): string {
  return getTradeSeed(tradeKey)?.name ?? tradeKey;
}