/**
 * Nigerian Mechanic Shop taxonomy — 30 category branches with subcategories.
 * Seeds shop_trade_categories for trade_key = mechanic.
 * Expandable; does not claim Nigerian stock for any specific SKU.
 */

export type MechCat = {
  slug: string;
  name: string;
  children?: MechCat[];
};

export const MECHANIC_CATEGORY_TREE: MechCat[] = [
  {
    slug: "engine-engine-parts",
    name: "Engine & Engine Parts",
    children: [
      { slug: "engine-assemblies", name: "Engine Assemblies" },
      { slug: "engine-blocks", name: "Engine Blocks" },
      { slug: "cylinder-heads", name: "Cylinder Heads" },
      { slug: "cylinder-head-components", name: "Cylinder Head Components" },
      { slug: "pistons", name: "Pistons" },
      { slug: "piston-rings", name: "Piston Rings" },
      { slug: "connecting-rods", name: "Connecting Rods" },
      { slug: "crankshafts", name: "Crankshafts" },
      { slug: "camshafts", name: "Camshafts" },
      { slug: "bearings-engine", name: "Bearings" },
      { slug: "main-bearings", name: "Main Bearings" },
      { slug: "big-end-bearings", name: "Big-End Bearings" },
      { slug: "thrust-washers", name: "Thrust Washers" },
      { slug: "valves", name: "Valves" },
      { slug: "valve-springs", name: "Valve Springs" },
      { slug: "valve-guides", name: "Valve Guides" },
      { slug: "valve-seals", name: "Valve Seals" },
      { slug: "rocker-arms", name: "Rocker Arms" },
      { slug: "rocker-shafts", name: "Rocker Shafts" },
      { slug: "tappets-lifters", name: "Tappets/Lifters" },
      { slug: "push-rods", name: "Push Rods" },
      { slug: "timing-components", name: "Timing Components" },
      { slug: "timing-belts", name: "Timing Belts" },
      { slug: "timing-chains", name: "Timing Chains" },
      { slug: "timing-gears", name: "Timing Gears" },
      { slug: "timing-belt-tensioners", name: "Timing Belt Tensioners" },
      { slug: "timing-chain-tensioners", name: "Timing Chain Tensioners" },
      { slug: "idler-pulleys", name: "Idler Pulleys" },
      { slug: "water-pumps", name: "Water Pumps" },
      { slug: "oil-pumps", name: "Oil Pumps" },
      { slug: "gaskets", name: "Gaskets" },
      { slug: "head-gaskets", name: "Head Gaskets" },
      { slug: "full-gasket-sets", name: "Full Gasket Sets" },
      { slug: "oil-seals", name: "Oil Seals" },
      { slug: "engine-mounts", name: "Engine Mounts" },
      { slug: "flywheels", name: "Flywheels" },
      { slug: "engine-repair-kits", name: "Engine Repair Kits" },
    ],
  },
  {
    slug: "transmission-gearbox",
    name: "Transmission & Gearbox",
    children: [
      { slug: "manual-transmission", name: "Manual Transmission" },
      { slug: "automatic-transmission", name: "Automatic Transmission" },
      { slug: "cvt", name: "CVT" },
      { slug: "transmission-assemblies", name: "Transmission Assemblies" },
      { slug: "gearbox-components", name: "Gearbox Components" },
      { slug: "synchronizers", name: "Synchronizers" },
      { slug: "torque-converters", name: "Torque Converters" },
      { slug: "valve-bodies", name: "Valve Bodies" },
      { slug: "transmission-filters", name: "Transmission Filters" },
      { slug: "atf", name: "ATF" },
      { slug: "transmission-fluids", name: "Transmission Fluids" },
      { slug: "transmission-mounts", name: "Transmission Mounts" },
      { slug: "transmission-repair-kits", name: "Transmission Repair Kits" },
    ],
  },
  {
    slug: "clutch",
    name: "Clutch",
    children: [
      { slug: "clutch-kits", name: "Clutch Kits" },
      { slug: "clutch-discs", name: "Clutch Discs" },
      { slug: "pressure-plates", name: "Pressure Plates" },
      { slug: "release-bearings", name: "Release Bearings" },
      { slug: "pilot-bearings", name: "Pilot Bearings" },
      { slug: "clutch-master-cylinders", name: "Clutch Master Cylinders" },
      { slug: "clutch-slave-cylinders", name: "Clutch Slave Cylinders" },
      { slug: "clutch-cables", name: "Clutch Cables" },
      { slug: "clutch-repair-kits", name: "Clutch Repair Kits" },
    ],
  },
  {
    slug: "brake-system",
    name: "Brake System",
    children: [
      { slug: "brake-pads", name: "Brake Pads" },
      { slug: "brake-discs", name: "Brake Discs" },
      { slug: "brake-rotors", name: "Brake Rotors" },
      { slug: "brake-drums", name: "Brake Drums" },
      { slug: "brake-shoes", name: "Brake Shoes" },
      { slug: "brake-calipers", name: "Brake Calipers" },
      { slug: "caliper-repair-kits", name: "Caliper Repair Kits" },
      { slug: "brake-master-cylinders", name: "Brake Master Cylinders" },
      { slug: "brake-boosters", name: "Brake Boosters" },
      { slug: "abs-components", name: "ABS Components" },
      { slug: "abs-sensors", name: "ABS Sensors" },
      { slug: "brake-hoses", name: "Brake Hoses" },
      { slug: "brake-fluid", name: "Brake Fluid" },
      { slug: "parking-brake-components", name: "Parking Brake Components" },
      { slug: "brake-hardware", name: "Brake Hardware" },
    ],
  },
  {
    slug: "suspension",
    name: "Suspension",
    children: [
      { slug: "shock-absorbers", name: "Shock Absorbers" },
      { slug: "struts", name: "Struts" },
      { slug: "strut-mounts", name: "Strut Mounts" },
      { slug: "coil-springs", name: "Coil Springs" },
      { slug: "leaf-springs", name: "Leaf Springs" },
      { slug: "control-arms", name: "Control Arms" },
      { slug: "ball-joints", name: "Ball Joints" },
      { slug: "bushings", name: "Bushings" },
      { slug: "stabilizer-links", name: "Stabilizer Links" },
      { slug: "wheel-hubs", name: "Wheel Hubs" },
      { slug: "wheel-bearings", name: "Wheel Bearings" },
      { slug: "suspension-kits", name: "Suspension Kits" },
    ],
  },
  {
    slug: "steering",
    name: "Steering",
    children: [
      { slug: "steering-racks", name: "Steering Racks" },
      { slug: "power-steering-pumps", name: "Power Steering Pumps" },
      { slug: "tie-rods", name: "Tie Rods" },
      { slug: "tie-rod-ends", name: "Tie Rod Ends" },
      { slug: "steering-boots", name: "Steering Boots" },
      { slug: "power-steering-hoses", name: "Power Steering Hoses" },
      { slug: "power-steering-fluid", name: "Power Steering Fluid" },
      { slug: "steering-repair-kits", name: "Steering Repair Kits" },
    ],
  },
  {
    slug: "cooling-system",
    name: "Cooling System",
    children: [
      { slug: "radiators", name: "Radiators" },
      { slug: "radiator-caps", name: "Radiator Caps" },
      { slug: "cooling-fans", name: "Cooling Fans" },
      { slug: "fan-motors", name: "Fan Motors" },
      { slug: "thermostats", name: "Thermostats" },
      { slug: "radiator-hoses", name: "Radiator Hoses" },
      { slug: "expansion-tanks", name: "Expansion Tanks" },
      { slug: "coolant", name: "Coolant" },
      { slug: "antifreeze", name: "Antifreeze" },
    ],
  },
  {
    slug: "fuel-system",
    name: "Fuel System",
    children: [
      { slug: "fuel-pumps", name: "Fuel Pumps" },
      { slug: "fuel-injectors", name: "Fuel Injectors" },
      { slug: "fuel-filters", name: "Fuel Filters" },
      { slug: "fuel-pressure-regulators", name: "Fuel Pressure Regulators" },
      { slug: "throttle-bodies", name: "Throttle Bodies" },
      { slug: "diesel-injectors", name: "Diesel Injectors" },
      { slug: "carburetors", name: "Carburetors" },
    ],
  },
  {
    slug: "air-intake",
    name: "Air Intake",
    children: [
      { slug: "air-filters", name: "Air Filters" },
      { slug: "intake-manifolds", name: "Intake Manifolds" },
      { slug: "maf-sensors", name: "MAF Sensors" },
      { slug: "map-sensors", name: "MAP Sensors" },
      { slug: "turbochargers", name: "Turbochargers" },
      { slug: "intercoolers", name: "Intercoolers" },
    ],
  },
  {
    slug: "exhaust-emissions",
    name: "Exhaust & Emissions",
    children: [
      { slug: "exhaust-manifolds", name: "Exhaust Manifolds" },
      { slug: "mufflers", name: "Mufflers" },
      { slug: "catalytic-converters", name: "Catalytic Converters" },
      { slug: "oxygen-sensors", name: "Oxygen Sensors" },
      { slug: "egr-components", name: "EGR Components" },
      { slug: "exhaust-gaskets", name: "Exhaust Gaskets" },
    ],
  },
  {
    slug: "filters",
    name: "Filters",
    children: [
      { slug: "engine-oil-filters", name: "Engine Oil Filters" },
      { slug: "cabin-filters", name: "Cabin Filters" },
      { slug: "diesel-filters", name: "Diesel Filters" },
      { slug: "hydraulic-filters", name: "Hydraulic Filters" },
      { slug: "service-filter-kits", name: "Service Filter Kits" },
    ],
  },
  {
    slug: "ignition",
    name: "Ignition",
    children: [
      { slug: "spark-plugs", name: "Spark Plugs" },
      { slug: "glow-plugs", name: "Glow Plugs" },
      { slug: "ignition-coils", name: "Ignition Coils" },
      { slug: "ignition-wires", name: "Ignition Wires" },
      { slug: "ignition-modules", name: "Ignition Modules" },
    ],
  },
  {
    slug: "belts-pulleys-tensioners",
    name: "Belts, Pulleys & Tensioners",
    children: [
      { slug: "serpentine-belts", name: "Serpentine Belts" },
      { slug: "v-belts", name: "V-Belts" },
      { slug: "tensioners", name: "Tensioners" },
      { slug: "timing-belt-kits", name: "Timing Belt Kits" },
      { slug: "timing-chain-kits", name: "Timing Chain Kits" },
    ],
  },
  {
    slug: "bearings-seals",
    name: "Bearings & Seals",
    children: [
      { slug: "hub-bearings", name: "Hub Bearings" },
      { slug: "grease-seals", name: "Grease Seals" },
      { slug: "o-rings", name: "O-Rings" },
      { slug: "bearing-kits", name: "Bearing Kits" },
      { slug: "seal-kits", name: "Seal Kits" },
    ],
  },
  {
    slug: "lubricants-fluids",
    name: "Lubricants & Fluids",
    children: [
      { slug: "engine-oil", name: "Engine Oil" },
      { slug: "gear-oil", name: "Gear Oil" },
      { slug: "cvt-fluid", name: "CVT Fluid" },
      { slug: "hydraulic-fluid", name: "Hydraulic Fluid" },
      { slug: "grease", name: "Grease" },
      { slug: "additives", name: "Additives" },
      { slug: "engine-flush", name: "Engine Flush" },
    ],
  },
  {
    slug: "electrical-starting-charging",
    name: "Electrical & Starting/Charging",
    children: [
      { slug: "alternators", name: "Alternators" },
      { slug: "starters", name: "Starters" },
      { slug: "batteries", name: "Batteries" },
      { slug: "battery-cables", name: "Battery Cables" },
      { slug: "fuses", name: "Fuses" },
      { slug: "relays", name: "Relays" },
      { slug: "automotive-bulbs", name: "Automotive Bulbs" },
      { slug: "wiring", name: "Automotive Wiring" },
    ],
  },
  {
    slug: "sensors-electronics",
    name: "Sensors & Electronic Components",
    children: [
      { slug: "crankshaft-position-sensors", name: "Crankshaft Position Sensors" },
      { slug: "camshaft-position-sensors", name: "Camshaft Position Sensors" },
      { slug: "coolant-temp-sensors", name: "Coolant Temperature Sensors" },
      { slug: "knock-sensors", name: "Knock Sensors" },
      { slug: "wheel-speed-sensors", name: "Wheel Speed Sensors" },
      { slug: "parking-sensors", name: "Parking Sensors" },
    ],
  },
  {
    slug: "engine-control-ecu",
    name: "Engine Control / ECU",
    children: [
      { slug: "ecu-modules", name: "ECU Modules" },
      { slug: "ecu-relays", name: "ECU Relays" },
      { slug: "wiring-harness", name: "Wiring Harness" },
      { slug: "ecu-connectors", name: "ECU Connectors" },
    ],
  },
  {
    slug: "body-interior",
    name: "Body & Interior (Mechanic)",
    children: [
      { slug: "wiper-blades", name: "Wiper Blades" },
      { slug: "wiper-motors", name: "Wiper Motors" },
      { slug: "mirrors", name: "Mirrors" },
      { slug: "door-locks", name: "Door Locks" },
      { slug: "window-regulators", name: "Window Regulators" },
    ],
  },
  {
    slug: "hvac-ac",
    name: "HVAC / A/C",
    children: [
      { slug: "ac-compressors", name: "AC Compressors" },
      { slug: "condensers", name: "Condensers" },
      { slug: "evaporators", name: "Evaporators" },
      { slug: "ac-gas", name: "AC Gas / Refrigerant" },
      { slug: "cabin-blower-motors", name: "Cabin Blower Motors" },
      { slug: "ac-hoses", name: "AC Hoses" },
    ],
  },
  {
    slug: "lighting",
    name: "Lighting",
    children: [
      { slug: "headlamps", name: "Headlamps" },
      { slug: "tail-lamps", name: "Tail Lamps" },
      { slug: "fog-lamps", name: "Fog Lamps" },
      { slug: "led-bulbs", name: "LED Bulbs" },
      { slug: "ballasts", name: "Ballasts" },
    ],
  },
  {
    slug: "wheels-related",
    name: "Wheels Related (Mechanic)",
    children: [
      { slug: "wheel-nuts", name: "Wheel Nuts" },
      { slug: "wheel-studs", name: "Wheel Studs" },
      { slug: "hub-caps", name: "Hub Caps" },
      { slug: "wheel-spacers", name: "Wheel Spacers" },
    ],
  },
  {
    slug: "tools-hand",
    name: "Hand Tools",
    children: [
      { slug: "spanners", name: "Spanners" },
      { slug: "sockets", name: "Sockets" },
      { slug: "screwdrivers", name: "Screwdrivers" },
      { slug: "pliers", name: "Pliers" },
      { slug: "hammers", name: "Hammers" },
      { slug: "torque-wrenches", name: "Torque Wrenches" },
    ],
  },
  {
    slug: "tools-power",
    name: "Power Tools",
    children: [
      { slug: "impact-wrenches", name: "Impact Wrenches" },
      { slug: "drills", name: "Drills" },
      { slug: "grinders", name: "Grinders" },
      { slug: "air-tools", name: "Air Tools" },
    ],
  },
  {
    slug: "diagnostic-tools",
    name: "Diagnostic Tools",
    children: [
      { slug: "obd-scanners", name: "OBD Scanners" },
      { slug: "multimeters", name: "Multimeters" },
      { slug: "battery-testers", name: "Battery Testers" },
      { slug: "compression-testers", name: "Compression Testers" },
      { slug: "leak-detectors", name: "Leak Detectors" },
    ],
  },
  {
    slug: "garage-equipment",
    name: "Garage Equipment",
    children: [
      { slug: "jacks", name: "Jacks" },
      { slug: "axle-stands", name: "Axle Stands" },
      { slug: "compressors", name: "Compressors" },
      { slug: "work-benches", name: "Work Benches" },
      { slug: "creepers", name: "Creepers" },
    ],
  },
  {
    slug: "consumables-chemicals",
    name: "Consumables & Chemicals",
    children: [
      { slug: "thread-lock", name: "Thread Lock" },
      { slug: "sealants", name: "Sealants" },
      { slug: "cleaners", name: "Cleaners" },
      { slug: "penetrating-oil", name: "Penetrating Oil" },
      { slug: "brake-cleaner", name: "Brake Cleaner" },
    ],
  },
  {
    slug: "safety-ppe",
    name: "Safety & PPE",
    children: [
      { slug: "safety-gloves", name: "Safety Gloves" },
      { slug: "safety-glasses", name: "Safety Glasses" },
      { slug: "coveralls", name: "Coveralls" },
      { slug: "ear-protection", name: "Ear Protection" },
      { slug: "first-aid", name: "First Aid Supplies" },
    ],
  },
  {
    slug: "fasteners-hardware",
    name: "Fasteners & General Hardware",
    children: [
      { slug: "bolts", name: "Bolts" },
      { slug: "nuts", name: "Nuts" },
      { slug: "washers", name: "Washers" },
      { slug: "clips", name: "Clips" },
      { slug: "hose-clamps", name: "Hose Clamps" },
      { slug: "cable-ties", name: "Cable Ties" },
    ],
  },
  {
    slug: "maintenance-service",
    name: "Maintenance & Service",
    children: [
      { slug: "service-kits", name: "Service Kits" },
      { slug: "oil-change-kits", name: "Oil Change Kits" },
      { slug: "tune-up-kits", name: "Tune-Up Kits" },
    ],
  },
];

/** Flat walk for seeding: depth 0 roots then depth 1 children. */
export function walkMechanicCategories(): Array<{
  slug: string;
  name: string;
  parentSlug: string | null;
  depth: number;
  sortOrder: number;
}> {
  const out: Array<{
    slug: string;
    name: string;
    parentSlug: string | null;
    depth: number;
    sortOrder: number;
  }> = [];
  MECHANIC_CATEGORY_TREE.forEach((root, i) => {
    out.push({
      slug: root.slug,
      name: root.name,
      parentSlug: null,
      depth: 0,
      sortOrder: i + 1,
    });
    (root.children || []).forEach((c, j) => {
      out.push({
        slug: c.slug,
        name: c.name,
        parentSlug: root.slug,
        depth: 1,
        sortOrder: j + 1,
      });
    });
  });
  return out;
}
