import type { ProService } from "@/lib/types";

export const SCAN_START_QUESTION = "Why do you need a diagnostic scan?";

export const SCAN_FINAL_COPY = {
  urgency: "How urgent is this request?",
  normal: "Normal",
  emergency: "Emergency",
  remote: "Remote location",
  night: "Night service needed",
  photos:
    "Add clear photos of the dashboard (warning lights) and engine bay if possible",
  voice: "Record a short voice note describing the symptoms",
  location: "Exact location / landmark",
  extra: "Any other detail you want the diagnostic technician to know?",
  tow: "Do you need the vehicle towed to a safer place or workshop for the scan?",
} as const;

export const SCAN_MIN_PHOTOS = 1;
export const SCAN_MAX_PHOTOS = 4;

export type ScanScreenKind = "choice" | "text";

export type ScanOption = {
  id: string;
  label: string;
};

export type ScanScreen = {
  id: string;
  question: string;
  kind: ScanScreenKind;
  options?: ScanOption[];
  placeholder?: string;
};

export type ScanRoute = {
  trade: ProService;
  alternate?: ProService;
  needsConfirm: boolean;
};

export const SCAN_START_OPTIONS: ScanOption[] = [
  { id: "A", label: "Check engine light or warning light is on" },
  {
    id: "B",
    label:
      "Vehicle has performance problems (loss of power, rough running, etc.)",
  },
  { id: "C", label: "Vehicle will not start or starts with difficulty" },
  { id: "D", label: "Need full system health check / preventive scan" },
  { id: "E", label: "After repairs, want to clear codes or confirm fix" },
  { id: "F", label: "Something else / I'm not sure" },
  {
    id: "G",
    label: "Electric vehicle (EV), battery / motor / charging scan",
  },
];

const YES_NO: ScanOption[] = [
  { id: "yes", label: "Yes" },
  { id: "no", label: "No" },
];

export const SCAN_SCREENS: Record<string, ScanScreen> = {
  start: {
    id: "start",
    question: SCAN_START_QUESTION,
    kind: "choice",
    options: SCAN_START_OPTIONS,
  },
  // Branch A Check engine light or warning light is on
  a_light: {
    id: "a_light",
    question: "Which light(s) are currently on?",
    kind: "choice",
    options: [
      { id: "ce", label: "Check Engine (MIL)" },
      { id: "battery", label: "Battery / charging" },
      { id: "oil", label: "Oil pressure" },
      { id: "temp", label: "Temperature" },
      { id: "abs", label: "ABS / traction" },
      { id: "airbag", label: "Airbag" },
      { id: "other", label: "Other warning light" },
    ],
  },
  a_flash: {
    id: "a_flash",
    question: "Is the light steady or flashing?",
    kind: "choice",
    options: [
      { id: "steady", label: "Steady" },
      { id: "flashing", label: "Flashing" },
      { id: "intermittent", label: "Comes and goes" },
    ],
  },
  a_when: {
    id: "a_when",
    question: "When did the light first come on?",
    kind: "choice",
    options: [
      { id: "today", label: "Today" },
      { id: "thisweek", label: "This week" },
      { id: "thismonth", label: "This month" },
      { id: "month", label: "Over a month ago" },
      { id: "dontknow", label: "I don't remember" },
    ],
  },
  a_symptoms: {
    id: "a_symptoms",
    question:
      "Did any symptoms start at the same time (loss of power, rough idle, smoke, etc.)?",
    kind: "choice",
    options: YES_NO,
  },
  a_scanned: {
    id: "a_scanned",
    question: "Has the vehicle been scanned before for this issue?",
    kind: "choice",
    options: YES_NO,
  },
  // Branch B Vehicle has performance problems
  b_what: {
    id: "b_what",
    question: "What exactly is the vehicle doing?",
    kind: "choice",
    options: [
      { id: "limp", label: "Loss of power / going into limp mode" },
      { id: "idle", label: "Rough idle or shaking" },
      { id: "misfire", label: "Misfiring or jerking" },
      { id: "fuel", label: "Poor fuel consumption" },
      { id: "stall", label: "Stalling" },
      { id: "other", label: "Other performance issue" },
    ],
  },
  b_when: {
    id: "b_when",
    question:
      "Does the problem happen all the time or only under certain conditions (cold, hot, accelerating, idling)?",
    kind: "choice",
    options: [
      { id: "all", label: "All the time" },
      { id: "cold", label: "Only when cold" },
      { id: "hot", label: "Only when hot" },
      { id: "accel", label: "Only when accelerating" },
      { id: "idle", label: "Only when idling" },
      { id: "other", label: "Other conditions" },
    ],
  },
  b_noise: {
    id: "b_noise",
    question: "Any unusual noises, smells, or smoke?",
    kind: "choice",
    options: YES_NO,
  },
  b_lights: {
    id: "b_lights",
    question: "Are there any warning lights on?",
    kind: "choice",
    options: YES_NO,
  },
  // Branch C Vehicle will not start or starts with difficulty
  c_what: {
    id: "c_what",
    question: "What happens when you try to start?",
    kind: "choice",
    options: [
      { id: "dead", label: "Completely dead (no lights, no crank)" },
      { id: "crank", label: "Cranks but does not start" },
      { id: "dies", label: "Starts then dies immediately" },
      { id: "slow", label: "Cranks very slowly" },
    ],
  },
  c_lights: {
    id: "c_lights",
    question: "Are there any warning lights on the dashboard?",
    kind: "choice",
    options: YES_NO,
  },
  c_sudden: {
    id: "c_sudden",
    question:
      "Did this start suddenly or after the vehicle was parked for a long time?",
    kind: "choice",
    options: [
      { id: "sudden", label: "Started suddenly" },
      { id: "parked", label: "After being parked for a long time" },
      { id: "notsure", label: "I'm not sure" },
    ],
  },
  c_work: {
    id: "c_work",
    question: "Any recent electrical or battery work?",
    kind: "choice",
    options: YES_NO,
  },
  // Branch D Need full system health check / preventive scan
  d_routine: {
    id: "d_routine",
    question: "Is this a routine check or before a long trip?",
    kind: "choice",
    options: [
      { id: "routine", label: "Routine check" },
      { id: "trip", label: "Before a long trip" },
      { id: "both", label: "Both" },
    ],
  },
  d_symptoms: {
    id: "d_symptoms",
    question: "Any existing minor symptoms you want investigated?",
    kind: "choice",
    options: YES_NO,
  },
  d_scope: {
    id: "d_scope",
    question:
      "Do you want only engine scan or full system scan (ABS, airbag, transmission, etc.)?",
    kind: "choice",
    options: [
      { id: "engine", label: "Engine scan only" },
      { id: "full", label: "Full system scan" },
    ],
  },
  // Branch E After repairs, want to clear codes or confirm fix
  e_repair: {
    id: "e_repair",
    question: "What repair was recently done?",
    kind: "text",
  },
  e_light: {
    id: "e_light",
    question: "Is the warning light still on or has it returned?",
    kind: "choice",
    options: [
      { id: "still", label: "Still on" },
      { id: "returned", label: "It came back" },
      { id: "off", label: "No, it's off" },
    ],
  },
  e_clear: {
    id: "e_clear",
    question: "Do you want codes cleared and a fresh scan report?",
    kind: "choice",
    options: YES_NO,
  },
  // Branch F Something else / I'm not sure
  f_describe: {
    id: "f_describe",
    question:
      "Please describe in your own words what is happening with the vehicle.",
    kind: "text",
  },
  f_related: {
    id: "f_related",
    question: "Is it related to:",
    kind: "choice",
    options: [
      { id: "tyre", label: "Tyre or wheel problem" },
      { id: "body", label: "Body damage or accident" },
      { id: "ac", label: "Air conditioning" },
      { id: "battery", label: "Pure battery issue" },
      { id: "tow", label: "Vehicle cannot move" },
      { id: "power", label: "Home/shop power" },
      { id: "house", label: "House repairs" },
      { id: "clothing", label: "Clothing" },
      { id: "diagnosis", label: "Still needs diagnosis" },
    ],
  },
  f_power: {
    id: "f_power",
    question: "Home/shop power",
    kind: "choice",
    options: [
      { id: "generator", label: "Generator" },
      { id: "solar", label: "Solar" },
      { id: "electric", label: "Electric" },
    ],
  },
  f_house: {
    id: "f_house",
    question: "House repairs",
    kind: "choice",
    options: [
      { id: "carpenter", label: "Carpenter" },
      { id: "plumber", label: "Plumber" },
      { id: "painter", label: "Painter" },
    ],
  },
  ev_scan: {
    id: "ev_scan",
    question: "Which EV system should be scanned?",
    kind: "choice",
    options: [
      { id: "battery", label: "High-voltage (HV) battery health scan" },
      { id: "motor", label: "Motor / inverter fault codes" },
      { id: "charging", label: "Charging system check" },
      { id: "all", label: "Full EV system health check" },
      { id: "unsure", label: "Not sure" },
    ],
  },
};

const START_NEXT: Record<string, string> = {
  A: "a_light",
  B: "b_what",
  C: "c_what",
  D: "d_routine",
  E: "e_repair",
  F: "f_describe",
  G: "ev_scan",
};

function resolveScreen(answers: Record<string, string>): "confirm" | "final" {
  return resolveScanRoute(answers).needsConfirm ? "confirm" : "final";
}

export function scanScreen(id: string): ScanScreen | undefined {
  return SCAN_SCREENS[id];
}

export function nextScanScreen(
  current: string,
  answerId: string,
  answers: Record<string, string>,
): string {
  if (current === "start") return START_NEXT[answerId] || "f_describe";

  if (current === "a_light") return "a_flash";
  if (current === "a_flash") return "a_when";
  if (current === "a_when") return "a_symptoms";
  if (current === "a_symptoms") return "a_scanned";
  if (current === "a_scanned") return resolveScreen(answers);

  if (current === "b_what") return "b_when";
  if (current === "b_when") return "b_noise";
  if (current === "b_noise") return "b_lights";
  if (current === "b_lights") return resolveScreen(answers);

  if (current === "c_what") return "c_lights";
  if (current === "c_lights") return "c_sudden";
  if (current === "c_sudden") return "c_work";
  if (current === "c_work") return resolveScreen(answers);

  if (current === "d_routine") return "d_symptoms";
  if (current === "d_symptoms") return "d_scope";
  if (current === "d_scope") return resolveScreen(answers);

  if (current === "e_repair") return "e_light";
  if (current === "e_light") return "e_clear";
  if (current === "e_clear") return resolveScreen(answers);

  if (current === "f_describe") return "f_related";
  if (current === "f_related") {
    if (answerId === "power") return "f_power";
    if (answerId === "house") return "f_house";
    return resolveScreen(answers);
  }
  if (current === "f_power" || current === "f_house") {
    return resolveScreen(answers);
  }

  if (current === "ev_scan") return resolveScreen(answers);

  return "final";
}

/**
 * Pick the trade from the filled answers. Deep routing matches the Scan
 * template: charging light → Battery + Electric, temperature/oil → Mechanic,
 * flashing check-engine → Priority Scan + Mechanic, dead/slow crank →
 * Battery first, crank-no-start → Scan + Mechanic, and the something-else
 * branch routes to any specialist. Confirm cards are shown whenever the
 * scan would hand the job to another trade.
 */
export function resolveScanRoute(answers: Record<string, string>): ScanRoute {
  const stay = (): ScanRoute => ({
    trade: "diagnostics",
    needsConfirm: false,
  });
  const leave = (trade: ProService, alternate?: ProService): ScanRoute => ({
    trade,
    alternate,
    needsConfirm: trade !== "diagnostics" || Boolean(alternate),
  });

  const main = answers.start;

  if (main === "A") {
    const light = answers.a_light;
    // Battery / charging light → Offer Battery + Electric.
    if (light === "battery") return leave("battery", "electrical");
    // Oil pressure / Temperature → Mechanic (lubrication / cooling).
    if (light === "oil" || light === "temp") return leave("mechanic");
    // Flashing Check Engine → Priority Scan + Mechanic (possible catalytic/misfire damage).
    if (light === "ce" && answers.a_flash === "flashing") {
      return leave("diagnostics", "mechanic");
    }
    // Check Engine (steady), ABS / traction, Airbag, Other → stay with Scan.
    return stay();
  }

  if (main === "B") return stay();

  if (main === "C") {
    const what = answers.c_what;
    // Completely dead or slow crank → Offer Battery first, then Scan / Electric.
    if (what === "dead" || what === "slow")
      return leave("battery", "electrical");
    // Cranks but does not start → Scan + Mechanic or Electric.
    if (what === "crank") return leave("diagnostics", "mechanic");
    // Starts then dies immediately → stay with Scan.
    return stay();
  }

  if (main === "D") return stay();

  if (main === "E") return stay();

  if (main === "F") {
    if (answers.f_related === "tyre") return leave("vulcanizer");
    if (answers.f_related === "body") return leave("body");
    if (answers.f_related === "ac") return leave("ac");
    if (answers.f_related === "battery") return leave("battery");
    if (answers.f_related === "tow") return leave("towing");
    if (answers.f_related === "power") {
      if (answers.f_power === "solar") return leave("solar");
      if (answers.f_power === "electric") return leave("electrical");
      return leave("generator");
    }
    if (answers.f_related === "house") {
      if (answers.f_house === "plumber") return leave("plumber");
      if (answers.f_house === "painter") return leave("painter");
      return leave("carpenter");
    }
    if (answers.f_related === "clothing") return leave("fashion");
    return stay();
  }

  if (main === "G") {
    if (answers.ev_scan === "charging")
      return leave("diagnostics", "electrical");
    return stay();
  }

  return stay();
}

export function applyConfirmChoice(route: ScanRoute, yes: boolean): ProService {
  if (yes) return route.trade;
  if (route.alternate) return route.alternate;
  return "diagnostics";
}

export function confirmQuestion(trade: ProService): string {
  const labels: Record<ProService, string> = {
    mechanic: "Mechanic",
    vulcanizer: "Vulcanizer",
    towing: "Tow",
    battery: "Battery",
    ac: "A/C",
    body: "Body",
    electrical: "Electrical",
    diagnostics: "Diagnostics",
    fashion: "Fashion",
    plumber: "Plumber",
    carpenter: "Carpenter",
    painter: "Painter",
    solar: "Solar",
    generator: "Generator",
  };
  return `This sounds like ${labels[trade]}. Continue?`;
}

export function composeScanProblem(
  answers: Record<string, string>,
  extra: string,
  landmark: string,
): string {
  const lines: string[] = [];
  const start = scanScreen("start");
  if (start) {
    lines.push(start.question);
    const picked = SCAN_START_OPTIONS.find((o) => o.id === answers.start);
    if (picked) lines.push(picked.label);
  }

  const order = Object.keys(answers).filter(
    (k) => k !== "start" && !k.endsWith("_label"),
  );
  for (const id of order) {
    const screen = scanScreen(id);
    if (!screen) continue;
    lines.push(screen.question);
    const stored = answers[`${id}_label`];
    if (stored) lines.push(stored);
    else if (screen.kind === "text") lines.push(answers[id] || "");
    else {
      const opt = screen.options?.find((o) => o.id === answers[id]);
      lines.push(opt?.label || answers[id] || "");
    }
  }

  if (landmark.trim()) {
    lines.push(SCAN_FINAL_COPY.location);
    lines.push(landmark.trim());
  }
  if (extra.trim()) {
    lines.push(SCAN_FINAL_COPY.extra);
    lines.push(extra.trim());
  }
  return lines.filter(Boolean).join("\n");
}

export function canAdvanceText(value: string): boolean {
  return value.trim().length >= 2;
}

export function canFindScanPro(photoCount: number): boolean {
  return photoCount >= SCAN_MIN_PHOTOS;
}

export function scanBreadcrumb(stack: string[]): string {
  const bits: string[] = ["Scan"];
  const firstBranch = stack.find(
    (id) =>
      id !== "vehicle" && id !== "start" && id !== "confirm" && id !== "final",
  );
  if (firstBranch) {
    const letter = Object.entries(START_NEXT).find(
      ([, id]) => id === firstBranch,
    )?.[0];
    if (letter) bits.push(letter);
  }
  const last = stack[stack.length - 1];
  if (last === "confirm") bits.push("Confirm");
  else if (last === "final") bits.push("Send");
  return bits.join(" · ");
}
