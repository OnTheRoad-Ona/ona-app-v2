/** Deep cascading question flow for the Plumber trade. */

export const PLUMBER_START_QUESTION =
  "What is the main plumbing problem you are experiencing?";

export const PLUMBER_MIN_PHOTOS = 2;
export const PLUMBER_MAX_PHOTOS = 4;

export interface PlumberOption {
  id: string;
  label: string;
  hint?: string;
}

export interface PlumberScreen {
  question: string;
  kind: "choice" | "text";
  options?: PlumberOption[];
  placeholder?: string;
}

export const PLUMBER_START_OPTIONS: PlumberOption[] = [
  { id: "A", label: "No water or very low water pressure" },
  { id: "B", label: "Water leakage" },
  { id: "C", label: "Blocked drain, sink, or toilet" },
  { id: "D", label: "Faulty or damaged tap / shower / mixer" },
  { id: "E", label: "Water heater / geyser problem" },
  { id: "F", label: "Toilet flushing problem" },
  { id: "G", label: "New installation or complete plumbing work" },
  { id: "H", label: "Something else / I’m not sure" },
];

export const PLUMBER_FINAL_COPY = {
  urgency: "How urgent is the plumbing problem?",
  normal: "Normal",
  emergency: "Emergency",
  remote: "Remote location",
  night: "Night service needed",
  photos:
    "Add clear photos of the affected area, leaking point, or blocked section (2-4)",
  voice: "Record a short voice note describing the problem",
  location: "Exact location / landmark",
  property: "Type of property (house, flat, shop, office, or other)?",
  extra: "Any other detail you want the plumber to know?",
};

export const PLUMBER_PROPERTY_OPTIONS: PlumberOption[] = [
  { id: "house", label: "House" },
  { id: "flat", label: "Flat" },
  { id: "shop", label: "Shop" },
  { id: "office", label: "Office" },
  { id: "other", label: "Other" },
];

export const PLUMBER_SCREENS: Record<string, PlumberScreen> = {
  start: {
    question: PLUMBER_START_QUESTION,
    kind: "choice",
    options: PLUMBER_START_OPTIONS,
  },

  // Branch A no water or very low water pressure
  a_flow: {
    question: "Is there completely no water, or is the pressure just very low?",
    kind: "choice",
    options: [
      { id: "completely-none", label: "Completely no water" },
      { id: "very-low", label: "Pressure is just very low" },
      { id: "both", label: "Both / it changes" },
      { id: "not-sure", label: "I'm not sure" },
    ],
  },
  a_area: {
    question:
      "Is the problem affecting the whole house or only certain areas (kitchen, bathroom, upstairs, etc.)?",
    kind: "choice",
    options: [
      { id: "whole-house", label: "Whole house" },
      { id: "certain-areas", label: "Only certain areas" },
      { id: "not-sure", label: "I'm not sure" },
    ],
  },
  a_supply: {
    question: "Do you use a borehole, well, or public water supply?",
    kind: "choice",
    options: [
      { id: "borehole", label: "Borehole" },
      { id: "well", label: "Well" },
      { id: "public", label: "Public water supply" },
      { id: "not-sure", label: "I'm not sure" },
    ],
  },
  a_tank: {
    question: "Do you have an overhead tank or pressure pump?",
    kind: "choice",
    options: [
      { id: "overhead-tank", label: "Overhead tank" },
      { id: "pressure-pump", label: "Pressure pump" },
      { id: "both", label: "Both" },
      { id: "neither", label: "Neither" },
    ],
  },
  a_started: {
    question: "When did the problem start?",
    kind: "text",
    placeholder: "e.g. Since yesterday morning",
  },

  // Branch B water leakage
  b_source: {
    question: "Where is the leakage coming from?",
    kind: "choice",
    options: [
      { id: "tap-mixer", label: "Tap or mixer" },
      { id: "pipe", label: "Pipe (visible or inside wall/ceiling)" },
      { id: "cistern-base", label: "Toilet cistern or base" },
      { id: "water-heater", label: "Water heater" },
      { id: "tank-underground", label: "Overhead tank or underground pipe" },
      { id: "other", label: "Other" },
    ],
  },
  b_flow: {
    question: "Is the leak slow dripping or strong flowing?",
    kind: "choice",
    options: [
      { id: "slow-dripping", label: "Slow dripping" },
      { id: "strong-flowing", label: "Strong flowing" },
      { id: "not-sure", label: "I'm not sure" },
    ],
  },
  b_damage: {
    question: "Is water currently damaging the floor, wall, or ceiling?",
    kind: "choice",
    options: [
      { id: "yes", label: "Yes" },
      { id: "no", label: "No" },
      { id: "not-sure", label: "I'm not sure" },
    ],
  },
  b_exact: {
    question: "Can you see the exact source of the leak?",
    kind: "choice",
    options: [
      { id: "yes", label: "Yes" },
      { id: "no", label: "No" },
    ],
  },

  // Branch C blocked drain, sink, or toilet
  c_blocked: {
    question: "What is blocked?",
    kind: "choice",
    options: [
      { id: "kitchen-sink", label: "Kitchen sink" },
      { id: "bathroom-sink", label: "Bathroom sink" },
      { id: "shower-drain", label: "Shower drain" },
      { id: "toilet", label: "Toilet" },
      { id: "floor-drain", label: "Floor drain / gully" },
      { id: "outdoor-drain", label: "Main outdoor drain" },
    ],
  },
  c_backup: {
    question: "Is water backing up or overflowing?",
    kind: "choice",
    options: [
      { id: "backing-up", label: "Water is backing up" },
      { id: "overflowing", label: "Water is overflowing" },
      { id: "no", label: "No" },
      { id: "not-sure", label: "I'm not sure" },
    ],
  },
  c_tried: {
    question:
      "Have you already tried any chemical or local method to clear it?",
    kind: "choice",
    options: [
      { id: "yes-chemical", label: "Yes, chemicals" },
      { id: "yes-local", label: "Yes, a local method" },
      { id: "no", label: "No" },
      { id: "not-sure", label: "I'm not sure" },
    ],
  },
  c_howlong: {
    question: "How long has it been blocked?",
    kind: "text",
    placeholder: "e.g. Since last night",
  },

  // Branch D faulty or damaged tap / shower / mixer
  d_what: {
    question: "What exactly is wrong?",
    kind: "choice",
    options: [
      { id: "tap-leaking", label: "Tap is leaking" },
      { id: "tap-loose-broken", label: "Tap is loose or broken" },
      { id: "tap-no-water", label: "No water coming out of the tap" },
      { id: "shower-not-working", label: "Shower not working properly" },
      {
        id: "mixer-hot-cold",
        label: "Mixer not controlling hot/cold correctly",
      },
    ],
  },
  d_mount: {
    question: "Is it a wall-mounted, standing, or sensor tap?",
    kind: "choice",
    options: [
      { id: "wall-mounted", label: "Wall-mounted" },
      { id: "standing", label: "Standing" },
      { id: "sensor", label: "Sensor tap" },
      { id: "not-sure", label: "I'm not sure" },
    ],
  },
  d_fix: {
    question: "Do you want repair or complete replacement?",
    kind: "choice",
    options: [
      { id: "repair", label: "Repair" },
      { id: "replacement", label: "Complete replacement" },
      { id: "not-sure", label: "I'm not sure" },
    ],
  },

  // Branch E water heater / geyser problem
  e_issue: {
    question: "What is the issue?",
    kind: "choice",
    options: [
      { id: "not-heating", label: "Not heating at all" },
      { id: "heating-slowly", label: "Heating too slowly" },
      { id: "leaking", label: "Leaking" },
      { id: "unusual-noise", label: "Making unusual noise" },
      { id: "tripping-dead", label: "Tripping electricity or completely dead" },
    ],
  },
  e_type: {
    question: "Is it an electric geyser, gas geyser, or solar water heater?",
    kind: "choice",
    options: [
      { id: "electric", label: "Electric geyser" },
      { id: "gas", label: "Gas geyser" },
      { id: "solar", label: "Solar water heater" },
      { id: "not-sure", label: "I'm not sure" },
    ],
  },
  e_age: {
    question: "How old is the unit (if known)?",
    kind: "text",
    placeholder: "e.g. About 3 years old",
  },

  // Branch F toilet flushing problem
  f_happening: {
    question: "What is happening?",
    kind: "choice",
    options: [
      { id: "not-flushing", label: "Toilet not flushing at all" },
      { id: "weak-flush", label: "Weak flush" },
      {
        id: "cistern-running",
        label: "Continuous running water in the cistern",
      },
      { id: "cistern-leaking", label: "Cistern leaking" },
      { id: "handle-broken", label: "Handle or button broken" },
    ],
  },
  f_cistern: {
    question: "Is it a wash-down, dual-flush, or old-style cistern?",
    kind: "choice",
    options: [
      { id: "wash-down", label: "Wash-down" },
      { id: "dual-flush", label: "Dual-flush" },
      { id: "old-style", label: "Old-style cistern" },
      { id: "not-sure", label: "I'm not sure" },
    ],
  },

  // Branch G new installation or complete plumbing work
  g_install: {
    question: "What do you need installed or done?",
    kind: "choice",
    options: [
      { id: "tap-sink-shower", label: "New tap, sink, or shower" },
      { id: "full-bathroom", label: "Complete bathroom plumbing" },
      { id: "kitchen", label: "Kitchen plumbing" },
      { id: "overhead-tank-pipes", label: "Overhead tank and piping" },
      {
        id: "borehole-pump",
        label: "Borehole connection or pump installation",
      },
      { id: "full-repipe", label: "Full house re-piping" },
    ],
  },
  g_building: {
    question: "Is the building new, under renovation, or existing?",
    kind: "choice",
    options: [
      { id: "new", label: "New" },
      { id: "renovation", label: "Under renovation" },
      { id: "existing", label: "Existing" },
      { id: "not-sure", label: "I'm not sure" },
    ],
  },

  // Branch H something else / not sure
  h_describe: {
    question: "Please describe the plumbing problem in your own words.",
    kind: "text",
    placeholder: "Describe what you’re experiencing…",
  },
  h_area: {
    question: "Which area of the house or property is affected?",
    kind: "text",
    placeholder: "e.g. Upstairs bathroom",
  },
};

const START_NEXT: Record<string, string> = {
  A: "a_flow",
  B: "b_source",
  C: "c_blocked",
  D: "d_what",
  E: "e_issue",
  F: "f_happening",
  G: "g_install",
  H: "h_describe",
};

export function plumberScreen(id: string): PlumberScreen | undefined {
  return PLUMBER_SCREENS[id];
}

/** Advance helper for the choice rows; returns the next screen id or "final". */
export function nextPlumberScreen(
  current: string,
  _answerId: string,
  _answers: Record<string, string>,
): string {
  const map: Record<string, string> = {
    a_flow: "a_area",
    a_area: "a_supply",
    a_supply: "a_tank",
    a_tank: "a_started",
    a_started: "final",

    b_source: "b_flow",
    b_flow: "b_damage",
    b_damage: "b_exact",
    b_exact: "final",

    c_blocked: "c_backup",
    c_backup: "c_tried",
    c_tried: "c_howlong",
    c_howlong: "final",

    d_what: "d_mount",
    d_mount: "d_fix",
    d_fix: "final",

    e_issue: "e_type",
    e_type: "e_age",
    e_age: "final",

    f_happening: "f_cistern",
    f_cistern: "final",

    g_install: "g_building",
    g_building: "final",

    h_describe: "h_area",
    h_area: "final",
  };
  if (current === "start") {
    return START_NEXT[_answerId] ?? "final";
  }
  return map[current] ?? "final";
}

/**
 * Strictly plumbing: the flow is capture-only and always dispatches as
 * "plumber" no confirm cards, no reroute to any other service.
 */
export function resolvePlumberRoute(_answers: Record<string, string>): {
  trade: "plumber";
  needsConfirm: false;
} {
  return { trade: "plumber", needsConfirm: false };
}

export function canAdvanceText(value: string): boolean {
  return value.trim().length > 0;
}

export function canFindPlumberPro(photoCount: number): boolean {
  return photoCount >= PLUMBER_MIN_PHOTOS;
}

export function composePlumberProblem(
  answers: Record<string, string>,
  extra: string,
  landmark: string,
): string {
  const lines: string[] = [];
  const startLabel = answers.start_label || answers.start || "";
  lines.push(`Problem: ${startLabel} (${PLUMBER_START_QUESTION})`);
  const orderedIds = [
    "a_flow",
    "a_area",
    "a_supply",
    "a_tank",
    "a_started",
    "b_source",
    "b_flow",
    "b_damage",
    "b_exact",
    "c_blocked",
    "c_backup",
    "c_tried",
    "c_howlong",
    "d_what",
    "d_mount",
    "d_fix",
    "e_issue",
    "e_type",
    "e_age",
    "f_happening",
    "f_cistern",
    "g_install",
    "g_building",
    "h_describe",
    "h_area",
  ];
  for (const id of orderedIds) {
    const value = answers[`${id}_label`] || answers[id];
    if (!value) continue;
    const screen = PLUMBER_SCREENS[id];
    if (!screen) continue;
    lines.push(`${screen.question} ${value}`);
  }
  if (landmark.trim()) lines.push(`Location: ${landmark.trim()}`);
  if (extra.trim()) lines.push(`Extra: ${extra.trim()}`);
  return lines.join("\n");
}

export function plumberBreadcrumb(stack: string[]): string {
  const step = stack[stack.length - 1];
  if (!step || step === "start") return "Plumber";
  if (step === "final") return "Plumber · Send";
  return `Plumber · ${step.charAt(0).toUpperCase()}`;
}
