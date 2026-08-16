/**
 * Lightweight structured intent from natural-language shop queries.
 * AI optional later — this is deterministic extraction (authoritative catalog still wins).
 */

import type { ShopSearchIntent } from "@/lib/server/shop/types";
import { expandSynonyms, parseTyreSize } from "@/lib/shop/tyre-size";

const TRADE_ALIASES: Record<string, string[]> = {
  mechanic: ["mechanic", "brake", "engine", "oil", "spark", "filter", "car", "auto"],
  vulcanizer: ["tyre", "tire", "vulcaniz", "tube", "wheel"],
  battery: ["battery", "jump", "12v", "car battery"],
  ac: ["a/c", "ac ", "air condition", "gas refill", "cooling"],
  solar: ["solar", "inverter", "panel", "pv", "lithium"],
  generator: ["generator", "gen ", "kva", "diesel gen"],
  plumber: ["plumb", "pipe", "water", "tap", "pvc"],
  carpenter: ["wood", "carpentry", "timber", "plywood"],
  painter: ["paint", "brush", "roller", "emulsion"],
  electrical: ["wire", "alternator", "sensor", "electrical"],
  diagnostics: ["scan", "obd", "fault code", "diagnostic"],
  body: ["dent", "panel", "body", "bumper"],
  fashion: ["fashion", "tailor", "sew", "dress", "fabric", "ankara"],
  towing: ["tow", "recovery", "winch"],
};

const MAKES = [
  "toyota",
  "honda",
  "mercedes",
  "benz",
  "lexus",
  "nissan",
  "ford",
  "bmw",
  "hyundai",
  "kia",
  "peugeot",
];

export function interpretShopQuery(raw: string): ShopSearchIntent {
  const normalized = raw
    .toLowerCase()
    .replace(/[^\w\s./-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  let tradeKey: string | null = null;
  for (const [key, aliases] of Object.entries(TRADE_ALIASES)) {
    if (aliases.some((a) => normalized.includes(a))) {
      tradeKey = key;
      break;
    }
  }

  // Everyday language → brake system
  if (
    !tradeKey &&
    (normalized.includes("stop my car") ||
      normalized.includes("stop the car") ||
      normalized.includes("braking"))
  ) {
    tradeKey = "mechanic";
  }

  let make: string | null = null;
  for (const m of MAKES) {
    if (normalized.includes(m)) {
      make = m === "benz" ? "mercedes-benz" : m;
      break;
    }
  }

  let model: string | null = null;
  const modelHints = [
    "camry",
    "corolla",
    "accord",
    "civic",
    "hilux",
    "rav4",
    "sienna",
  ];
  for (const m of modelHints) {
    if (normalized.includes(m)) {
      model = m;
      break;
    }
  }

  let year: number | null = null;
  const ym = normalized.match(/\b(19|20)\d{2}\b/);
  if (ym) year = Number(ym[0]);

  let position: string | null = null;
  if (/\bfront\b/.test(normalized)) position = "front";
  else if (/\brear\b/.test(normalized)) position = "rear";

  const productHints: string[] = [];
  if (normalized.includes("brake pad")) productHints.push("brake pad");
  else if (normalized.includes("brake")) productHints.push("brake");
  if (normalized.includes("inverter")) productHints.push("inverter");
  if (normalized.includes("oil")) productHints.push("oil");
  if (normalized.includes("pipe")) productHints.push("pipe");
  if (normalized.includes("battery") && tradeKey !== "solar") {
    productHints.push("battery");
  }

  const specs: Record<string, string | number> = {};
  const kva = normalized.match(/(\d+(?:\.\d+)?)\s*kva/);
  if (kva) specs.kva = Number(kva[1]);
  const volt = normalized.match(/(\d+)\s*v\b/);
  if (volt) specs.voltage = Number(volt[1]);
  const mm = normalized.match(/(\d+)\s*mm\b/);
  if (mm) specs.diameterMm = Number(mm[1]);

  // Tyre-size awareness: "205/55 R16" == "205 55 16" == "205/55R16" ==
  // "205/55/16". Store the canonical size in specs so search + fitment can
  // use it, and hint `tyre` as the product class.
  const tyreSize = parseTyreSize(raw);
  if (tyreSize?.canonical) {
    if (tyreSize.width) specs.tireWidth = tyreSize.width;
    if (tyreSize.aspect) specs.aspectRatio = tyreSize.aspect;
    if (tyreSize.rim) specs.rimSize = tyreSize.rim;
    if (tyreSize.loadIndex) specs.loadIndex = tyreSize.loadIndex;
    if (tyreSize.speedRating) specs.speedRating = tyreSize.speedRating;
    if (!productHints.includes("tire")) productHints.push("tire");
    if (tradeKey !== "vulcanizer" && !tradeKey) tradeKey = "vulcanizer";
  }

  // Synonyms: "tyre" ↔ "tire", "vulcanizer" ↔ "vulcaniser" are the same query
  // (never surfaced twice in suggestions).
  const synExpanded = expandSynonyms(raw).length > 1;

  return {
    rawQuery: raw,
    normalizedQuery: normalized,
    tradeKey,
    productHints,
    make,
    model,
    year,
    position,
    specs,
    tyreSize: tyreSize?.canonical ?? null,
    tyreSynonymExpanded: synExpanded,
  };
}
