/**
 * Vulcanizer Shop taxonomy — 34 category branches with subcategories.
 * Seeds shop_trade_categories for trade_key = vulcanizer.
 * Expandable; grounded in real tyre/tube/valve/equipment product classes sold
 * by tyre tradesmen (ETRTO-standard sizes, brand product lines).
 */

export type VulcCat = {
  slug: string;
  name: string;
  children?: VulcCat[];
};

export const VULCANIZER_CATEGORY_TREE: VulcCat[] = [
  {
    slug: "tires",
    name: "Tires & Tyres",
    children: [
      { slug: "passenger-tires", name: "Passenger Car Tyres" },
      { slug: "touring-tires", name: "Touring Tyres" },
      { slug: "performance-tires", name: "Performance Tyres" },
      { slug: "run-flat-tires", name: "Run-Flat Tyres" },
      { slug: "all-season-tires", name: "All-Season Tyres" },
      { slug: "winter-tires", name: "Winter / Snow Tyres" },
      { slug: "spare-temporary-tires", name: "Temporary / Space-Saver Spares" },
    ],
  },
  {
    slug: "truck-bus-tires",
    name: "Truck & Bus Tyres",
    children: [
      { slug: "light-truck-tires", name: "Light-Truck (LT) Tyres" },
      { slug: "bus-tires", name: "Bus Tyres" },
      { slug: "truck-tires", name: "Rigid Truck Tyres" },
      { slug: "trailer-tires", name: "Trailer Tyres" },
    ],
  },
  {
    slug: "motorcycle-tires",
    name: "Motorcycle & Scooter Tyres",
    children: [
      { slug: "motorcycle-front-tires", name: "Motorcycle Front Tyres" },
      { slug: "motorcycle-rear-tires", name: "Motorcycle Rear Tyres" },
      { slug: "scooter-tires", name: "Scooter Tyres" },
      { slug: "motocross-tires", name: "Motocross / Dirt Tyres" },
    ],
  },
  {
    slug: "bicycle-tires",
    name: "Bicycle Tyres",
    children: [
      { slug: "road-bike-tires", name: "Road Bike Tyres" },
      { slug: "mountain-bike-tires", name: "Mountain Bike Tyres" },
      { slug: "city-bike-tires", name: "City / Commuter Tyres" },
      { slug: "kart-tires", name: "Go-Kart Tyres" },
    ],
  },
  {
    slug: "speciality-tires",
    name: "Speciality & Off-Road Tyres",
    children: [
      { slug: "all-terrain-tires", name: "All-Terrain Tyres" },
      { slug: "mud-terrain-tires", name: "Mud-Terrain Tyres" },
      { slug: "agricultural-tires", name: "Agricultural / Tractor Tyres" },
      { slug: "industrial-tires", name: "Industrial & Forklift Tyres" },
      { slug: "solid-tires", name: "Solid / Puncture-Proof Tyres" },
    ],
  },
  {
    slug: "tubes",
    name: "Inner Tubes",
    children: [
      { slug: "passenger-tubes", name: "Passenger Car Tubes" },
      { slug: "truck-tubes", name: "Truck & Bus Tubes" },
      { slug: "motorcycle-tubes", name: "Motorcycle / Scooter Tubes" },
      { slug: "bicycle-tubes", name: "Bicycle Tubes" },
      { slug: "r20-r24-tubes", name: "Heavy-Duty (R20–R24) Tubes" },
    ],
  },
  {
    slug: "rims",
    name: "Rims & Alloy Wheels",
    children: [
      { slug: "steel-rims", name: "Steel Rims" },
      { slug: "alloy-rims", name: "Alloy Rims" },
      { slug: "white-rims", name: "White / Spider Rims" },
      { slug: "heavy-duty-rims", name: "Heavy-Duty Rims" },
      { slug: "split-rim-parts", name: "Split Rim Parts" },
    ],
  },
  {
    slug: "wheels",
    name: "Complete Wheels",
    children: [
      { slug: "steel-wheel-assemblies", name: "Steel Wheel Assemblies" },
      { slug: "alloy-wheel-assemblies", name: "Alloy Wheel Assemblies" },
      { slug: "spare-wheel-assemblies", name: "Spare Wheel Assemblies" },
      { slug: "wheel-covers", name: "Wheel Covers & Trims" },
    ],
  },
  {
    slug: "hub-caps-accessories",
    name: "Hub Caps & Wheel Accessories",
    children: [
      { slug: "hub-caps", name: "Hub Caps" },
      { slug: "center-caps", name: "Centre Caps" },
      { slug: "wheel-center-covers", name: "Wheel Centre Covers" },
      { slug: "wheel-spacers", name: "Wheel Spacers" },
    ],
  },
  {
    slug: "tires-fasteners",
    name: "Wheel Nuts, Studs & Hardware",
    children: [
      { slug: "lug-nuts", name: "Lug Nuts" },
      { slug: "wheel-studs", name: "Wheel Studs" },
      { slug: "locking-nuts", name: "Locking Nuts" },
      { slug: "wheel-hardware-kits", name: "Wheel Hardware Kits" },
    ],
  },
  {
    slug: "valves",
    name: "Valves & Valve Cores",
    children: [
      { slug: "snap-in-valves", name: "Snap-In Tyre Valves" },
      { slug: "clamp-in-valves", name: "Clamp-In / Metal Valves" },
      { slug: "valve-cores", name: "Valve Cores" },
      { slug: "valve-caps", name: "Valve Caps" },
      { slug: "valve-extenders", name: "Valve Extenders" },
      { slug: "tpms-valves", name: "TPMS Valves" },
    ],
  },
  {
    slug: "tpms",
    name: "TPMS & Sensors",
    children: [
      { slug: "tpms-sensors", name: "TPMS Sensors" },
      { slug: "tpms-service-kits", name: "TPMS Service Kits" },
      { slug: "tpms-tools", name: "TPMS Tools" },
      { slug: "programmable-sensors", name: "Programmable Sensors" },
    ],
  },
  {
    slug: "patches",
    name: "Repair Patches & Plugs",
    children: [
      { slug: "hot-patches", name: "Hot Patches" },
      { slug: "cold-patches", name: "Cold Patches" },
      { slug: "radial-repair-patches", name: "Radial Repair Patches" },
      { slug: "tube-patches", name: "Tube Patches" },
      { slug: "tire-plugs", name: "Tyre Plugs & Strings" },
    ],
  },
  {
    slug: "tire-repair",
    name: "Tyre Repair Kits & Tools",
    children: [
      { slug: "puncture-repair-kits", name: "Puncture Repair Kits" },
      { slug: "diagonal-repair-kits", name: "Diagonal Repair Kits" },
      { slug: "section-repair-kits", name: "Section Repair Kits" },
      { slug: "repair-tools", name: "Repair Tools" },
    ],
  },
  {
    slug: "tubeless-sealant",
    name: "Tubeless Conversion & Sealant",
    children: [
      { slug: "tubeless-conversion-kits", name: "Tubeless Conversion Kits" },
      { slug: "tubeless-sealant", name: "Tubeless Sealant" },
      { slug: "rim-tape", name: "Rim Tape" },
      { slug: "bead-seat-sealant", name: "Bead Seat Sealant" },
    ],
  },
  {
    slug: "vulcanizing-materials",
    name: "Vulcanizing Materials",
    children: [
      { slug: "vulcanizing-cement", name: "Vulcanizing Cement" },
      { slug: "cushion-gum", name: "Cushion Gum" },
      { slug: "repair-gum", name: "Repair Gum" },
      { slug: "uncured-rubber", name: "Uncured Rubber Sheets" },
      { slug: "chemical-vulcanizing", name: "Chemical Vulcanizing Fluid" },
    ],
  },
  {
    slug: "vulcanizing-equipment",
    name: "Vulcanizing Equipment",
    children: [
      { slug: "vulcanizing-machines", name: "Vulcanizing Machines" },
      { slug: "heat-curing-pads", name: "Heat / Curing Pads" },
      { slug: "vulcanizing-presses", name: "Vulcanizing Presses" },
      { slug: "spot-vulcanizers", name: "Spot Vulcanizers" },
      { slug: "autoclaves", name: "Autoclaves / Chambers" },
    ],
  },
  {
    slug: "tire-changers",
    name: "Tyre Changers & Dismantling",
    children: [
      { slug: "manual-tire-changers", name: "Manual Tyre Changers" },
      { slug: "semi-auto-tire-changers", name: "Semi-Automatic Tyre Changers" },
      { slug: "automatic-tire-changers", name: "Automatic Tyre Changers" },
      { slug: "truck-tire-changers", name: "Truck / Bus Tyre Changers" },
      { slug: "tire-changer-accessories", name: "Tyre Changer Accessories" },
    ],
  },
  {
    slug: "bead-breakers",
    name: "Bead Breakers",
    children: [
      { slug: "manual-bead-breakers", name: "Manual Bead Breakers" },
      { slug: "hydraulic-bead-breakers", name: "Hydraulic Bead Breakers" },
      { slug: "bead-breaker-kits", name: "Bead Breaker Kits" },
    ],
  },
  {
    slug: "compressors",
    name: "Air Compressors",
    children: [
      { slug: "portable-compressors", name: "Portable Compressors" },
      { slug: "garage-compressors", name: "Garage / Shop Compressors" },
      { slug: "twin-cylinder-compressors", name: "Twin-Cylinder Compressors" },
      { slug: "diesel-compressors", name: "Diesel Compressors" },
      { slug: "compressor-spares", name: "Compressor Spares" },
    ],
  },
  {
    slug: "air-accessories",
    name: "Air Systems & Fittings",
    children: [
      { slug: "air-hoses", name: "Air Hoses" },
      { slug: "air-chucks", name: "Air Chucks" },
      { slug: "air-couplers", name: "Quick Couplers & Fittings" },
      { slug: "air-regulators", name: "Regulators & Moisture Traps" },
      { slug: "air-tanks", name: "Air Tanks" },
    ],
  },
  {
    slug: "tire-inflation",
    name: "Inflation & Pressure Gauges",
    children: [
      { slug: "tyre-pressure-gauges", name: "Tyre Pressure Gauges" },
      { slug: "digital-inflators", name: "Digital Inflators" },
      { slug: "foot-pumps", name: "Foot Pumps" },
      { slug: "portable-inflators", name: "Portable / 12V Inflators" },
      { slug: "air-guns", name: "Pneumatic Air Guns" },
    ],
  },
  {
    slug: "balancing",
    name: "Wheel Balancing",
    children: [
      { slug: "wheel-balancers", name: "Wheel Balancers" },
      { slug: "wheel-balancer-accessories", name: "Balancer Accessories" },
      { slug: "balancing-cones", name: "Balancing Cones" },
      { slug: "wheel-balancers-semi", name: "Semi-Automatic Balancers" },
    ],
  },
  {
    slug: "balance-weights",
    name: "Balance Weights",
    children: [
      { slug: "adhesive-weights", name: "Adhesive Weights" },
      { slug: "hammer-on-weights", name: "Hammer-On Weights" },
      { slug: "balance-weight-kits", name: "Weight Kits" },
      { slug: "balance-beads", name: "Balancing Beads" },
    ],
  },
  {
    slug: "alignment",
    name: "Wheel Alignment",
    children: [
      { slug: "alignment-gauges", name: "Alignment Gauges" },
      { slug: "camber-kits", name: "Camber / Caster Kits" },
      { slug: "toe-gauges", name: "Toe Gauges" },
      { slug: "laser-alignment-systems", name: "Laser Alignment Systems" },
      { slug: "alignment-accessories", name: "Alignment Accessories" },
    ],
  },
  {
    slug: "tire-levers",
    name: "Tyre Levers & Mounting Tools",
    children: [
      { slug: "tyre-levers", name: "Tyre Levers" },
      { slug: "bead-tools", name: "Bead Tools" },
      { slug: "mounting-hammers", name: "Rubber Mallets & Hammers" },
      { slug: "tyre-spoons", name: "Tyre Spoons" },
      { slug: "socket-sets", name: "Wheel Socket Sets" },
    ],
  },
  {
    slug: "tire-buffers",
    name: "Buffing & Grinding",
    children: [
      { slug: "tire-buffing-machines", name: "Buffing Machines" },
      { slug: "hand-rasps", name: "Hand Rasps" },
      { slug: "grinder-wheels", name: "Grinder Wheels" },
      { slug: "wire-brushes", name: "Wire Brushes" },
      { slug: "power-buffers", name: "Power Buffers" },
    ],
  },
  {
    slug: "power-tools",
    name: "Power Tools",
    children: [
      { slug: "impact-wrenches", name: "Impact Wrenches" },
      { slug: "angle-grinders", name: "Angle Grinders" },
      { slug: "portable-drills", name: "Portable Drills" },
      { slug: "air-tools", name: "Air Tools" },
      { slug: "battery-chargers", name: "Chargers & Batteries" },
    ],
  },
  {
    slug: "garage-equipment",
    name: "Garage & Lifting Equipment",
    children: [
      { slug: "trolley-jacks", name: "Trolley Jacks" },
      { slug: "bottle-jacks", name: "Bottle Jacks" },
      { slug: "axle-stands", name: "Axle Stands" },
      { slug: "creepers", name: "Creepers" },
      { slug: "work-benches", name: "Work Benches" },
      { slug: "wheel-chocks", name: "Wheel Chocks" },
    ],
  },
  {
    slug: "tire-care-chemicals",
    name: "Tyre Care & Chemicals",
    children: [
      { slug: "tyre-dressing", name: "Tyre Dressing" },
      { slug: "tyre-shine", name: "Tyre Shine" },
      { slug: "bead-lubricant", name: "Bead Lubricant / Mounting Paste" },
      { slug: "degreasers", name: "Degreasers & Cleaners" },
      { slug: "leak-detector", name: "Puncture / Leak Detection Spray" },
    ],
  },
  {
    slug: "safety-ppe",
    name: "Safety & PPE",
    children: [
      { slug: "safety-gloves", name: "Safety Gloves" },
      { slug: "safety-glasses", name: "Safety Glasses" },
      { slug: "ear-protection", name: "Ear Protection" },
      { slug: "aprons", name: "Aprons & Coveralls" },
      { slug: "first-aid", name: "First-Aid Supplies" },
    ],
  },
];

/** Flat walk for seeding: depth 0 roots then depth 1 children. */
export function walkVulcanizerCategories(): Array<{
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
  VULCANIZER_CATEGORY_TREE.forEach((root, i) => {
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