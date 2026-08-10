/**
 * Vulcanizer tyre-size parsing + synonym normalization.
 *
 * Accepts "205/55 R16", "205 55 16", "205/55R16", "205/55/16", "205-55-16",
 * "P205/55R16", "205/55 R16 91V" and normalizes them all to a canonical search
 * token set. Pure functions — shared server + client, unit-testable.
 */

export type ParsedTyreSize = {
  /** Section width in mm (e.g. 205). */
  width: number | null;
  /** Aspect ratio in % (e.g. 55). */
  aspect: number | null;
  /** Rim diameter in inches (e.g. 16). */
  rim: number | null;
  /** Load index when present (e.g. 91). */
  loadIndex: number | null;
  /** Speed symbol when present (e.g. "V"). */
  speedRating: string | null;
  /** Optional P/LT/T prefix. */
  prefix: string | null;
  /** Absolute canonical form: "205/55R16". Null when no full size found. */
  canonical: string | null;
  /** Search tokens that match products regardless of input spacing. */
  tokens: string[];
};

/**
 * Extract a tyre size from free text. Returns null when no width/aspect/rim
 * triplet is present, so "battery" or "oil" never false-positive here.
 */
export function parseTyreSize(input: string | null | undefined): ParsedTyreSize | null {
  if (!input) return null;
  const raw = String(input).trim();
  if (!raw) return null;

  // Normalize separators: 205/55 R16 | 205 55 16 | 2055R16 | 205-55-16 | 205/55R16
  const triplets = raw.match(
    /\b(P|LT|HT|ST|T)?[\s-]?(\d{3})[\s/\/\-_.]{0,2}[Rr]?[\s-]?(\d{2})[\s/\/\-_.]{0,2}[Rr]?[\s-]?(\d{1,2})\b/
  );

  let width: number | null = null;
  let aspect: number | null = null;
  let rim: number | null = null;
  let prefix: string | null = null;
  let canonical: string | null = null;

  // Multi-triplet alternative: "205/55 R16" where tokens are separated by the
  // slash BEFORE "R": 205 / 55 R 16
  const alt = raw.match(
    /\b(P|LT|HT|ST|T)?[\s-]?(\d{3})\s*\/\s*(\d{2})\s*[Rr]?\s*(\d{1,2})\b/
  );
  const m = alt ?? triplets;
  if (m) {
    // Prefer the slash-form (alt) because "205 55 16" (space form) also matches
    // triplets and has the same groups.
    prefix = m[1] ? m[1].toUpperCase() : null;
    width = Number(m[2]);
    aspect = Number(m[3]);
    rim = Number(m[4]);
    if (aspect >= 20 && aspect <= 90 && rim >= 10 && rim <= 32) {
      canonical = `${width}/${aspect}R${rim}`;
    }
  }

  let loadIndex: number | null = null;
  let speedRating: string | null = null;
  if (canonical) {
    // Optional trailing service description: "…R16 91V" / "…R16 91 V" / "R16 91"
    const can = `${width}/${aspect}R${rim}`;
    const desc = raw
      .replace(/\b(P|LT|HT|ST|T)[\s-]?/, "")
      .match(new RegExp(`${can.replace(/[./]/g, "\\$&")}\\s*([0-9]{2,3})\\s*([A-Za-z])?`));
    if (desc) {
      const li = Number(desc[1]);
      if (li >= 50 && li <= 199) loadIndex = li;
      if (desc[2]) speedRating = desc[2].toUpperCase();
    }
    // Also catch service description without space variants
    if (!loadIndex) {
      const compact = raw.match(/\b([0-9]{2,3})\s*(Y|W|V|H|T|S|Q|R)\b$/);
      if (compact) {
        const li = Number(compact[1]);
        if (li >= 50 && li <= 199) loadIndex = li;
        speedRating = compact[2].toUpperCase();
      }
    }
  }

  if (!canonical) return null;

  // Canonical token set — one tyre matches all input spellings.
  const c = canonical;
  const tokens: string[] = [
    c.toLowerCase(), // 205/55r16
    c.replace("/", "/").toLowerCase(), // 205/55r16 (same)
    `${width} ${aspect} ${rim}`, // 205 55 16
    `${width}/${aspect} r${rim}`, // 205/55 r16
    `${width}/${aspect} r ${rim}`, // 205/55 r 16
    `${width}-${aspect}-${rim}`, // 205-55-16
    `${width}${aspect}r${rim}`, // 20555r16 (compact from "20555R16")
    `${width}${aspect}R${rim}`, // 20555R16
  ];

  return {
    width,
    aspect,
    rim,
    loadIndex,
    speedRating,
    prefix,
    canonical,
    tokens: [...new Set(tokens)].filter((t) => t.length >= 5),
  };
}

const UK_US_SYNONYMS: Record<string, string[]> = {
  tyre: ["tire", "tires", "tyres"],
  tire: ["tyre", "tyres", "tires"],
  vulcanizer: ["vulcaniser", "vulcanizers", "vulcanisers"],
  vulcaniser: ["vulcanizer", "vulcanizers", "vulcanisers"],
};

/** Expand a raw query into synonym variants so tyre/tire and
 * vulcanizer/vulcaniser search identically. */
export function expandSynonyms(raw: string): string[] {
  const out = new Set<string>([raw]);
  for (const [base, syns] of Object.entries(UK_US_SYNONYMS)) {
    for (const s of syns) {
      if (raw.toLowerCase().includes(s)) {
        const re = new RegExp(s, "ig");
        out.add(raw.replace(re, base));
        // Also derive every synonym variant
        for (const alt of syns) out.add(raw.replace(re, alt));
      }
    }
  }
  return [...out];
}

/** True when the query looks like a tyre-size search (has a full triplet). */
export function isTyreSizeQuery(raw: string): boolean {
  return parseTyreSize(raw)?.canonical != null;
}