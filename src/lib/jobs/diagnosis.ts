import type { ProService } from "@/lib/types";

/**
 * Trade-aware likely-problem synthesis from the full Q/A session.
 * Pure, single-file, typed, human-maintainable. No UI imports.
 * No circular deps — does not import from job-problem-qa.
 *
 * HYBRID INTELLIGENCE (v2):
 * 1. Exact regex (trade-locked) — fast, precise
 * 2. Fuzzy semantic fallback — token + synonym + stem scoring across the SAME trade's rules
 *    (no cross-trade leakage) — handles "The vehicle will not start at all" vs "engine won't start"
 * 3. Raw Q/A fallback — best meaningful answer, filtered from trivial yes/no
 */

type DiagnosisRule = {
  test: RegExp;
  diagnosis: string;
  /** Keywords for fuzzy scoring (lowercase, no regex) */
  keywords: string[];
};

const SYNONYMS: Record<string, string[]> = {
  overheat: ["hot", "high temperature", "boiling", "overheating", "heat", "temperature high"],
  coolant: ["water", "antifreeze", "coolant"],
  radiator: ["radiator", "rad"],
  brake: ["brake", "brakes", "braking"],
  puncture: ["puncture", "punctured", "nail", "flat tyre", "flat tire", "deflated"],
  breakdown: ["breakdown", "broke down", "stalled", "stuck", "won't move", "will not move", "not moving", "immobile", "stranded"],
  start: ["start", "starting", "crank", "cranking", "turn over", "ignite", "kick"],
  battery: ["battery", "batt"],
  power: ["power", "electric", "electricity", "light", "lights"],
  leak: ["leak", "leaking", "drip", "dripping", "seep", "burst"],
  pipe: ["pipe", "pipeline", "plumbing", "tube"],
  drain: ["drain", "drainage", "gutter", "clog", "blocked"],
  wiring: ["wiring", "wire", "cable", "short circuit", "short"],
};

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stem(word: string): string {
  // light stemming: plurals, ing, ed
  return word
    .replace(/(ing|ed|es|s)$/i, "")
    .replace(/(ies)$/i, "y");
}

function tokenize(text: string): string[] {
  return normalize(text)
    .split(" ")
    .filter(Boolean)
    .map(stem);
}

function expandWithSynonyms(keywords: string[]): string[] {
  const out = new Set<string>(keywords.map((k) => normalize(k)));
  for (const k of keywords) {
    const norm = normalize(k);
    if (SYNONYMS[norm]) {
      for (const syn of SYNONYMS[norm]) out.add(normalize(syn));
    }
    // also expand single words inside multi-word keywords
    for (const w of norm.split(" ")) {
      if (SYNONYMS[w]) {
        for (const syn of SYNONYMS[w]) out.add(normalize(syn));
      }
    }
  }
  return [...out];
}

const TRADE_RULES: Record<string, DiagnosisRule[]> = {
  mechanic: [
    {
      test: /nozzle|injector|misfire|fuel\s*rail/i,
      diagnosis: "Likely fuel/ignition — injector/nozzle fouling",
      keywords: ["nozzle", "injector", "misfire", "fuel rail"],
    },
    {
      test: /overheat|temperature\s*high|coolant|radiator|fan\s*not|thermostat|overheating|hot\s*engine|high\s*temp/i,
      diagnosis: "Engine may need servicing — likely cooling system failure (coolant/radiator/fan)",
      keywords: ["overheat", "coolant", "radiator", "fan", "thermostat", "temperature", "hot"],
    },
    {
      test: /brake.*(pad|disc|squeal)|brake\s*failure|brake\s*not\s*working/i,
      diagnosis: "Likely brake pad/disc wear — brake system needs check",
      keywords: ["brake", "pad", "disc", "squeal"],
    },
    {
      test: /engine.*knock|piston|crank|rod\s*knock|knocking\s*sound/i,
      diagnosis: "This sounds like the engine block is knocking — may need servicing",
      keywords: ["knock", "piston", "crank", "engine"],
    },
    {
      test: /gear.*slip|transmission|gearbox|gear\s*won'?t\s*shift/i,
      diagnosis: "Likely gearbox/transmission slip — gear system",
      keywords: ["gear", "transmission", "gearbox", "slip"],
    },
    {
      test: /steering.*heavy|steering\s*play|hard\s*to\s*steer/i,
      diagnosis: "Problem may be coming from power steering pump/rack",
      keywords: ["steering", "heavy", "play"],
    },
    {
      test: /suspension|shock\s*absorber|strut|bumpy\s*ride/i,
      diagnosis: "Likely suspension/shock absorber issue",
      keywords: ["suspension", "shock", "strut"],
    },
    {
      test: /(?:vehicle|car|engine|motor).{0,20}(?:will\s*not\s*start|won'?t\s*start|not\s*starting|fails?\s*to\s*start|cranks?\s*(but\s*)?not\s*start|no\s*start|silent\s*when.*start)/i,
      diagnosis: "Likely fuel/ignition — engine cranks but won't start",
      keywords: ["vehicle", "car", "engine", "start", "crank", "silent", "not start"],
    },
    {
      test: /won'?t\s*start|not\s*starting|cranks?\s*no\s*start/i,
      diagnosis: "Likely a spark plug/ignition problem — may need servicing",
      keywords: ["start", "crank", "not start"],
    },
    {
      test: /oil\s*leak|leaking\s*oil|oil\s*drip/i,
      diagnosis: "This sounds like an oil leak — check sump/gasket",
      keywords: ["oil", "leak", "drip"],
    },
    {
      test: /shaft|axle|drive\s*shaft|cv\s*joint/i,
      diagnosis: "This sounds like the shaft is broken — axle/CV joint",
      keywords: ["shaft", "axle", "drive shaft", "cv"],
    },
  ],
  vulcanizer: [
    {
      test: /puncture|flat\s*tyre|flat\s*tire|nail\s*in\s*tyre|tyre\s*flat/i,
      diagnosis: "Likely tyre puncture — nail/flat, needs patch/replacement",
      keywords: ["puncture", "flat", "tyre", "nail"],
    },
    {
      test: /wheel\s*balance|vibration\s*at\s*speed|shaking\s*at\s*speed/i,
      diagnosis: "This sounds like wheel balance off — vibration at speed",
      keywords: ["balance", "vibration", "shaking"],
    },
    {
      test: /alignment|pulls\s*to\s*one\s*side|steering\s*pulls/i,
      diagnosis: "Problem may be coming from wheel alignment — pulls to one side",
      keywords: ["alignment", "pulls", "steering"],
    },
  ],
  towing: [
    {
      test: /(?:vehicle|car).{0,20}(?:will\s*not\s*start|won'?t\s*move|breakdown|stalled|stranded|immobile)|engine\s*won'?t\s*start|stalled|breakdown/i,
      diagnosis: "Vehicle breakdown — Likely fuel/ignition or stalled, needs tow",
      keywords: ["breakdown", "stalled", "stranded", "won't move", "will not start", "immobile"],
    },
    { test: /accident|collision|crash|hit\s*and\s*run/i, diagnosis: "Accident recovery — collision/crash needs tow", keywords: ["accident", "collision", "crash"] },
  ],
  battery: [
    {
      test: /(?:vehicle|car).{0,20}(?:will\s*not\s*start|won'?t\s*start)|dead\s*battery|battery\s*dead|jump\s*start|battery\s*weak|no\s*power.*battery/i,
      diagnosis: "Likely battery failure — dead/weak, may need jump/replacement",
      keywords: ["battery", "dead", "jump", "start", "weak"],
    },
    { test: /terminal.*corrosion|terminal\s*clean|corroded\s*terminal/i, diagnosis: "Problem may be coming from battery terminals — corrosion/loose", keywords: ["terminal", "corrosion"] },
  ],
  ac: [
    { test: /a\/c.*recent.*work|recent.*a\/c|a\/c\s*service/i, diagnosis: "Likely A/C system fault — recent work/service related", keywords: ["ac", "a/c", "recent work"] },
    { test: /not\s*cool|no\s*cooling|warm\s*air|ac\s*not\s*cool|ac\s*blowing\s*warm/i, diagnosis: "This sounds like the A/C is blowing warm — cooling failure", keywords: ["cool", "cooling", "warm air"] },
  ],
  body: [
    { test: /dent|scratch|scraped|body\s*damage|panel\s*damage/i, diagnosis: "Likely body panel damage — dent/scratch needs repair", keywords: ["dent", "scratch", "body", "panel"] },
    { test: /paint.*damage|clear\s*coat|paint\s*peel/i, diagnosis: "This sounds like clear coat/paint damage", keywords: ["paint", "clear coat", "damage"] },
  ],
  electrical: [
    { test: /short\s*circuit|wiring|exposed\s*wire/i, diagnosis: "This sounds like a wiring/short circuit fault", keywords: ["short", "wiring", "exposed wire"] },
    { test: /fuse|breaker.*trip|mcb\s*trip|fuse\s*blown/i, diagnosis: "Likely fuse/breaker tripped — may need replacement", keywords: ["fuse", "breaker", "trip"] },
    { test: /no\s*light|power\s*outage|no\s*power|lights?\s*out/i, diagnosis: "Problem may be coming from power supply — outage/no light", keywords: ["power", "light", "outage"] },
  ],
  diagnostics: [
    { test: /engine.*light|check\s*engine|obd|diagnostic.*scan/i, diagnosis: "Likely needs engine diagnostics — OBD scan", keywords: ["engine light", "check engine", "obd", "diagnostic"] },
    { test: /electrical.*fault|diagnostic.*electrical/i, diagnosis: "This sounds like an electrical fault — diagnostics needed", keywords: ["electrical", "diagnostic", "fault"] },
  ],
  solar: [
    { test: /receptor|receptor\s*fault/i, diagnosis: "This sounds like the solar receptor is faulty", keywords: ["receptor"] },
    { test: /panel.*not\s*charging|panel.*dirty|panel.*cracked|panel\s*not\s*working/i, diagnosis: "Likely solar panel not charging — dirty/cracked", keywords: ["panel", "charging", "dirty", "cracked"] },
    { test: /inverter.*fault|inverter\s*beep|inverter\s*error/i, diagnosis: "Problem may be coming from inverter unit — fault/beep", keywords: ["inverter", "fault", "beep"] },
    { test: /battery.*solar|solar.*battery|battery\s*not\s*holding|solar\s*battery/i, diagnosis: "Likely solar battery not holding charge", keywords: ["battery", "solar"] },
  ],
  generator: [
    { test: /won'?t\s*start|surging|generator.*noise|overload|generator\s*won'?t\s*start/i, diagnosis: "This sounds like the shaft is broken / generator won't start — surging/overload", keywords: ["generator", "start", "surging", "noise", "overload", "shaft"] },
    { test: /no\s*output|no\s*power.*generator|generator\s*no\s*power/i, diagnosis: "Likely generator output failure — no power", keywords: ["output", "power", "generator"] },
  ],
  carpenter: [
    { test: /door.*won'?t\s*close|door\s*frame|hinge|door\s*stuck/i, diagnosis: "This sounds like door/frame hinge issue — won't close", keywords: ["door", "frame", "hinge"] },
    { test: /roof.*leak|ceiling.*wood|roof\s*damage/i, diagnosis: "Likely roof/ceiling wood damage — leak", keywords: ["roof", "leak", "ceiling"] },
  ],
  painter: [
    { test: /peeling|paint.*peel|damp\s*wall|wall\s*damp|paint\s*peeling/i, diagnosis: "Likely paint peeling — damp wall needs repaint", keywords: ["peeling", "paint", "damp", "wall"] },
  ],
  fashion: [
    { test: /zip.*broke|sewing|hem|alteration|zipper/i, diagnosis: "Likely tailoring issue — zip/sewing/hem needs repair", keywords: ["zip", "sewing", "hem", "alteration"] },
  ],
};

export type DiagnosisInput = {
  serviceType?: ProService | string | null;
  problem: string;
  locationLabel?: string | null;
};

function extractAnswers(problem: string): string[] {
  const lines = problem.split("\n").map((s) => s.trim()).filter(Boolean);
  const answers: string[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const qi = line.lastIndexOf("?");
    if (qi >= 0 && qi < line.length - 1) {
      const ans = line.slice(qi + 1).trim();
      if (ans && !seen.has(ans)) {
        seen.add(ans);
        answers.push(ans);
      }
      continue;
    }
  }
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].endsWith("?") && lines[i + 1] && !lines[i + 1].endsWith("?") && !/^(Location|Extra|Service|Vehicle):/i.test(lines[i + 1])) {
      const ans = lines[i + 1].trim();
      if (ans && !seen.has(ans)) {
        seen.add(ans);
        answers.push(ans);
      }
    }
  }
  return answers;
}

function isTrivialAnswer(s: string): boolean {
  const t = normalize(s);
  if (t.length < 3) return true;
  if (/^(yes|no|maybe|not\s*sure|i\s*don'?t\s*know|none|n\/a|nil)$/.test(t)) return true;
  return false;
}

function scoreRule(rule: DiagnosisRule, tokens: string[], blob: string): number {
  // Exact regex is strongest (handled separately), here fuzzy token scoring
  const keywords = expandWithSynonyms(rule.keywords);
  let score = 0;
  const blobNorm = normalize(blob);
  for (const kw of keywords) {
    const normKw = normalize(kw);
    if (!normKw) continue;
    // multi-word keyword: check substring
    if (normKw.includes(" ")) {
      if (blobNorm.includes(normKw)) score += 2;
    } else {
      // single word: check stemmed token match
      const stemKw = stem(normKw);
      if (tokens.includes(stemKw) || tokens.includes(normKw) || blobNorm.includes(normKw)) score += 1;
    }
  }
  return score;
}

export function getLikelyProblem(input: DiagnosisInput): string | null {
  const problem = (input.problem || "").trim();
  if (!problem) return null;
  const service = String(input.serviceType || "").toLowerCase();
  const answers = extractAnswers(problem).filter((a) => !isTrivialAnswer(a));
  const blob = [problem, input.locationLabel || "", ...answers].join(" \n ");
  const blobLower = blob.toLowerCase();
  const tokens = tokenize(blob);

  // 1. Exact trade-locked regex — most precise
  const rules = TRADE_RULES[service] || [];
  for (const r of rules) {
    if (r.test.test(blob)) return r.diagnosis;
  }

  // 2. Fuzzy semantic fallback — same trade only, synonym + stem scoring
  if (rules.length) {
    let best: DiagnosisRule | null = null;
    let bestScore = 0;
    for (const r of rules) {
      const s = scoreRule(r, tokens, blobLower);
      if (s > bestScore) {
        bestScore = s;
        best = r;
      }
    }
    // threshold: at least 1 keyword hit, and not trivial
    if (best && bestScore >= 1) return best.diagnosis;
  }

  // 3. Raw Q/A fallback — best meaningful answer, not question prefix
  if (answers.length) {
    // pick longest meaningful answer (often the problem description)
    const sorted = [...answers].sort((a, b) => b.length - a.length);
    const pick = sorted.find((a) => a.trim().length >= 8) || answers[0];
    return pick.slice(0, 80).trim();
  }
  const lines = problem.split("\n").map((s) => s.trim()).filter((s) => s.length > 2);
  if (!lines.length) return null;
  const first = lines[0];
  const qi = first.lastIndexOf("?");
  if (qi >= 0 && qi < first.length - 1) {
    const a = first.slice(qi + 1).trim();
    if (a && !isTrivialAnswer(a)) return a.slice(0, 80);
  }
  const m = first.match(/^(Location|Extra|Service|Vehicle):\s*(.+)$/i);
  if (m) return m[2].slice(0, 80).trim();
  return first.slice(0, 80);
}
