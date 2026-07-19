import type { ProService } from "@/lib/types";
import type { LucideIcon } from "lucide-react";
import {
  Car,
  CircleDot,
  Cpu,
  Droplets,
  Fan,
  Hammer,
  Paintbrush,
  PaintRoller,
  Plug,
  ShowerHead,
  Sun,
  Wrench,
  Zap,
  createLucideIcon,
} from "lucide-react";

/**
 * Car battery (12V block with top posts) — not the Lucide phone/device battery.
 * Matches Lucide stroke style so it works anywhere PRO_TRADE_OPTIONS icons are used.
 */
export const CarBattery = createLucideIcon("CarBattery", [
  ["rect", { x: "3", y: "8", width: "18", height: "12", rx: "1.5", key: "body" }],
  [
    "path",
    {
      d: "M6 8V5.5A1.5 1.5 0 0 1 7.5 4h1A1.5 1.5 0 0 1 10 5.5V8",
      key: "pos",
    },
  ],
  [
    "path",
    {
      d: "M14 8V5.5A1.5 1.5 0 0 1 15.5 4h1A1.5 1.5 0 0 1 18 5.5V8",
      key: "neg",
    },
  ],
  ["path", { d: "M7 13h2.5", key: "plus-h" }],
  ["path", { d: "M8.25 11.75v2.5", key: "plus-v" }],
  ["path", { d: "M14.5 13h2.5", key: "minus" }],
]);

/** Soft tile fills (reference-style service chips) */
export type TradeTileTone = { bg: string; fg: string };

/** Real trades — same as home service cards (excludes "All") */
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
    icon: CarBattery,
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
  {
    id: "plumber",
    label: "Plumber",
    homeLabel: "Plumber",
    hint: "Pipes, leaks and water works",
    icon: ShowerHead,
    tile: { bg: "#B3E5FC", fg: "#01579B" },
  },
  {
    id: "carpenter",
    label: "Carpenter",
    homeLabel: "Carpenter",
    hint: "Woodwork, doors and fittings",
    icon: Hammer,
    tile: { bg: "#D7CCC8", fg: "#4E342E" },
  },
  {
    id: "painter",
    label: "Painter",
    homeLabel: "Painter",
    hint: "Interior and exterior painting",
    icon: PaintRoller,
    tile: { bg: "#F8BBD0", fg: "#880E4F" },
  },
  {
    id: "solar",
    label: "Solar",
    homeLabel: "Solar",
    hint: "Solar panels and inverter setup",
    icon: Sun,
    tile: { bg: "#FFF59D", fg: "#F57F17" },
  },
  {
    id: "generator",
    label: "Generator",
    homeLabel: "Generator",
    hint: "Generator repair and service",
    icon: Zap,
    tile: { bg: "#FFECB3", fg: "#E65100" },
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
