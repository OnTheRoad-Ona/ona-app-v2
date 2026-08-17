import type { ProService } from "@/lib/types";

/** Trade ids only — no icons. Safe for the first client paint. */
export const ALL_PRO_SERVICES: ProService[] = [
  "mechanic",
  "vulcanizer",
  "towing",
  "battery",
  "ac",
  "body",
  "electrical",
  "diagnostics",
  "fashion",
  "plumber",
  "carpenter",
  "painter",
  "solar",
  "generator",
];

export const PRO_SERVICE_LABELS: Record<ProService, string> = {
  mechanic: "Mechanic",
  vulcanizer: "Vulcanizer",
  towing: "Tow",
  battery: "Battery",
  ac: "A/C",
  body: "Body",
  electrical: "Electrical",
  diagnostics: "Diagnostics",
  fashion: "Fashion Designer",
  plumber: "Plumber",
  carpenter: "Carpenter",
  painter: "Painter",
  solar: "Solar",
  generator: "Generator",
};

export function isProService(v: string): v is ProService {
  return (ALL_PRO_SERVICES as readonly string[]).includes(v);
}
