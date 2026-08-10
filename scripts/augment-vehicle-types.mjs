/**
 * Augment the offline vehicle catalog with a vehicle TYPE dimension.
 *
 * - For every make already in the JSON: ask NHTSA GetVehicleTypesForMake and map
 *   NHTSA vehicle types → Ona 10-type taxonomy.
 * - Add curated non-NHTSA brands for types NHTSA covers poorly or not at all:
 *   Trailer, Motorhome/RV, ATV/UTV, Construction & Ag, Bus, and extra vans.
 *
 * Output: src/lib/data/vehicles-catalog.json (adds `typesByMake` + `types`).
 *
 * Usage: node scripts/augment-vehicle-types.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CATALOG_PATH = path.join(
  __dirname,
  "../src/lib/data/vehicles-catalog.json"
);
const BASE = "https://vpic.nhtsa.dot.gov/api/vehicles";

const ONT_TYPES = [
  "automobile",
  "motorcycle",
  "truck",
  "van",
  "bus",
  "trailer",
  "motorhome",
  "atv_utv",
  "construction_ag",
  "other",
];

/** NHTSA VehicleTypeName → Ona slugs (MPVs are cars/vans/SUVs → car + van). */
const NHTSA_MAP = {
  "Passenger Car": ["automobile"],
  "Multipurpose Passenger Vehicle (MPV)": ["automobile", "van"],
  Truck: ["truck"],
  Bus: ["bus"],
  Motorcycle: ["motorcycle"],
  Trailer: ["trailer"],
  Motorhome: ["motorhome"],
  "Off Road Vehicle": ["atv_utv"],
  "Low Speed Vehicle (LSV)": ["other"],
  "Incomplete Vehicle": ["other"],
};

/** Overrides for NHTSA noise where classification is obviously wrong. */
const OVERRIDE_TYPES = {
  DAF: ["truck"],
  Peterbilt: ["truck"],
  Kenworth: ["truck"],
  Mack: ["truck"],
  Freightliner: ["truck"],
  Scania: ["truck", "bus"],
  MAN: ["truck", "bus"],
  Iveco: ["truck", "van"],
  Hino: ["truck"],
  Fuso: ["truck"],
  "Mitsubishi Fuso": ["truck"],
  "UD Trucks": ["truck"],
  "Volvo Trucks": ["truck"],
  Howo: ["truck"],
  Sinotruk: ["truck"],
  Foton: ["truck"],
  Isuzu: ["automobile", "truck"],
  "Ashok Leyland": ["truck", "bus"],
  Tata: ["automobile", "truck", "bus"],
  Yutong: ["bus"],
  "King Long": ["bus"],
  Higer: ["bus"],
  Volvo: ["automobile", "bus"],
  BMW: ["automobile", "motorcycle"],
  "Can-am": ["atv_utv", "motorcycle"],
  Cfmoto: ["atv_utv", "motorcycle"],
  Polaris: ["atv_utv"],
  KTM: ["motorcycle", "atv_utv"],
  Kawasaki: ["motorcycle", "atv_utv"],
  Suzuki: ["automobile", "motorcycle"],
  Yamaha: ["motorcycle", "atv_utv"],
  Honda: ["automobile", "motorcycle", "atv_utv"],
  "Honda Moto": ["motorcycle", "atv_utv"],
  Hyundai: ["automobile", "truck"],
  "John Deere": ["construction_ag"],
  Caterpillar: ["construction_ag", "truck"],
  JCB: ["construction_ag"],
  Komatsu: ["construction_ag"],
  Kubota: ["construction_ag"],
  Case: ["construction_ag"],
};

/** Curated make→types for brands NHTSA can't classify (non-NHTSA + gaps). */
const CURATED_MAKE_TYPES = {
  // Trailers (NHTSA trailer list is noisy; curated real brands)
  "Big Tex": ["trailer"],
  "PJ Trailers": ["trailer"],
  "Carry-On Trailer": ["trailer"],
  "Wells Cargo": ["trailer"],
  "Diamond C": ["trailer"],
  "Karavan": ["trailer"],
  "Featherlite": ["trailer"],
  "Aluma": ["trailer"],
  "Haulmark": ["trailer"],
  "Load Trail": ["trailer"],
  "Hillsboro": ["trailer"],
  "Legacy Trailers": ["trailer"],
  "McClain": ["trailer"],
  "Kaufman": ["trailer"],
  "Bigfoot": ["trailer", "motorhome"],
  "Airstream": ["trailer", "motorhome"],
  // Motorhomes / RVs
  "Winnebago": ["motorhome"],
  "Thor Motor Coach": ["motorhome"],
  "Coachmen": ["motorhome"],
  "Jayco": ["motorhome", "trailer"],
  "Newmar": ["motorhome"],
  "Entegra": ["motorhome"],
  "Fleetwood": ["motorhome"],
  "Monaco": ["motorhome"],
  "Itasca": ["motorhome"],
  "Tiffin": ["motorhome"],
  "Roadtrek": ["motorhome"],
  "Forest River": ["motorhome", "trailer"],
  "Keystone RV": ["trailer", "motorhome"],
  // ATV / UTV
  "Arctic Cat": ["atv_utv"],
  "Hisun": ["atv_utv"],
  "Bennche": ["atv_utv"],
  "Trail Master": ["atv_utv"],
  "Segway": ["atv_utv", "motorcycle"],
  "Sur Ron": ["atv_utv", "motorcycle"],
  // Construction & Ag
  "Case": ["construction_ag"],
  "New Holland": ["construction_ag"],
  "Massey Ferguson": ["construction_ag"],
  "Liebherr": ["construction_ag"],
  "Hitachi": ["construction_ag"],
  "Terex": ["construction_ag"],
  "Bobcat": ["construction_ag"],
  "Doosan": ["construction_ag"],
  "Yanmar": ["construction_ag", "automobile"],
  "Kioti": ["construction_ag"],
  "Branson": ["construction_ag"],
  "Sany": ["construction_ag", "truck"],
  "XCMG": ["construction_ag", "truck"],
  "Hyster": ["construction_ag"],
  "Clark": ["construction_ag"],
  // Buses (curated body builders not in NHTSA)
  "Blue Bird": ["bus"],
  "Thomas Built Buses": ["bus"],
  "Gillig": ["bus"],
  "New Flyer": ["bus"],
  "IC Bus": ["bus"],
  "Prevost": ["bus", "motorhome"],
  "Van Hool": ["bus"],
  "Marcopolo": ["bus"],
  "Ankai": ["bus"],
  "Zhongtong": ["bus"],
  // Vans / MPVs already covered via NHTSA MPV mapping; add gap vans
  "Maxus": ["van", "automobile", "truck"],
  "LDV": ["van", "automobile"],
  "Oshan": ["van", "automobile"],
  "JAC Motors": ["van", "automobile", "truck"],
};

/** Curated models per curated brand (brands with no NHTSA rows). */
const CURATED_MODELS = {
  "Big Tex": ["Utility Trailer", "Equipment Trailer", "Car Hauler", "Dump Trailer", "Tilt Deck"],
  "PJ Trailers": ["Utility", "Dump", "Equipment", "Car Hauler", "Flatbed"],
  "Carry-On Trailer": ["Utility", "Dump", "Equipment", "Cargo", "Landscape"],
  "Wells Cargo": ["Cargo", "Car Hauler", "Race Car", "Contractor"],
  "Diamond C": ["Utility", "Dump", "Equipment", "Flatbed"],
  "Karavan": ["Utility", "Snowmobile", "ATV", "Boat", "Car"],
  "Featherlite": ["Cargo", "Enclosed", "Car Hauler", "Trailer", "ATV"],
  "Aluma": ["Utility", "Cargo", "Boat", "ATV"],
  "Haulmark": ["Enclosed", "Cargo", "Race", "Sport Utility"],
  "Load Trail": ["Utility", "Dump", "Equipment", "Gooseneck"],
  "Hillsboro": ["Enclosed", "Cargo", "Car Hauler", "Trailer"],
  "Legacy Trailers": ["Utility", "Dump", "Car Hauler"],
  "McClain": ["Utility", "Dump", "Equipment", "Flatbed"],
  "Kaufman": ["Utility", "Dump", "Equipment", "Flatbed"],
  "Bigfoot": ["Travel Trailer", "Fifth Wheel", "Truck Camper"],
  "Airstream": ["Travel Trailer", "Basecamp", "Classic", "International", "Caravel"],
  "Winnebago": ["Solis", "View", "Navion", "Travato", "Ekko", "Vita", "Bold"],
  "Thor Motor Coach": ["Class A", "Class B", "Class C", "Tuscany", "Axis", "Vegas"],
  "Coachmen": ["Class A", "Class C", "Travel Trailer", "Fifth Wheel"],
  "Jayco": ["Travel Trailer", "Fifth Wheel", "Class C", "Class A", "Toy Hauler"],
  "Newmar": ["Class A", "Super C", "Class C"],
  "Entegra": ["Class A", "Class C", "Coach"],
  "Fleetwood": ["Class A", "Class C", "Travel Trailer"],
  "Monaco": ["Class A", "Class B", "Diesel Coach"],
  "Itasca": ["Class A", "Class B", "Class C"],
  "Tiffin": ["Class A", "Class C", "Allegro"],
  "Roadtrek": ["Class B", "Camper Van", "E-Trek"],
  "Forest River": ["Travel Trailer", "Fifth Wheel", "Class C", "Toy Hauler"],
  "Keystone RV": ["Travel Trailer", "Fifth Wheel", "Toy Hauler"],
  "Arctic Cat": ["Wildcat", "Riot", "Alterra", "Thundercat"],
  "Hisun": ["Ace", "Tactic", "Strike", "Vector", "Streak"],
  "Bennche": ["Maverick", "Bighorn", "Tomahawk"],
  "Trail Master": ["UTV", "ATV"],
  "Segway": ["UT10", "Snarler", "Villain", "Fugleman"],
  "Sur Ron": ["Light Bee", "Storm Bee", "Ultra Bee"],
  "Case": ["Tractor", "Loader", "Backhoe", "Excavator", "Skid Steer"],
  "New Holland": ["Tractor", "Loader", "Harvester", "Skid Steer"],
  "Massey Ferguson": ["Tractor", "Grain Harvester"],
  "Liebherr": ["Excavator", "Crane", "Loader", "Dozer"],
  "Hitachi": ["Excavator", "Loader", "Skid Steer", "Dump Truck"],
  "Terex": ["Dump Truck", "Excavator", "Crane"],
  "Bobcat": ["Skid Steer", "Compact Excavator", "Loader", "Utility"],
  "Doosan": ["Excavator", "Loader", "Skid Steer"],
  "Yanmar": ["Tractor", "Excavator", "Compact"],
  "Kioti": ["Tractor", "Excavator", "Utility"],
  "Branson": ["Tractor", "Utility"],
  "Sany": ["Excavator", "Crane", "Concrete Pump", "Loader"],
  "XCMG": ["Excavator", "Crane", "Loader", "Dump Truck"],
  "Hyster": ["Forklift", "Reach Stacker"],
  "Clark": ["Forklift", "Utility"],
  "Blue Bird": ["Vision", "All American", "Micro Bird", "Transit"],
  "Thomas Built Buses": ["Saf-T-Liner", "Minotour", "EFX", "Transit"],
  "Gillig": ["Low Floor", "Advantage", "Transit"],
  "New Flyer": ["Xcelsior", "Low Floor", "Transit"],
  "IC Bus": ["CE Series", "BE Series", "RE Series"],
  "Prevost": ["H3-45", "X3-45", "H3-41"],
  "Van Hool": ["CX45", "TDX25", "Coach"],
  "Marcopolo": ["Paradiso", "Audace", "Viaggio"],
  "Ankai": ["City Bus", "Coach", "Electric Bus"],
  "Zhongtong": ["City Bus", "Coach", "Electric Bus"],
  "Maxus": ["Deliver 9", "G10", "V80", "T90", "V90"],
  "LDV": ["D60", "T60", "Deliver 9", "V80"],
  "Oshan": ["X70", "X7", "CM8", "Rui"]
};

function norm(s) {
  return String(s).trim().toLowerCase();
}

async function fetchJson(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${res.status} ${url}`);
      return await res.json();
    } catch (e) {
      if (i === retries - 1) throw e;
      await new Promise((r) => setTimeout(r, 300 * (i + 1)));
    }
  }
}

async function mapPool(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

async function nhtsaTypesForMake(make) {
  try {
    const json = await fetchJson(
      `${BASE}/GetVehicleTypesForMake/${encodeURIComponent(make)}?format=json`
    );
    const slugs = new Set();
    for (const r of json.Results || []) {
      const mapped = NHTSA_MAP[String(r.VehicleTypeName || "")];
      if (mapped) mapped.forEach((s) => slugs.add(s));
    }
    return [...slugs];
  } catch {
    return [];
  }
}

function guessTypeFromName(make) {
  const n = norm(make);
  if (/\b(moto|motorcycle|scooter|bike)\b/.test(n)) return ["motorcycle"];
  if (/\b(trailer|haul|caravan)\b/.test(n)) return ["trailer"];
  if (/\b(bus|coach)\b/.test(n)) return ["bus"];
  if (/\b(truck|freight|tractor-trailer|heavy)\b/.test(n)) return ["truck"];
  if (/\b(boat|marine|pwc|jet-ski)\b/.test(n)) return ["other"];
  if (/\b(skid steer|tractor|excavator|loader|agric|construction|forklift)\b/.test(n))
    return ["construction_ag"];
  return ["automobile"];
}

async function main() {
  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8"));
  const makes = catalog.makes || [];
  console.log(`Classifying ${makes.length} existing makes via NHTSA…`);

  const typesByMake = {};
  await mapPool(makes, 8, async (make, idx) => {
    let types = await nhtsaTypesForMake(make);
    if (!types.length) types = guessTypeFromName(make);
    const curated = CURATED_MAKE_TYPES[make] || CURATED_MAKE_TYPES[titleCaseName(make)];
    const override = OVERRIDE_TYPES[make] || OVERRIDE_TYPES[titleCaseName(make)];
    if (curated) types = [...new Set([...types, ...curated])];
    if (override) types = [...new Set(override)];
    if (!types.length) types = ["automobile"];
    typesByMake[make] = types;
    if (idx % 25 === 0) console.log(`  ${idx}/${makes.length} ${make} → ${types.join(",")}`);
  });

  // Curated brands not already in catalog: add with models.
  for (const [brand, models] of Object.entries(CURATED_MODELS)) {
    if (catalog.makes.includes(brand)) continue;
    catalog.makes.push(brand);
    catalog.modelsByMake[brand] = models;
    for (const model of models) {
      const key = `${brand}|${model}`;
      if (!catalog.yearsByMakeModel[key]) {
        catalog.yearsByMakeModel[key] = catalog.defaultYears || [];
      }
    }
    typesByMake[brand] = CURATED_MAKE_TYPES[brand] || guessTypeFromName(brand);
  }

  catalog.makes.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  catalog.types = ONT_TYPES;
  catalog.typesByMake = typesByMake;
  catalog.version = 2;

  fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog));
  const mb = (fs.statSync(CATALOG_PATH).size / (1024 * 1024)).toFixed(2);
  console.log(
    `Wrote ${CATALOG_PATH} (${mb} MB) · ${catalog.makes.length} makes · ` +
      `types ${Object.keys(typesByMake).length}`
  );
}

function titleCaseName(s) {
  return String(s || "")
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
