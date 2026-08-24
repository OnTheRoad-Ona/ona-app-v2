import type { ProService } from "@/lib/types";

/** Deep cascading question flow for the Solar trade. */

export const SOLAR_MACHINE_QUESTION = "What type of solar system do you use?";
export const SOLAR_MACHINE_NONE_ID = "none";
export const SOLAR_MACHINE_OTHER_ID = "other";

export const SOLAR_START_QUESTION = "What kind of solar work do you need?";

export const SOLAR_MIN_PHOTOS = 2;
export const SOLAR_MAX_PHOTOS = 4;

export interface SolarOption {
  id: string;
  label: string;
  hint?: string;
}

export interface SolarScreen {
  question: string;
  kind: "choice" | "text";
  options?: SolarOption[];
  placeholder?: string;
}

export interface SolarRoute {
  trade: ProService;
  alternate?: ProService;
  needsConfirm: boolean;
}

export const SOLAR_START_OPTIONS: SolarOption[] = [
  { id: "A", label: "New solar installation" },
  { id: "B", label: "Existing solar system not working properly" },
  { id: "C", label: "Battery or inverter problem" },
  { id: "D", label: "Solar panel cleaning or maintenance" },
  { id: "E", label: "System upgrade or expansion" },
  { id: "F", label: "Something else / I’m not sure" },
];

export const SOLAR_FINAL_COPY = {
  urgency: "How urgent is the work?",
  normal: "Normal",
  emergency: "Emergency",
  remote: "Remote location",
  night: "Night service needed",
  photos:
    "Add clear photos (2-4): existing solar panels / inverter / batteries (if any), the roof or installation area, and distribution board (if relevant)",
  voice: "Record a short voice note explaining exactly what you need",
  location: "Exact location / landmark",
  load: "Estimated load or what you want to power",
  supply: "Who is supplying the equipment?",
  extra: "Any other detail you want the solar technician to know?",
};

export const SOLAR_SUPPLY_OPTIONS: SolarOption[] = [
  { id: "i-will-supply", label: "I will supply" },
  { id: "technician-supplies", label: "Solar technician should supply" },
];

export const SOLAR_SCREENS: Record<string, SolarScreen> = {
  start: {
    question: SOLAR_START_QUESTION,
    kind: "choice",
    options: SOLAR_START_OPTIONS,
  },

  // Branch A new solar installation
  a_property: {
    question: "What type of property is it?",
    kind: "choice",
    options: [
      { id: "residential", label: "Residential house / flat" },
      { id: "shop-office", label: "Shop / office" },
      { id: "church-school", label: "Church / mosque / school" },
      { id: "factory", label: "Factory / industrial" },
      { id: "other", label: "Other" },
    ],
  },
  a_power: {
    question: "What do you mainly want to power?",
    kind: "choice",
    options: [
      { id: "lights-fans", label: "Lights and fans only" },
      { id: "lights-fridge", label: "Lights, fans, TV and fridge" },
      {
        id: "full-house",
        label: "Full house (including A/C and pumping machine)",
      },
      { id: "shop-equipment", label: "Shop or office equipment" },
      { id: "heavy-machines", label: "Heavy industrial machines" },
    ],
  },
  a_system: {
    question: "Preferred system type?",
    kind: "choice",
    options: [
      { id: "off-grid", label: "Off-grid (complete independence from NEPA)" },
      { id: "hybrid", label: "Hybrid (solar + NEPA)" },
      { id: "advise", label: "I don’t know, advise me" },
    ],
  },
  a_equipment: {
    question:
      "Do you already have any solar equipment (panels, inverter, batteries)?",
    kind: "choice",
    options: [
      { id: "yes", label: "Yes" },
      { id: "no", label: "No" },
      { id: "some", label: "Some" },
    ],
  },
  a_supply: {
    question: "Who should supply the panels, inverter and batteries?",
    kind: "choice",
    options: [
      { id: "i-buy", label: "I will buy them myself" },
      {
        id: "technician-supplies",
        label: "Solar technician should supply everything",
      },
    ],
  },
  a_roof: {
    question: "What is your roof type? (for panel mounting)",
    kind: "choice",
    options: [
      { id: "corrugated", label: "Corrugated iron sheet" },
      { id: "long-span", label: "Long-span aluminium" },
      { id: "concrete-flat", label: "Concrete flat roof" },
      { id: "other", label: "Other" },
    ],
  },

  // Branch B existing solar system not working properly
  b_problem: {
    question: "What exactly is the problem?",
    kind: "choice",
    options: [
      { id: "no-power", label: "System not giving power at all" },
      { id: "finishes-quickly", label: "Power finishes too quickly" },
      { id: "inverter-error", label: "Inverter showing error or alarm" },
      { id: "not-charging", label: "Panels not charging the batteries well" },
      { id: "change-over", label: "Change-over not working properly" },
      { id: "other", label: "Other" },
    ],
  },
  b_age: {
    question: "How old is the system?",
    kind: "text",
    placeholder: "e.g. About 2 years",
  },
  b_inverter: {
    question: "What size is the inverter (e.g. 2kVA, 3.5kVA, 5kVA, etc.)?",
    kind: "text",
    placeholder: "e.g. 3.5kVA",
  },
  b_warranty: {
    question: "Are the batteries still under warranty?",
    kind: "choice",
    options: [
      { id: "yes", label: "Yes" },
      { id: "no", label: "No" },
      { id: "not-sure", label: "Not sure" },
    ],
  },

  // Branch C battery or inverter problem
  c_which: {
    question: "Which one is having issue?",
    kind: "choice",
    options: [
      { id: "batteries", label: "Batteries" },
      { id: "inverter", label: "Inverter" },
      { id: "both", label: "Both" },
    ],
  },
  c_symptom: {
    question: "What is the symptom?",
    kind: "choice",
    options: [
      { id: "not-holding", label: "Batteries not holding charge" },
      { id: "not-switching", label: "Inverter not switching on" },
      { id: "beeping", label: "Inverter beeping or showing fault code" },
      { id: "shuts-down", label: "System shuts down when load is connected" },
      { id: "other", label: "Other" },
    ],
  },
  c_type: {
    question: "Battery type (if known)?",
    kind: "choice",
    options: [
      { id: "tubular", label: "Tubular" },
      { id: "lithium", label: "Lithium" },
      { id: "agm", label: "Dry cell / AGM" },
      { id: "dont-know", label: "I don’t know" },
    ],
  },
  c_bank: {
    question: "How many batteries and what size of inverter?",
    kind: "text",
    placeholder: "e.g. 4 batteries, 5kVA inverter",
  },

  // Branch D solar panel cleaning or maintenance
  d_count: {
    question: "How many panels do you have?",
    kind: "text",
    placeholder: "e.g. 6 panels",
  },
  d_last: {
    question: "When last were the panels cleaned?",
    kind: "text",
    placeholder: "e.g. Over 6 months ago",
  },
  d_condition: {
    question:
      "Are the panels dirty, covered with dust, bird droppings, or shaded by trees?",
    kind: "choice",
    options: [
      { id: "dirty-dusty", label: "Dirty / dusty" },
      { id: "bird-droppings", label: "Bird droppings" },
      { id: "shaded", label: "Shaded by trees" },
      { id: "clean", label: "No, they look clean" },
      { id: "not-sure", label: "Not sure" },
    ],
  },
  d_check: {
    question:
      "Do you also want the whole system checked (connections, inverter, batteries)?",
    kind: "choice",
    options: [
      { id: "yes", label: "Yes" },
      { id: "no", label: "No" },
    ],
  },

  // Branch E system upgrade or expansion
  e_upgrade: {
    question: "What do you want to upgrade?",
    kind: "choice",
    options: [
      { id: "more-panels", label: "Add more panels" },
      { id: "inverter-capacity", label: "Increase inverter capacity" },
      { id: "more-batteries", label: "Add more batteries" },
      { id: "to-lithium", label: "Change from tubular to lithium" },
      { id: "full-upgrade", label: "Full system upgrade" },
    ],
  },
  e_current: {
    question: "What is the current inverter size and battery bank?",
    kind: "text",
    placeholder: "e.g. 3.5kVA inverter, 4 tubular batteries",
  },
  e_load: {
    question: "What additional load do you want to support?",
    kind: "text",
    placeholder: "e.g. Add a fridge and freezer",
  },

  // Branch F something else / not sure
  f_describe: {
    question:
      "Please describe the solar issue or what you want in your own words.",
    kind: "text",
    placeholder: "Describe the solar issue…",
  },
  f_location: {
    question: "Is it for house, shop, church, factory, or another location?",
    kind: "choice",
    options: [
      { id: "house", label: "House" },
      { id: "shop", label: "Shop" },
      { id: "church", label: "Church" },
      { id: "factory", label: "Factory" },
      { id: "other", label: "Other" },
    ],
  },
};

const START_NEXT: Record<string, string> = {
  A: "a_property",
  B: "b_problem",
  C: "c_which",
  D: "d_count",
  E: "e_upgrade",
  F: "f_describe",
};

export function solarScreen(id: string): SolarScreen | undefined {
  return SOLAR_SCREENS[id];
}

/** Advance helper for the choice rows; returns the next screen id or "final". */
export function nextSolarScreen(
  current: string,
  _answerId: string,
  _answers: Record<string, string>,
): string {
  const map: Record<string, string> = {
    a_property: "a_power",
    a_power: "a_system",
    a_system: "a_equipment",
    a_equipment: "a_supply",
    a_supply: "a_roof",
    a_roof: "final",

    b_problem: "b_age",
    b_age: "b_inverter",
    b_inverter: "b_warranty",
    b_warranty: "confirm",

    c_which: "c_symptom",
    c_symptom: "c_type",
    c_type: "c_bank",
    c_bank: "confirm",

    d_count: "d_last",
    d_last: "d_condition",
    d_condition: "d_check",
    d_check: "final",

    e_upgrade: "e_current",
    e_current: "e_load",
    e_load: "final",

    f_describe: "f_location",
    f_location: "confirm",
  };
  if (current === "machine") {
    return "start";
  }
  if (current === "start") {
    return START_NEXT[_answerId] ?? "final";
  }
  return map[current] ?? "final";
}

/**
 * Solar is capture-only except where the problem is clearly pure electrical
 * (wiring / distribution board / inverter electronics) branches B, C and F
 * end with a confirm card offering Electric. No other trade links.
 */
export function resolveSolarRoute(answers: Record<string, string>): SolarRoute {
  const stay = (): SolarRoute => ({
    trade: "solar",
    needsConfirm: false,
  });
  const leave = (trade: ProService, alternate?: ProService): SolarRoute => ({
    trade,
    alternate,
    needsConfirm: trade !== "solar" || Boolean(alternate),
  });

  const main = answers.start;
  if (main === "B" || main === "C" || main === "F") {
    return leave("electrical", "solar");
  }
  return stay();
}

export function applyConfirmChoice(
  route: SolarRoute,
  yes: boolean,
): ProService {
  if (yes) return route.trade;
  if (route.alternate) return route.alternate;
  return "solar";
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

export function canAdvanceText(value: string): boolean {
  return value.trim().length > 0;
}

export function canFindSolarPro(photoCount: number): boolean {
  return photoCount >= SOLAR_MIN_PHOTOS;
}

export function composeSolarProblem(
  answers: Record<string, string>,
  extra: string,
  landmark: string,
): string {
  const lines: string[] = [];
  const machineLabel = answers.machine_label || answers.machine || "";
  if (machineLabel) {
    lines.push(`${SOLAR_MACHINE_QUESTION} ${machineLabel}`);
  }
  const startLabel = answers.start_label || answers.start || "";
  lines.push(`Solar work: ${startLabel} (${SOLAR_START_QUESTION})`);
  const orderedIds = [
    "a_property",
    "a_power",
    "a_system",
    "a_equipment",
    "a_supply",
    "a_roof",
    "b_problem",
    "b_age",
    "b_inverter",
    "b_warranty",
    "c_which",
    "c_symptom",
    "c_type",
    "c_bank",
    "d_count",
    "d_last",
    "d_condition",
    "d_check",
    "e_upgrade",
    "e_current",
    "e_load",
    "f_describe",
    "f_location",
  ];
  for (const id of orderedIds) {
    const value = answers[`${id}_label`] || answers[id];
    if (!value) continue;
    const screen = SOLAR_SCREENS[id];
    if (!screen) continue;
    lines.push(`${screen.question} ${value}`);
  }
  if (landmark.trim()) lines.push(`Location: ${landmark.trim()}`);
  if (extra.trim()) lines.push(`Extra: ${extra.trim()}`);
  return lines.join("\n");
}

export function solarBreadcrumb(stack: string[]): string {
  const step = stack[stack.length - 1];
  if (!step || step === "start" || step === "machine") return "Solar";
  if (step === "final") return "Solar · Send";
  return `Solar · ${step.charAt(0).toUpperCase()}`;
}
