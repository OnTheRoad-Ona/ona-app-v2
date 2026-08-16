/**
 * Repair Pro / artisan trade catalog for Ona.
 * Motorist filter uses `service`; specialty is artisan self-description.
 */

import type { ProService } from "@/lib/types";

export type ArtisanTradeDef = {
  service: ProService;
  label: string;
  homeLabel: string;
  description: string;
  /** Sub-categories — required on signup / onboarding */
  specialties: string[];
};

export const ARTISAN_TRADE_CATALOG: ArtisanTradeDef[] = [
  {
    service: "mechanic",
    label: "Mechanic",
    homeLabel: "Mechanic",
    description: "Engine, brakes and general auto repair",
    specialties: [
      "General Mechanic",
      "Engine Specialist",
      "Brakes & Suspension",
      "Roadside Mechanic",
      "Workshop Mechanic",
    ],
  },
  {
    service: "vulcanizer",
    label: "Vulcanizer",
    homeLabel: "Vulcanizer",
    description: "Tyres, tubes and balancing",
    specialties: [
      "Roadside Vulcanizing",
      "Workshop Vulcanizing",
      "Fleet / Commercial Tyres",
    ],
  },
  {
    service: "towing",
    label: "Tow",
    homeLabel: "Tow",
    description: "Tow and recovery",
    specialties: [
      "Light Tow",
      "Heavy Recovery",
      "Accident Recovery",
      "Highway Assist",
    ],
  },
  {
    service: "battery",
    label: "Battery",
    homeLabel: "Battery",
    description: "Jump start, change battery, charge",
    specialties: [
      "Jump Start",
      "Battery Replacement",
      "Charging System",
      "Home / Inverter Batteries",
    ],
  },
  {
    service: "ac",
    label: "A/C",
    homeLabel: "A/C",
    description: "Vehicle, home, commercial and industrial cooling",
    specialties: [
      "Vehicle",
      "Residential (Homes)",
      "Commercial",
      "Industrial",
    ],
  },
  {
    service: "body",
    label: "Body",
    homeLabel: "Body",
    description: "Dent, panel beat and paint",
    specialties: [
      "Panel Beating",
      "Spray Painting",
      "Dent Repair",
      "Full Body Shop",
    ],
  },
  {
    service: "electrical",
    label: "Electric",
    homeLabel: "Electric",
    description: "Vehicle, home, commercial, industrial and electronics",
    specialties: [
      "Vehicle",
      "Residential (Homes)",
      "Commercial",
      "Industrial",
      "Electronics",
      "Mobile",
    ],
  },
  {
    service: "diagnostics",
    label: "Scan",
    homeLabel: "Scan",
    description: "Digital health check for vehicles",
    specialties: [
      "OBD Scan",
      "Full Vehicle Health Check",
      "Coding & Programming",
    ],
  },
  {
    service: "fashion",
    label: "Fashion",
    homeLabel: "Fashion",
    description: "Fashion design and tailoring",
    specialties: [
      "Bespoke Tailoring",
      "Bridal & Event Wear",
      "Native / Traditional Wear",
      "Corporate & Uniforms",
      "Alterations",
    ],
  },
  {
    service: "plumber",
    label: "Plumber",
    homeLabel: "Plumber",
    description: "Homes, offices, commercial and industrial",
    specialties: [
      "Residential (Homes)",
      "Offices",
      "Commercial Plumbing",
      "Industrial Plumbing",
    ],
  },
  {
    service: "carpenter",
    label: "Carpenter",
    homeLabel: "Carpenter",
    description: "Homes, offices, industrial and commercial",
    specialties: [
      "Residential (Homes)",
      "Offices",
      "Commercial Carpentry",
      "Industrial Carpentry",
      "Furniture & Fit-out",
    ],
  },
  {
    service: "painter",
    label: "Painter",
    homeLabel: "Painter",
    description: "Homes, offices, industrial and commercial",
    specialties: [
      "Residential (Homes)",
      "Offices",
      "Commercial Painting",
      "Industrial Painting",
      "Exterior / Facade",
    ],
  },
  {
    service: "solar",
    label: "Solar",
    homeLabel: "Solar",
    description: "Homes, offices, industrial and commercial",
    specialties: [
      "Residential (Homes)",
      "Offices",
      "Commercial Solar",
      "Industrial Solar",
    ],
  },
  {
    service: "generator",
    label: "Generator",
    homeLabel: "Generator",
    description: "Homes, offices, commercial and industrial",
    specialties: [
      "Residential (Homes)",
      "Offices",
      "Commercial Generators",
      "Industrial Generators",
    ],
  },
];

/**
 * Trades that prompt motorists for Home / Office / Industrial (etc.) specialty
 * in place of the radius slider until one option is picked.
 */
export const SPECIALTY_PICKER_TRADES: ProService[] = [
  "plumber",
  "carpenter",
  "painter",
  "solar",
  "generator",
  "ac",
  "electrical",
];

export function isSpecialtyPickerTrade(
  service: string | null | undefined
): boolean {
  return SPECIALTY_PICKER_TRADES.includes(service as ProService);
}

/** Compact labels for home specialty strip */
export function specialtyChipLabel(specialty: string): string {
  const s = specialty.toLowerCase();
  if (s.includes("residential") || s.includes("home")) return "Home";
  if (s.includes("office")) return "Office";
  if (s.includes("commercial")) return "Commercial";
  if (s.includes("industrial")) return "Industrial";
  if (s.includes("furniture") || s.includes("fit-out")) return "Furniture";
  if (s.includes("exterior") || s.includes("facade")) return "Exterior";
  if (s.includes("vehicle") || s === "auto" || s.includes("auto "))
    return "Vehicle";
  if (s.includes("electronics")) return "Electronics";
  if (s.includes("mobile")) return "Mobile";
  // Short catalog labels (Vehicle / Commercial / …) show as-is
  if (specialty.length <= 14) return specialty;
  return `${specialty.slice(0, 12)}…`;
}

/**
 * Pure vehicle / auto trades — always use vehicle focus (type/brand/model)
 * and show vehicle fields on customer request.
 * Single source of truth for signup, admin, request UI, jobs.
 * (Never include non-services like "panel".)
 */
export const AUTOMOTIVE_TRADES: readonly ProService[] = [
  "mechanic",
  "vulcanizer",
  "towing",
  "battery",
  "body",
  "diagnostics",
] as const;

export function isAutomotiveTrade(
  service: ProService | string | null | undefined
): boolean {
  return AUTOMOTIVE_TRADES.includes(service as ProService);
}

/**
 * Whether this pro/request should collect vehicle details.
 * AC / Electric only when the pro’s specialties include vehicle/auto work
 * (home / industrial / commercial specialty variants do not).
 */
export function showsVehicleOnRequest(
  service: ProService | string | null | undefined,
  specialties?: string[] | null
): boolean {
  const s = (service || "") as ProService;
  if (isAutomotiveTrade(s)) return true;
  if (s !== "ac" && s !== "electrical") return false;
  const list = (specialties || []).map((x) => String(x).toLowerCase());
  if (!list.length) {
    // Legacy pros without specialty chips — allow vehicle when trade can be auto
    return true;
  }
  // Any vehicle-focused specialty → show vehicle picker
  if (list.some((x) => x.includes("vehicle") || x.includes("auto"))) {
    return true;
  }
  // Only home / commercial / industrial / electronics → no vehicle fields
  return false;
}

/**
 * Signup “Vehicles you fix” step + vehicle_focus brand storage.
 * Home trades (solar, generator, plumber, …) never.
 * AC / Electric only when focus is Vehicle.
 */
export function needsVehiclesSignupStep(
  service: ProService | string | null | undefined,
  specialty?: string | null,
  specialties?: string[] | null
): boolean {
  const s = (service || "") as ProService;
  if (!s) return false;
  if (isAutomotiveTrade(s)) return true;
  if (s === "ac" || s === "electrical") {
    const list = [
      specialty,
      ...((specialties || []) as string[]),
    ]
      .filter(Boolean)
      .map((x) => String(x).toLowerCase());
    if (!list.length) return false;
    return list.some((x) => x.includes("vehicle") || x.includes("auto"));
  }
  return false;
}

/** Persist vehicle brands/models in vehicle_focus (vs home specialty blob). */
export function storesVehicleBrandFocus(
  service: ProService | string | null | undefined,
  specialty?: string | null,
  specialties?: string[] | null
): boolean {
  return needsVehiclesSignupStep(service, specialty, specialties);
}

export function tradeDef(service: ProService): ArtisanTradeDef | undefined {
  return ARTISAN_TRADE_CATALOG.find((t) => t.service === service);
}

/** Nigerian states (subset for v1 picker; extend as needed) */
export const NG_STATES = [
  "Lagos",
  "Abuja (FCT)",
  "Ogun",
  "Oyo",
  "Rivers",
  "Kano",
  "Kaduna",
  "Enugu",
  "Anambra",
  "Delta",
  "Edo",
  "Kwara",
  "Ondo",
  "Osun",
  "Imo",
] as const;

export const LAGOS_CITIES = [
  "Ikeja",
  "Lekki",
  "Victoria Island",
  "Ikoyi",
  "Yaba",
  "Surulere",
  "Ajah",
  "Ikorodu",
  "Agege",
  "Festac",
  "Maryland",
  "Gbagada",
  "Magodo",
  "Ojodu",
] as const;

export const COMMON_TOOLS_SUGGESTIONS = [
  "Toolbox / hand tools",
  "Jack & stands",
  "Multimeter",
  "OBD scanner",
  "Compressor",
  "Welding machine",
  "Ladder",
  "Generator (own)",
  "Pipe wrench set",
  "Paint spray gun",
  "Inverter tools",
];
