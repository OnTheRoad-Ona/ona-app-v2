import type { ProService } from "@/lib/types";

export const GEN_START_QUESTION = "What kind of generator work do you need?";

export const GEN_START_OPTIONS = [
  { id: "A", label: "New generator installation or purchase advice" },
  { id: "B", label: "Generator will not start" },
  { id: "C", label: "Generator starts but does not give power" },
  { id: "D", label: "Generator servicing or maintenance" },
  { id: "E", label: "Change-over switch or wiring problem" },
  {
    id: "F",
    label: "Generator overheating, smoking or making unusual noise",
  },
  { id: "G", label: "Something else / I'm not sure" },
] as const;

export interface GenScreen {
  kind: "choice" | "text";
  question: string;
  placeholder?: string;
  options?: { id: string; label: string }[];
}

export interface GenRoute {
  trade: ProService;
  alternate: ProService;
  needsConfirm: boolean;
}

export const GEN_SCREENS: Record<string, GenScreen> = {
  start: {
    kind: "choice",
    question: GEN_START_QUESTION,
    options: GEN_START_OPTIONS.map((o) => ({ id: o.id, label: o.label })),
  },

  // A – New generator installation or purchase advice
  a_property: {
    kind: "choice",
    question: "What type of property is it?",
    options: [
      { id: "residential", label: "Residential house / flat" },
      { id: "shop", label: "Shop / office" },
      { id: "church", label: "Church / mosque / school" },
      { id: "factory", label: "Factory / industrial" },
      { id: "other", label: "Other" },
    ],
  },
  a_power: {
    kind: "choice",
    question: "What do you want the generator to power?",
    options: [
      { id: "lights", label: "Lights and fans only" },
      { id: "lights-tv", label: "Lights, fans, TV and fridge" },
      {
        id: "full-house",
        label: "Full house (including A/C and pumping machine)",
      },
      { id: "shop", label: "Shop or office equipment" },
      { id: "heavy", label: "Heavy machines / industrial load" },
    ],
  },
  a_type: {
    kind: "choice",
    question: "Preferred type?",
    options: [
      { id: "petrol", label: "Petrol" },
      { id: "diesel", label: "Diesel" },
      { id: "advise", label: "I don't know - advise me" },
    ],
  },
  a_size: {
    kind: "choice",
    question: "Preferred size range (if known)?",
    options: [
      { id: "below-5", label: "Below 5kVA" },
      { id: "5-10", label: "5kVA - 10kVA" },
      { id: "10-20", label: "10kVA - 20kVA" },
      { id: "above-20", label: "Above 20kVA" },
      { id: "calculate", label: "I don't know - calculate for me" },
    ],
  },
  a_sound: {
    kind: "text",
    question: "Do you want soundproof or open type?",
    placeholder: "e.g. Soundproof for home use",
  },
  a_supply: {
    kind: "choice",
    question: "Who is supplying the generator?",
    options: [
      { id: "i-will", label: "I will buy it myself" },
      { id: "technician", label: "Technician should supply it" },
    ],
  },
  a_changeover: {
    kind: "text",
    question: "Do you need automatic change-over or manual change-over?",
    placeholder: "e.g. Automatic change-over",
  },

  // B – Generator will not start
  b_start: {
    kind: "choice",
    question: "What happens when you try to start it?",
    options: [
      { id: "dead", label: "Completely dead / no response" },
      { id: "cranks", label: "Cranks but does not start" },
      { id: "dies", label: "Starts then dies immediately" },
      { id: "hard", label: "Difficult to start (takes many tries)" },
    ],
  },
  b_type: {
    kind: "text",
    question: "Is it petrol or diesel?",
    placeholder: "e.g. Petrol",
  },
  b_service: {
    kind: "text",
    question: "When last was it serviced?",
    placeholder: "e.g. 3 months ago",
  },
  b_fuel: {
    kind: "text",
    question: "Is there fuel in the tank?",
    placeholder: "e.g. Yes, it is full",
  },
  b_work: {
    kind: "text",
    question: "Any recent work done on it?",
    placeholder: "e.g. No, nothing recently",
  },

  // C – Generator starts but does not give power
  c_output: {
    kind: "text",
    question: "Does the engine run normally but there is no electricity output?",
    placeholder: "e.g. Yes, engine runs fine but no power",
  },
  c_voltage: {
    kind: "text",
    question: "Is the voltage too low or fluctuating?",
    placeholder: "e.g. Lights flicker",
  },
  c_load: {
    kind: "text",
    question: "Does it only happen when you connect heavy load?",
    placeholder: "e.g. No, it fails even on small load",
  },
  c_changeover: {
    kind: "text",
    question: "Is the change-over switch working?",
    placeholder: "e.g. I think so",
  },

  // D – Generator servicing or maintenance
  d_service: {
    kind: "choice",
    question: "What kind of service do you need?",
    options: [
      { id: "normal", label: "Normal servicing (oil, filter, plug)" },
      { id: "overhaul", label: "Major overhaul" },
      { id: "make-work", label: "I don't know - just make it work well" },
    ],
  },
  d_last: {
    kind: "text",
    question: "How long has it been since the last service?",
    placeholder: "e.g. Over a year",
  },
  d_spec: {
    kind: "text",
    question: "Is it petrol or diesel and what is the size (kVA)?",
    placeholder: "e.g. Diesel 7.5kVA",
  },
  d_problem: {
    kind: "text",
    question:
      "Are you experiencing any specific problem (smoke, noise, high fuel consumption, etc.)?",
    placeholder: "e.g. Black smoke when loaded",
  },

  // E – Change-over switch or wiring problem
  e_issue: {
    kind: "choice",
    question: "What exactly is the issue?",
    options: [
      { id: "not-working", label: "Change-over not working" },
      { id: "manual-hard", label: "Manual change-over difficult to operate" },
      {
        id: "auto-detect",
        label: "Automatic change-over not detecting NEPA or generator",
      },
      { id: "wiring", label: "Wiring from generator to house/shop is faulty" },
      { id: "other", label: "Other" },
    ],
  },
  e_kind: {
    kind: "text",
    question: "Is it a manual or automatic change-over?",
    placeholder: "e.g. Automatic",
  },
  e_history: {
    kind: "text",
    question: "Was it working before or is this a new installation?",
    placeholder: "e.g. New installation",
  },

  // F – Generator overheating, smoking or making unusual noise
  f_happening: {
    kind: "choice",
    question: "What is happening?",
    options: [
      { id: "overheating", label: "Overheating" },
      { id: "smoke", label: "White / blue / black smoke" },
      { id: "knocking", label: "Unusual knocking or grinding noise" },
      { id: "vibration", label: "Excessive vibration" },
      { id: "other", label: "Other" },
    ],
  },
  f_when: {
    kind: "text",
    question:
      "Does it happen immediately after starting or after running for some time?",
    placeholder: "e.g. After running for 20 minutes",
  },
  f_oil: {
    kind: "text",
    question: "Is the oil level okay (if you have checked)?",
    placeholder: "e.g. Yes, oil level is fine",
  },

  // G – Something else / I'm not sure
  g_describe: {
    kind: "text",
    question: "Please describe the generator problem in your own words.",
    placeholder: "Describe what is happening",
  },
  g_location: {
    kind: "text",
    question: "Is it for house, shop, church, factory, or another location?",
    placeholder: "e.g. Shop",
  },
};

export const GEN_MIN_PHOTOS = 2;
export const GEN_MAX_PHOTOS = 4;

export const GEN_SUPPLY_OPTIONS = [
  { id: "i-will-supply", label: "I will supply parts / new generator" },
  { id: "technician-supplies", label: "Technician should supply" },
] as const;

export const GEN_FINAL_COPY = {
  urgency: "How urgent is this?",
  photos: "Add clear photos of the generator, control panel and change-over switch",
  voice: "Record a short voice note explaining the problem or the sound it is making",
  location: "Where should the technician come to?",
  extra: "Any other detail you want the technician to know?",
  size: "Generator size (kVA) and type (petrol/diesel) if known",
  supply: "Who is supplying parts or the new generator?",
  normal: "Normal",
  emergency: "Emergency",
  remote: "Remote location",
  night: "Night service needed",
} as const;

export function nextGeneratorScreen(
  step: string,
  _answer: string,
  _answers: Record<string, string>
): string {
  switch (step) {
    case "start":
      return _answer === "A"
        ? "a_property"
        : _answer === "B"
          ? "b_start"
          : _answer === "C"
            ? "c_output"
            : _answer === "D"
              ? "d_service"
              : _answer === "E"
                ? "e_issue"
                : _answer === "F"
                  ? "f_happening"
                  : "g_describe";
    case "a_property":
      return "a_power";
    case "a_power":
      return "a_type";
    case "a_type":
      return "a_size";
    case "a_size":
      return "a_sound";
    case "a_sound":
      return "a_supply";
    case "a_supply":
      return "a_changeover";
    case "a_changeover":
      return "final";

    case "b_start":
      return "b_type";
    case "b_type":
      return "b_service";
    case "b_service":
      return "b_fuel";
    case "b_fuel":
      return "b_work";
    case "b_work":
      return "confirm";

    case "c_output":
      return "c_voltage";
    case "c_voltage":
      return "c_load";
    case "c_load":
      return "c_changeover";
    case "c_changeover":
      return "confirm";

    case "d_service":
      return "d_last";
    case "d_last":
      return "d_spec";
    case "d_spec":
      return "d_problem";
    case "d_problem":
      return "final";

    case "e_issue":
      return "e_kind";
    case "e_kind":
      return "e_history";
    case "e_history":
      return "confirm";

    case "f_happening":
      return "f_when";
    case "f_when":
      return "f_oil";
    case "f_oil":
      return "final";

    case "g_describe":
      return "g_location";
    case "g_location":
      return "confirm";

    default:
      return "final";
  }
}

export function genScreen(id: string): GenScreen | undefined {
  return GEN_SCREENS[id];
}

export function canFindGeneratorPro(photoCount: number): boolean {
  return photoCount >= GEN_MIN_PHOTOS;
}

export function canAdvanceText(value: string): boolean {
  return value.trim().length > 0;
}

export function resolveGeneratorRoute(answers: Record<string, string>): GenRoute {
  const start = answers.start || "";
  const needsConfirm = ["B", "C", "E", "G"].includes(start);
  return needsConfirm
    ? { trade: "electrical", alternate: "generator", needsConfirm: true }
    : { trade: "generator", alternate: "generator", needsConfirm: false };
}

export function applyConfirmChoice(
  route: GenRoute,
  chooseAlternate: boolean
): ProService {
  return chooseAlternate ? route.trade : route.alternate;
}

export function confirmQuestion(trade: ProService): string {
  const name =
    trade === "electrical" ? "Electrical" : (trade.charAt(0).toUpperCase() + trade.slice(1));
  return `This sounds like ${name}. Continue?`;
}

export function composeGeneratorProblem(
  answers: Record<string, string>,
  extra: string,
  landmark: string
): string {
  const lines: string[] = [];
  const startLabel = answers.start_label || answers.start || "";
  lines.push(`Generator work: ${startLabel} (${GEN_START_QUESTION})`);
  const orderedIds = [
    "a_property",
    "a_power",
    "a_type",
    "a_size",
    "a_sound",
    "a_supply",
    "a_changeover",
    "b_start",
    "b_type",
    "b_service",
    "b_fuel",
    "b_work",
    "c_output",
    "c_voltage",
    "c_load",
    "c_changeover",
    "d_service",
    "d_last",
    "d_spec",
    "d_problem",
    "e_issue",
    "e_kind",
    "e_history",
    "f_happening",
    "f_when",
    "f_oil",
    "g_describe",
    "g_location",
  ];
  for (const id of orderedIds) {
    const value = answers[`${id}_label`] || answers[id];
    if (!value) continue;
    const screen = GEN_SCREENS[id];
    if (!screen) continue;
    lines.push(`${screen.question} ${value}`);
  }
  if (landmark.trim()) lines.push(`Location / landmark: ${landmark.trim()}`);
  if (extra.trim()) lines.push(`Extra detail: ${extra.trim()}`);
  return lines.join("\n");
}

export function generatorBreadcrumb(stack: string[]): string {
  const start = stack[0] === "start" ? (stack[1] || "") : "";
  const letter =
    start === "a_property"
      ? "A"
      : start === "b_start"
        ? "B"
        : start === "c_output"
          ? "C"
          : start === "d_service"
            ? "D"
            : start === "e_issue"
              ? "E"
              : start === "f_happening"
                ? "F"
                : start === "g_describe"
                  ? "G"
                  : "";
  const last = stack[stack.length - 1];
  if (last === "final") return letter ? `Generator · ${letter} · Send` : "Generator · Send";
  return letter ? `Generator · ${letter}` : "Generator";
}