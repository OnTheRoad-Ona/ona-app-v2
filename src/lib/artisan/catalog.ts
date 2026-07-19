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
    description: "Vehicle, residential and commercial cooling",
    specialties: [
      "Vehicle AC",
      "Residential AC (Homes)",
      "Commercial AC (Offices)",
      "Industrial HVAC",
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
    description: "House, auto, and mobile/electronics",
    specialties: [
      "House Electrician",
      "Office / Building Wiring",
      "Auto Electrician",
      "Mobile & Electronics Technician",
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
    service: "wash",
    label: "Wash",
    homeLabel: "Wash",
    description: "Vehicle wash and detailing",
    specialties: [
      "Vehicle Wash",
      "Full Detail",
      "Mobile Wash",
      "Fleet Wash",
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

/** True for trades where vehicle brand/model focus still makes sense */
export function isAutomotiveTrade(service: ProService): boolean {
  return (
    service === "mechanic" ||
    service === "vulcanizer" ||
    service === "towing" ||
    service === "battery" ||
    service === "body" ||
    service === "diagnostics" ||
    service === "wash" ||
    service === "ac" || // may still pick Vehicle AC specialty
    service === "electrical" // may be Auto Electrician
  );
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
