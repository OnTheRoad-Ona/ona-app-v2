/**
 * Service-focus options for Repair Pro signup.
 * Vehicle type → Brand → Model are synchronized.
 * Country → State / Region (all world countries; Nigeria first).
 */

import { Country, State } from "country-state-city";

export type PrefKey =
  | "vehicleType"
  | "brand"
  | "model"
  | "country"
  | "location";

export const VEHICLE_TYPES = [
  "Any",
  "Agricultural Tractor",
  "Agriculture & Farm Equipment",
  "Ambulance",
  "Amphibious Vehicle",
  "ATV / Four-Wheeler",
  "Autocycle",
  "Automobile / Passenger Car",
  "Bicycle",
  "Boat / Watercraft",
  "Box Truck",
  "Bus (Charter)",
  "Bus (City / Transit)",
  "Bus (School)",
  "Camper (Slide-in / Truck)",
  "Cargo Trailer",
  "Cement Mixer",
  "Classic / Antique Vehicle",
  "Commercial Truck",
  "Construction Equipment",
  "Convertible",
  "Coupe",
  "Crane Truck",
  "Crossover (CUV)",
  "Delivery Van",
  "Dirt Bike",
  "Dump Truck",
  "Dune Buggy",
  "E-bike / Electric Bicycle",
  "Electric Vehicle (EV)",
  "Farm Truck",
  "Fifth-Wheel Trailer",
  "Fire Truck",
  "Flatbed Truck",
  "Fleet Vehicle",
  "Food Truck",
  "Forklift",
  "Generator / Mobile Power",
  "Golf Cart",
  "Hatchback",
  "Hearse",
  "Heavy Duty Truck",
  "Horse Trailer",
  "Hybrid Vehicle",
  "Industrial Equipment",
  "Inspection Vehicle",
  "Jet Ski / PWC",
  "Kei / Mini Truck",
  "Kit / Custom Built",
  "Light Duty Truck",
  "Limousine",
  "Low-Speed Vehicle (LSV)",
  "Medium Duty Truck",
  "Mini Bus / Shuttle",
  "Minivan",
  "Mobile Crane",
  "Mobile Home / Manufactured",
  "Moped",
  "Motorhome Class A",
  "Motorhome Class B",
  "Motorhome Class C",
  "Motorcycle",
  "Motorcycle (3-Wheel / Trike)",
  "Off-Highway Vehicle (OHV)",
  "Panel Van",
  "Pickup Truck",
  "Police / Emergency Vehicle",
  "Pop-up Camper",
  "Recreational Vehicle (RV)",
  "Refuse / Garbage Truck",
  "Road Tractor / Semi",
  "Scooter",
  "Sedan",
  "Side-by-Side (UTV / SxS)",
  "Snowmobile",
  "Sport Bike",
  "Station Wagon",
  "SUV",
  "Tanker Truck",
  "Taxi / Cab",
  "Tow Truck / Wrecker",
  "Toy Hauler",
  "Tractor (Semi)",
  "Trailer (Boat)",
  "Trailer (Cargo / Utility)",
  "Trailer (Travel)",
  "Tricycle / Motorized",
  "Truck Camper",
  "Utility Vehicle",
  "Van (Cargo)",
  "Van (Panel)",
  "Van (Passenger)",
  "Wagon",
  "Other",
] as const;

type VehicleBucket =
  | "passenger"
  | "truck"
  | "motorcycle"
  | "boat"
  | "equipment"
  | "bus"
  | "bicycle"
  | "generic";

function bucketForVehicleType(vehicleType: string): VehicleBucket {
  const t = vehicleType.toLowerCase();
  if (!vehicleType || vehicleType === "Any" || vehicleType === "Other") {
    return "generic";
  }
  if (t.includes("bicycle") || t.includes("e-bike")) return "bicycle";
  if (
    t.includes("motorcycle") ||
    t.includes("scooter") ||
    t.includes("moped") ||
    t.includes("dirt bike") ||
    t.includes("sport bike") ||
    t.includes("atv") ||
    t.includes("tricycle") ||
    t.includes("autocycle") ||
    t.includes("side-by-side") ||
    t.includes("snowmobile")
  ) {
    return "motorcycle";
  }
  if (
    t.includes("boat") ||
    t.includes("jet ski") ||
    t.includes("watercraft") ||
    t.includes("amphibious")
  ) {
    return "boat";
  }
  if (
    t.includes("construction") ||
    t.includes("industrial") ||
    t.includes("agriculture") ||
    t.includes("farm") ||
    t.includes("forklift") ||
    t.includes("crane") ||
    t.includes("generator") ||
    (t.includes("tractor") && !t.includes("semi"))
  ) {
    return "equipment";
  }
  if (t.includes("bus") || t.includes("shuttle")) return "bus";
  if (
    t.includes("truck") ||
    t.includes("trailer") ||
    t.includes("semi") ||
    t.includes("van") ||
    t.includes("pickup") ||
    t.includes("tanker") ||
    t.includes("tow") ||
    t.includes("flatbed") ||
    t.includes("dump") ||
    t.includes("box truck") ||
    t.includes("food truck") ||
    t.includes("refuse") ||
    t.includes("camper") ||
    t.includes("motorhome") ||
    t.includes("rv")
  ) {
    return "truck";
  }
  return "passenger";
}

/** Comprehensive brands by vehicle category */
const PASSENGER_BRANDS = [
  "Any",
  "Acura",
  "Alfa Romeo",
  "Aston Martin",
  "Audi",
  "Bentley",
  "BMW",
  "Buick",
  "BYD",
  "Cadillac",
  "Changan",
  "Chery",
  "Chevrolet",
  "Chrysler",
  "Citroën",
  "Dacia",
  "Daewoo",
  "Dodge",
  "Dongfeng",
  "Ferrari",
  "Fiat",
  "Ford",
  "GAC",
  "Geely",
  "Genesis",
  "GMC",
  "Great Wall",
  "Haval",
  "Honda",
  "Hongqi",
  "Hyundai",
  "Infiniti",
  "Innoson",
  "Jaguar",
  "Jeep",
  "Kia",
  "Lada",
  "Lamborghini",
  "Land Rover",
  "Lexus",
  "Lincoln",
  "Maserati",
  "Mazda",
  "McLaren",
  "Mercedes-Benz",
  "MG",
  "Mini",
  "Mitsubishi",
  "Nissan",
  "Opel",
  "Peugeot",
  "Polestar",
  "Porsche",
  "Proton",
  "Ram",
  "Renault",
  "Rolls-Royce",
  "SAIC",
  "Seat",
  "Škoda",
  "SsangYong",
  "Subaru",
  "Suzuki",
  "Tata",
  "Tesla",
  "Toyota",
  "Vauxhall",
  "Volkswagen",
  "Volvo",
  "Other",
];

const TRUCK_BRANDS = [
  "Any",
  "Ashok Leyland",
  "DAF",
  "Dongfeng",
  "Foton",
  "Ford",
  "Freightliner",
  "Hino",
  "Howo",
  "Isuzu",
  "Iveco",
  "JAC",
  "Kenworth",
  "Mack",
  "MAN",
  "Mercedes-Benz",
  "Mitsubishi Fuso",
  "Nissan",
  "Peterbilt",
  "Scania",
  "Sinotruk",
  "Tata",
  "Toyota",
  "UD Trucks",
  "Volvo",
  "Other",
];

const MOTORCYCLE_BRANDS = [
  "Any",
  "Aprilia",
  "Bajaj",
  "Benelli",
  "BMW Motorrad",
  "CFMoto",
  "Ducati",
  "Haojue",
  "Harley-Davidson",
  "Hero",
  "Honda",
  "Indian",
  "Kawasaki",
  "KTM",
  "Kymco",
  "Piaggio",
  "Royal Enfield",
  "Suzuki",
  "TVS",
  "Vespa",
  "Yamaha",
  "Zontes",
  "Other",
];

const BOAT_BRANDS = [
  "Any",
  "Bayliner",
  "Boston Whaler",
  "Honda Marine",
  "Mercury",
  "Sea-Doo",
  "Suzuki Marine",
  "Yamaha",
  "Other",
];

const EQUIPMENT_BRANDS = [
  "Any",
  "Case",
  "Caterpillar",
  "Doosan",
  "Hitachi",
  "JCB",
  "John Deere",
  "Komatsu",
  "Kubota",
  "Liebherr",
  "Massey Ferguson",
  "New Holland",
  "Sany",
  "Volvo CE",
  "XCMG",
  "Other",
];

const BUS_BRANDS = [
  "Any",
  "Ashok Leyland",
  "Golden Dragon",
  "Higer",
  "Iveco",
  "King Long",
  "MAN",
  "Mercedes-Benz",
  "Scania",
  "Tata",
  "Toyota",
  "Volvo",
  "Yutong",
  "Zhongtong",
  "Other",
];

const BICYCLE_BRANDS = [
  "Any",
  "Cannondale",
  "Giant",
  "Scott",
  "Specialized",
  "Trek",
  "Other",
];

/** Popular models by brand (shared across types when brand is valid) */
const MODELS_BY_BRAND: Record<string, string[]> = {
  Any: ["Any", "Other"],
  Other: ["Any", "Other"],
  Toyota: [
    "Any",
    "Corolla",
    "Camry",
    "Yaris",
    "Avalon",
    "RAV4",
    "Highlander",
    "Land Cruiser",
    "Prado",
    "4Runner",
    "Hilux",
    "Tacoma",
    "Tundra",
    "Hiace",
    "Sienna",
    "C-HR",
    "Venza",
    "Sequoia",
    "Coaster",
    "Other",
  ],
  Honda: [
    "Any",
    "Civic",
    "Accord",
    "City",
    "Fit",
    "CR-V",
    "HR-V",
    "Pilot",
    "Passport",
    "Odyssey",
    "Ridgeline",
    "CB500",
    "CBR",
    "PCX",
    "Activa",
    "Other",
  ],
  "Mercedes-Benz": [
    "Any",
    "A-Class",
    "C-Class",
    "E-Class",
    "S-Class",
    "GLA",
    "GLC",
    "GLE",
    "GLS",
    "Sprinter",
    "Vito",
    "Actros",
    "Atego",
    "Other",
  ],
  BMW: [
    "Any",
    "1 Series",
    "3 Series",
    "5 Series",
    "7 Series",
    "X1",
    "X3",
    "X5",
    "X7",
    "i4",
    "iX",
    "Other",
  ],
  Hyundai: [
    "Any",
    "Accent",
    "Elantra",
    "Sonata",
    "Tucson",
    "Santa Fe",
    "Palisade",
    "Creta",
    "Kona",
    "Ioniq",
    "Other",
  ],
  Kia: [
    "Any",
    "Rio",
    "Cerato",
    "Optima",
    "Sportage",
    "Sorento",
    "Telluride",
    "Seltos",
    "Carnival",
    "Other",
  ],
  Nissan: [
    "Any",
    "Almera",
    "Sentra",
    "Altima",
    "Maxima",
    "Kicks",
    "Qashqai",
    "X-Trail",
    "Pathfinder",
    "Patrol",
    "Navara",
    "Urvan",
    "Other",
  ],
  Ford: [
    "Any",
    "Focus",
    "Fusion",
    "Mustang",
    "Escape",
    "Explorer",
    "Edge",
    "Expedition",
    "Ranger",
    "F-150",
    "Transit",
    "Everest",
    "Other",
  ],
  Volkswagen: [
    "Any",
    "Polo",
    "Golf",
    "Jetta",
    "Passat",
    "Tiguan",
    "Touareg",
    "Transporter",
    "Caddy",
    "ID.4",
    "Other",
  ],
  Peugeot: [
    "Any",
    "208",
    "301",
    "308",
    "3008",
    "5008",
    "Partner",
    "Boxer",
    "Other",
  ],
  Lexus: ["Any", "ES", "IS", "RX", "NX", "GX", "LX", "UX", "Other"],
  Mazda: ["Any", "2", "3", "6", "CX-3", "CX-5", "CX-9", "BT-50", "Other"],
  Mitsubishi: [
    "Any",
    "Lancer",
    "Outlander",
    "Pajero",
    "ASX",
    "L200",
    "Canter",
    "Other",
  ],
  "Land Rover": [
    "Any",
    "Defender",
    "Discovery",
    "Discovery Sport",
    "Range Rover",
    "Range Rover Sport",
    "Evoque",
    "Other",
  ],
  Audi: ["Any", "A3", "A4", "A6", "A8", "Q3", "Q5", "Q7", "e-tron", "Other"],
  Chevrolet: [
    "Any",
    "Spark",
    "Malibu",
    "Impala",
    "Equinox",
    "Traverse",
    "Tahoe",
    "Suburban",
    "Silverado",
    "Other",
  ],
  Tesla: ["Any", "Model 3", "Model Y", "Model S", "Model X", "Cybertruck", "Other"],
  Suzuki: [
    "Any",
    "Swift",
    "Baleno",
    "Vitara",
    "Jimny",
    "Ertiga",
    "GSX-R",
    "Burgman",
    "Other",
  ],
  Renault: ["Any", "Clio", "Megane", "Duster", "Koleos", "Trafic", "Other"],
  Jeep: ["Any", "Wrangler", "Cherokee", "Grand Cherokee", "Compass", "Renegade", "Other"],
  Volvo: ["Any", "S60", "S90", "XC40", "XC60", "XC90", "FH", "FM", "Other"],
  Isuzu: ["Any", "D-Max", "MU-X", "NPR", "NQR", "FVR", "Other"],
  Hino: ["Any", "300 Series", "500 Series", "700 Series", "Other"],
  MAN: ["Any", "TGL", "TGM", "TGS", "TGX", "Other"],
  Scania: ["Any", "P-Series", "G-Series", "R-Series", "S-Series", "Other"],
  Iveco: ["Any", "Daily", "Eurocargo", "Stralis", "S-Way", "Other"],
  Bajaj: ["Any", "Boxer", "Pulsar", "CT100", "Discover", "Other"],
  TVS: ["Any", "Apache", "Jupiter", "Star", "Ntorq", "Other"],
  Yamaha: [
    "Any",
    "YZF-R3",
    "MT-07",
    "MT-09",
    "NMAX",
    "RayZR",
    "Outboard",
    "WaveRunner",
    "Other",
  ],
  Kawasaki: ["Any", "Ninja", "Z900", "Versys", "KLR", "Other"],
  "Royal Enfield": ["Any", "Classic 350", "Meteor", "Himalayan", "Hunter", "Other"],
  "BMW Motorrad": ["Any", "G 310", "F 750", "R 1250", "S 1000", "Other"],
  "Harley-Davidson": ["Any", "Sportster", "Street", "Softail", "Touring", "Other"],
  KTM: ["Any", "Duke 200", "Duke 390", "RC 390", "Adventure", "Other"],
  Caterpillar: ["Any", "Excavator", "Loader", "Bulldozer", "Grader", "Other"],
  "John Deere": ["Any", "Tractor", "Loader", "Harvester", "Other"],
  Komatsu: ["Any", "Excavator", "Dozer", "Wheel Loader", "Other"],
  JCB: ["Any", "Backhoe", "Telehandler", "Excavator", "Other"],
  "Volvo CE": ["Any", "Excavator", "Wheel Loader", "Dumper", "Other"],
  Yutong: ["Any", "City Bus", "Coach", "School Bus", "Other"],
  "Honda Marine": ["Any", "Outboard", "Other"],
  Mercury: ["Any", "Outboard", "Other"],
  Bayliner: ["Any", "Element", "VR Series", "Other"],
  "Sea-Doo": ["Any", "Spark", "GTX", "RXT", "Other"],
  Tata: ["Any", "Ace", "Xenon", "Safari", "Nexon", "Other"],
  Innoson: ["Any", "IVM", "Fox", "G5", "Other"],
  BYD: ["Any", "Atto 3", "Seal", "Dolphin", "Han", "Other"],
  Geely: ["Any", "Coolray", "Emgrand", "Monjaro", "Other"],
  Chery: ["Any", "Tiggo", "Arrizo", "Other"],
  Haval: ["Any", "H6", "Jolion", "Other"],
  MG: ["Any", "ZS", "HS", "MG5", "Other"],
  Porsche: ["Any", "911", "Cayenne", "Macan", "Panamera", "Taycan", "Other"],
  Subaru: ["Any", "Impreza", "Forester", "Outback", "XV", "Other"],
  Fiat: ["Any", "500", "Panda", "Tipo", "Ducato", "Other"],
  Citroën: ["Any", "C3", "C4", "C5 Aircross", "Berlingo", "Other"],
  Opel: ["Any", "Corsa", "Astra", "Mokka", "Other"],
  Skoda: ["Any", "Fabia", "Octavia", "Kodiaq", "Other"],
  Škoda: ["Any", "Fabia", "Octavia", "Kodiaq", "Other"],
  DAF: ["Any", "XF", "CF", "LF", "Other"],
  Foton: ["Any", "Aumark", "Tunland", "Other"],
  Sinotruk: ["Any", "Howo", "Other"],
  Howo: ["Any", "Dump", "Tractor", "Other"],
  Hero: ["Any", "Splendor", "Passion", "Xtreme", "Other"],
  Piaggio: ["Any", "Vespa", "Ape", "Other"],
  Vespa: ["Any", "Primavera", "GTS", "Other"],
};

function sortWithAnyOther(list: string[]): string[] {
  return [...list].sort((a, b) => {
    if (a === "Any") return -1;
    if (b === "Any") return 1;
    if (a === "Other") return 1;
    if (b === "Other") return -1;
    return a.localeCompare(b);
  });
}

export function getBrandsForVehicleType(vehicleType: string): string[] {
  switch (bucketForVehicleType(vehicleType)) {
    case "motorcycle":
      return sortWithAnyOther([...MOTORCYCLE_BRANDS]);
    case "boat":
      return sortWithAnyOther([...BOAT_BRANDS]);
    case "equipment":
      return sortWithAnyOther([...EQUIPMENT_BRANDS]);
    case "bus":
      return sortWithAnyOther([...BUS_BRANDS]);
    case "truck":
      return sortWithAnyOther([...TRUCK_BRANDS]);
    case "bicycle":
      return sortWithAnyOther([...BICYCLE_BRANDS]);
    case "passenger":
      return sortWithAnyOther([...PASSENGER_BRANDS]);
    default:
      return sortWithAnyOther([
        ...new Set([
          ...PASSENGER_BRANDS,
          ...TRUCK_BRANDS,
          ...MOTORCYCLE_BRANDS,
        ]),
      ]);
  }
}

/** @deprecated use getBrandsForVehicleType */
export const getMakesForVehicleType = getBrandsForVehicleType;

export function getModelsForBrand(
  brand: string,
  vehicleType?: string
): string[] {
  const base = MODELS_BY_BRAND[brand] ?? ["Any", "Other"];
  // Light filter by bucket when useful
  if (!vehicleType || vehicleType === "Any") return base;
  const bucket = bucketForVehicleType(vehicleType);
  if (bucket === "motorcycle" && brand === "Honda") {
    return [
      "Any",
      "CB500",
      "CBR",
      "PCX",
      "Activa",
      "Africa Twin",
      "Other",
    ];
  }
  if (bucket === "motorcycle" && brand === "Yamaha") {
    return ["Any", "YZF-R3", "MT-07", "MT-09", "NMAX", "RayZR", "Other"];
  }
  if (
    (bucket === "truck" || bucket === "bus") &&
    brand === "Toyota"
  ) {
    return ["Any", "Hilux", "Hiace", "Coaster", "Dyna", "Land Cruiser", "Other"];
  }
  return base;
}

/** @deprecated use getModelsForBrand */
export function getModelsForMake(make: string): string[] {
  return getModelsForBrand(make);
}

/** Cache all countries once (Nigeria first, then A–Z). */
let _countriesCache: string[] | null = null;
let _isoByName: Map<string, string> | null = null;

function ensureCountryIndex() {
  if (_countriesCache && _isoByName) return;
  const all = Country.getAllCountries();
  _isoByName = new Map(all.map((c) => [c.name, c.isoCode]));
  const nigeria = all.find((c) => c.isoCode === "NG");
  const rest = all
    .filter((c) => c.isoCode !== "NG")
    .map((c) => c.name)
    .sort((a, b) => a.localeCompare(b));
  _countriesCache = [
    "Any",
    ...(nigeria ? [nigeria.name] : ["Nigeria"]),
    ...rest,
    "Other",
  ];
}

/** All world countries — Nigeria first, then alphabetical, plus Any/Other. */
export function getAllCountries(): string[] {
  ensureCountryIndex();
  return _countriesCache!;
}

/** @deprecated use getAllCountries() */
export const COUNTRIES = typeof window === "undefined"
  ? (["Any", "Nigeria", "Other"] as string[])
  : getAllCountries();

/**
 * States / regions for a country (full list from ISO data).
 * Nigeria → 36 states + FCT, etc.
 */
export function getLocationsForCountry(country: string): string[] {
  if (!country || country === "Any") {
    // Nigeria states as default browse list when country not set
    ensureCountryIndex();
    const ngIso = _isoByName?.get("Nigeria") ?? "NG";
    const ngStates = State.getStatesOfCountry(ngIso)
      .map((s) => s.name)
      .sort((a, b) => a.localeCompare(b));
    return ["Any", ...ngStates, "Other"];
  }
  if (country === "Other") {
    return ["Any", "Other"];
  }
  ensureCountryIndex();
  const iso = _isoByName?.get(country);
  if (!iso) return ["Any", "Other"];
  const states = State.getStatesOfCountry(iso)
    .map((s) => s.name)
    .sort((a, b) => a.localeCompare(b));
  if (states.length === 0) {
    // Some territories have no states — offer Any/Other only
    return ["Any", "Other"];
  }
  return ["Any", ...states, "Other"];
}

export const PREF_ROWS: { key: PrefKey; label: string }[] = [
  { key: "vehicleType", label: "Vehicle Type" },
  { key: "brand", label: "Brand" },
  { key: "model", label: "Model" },
  { key: "country", label: "Country" },
  { key: "location", label: "State / Region" },
];

export function optionsForPref(
  key: PrefKey,
  vehicleType: string,
  brand: string,
  country: string
): string[] {
  switch (key) {
    case "vehicleType":
      return [...VEHICLE_TYPES];
    case "brand":
      return getBrandsForVehicleType(vehicleType);
    case "model":
      return getModelsForBrand(brand, vehicleType);
    case "country":
      return getAllCountries();
    case "location":
      return getLocationsForCountry(country);
  }
}

export function syncBrandForVehicleType(
  vehicleType: string,
  currentBrand: string
): string {
  const brands = getBrandsForVehicleType(vehicleType);
  if (brands.includes(currentBrand)) return currentBrand;
  return brands[0] ?? "Any";
}

/** @deprecated */
export const syncMakeForVehicleType = syncBrandForVehicleType;

export function syncModelForBrand(
  brand: string,
  currentModel: string,
  vehicleType?: string
): string {
  const models = getModelsForBrand(brand, vehicleType);
  if (models.includes(currentModel)) return currentModel;
  return models[0] ?? "Any";
}

/** @deprecated */
export function syncModelForMake(make: string, currentModel: string): string {
  return syncModelForBrand(make, currentModel);
}

export function syncLocationForCountry(
  country: string,
  currentLocation: string
): string {
  const locs = getLocationsForCountry(country);
  if (locs.includes(currentLocation)) return currentLocation;
  return locs[0] ?? "Any";
}
