import type { ProService } from "@/lib/types";
import type { LucideIcon } from "lucide-react";
import {
  Battery,
  Car,
  CircleDot,
  Cpu,
  Droplets,
  Fan,
  Paintbrush,
  Plug,
  Wrench,
} from "lucide-react";

/** Soft tile fills (reference-style service chips) */
export type TradeTileTone = { bg: string; fg: string };

/** 9 real trades — same as home service cards (excludes "All") */
export const PRO_TRADE_OPTIONS: {
  id: ProService;
  label: string;
  homeLabel: string;
  hint: string;
  icon: LucideIcon;
  tile: TradeTileTone;
}[] = [
  {
    id: "mechanic",
    label: "Mechanic",
    homeLabel: "Mechanic",
    hint: "Engine, brakes and general repair",
    icon: Wrench,
    tile: { bg: "#C8E6C9", fg: "#1B5E20" },
  },
  {
    id: "vulcanizer",
    label: "Vulcanizer",
    homeLabel: "Vulcanizer",
    hint: "Tyres, tubes and balancing",
    icon: CircleDot,
    tile: { bg: "#FFE082", fg: "#E65100" },
  },
  {
    id: "towing",
    label: "Tow",
    homeLabel: "Tow",
    hint: "Tow and recovery",
    icon: Car,
    tile: { bg: "#BBDEFB", fg: "#0D47A1" },
  },
  {
    id: "battery",
    label: "Battery",
    homeLabel: "Battery",
    hint: "Jump start, change battery, charge",
    icon: Battery,
    tile: { bg: "#FFCCBC", fg: "#BF360C" },
  },
  {
    id: "ac",
    label: "A/C",
    homeLabel: "A/C",
    hint: "AC gas and cooling",
    icon: Fan,
    tile: { bg: "#B2EBF2", fg: "#006064" },
  },
  {
    id: "body",
    label: "Body",
    homeLabel: "Body",
    hint: "Dent, panel beat and paint",
    icon: Paintbrush,
    tile: { bg: "#E1BEE7", fg: "#4A148C" },
  },
  {
    id: "electrical",
    label: "Electrical",
    homeLabel: "Electric",
    hint: "Wiring, alternator and sensors",
    icon: Plug,
    tile: { bg: "#FFF9C4", fg: "#F57F17" },
  },
  {
    id: "diagnostics",
    label: "Diagnostics",
    homeLabel: "Scan",
    hint: "Computer scan and fault codes",
    icon: Cpu,
    tile: { bg: "#C5CAE9", fg: "#1A237E" },
  },
  {
    id: "wash",
    label: "Car Wash",
    homeLabel: "Wash",
    hint: "Wash, clean and polish",
    icon: Droplets,
    tile: { bg: "#B2DFDB", fg: "#004D40" },
  },
];

export const ALL_PRO_SERVICES: ProService[] = PRO_TRADE_OPTIONS.map((t) => t.id);

export const PRO_SERVICE_LABELS: Record<ProService, string> = Object.fromEntries(
  PRO_TRADE_OPTIONS.map((t) => [t.id, t.label])
) as Record<ProService, string>;

/** Repair Pros pick exactly one skill at signup */
export const MAX_PRO_SERVICES_ON_SIGNUP = 1;

export function isProService(v: string): v is ProService {
  return ALL_PRO_SERVICES.includes(v as ProService);
}
