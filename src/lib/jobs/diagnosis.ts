import type { ProService } from "@/lib/types";

/**
 * Trade-aware likely-problem line for the pro lower panel.
 * Pure: matches keywords in the composed Q&A blob. Does not import UI.
 */

type DiagnosisInput = {
  serviceType?: ProService | string | null;
  problem: string;
  locationLabel?: string | null;
};

const TRADE_RULES: Record<string, Array<{ test: RegExp; diagnosis: string }>> = {
  mechanic: [
    { test: /nozzle|injector/i, diagnosis: "Engine nozzle" },
    {
      test: /overheat|temperature|coolant|radiator|fan/i,
      diagnosis: "Cooling system",
    },
    { test: /brake.*pad|brake.*disc/i, diagnosis: "Brake system" },
    { test: /engine.*knock|piston/i, diagnosis: "Engine block" },
  ],
  solar: [
    { test: /receptor|panel/i, diagnosis: "Solar panel receptor" },
    { test: /inverter/i, diagnosis: "Inverter unit" },
    { test: /battery.*solar|solar.*battery/i, diagnosis: "Solar battery bank" },
  ],
  plumber: [
    {
      test: /pipeline|foundation|misconstructed/i,
      diagnosis: "Misconstructed pipeline in foundation",
    },
    { test: /burst.*pipe|leak.*pipe/i, diagnosis: "Burst pipeline" },
    { test: /drain.*block/i, diagnosis: "Blocked drainage" },
  ],
  electrical: [
    { test: /short.*circuit|wiring/i, diagnosis: "Electrical wiring fault" },
    { test: /fuse|breaker/i, diagnosis: "Fuse/breaker failure" },
  ],
  ac: [
    { test: /a\/c.*work|recent.*a\/c/i, diagnosis: "A/C system related fault" },
    { test: /not.*cool/i, diagnosis: "A/C cooling failure" },
  ],
  generator: [
    { test: /won.*start|surging/i, diagnosis: "Generator start failure" },
  ],
  battery: [{ test: /dead.*battery|jump.*start/i, diagnosis: "Battery failure" }],
  towing: [{ test: /breakdown|won.*move/i, diagnosis: "Vehicle breakdown" }],
};

export function getLikelyProblem(input: DiagnosisInput): string | null {
  const problem = input.problem || "";
  const service = String(input.serviceType || "").toLowerCase();
  const blob = [problem, input.locationLabel || ""].filter(Boolean).join("\n");
  const rules = TRADE_RULES[service] || [];
  for (const r of rules) {
    if (r.test.test(blob)) return r.diagnosis;
  }
  const lines = problem
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.length > 2);
  if (lines.length) return lines[0].slice(0, 80);
  return null;
}
