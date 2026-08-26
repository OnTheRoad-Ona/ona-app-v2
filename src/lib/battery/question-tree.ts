import type { ProService } from "@/lib/types";
import { qaLinesForPath } from "@/lib/help-flow-progress";

export const BATTERY_START_QUESTION =
  "What is the main battery or starting problem you are experiencing?";

export const BATTERY_FINAL_COPY = {
  urgency: "Urgency",
  normal: "Normal",
  emergency: "Emergency",
  remote: "Remote location",
  night: "Night service needed",
  photos:
    "Add clear photos (at most 4) of the battery, terminals, and dashboard",
  voice: "Record a short voice note describing the problem",
  location: "Current Location",
  extra: "Any other detail you want the technician to know?",
  diagnosis: "Likely problem",
  tow: "Do you need the vehicle towed to a safer place or workshop?",
} as const;

export const BATTERY_MIN_PHOTOS = 0;
export const BATTERY_MAX_PHOTOS = 4;

export type BatteryScreenKind = "choice" | "text";

export type BatteryOption = {
  id: string;
  label: string;
};

export type BatteryScreen = {
  id: string;
  question: string;
  kind: BatteryScreenKind;
  options?: BatteryOption[];
  placeholder?: string;
};

export type BatteryRoute = {
  trade: ProService;
  alternate?: ProService;
  needsConfirm: boolean;
  diagnosis?: string;
};

export const BATTERY_START_OPTIONS: BatteryOption[] = [
  {
    id: "A",
    label: "Vehicle is completely dead (no lights, no sound)",
  },
  {
    id: "B",
    label: "Lights come on but engine does not crank",
  },
  {
    id: "C",
    label: "Engine cranks very slowly or weakly",
  },
  {
    id: "D",
    label: "Battery keeps going flat / needs frequent jump-starts",
  },
  { id: "E", label: "Need battery testing or replacement" },
  {
    id: "F",
    label: "Battery warning light is on while driving",
  },
  { id: "G", label: "Something else / I'm not sure" },
  {
    id: "H",
    label: "Electric vehicle (EV) battery problem",
  },
];

const YES_NO: BatteryOption[] = [
  { id: "yes", label: "Yes" },
  { id: "no", label: "No" },
];

const YES_NO_UNSURE: BatteryOption[] = [
  { id: "yes", label: "Yes" },
  { id: "no", label: "No" },
  { id: "unsure", label: "I'm not sure" },
];

export const BATTERY_SCREENS: Record<string, BatteryScreen> = {
  start: {
    id: "start",
    question: BATTERY_START_QUESTION,
    kind: "choice",
    options: BATTERY_START_OPTIONS,
  },
  a_sudden: {
    id: "a_sudden",
    question:
      "Did this happen suddenly or after the vehicle was parked for a long time?",
    kind: "choice",
    options: [
      { id: "suddenly", label: "Suddenly" },
      {
        id: "parked_long",
        label: "After the vehicle was parked for a long time",
      },
    ],
  },
  a_lefton: {
    id: "a_lefton",
    question: "Were any lights or accessories left on?",
    kind: "choice",
    options: YES_NO,
  },
  a_jump: {
    id: "a_jump",
    question: "Have you tried jump-starting it before?",
    kind: "choice",
    options: YES_NO,
  },
  a_terminals: {
    id: "a_terminals",
    question:
      "Are the battery terminals clean and tight (if you can check safely)?",
    kind: "choice",
    options: [
      { id: "yes", label: "Yes, clean and tight" },
      { id: "no", label: "No, corroded or loose" },
      { id: "cant_check", label: "Can't check" },
    ],
  },
  a_safe: {
    id: "a_safe",
    question: "Is the vehicle in a safe location?",
    kind: "choice",
    options: YES_NO,
  },
  b_click: {
    id: "b_click",
    question:
      "Do you hear any clicking sound when you turn the key / press start?",
    kind: "choice",
    options: [
      { id: "rapid", label: "Yes, rapid clicking" },
      { id: "one_click", label: "One click, then nothing" },
      { id: "none", label: "No sound at all" },
    ],
  },
  b_bright: {
    id: "b_bright",
    question: "Are the headlights bright or dim?",
    kind: "choice",
    options: [
      { id: "bright", label: "Bright" },
      { id: "dim", label: "Dim" },
      { id: "unsure", label: "Don't know" },
    ],
  },
  b_recent: {
    id: "b_recent",
    question: "Did this start after a recent battery or electrical work?",
    kind: "choice",
    options: YES_NO,
  },
  b_safe: {
    id: "b_safe",
    question: "Is the vehicle in a safe location?",
    kind: "choice",
    options: YES_NO,
  },
  c_howlong: {
    id: "c_howlong",
    question: "How long has this weak cranking been happening?",
    kind: "choice",
    options: [
      { id: "today", label: "Just started today" },
      { id: "days", label: "A few days" },
      { id: "weeks", label: "Weeks or more" },
      { id: "unsure", label: "Don't know" },
    ],
  },
  c_eventual: {
    id: "c_eventual",
    question: "Does it eventually start or does it fail completely?",
    kind: "choice",
    options: [
      { id: "eventually", label: "Eventually starts" },
      { id: "fails", label: "Fails completely" },
      { id: "sometimes", label: "Sometimes starts" },
    ],
  },
  c_idle: {
    id: "c_idle",
    question: "Any recent long periods of not driving the vehicle?",
    kind: "choice",
    options: YES_NO,
  },
  c_age: {
    id: "c_age",
    question: "Battery age (if known)?",
    kind: "choice",
    options: [
      { id: "under_1", label: "Under 1 year" },
      { id: "1_2", label: "1-2 years" },
      { id: "3_4", label: "3-4 years" },
      { id: "over_4", label: "Over 4 years" },
      { id: "unsure", label: "Don't know" },
    ],
  },
  d_often: {
    id: "d_often",
    question: "How often does the battery go flat?",
    kind: "choice",
    options: [
      { id: "every_few_days", label: "Every few days" },
      { id: "weekly", label: "About once a week" },
      { id: "monthly", label: "Once a month or less" },
      { id: "overnight", label: "After sitting overnight" },
    ],
  },
  d_lefton: {
    id: "d_lefton",
    question: "Do you leave lights, radio, or chargers on?",
    kind: "choice",
    options: [
      { id: "yes", label: "Yes" },
      { id: "no", label: "No" },
      { id: "sometimes", label: "Sometimes" },
    ],
  },
  d_warning: {
    id: "d_warning",
    question: "Does the battery warning light come on while driving?",
    kind: "choice",
    options: YES_NO,
  },
  d_altchecked: {
    id: "d_altchecked",
    question: "Has the alternator or charging system been checked before?",
    kind: "choice",
    options: [
      { id: "checked", label: "Yes, checked" },
      { id: "never", label: "No, never" },
      { id: "unsure", label: "I'm not sure" },
    ],
  },
  e_suspect: {
    id: "e_suspect",
    question: "Do you already suspect the battery is bad?",
    kind: "choice",
    options: [
      { id: "definitely", label: "Yes, definitely" },
      { id: "maybe", label: "Maybe" },
      { id: "no", label: "No" },
    ],
  },
  e_test_first: {
    id: "e_test_first",
    question:
      "Do you want the technician to test it first or supply a new battery?",
    kind: "choice",
    options: [
      { id: "test", label: "Test it first" },
      { id: "supply", label: "Supply a new battery" },
      { id: "unsure", label: "I'm not sure" },
    ],
  },
  e_brand: {
    id: "e_brand",
    question: "Preferred battery type or brand (if any)?",
    kind: "text",
    placeholder: "Preferred battery type or brand (if any)?",
  },
  f_sudden: {
    id: "f_sudden",
    question: "Did the light come on suddenly or gradually?",
    kind: "choice",
    options: [
      { id: "suddenly", label: "Suddenly" },
      { id: "gradually", label: "Gradually" },
    ],
  },
  f_dim: {
    id: "f_dim",
    question: "Are the headlights or dashboard lights becoming dim?",
    kind: "choice",
    options: YES_NO_UNSURE,
  },
  f_stall: {
    id: "f_stall",
    question: "Has the vehicle stalled or lost power recently?",
    kind: "choice",
    options: YES_NO,
  },
  f_smell: {
    id: "f_smell",
    question: "Any unusual smell or noise from the engine bay?",
    kind: "choice",
    options: YES_NO_UNSURE,
  },
  g_describe: {
    id: "g_describe",
    question: "Please describe in your own words what is happening.",
    kind: "text",
    placeholder: "Please describe in your own words what is happening.",
  },
  g_related: {
    id: "g_related",
    question: "Is it related to:",
    kind: "choice",
    options: [
      { id: "engine", label: "Engine or mechanical problem" },
      { id: "tyre", label: "Tyre or wheel problem" },
      { id: "towing", label: "Vehicle cannot move and needs towing" },
      { id: "body", label: "Body damage or accident" },
      { id: "ac", label: "Air conditioning" },
      { id: "electrical", label: "Wiring, lights, or other electrical issues" },
      { id: "power", label: "Power at home or shop" },
      { id: "house", label: "House repair" },
      { id: "clothing", label: "Clothing" },
      { id: "battery", label: "Still battery / starting related" },
    ],
  },
  g_power: {
    id: "g_power",
    question: "Power at home or shop",
    kind: "choice",
    options: [
      { id: "generator", label: "Generator" },
      { id: "solar", label: "Solar" },
    ],
  },
  g_house: {
    id: "g_house",
    question: "House repair",
    kind: "choice",
    options: [
      { id: "carpenter", label: "Carpenter" },
      { id: "plumber", label: "Plumber" },
      { id: "painter", label: "Painter" },
    ],
  },
  ev_type: {
    id: "ev_type",
    question: "Which EV battery issue?",
    kind: "choice",
    options: [
      {
        id: "12v",
        label: "12V auxiliary battery (won't start / go into ready)",
      },
      { id: "hv", label: "High-voltage (HV) battery / range problem" },
      { id: "charging", label: "Charging problem / won't charge" },
      { id: "unsure", label: "I'm not sure" },
    ],
  },
  ev_safe: {
    id: "ev_safe",
    question: "Is the vehicle in a safe location?",
    kind: "choice",
    options: YES_NO,
  },
};

const START_NEXT: Record<string, string> = {
  A: "a_sudden",
  B: "b_click",
  C: "c_howlong",
  D: "d_often",
  E: "e_suspect",
  F: "f_sudden",
  G: "g_describe",
  H: "ev_type",
};

function resolveScreen(answers: Record<string, string>): "confirm" | "final" {
  return resolveBatteryRoute(answers).needsConfirm ? "confirm" : "final";
}

export function batteryScreen(id: string): BatteryScreen | undefined {
  return BATTERY_SCREENS[id];
}

export function nextBatteryScreen(
  current: string,
  answerId: string,
  answers: Record<string, string>,
): string {
  if (current === "start") return START_NEXT[answerId] || "g_describe";

  if (current === "a_sudden") return "a_lefton";
  if (current === "a_lefton") return "a_jump";
  if (current === "a_jump") return "a_terminals";
  if (current === "a_terminals") return "a_safe";
  if (current === "a_safe") return resolveScreen(answers);

  if (current === "b_click") return "b_bright";
  if (current === "b_bright") return "b_recent";
  if (current === "b_recent") return "b_safe";
  if (current === "b_safe") return resolveScreen(answers);

  if (current === "c_howlong") return "c_eventual";
  if (current === "c_eventual") return "c_idle";
  if (current === "c_idle") return "c_age";
  if (current === "c_age") return resolveScreen(answers);

  if (current === "d_often") return "d_lefton";
  if (current === "d_lefton") return "d_warning";
  if (current === "d_warning") return "d_altchecked";
  if (current === "d_altchecked") return resolveScreen(answers);

  if (current === "e_suspect") return "e_test_first";
  if (current === "e_test_first") return "e_brand";
  if (current === "e_brand") return resolveScreen(answers);

  if (current === "f_sudden") return "f_dim";
  if (current === "f_dim") return "f_stall";
  if (current === "f_stall") return "f_smell";
  if (current === "f_smell") return resolveScreen(answers);

  if (current === "g_describe") return "g_related";
  if (current === "g_related") {
    if (answerId === "power") return "g_power";
    if (answerId === "house") return "g_house";
    return resolveScreen(answers);
  }
  if (current === "g_power" || current === "g_house") {
    return resolveScreen(answers);
  }

  if (current === "ev_type") return "ev_safe";
  if (current === "ev_safe") return resolveScreen(answers);

  return "final";
}

/**
 * Narrow the battery answers down to the most likely problem so the pro
 * arrives with the real issue already identified.
 */
export function batteryDiagnosis(
  answers: Record<string, string>,
): string | undefined {
  const main = answers.start;

  if (main === "A") {
    if (answers.a_terminals === "no") {
      return "Likely corroded or loose battery terminals";
    }
    return "Likely a dead or weak battery";
  }

  if (main === "B") {
    if (answers.b_recent === "yes") {
      return "Likely an electrical fault rather than the battery";
    }
    return "Likely a weak battery";
  }

  if (main === "C") return "Likely a weak or failing battery";

  if (main === "D") {
    if (answers.d_warning === "yes") {
      return "Likely a charging-system (alternator) fault";
    }
    return "Likely a battery that no longer holds a charge";
  }

  if (main === "E") return "Battery needs testing or replacement";

  if (main === "F") return "Likely a charging-system fault";

  if (main === "H") {
    if (answers.ev_type === "12v") {
      return "Likely a dead EV 12V auxiliary battery (won't go into ready)";
    }
    if (answers.ev_type === "hv") {
      return "Likely an EV high-voltage (HV) battery or range fault";
    }
    if (answers.ev_type === "charging") {
      return "Likely an EV charging fault (charger, cable, or charge port)";
    }
    return "EV battery problem (customer described)";
  }

  return undefined;
}

/**
 * Pick the trade from the filled answers. Dangerous locations always route to
 * Tow first. Cross-trade forks pick the stronger one first with a confirm card;
 * staying on Battery is seamless.
 */
export function resolveBatteryRoute(
  answers: Record<string, string>,
): BatteryRoute {
  const diagnosis = batteryDiagnosis(answers);
  const stay = (): BatteryRoute => ({
    trade: "battery",
    needsConfirm: false,
    diagnosis,
  });
  const leave = (trade: ProService, alternate?: ProService): BatteryRoute => ({
    trade,
    alternate,
    needsConfirm: trade !== "battery" || Boolean(alternate),
    diagnosis,
  });

  if (answers.a_safe === "no" || answers.b_safe === "no") {
    return leave("towing");
  }

  const main = answers.start;

  if (main === "A") {
    // Corroded / loose terminals: also offer Electrical (wiring check).
    if (answers.a_terminals === "no") return leave("battery", "electrical");
    return stay();
  }

  if (main === "B") {
    // Persistent clicking or no response after a new battery → not the battery.
    if (answers.b_recent === "yes") return leave("electrical", "battery");
    return stay();
  }

  if (main === "C") return stay();

  if (main === "D") {
    // Charging system problem (warning light while driving) → Electric first.
    if (answers.d_warning === "yes") return leave("electrical", "battery");
    return stay();
  }

  if (main === "E") return stay();

  if (main === "F") return leave("electrical", "battery");

  if (main === "G") {
    if (answers.g_related === "engine") return leave("mechanic");
    if (answers.g_related === "tyre") return leave("vulcanizer");
    if (answers.g_related === "towing") return leave("towing");
    if (answers.g_related === "body") return leave("body");
    if (answers.g_related === "ac") return leave("ac");
    if (answers.g_related === "electrical") return leave("electrical");
    if (answers.g_related === "power") {
      if (answers.g_power === "solar") return leave("solar");
      return leave("generator");
    }
    if (answers.g_related === "house") {
      if (answers.g_house === "plumber") return leave("plumber");
      if (answers.g_house === "painter") return leave("painter");
      return leave("carpenter");
    }
    if (answers.g_related === "clothing") return leave("fashion");
    return stay();
  }

  if (main === "H") {
    if (answers.ev_type === "charging") return leave("electrical", "battery");
    if (answers.ev_type === "hv") return stay();
    if (answers.ev_type === "12v") return stay();
    return stay();
  }

  return stay();
}

export function applyConfirmChoice(
  route: BatteryRoute,
  yes: boolean,
): ProService {
  if (yes) return route.trade;
  if (route.alternate) return route.alternate;
  return "battery";
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

export function composeBatteryProblem(
  answers: Record<string, string>,
  extra: string,
  landmark: string,
): string {
  const lines = qaLinesForPath({
    answers,
    next: nextBatteryScreen,
    screenOf: batteryScreen,
  });

  if (landmark.trim()) {
    lines.push(BATTERY_FINAL_COPY.location);
    lines.push(landmark.trim());
  }
  if (extra.trim()) {
    lines.push(BATTERY_FINAL_COPY.extra);
    lines.push(extra.trim());
  }
  const diagnosis = batteryDiagnosis(answers);
  if (diagnosis) {
    lines.push(BATTERY_FINAL_COPY.diagnosis);
    lines.push(diagnosis);
  }
  return lines.filter(Boolean).join("\n");
}

export function canAdvanceText(value: string): boolean {
  return value.trim().length >= 2;
}

export function canFindBatteryPro(photoCount: number): boolean {
  return photoCount >= BATTERY_MIN_PHOTOS;
}

export function batteryBreadcrumb(stack: string[]): string {
  const bits: string[] = ["Battery"];
  if (stack.length > 1) {
    const firstBranch = stack[1];
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
