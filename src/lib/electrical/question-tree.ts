import type { ProService } from "@/lib/types";

export const ELECTRICAL_START_QUESTION =
  "What type of electrical problem or service do you need?";

export const ELECTRICAL_FINAL_COPY = {
  urgency: "How urgent is this request?",
  normal: "Normal",
  emergency: "Emergency",
  remote: "Remote location",
  night: "Night service needed",
  photos:
    "Add clear photos of the affected area, distribution board, wires, or vehicle engine bay",
  voice: "Record a short voice note describing the problem or any noise/smell",
  location: "Where is the site or vehicle?",
  extra: "Any other detail you want the technician to know?",
  tow: "Do you need the vehicle towed, or is this a pure on-site electrical job?",
} as const;

export const ELECTRICAL_MIN_PHOTOS = 0;
export const ELECTRICAL_MAX_PHOTOS = 4;

export type ElectricalScreenKind = "choice" | "text";

export type ElectricalOption = {
  id: string;
  label: string;
};

export type ElectricalScreen = {
  id: string;
  question: string;
  kind: ElectricalScreenKind;
  options?: ElectricalOption[];
  placeholder?: string;
};

export type ElectricalRoute = {
  trade: ProService;
  needsConfirm: boolean;
};

export const ELECTRICAL_START_OPTIONS: ElectricalOption[] = [
  { id: "A", label: "Vehicle electrical issue" },
  { id: "B", label: "Residential (Home) electrical issue" },
  { id: "C", label: "Commercial (Shop / Office) electrical issue" },
  { id: "D", label: "Industrial electrical issue" },
  { id: "E", label: "Something else / I'm not sure" },
];

const YES_NO: ElectricalOption[] = [
  { id: "yes", label: "Yes" },
  { id: "no", label: "No" },
];

export const ELECTRICAL_SCREENS: Record<string, ElectricalScreen> = {
  start: {
    id: "start",
    question: ELECTRICAL_START_QUESTION,
    kind: "choice",
    options: ELECTRICAL_START_OPTIONS,
  },
  // Branch A — Vehicle electrical issue
  a_symptom: {
    id: "a_symptom",
    question: "What is the main symptom?",
    kind: "choice",
    options: [
      { id: "dead", label: "No power / completely dead" },
      {
        id: "charging",
        label: "Battery warning light or charging problem",
      },
      {
        id: "lights",
        label: "Lights (headlights, indicators, interior) not working",
      },
      { id: "wiring", label: "Wiring, short circuit or burning smell" },
      { id: "starter", label: "Starter / cranking problem" },
      {
        id: "accessories",
        label: "Power windows, central lock, radio or accessories",
      },
      {
        id: "dashboard",
        label: "Dashboard warning lights or computer issues",
      },
      { id: "other", label: "Other vehicle electrical fault" },
    ],
  },
  a_after: {
    id: "a_after",
    question:
      "Did the problem start after rain, washing, accident, or recent work?",
    kind: "choice",
    options: YES_NO,
  },
  a_smell: {
    id: "a_smell",
    question: "Are there any burning smells, smoke, or visible damaged wires?",
    kind: "choice",
    options: YES_NO,
  },
  a_start: {
    id: "a_start",
    question: "Is the vehicle currently able to start and move?",
    kind: "choice",
    options: YES_NO,
  },
  a_safe: {
    id: "a_safe",
    question: "Is the vehicle in a safe location?",
    kind: "choice",
    options: YES_NO,
  },
  // Branch B — Residential (Home) electrical issue
  b_main: {
    id: "b_main",
    question: "What is the main problem?",
    kind: "choice",
    options: [
      { id: "outage", label: "Complete power outage in the house" },
      { id: "partial", label: "Power outage in part of the house only" },
      { id: "tripping", label: "Frequent tripping of breakers / fuses" },
      { id: "socket", label: "Socket / switch not working" },
      { id: "lighting", label: "Lighting problem" },
      { id: "install", label: "New installation or wiring needed" },
      {
        id: "burning",
        label: "Burning smell, sparking or overheating outlets",
      },
      { id: "other", label: "Other home electrical issue" },
    ],
  },
  b_board: {
    id: "b_board",
    question: "Is the main distribution board / consumer unit accessible?",
    kind: "choice",
    options: YES_NO,
  },
  b_after: {
    id: "b_after",
    question:
      "Did this start after a storm, heavy rain, or recent renovation?",
    kind: "choice",
    options: YES_NO,
  },
  b_smell: {
    id: "b_smell",
    question: "Are there any burning smells, smoke, or hot outlets right now?",
    kind: "choice",
    options: YES_NO,
  },
  b_emergency: {
    id: "b_emergency",
    question: "Is this an emergency (no power, sparking, or safety risk)?",
    kind: "choice",
    options: YES_NO,
  },
  // Branch C — Commercial (Shop / Office) electrical issue
  c_main: {
    id: "c_main",
    question: "What is the main problem?",
    kind: "choice",
    options: [
      { id: "outage", label: "Complete power outage" },
      { id: "partial", label: "Partial power loss" },
      { id: "tripping", label: "Frequent breaker tripping" },
      { id: "lighting", label: "Lighting or socket failures" },
      { id: "ac", label: "Air-conditioning electrical issues" },
      {
        id: "upgrade",
        label: "New installation, three-phase, or upgrade needed",
      },
      { id: "burning", label: "Burning smell, sparking or overheating" },
      { id: "other", label: "Other commercial electrical issue" },
    ],
  },
  c_scope: {
    id: "c_scope",
    question: "Is this a single shop, multi-tenant building, or office complex?",
    kind: "choice",
    options: [
      { id: "single", label: "Single shop" },
      { id: "multi", label: "Multi-tenant building" },
      { id: "office", label: "Office complex" },
    ],
  },
  c_three: {
    id: "c_three",
    question: "Is three-phase power involved?",
    kind: "choice",
    options: YES_NO,
  },
  c_critical: {
    id: "c_critical",
    question:
      "Are there critical systems affected (POS, servers, refrigeration, etc.)?",
    kind: "choice",
    options: YES_NO,
  },
  c_emergency: {
    id: "c_emergency",
    question: "Is this an emergency affecting business operations or safety?",
    kind: "choice",
    options: YES_NO,
  },
  // Branch D — Industrial electrical issue
  d_main: {
    id: "d_main",
    question: "What is the main problem?",
    kind: "choice",
    options: [
      { id: "power", label: "Machine or equipment not receiving power" },
      { id: "motor", label: "Motor / control panel fault" },
      { id: "three", label: "Three-phase imbalance or failure" },
      { id: "board", label: "Distribution board or switchgear issue" },
      { id: "install", label: "New industrial installation or upgrade" },
      { id: "safety", label: "Burning smell, overheating, or safety trip" },
      { id: "other", label: "Other industrial electrical fault" },
    ],
  },
  d_facility: {
    id: "d_facility",
    question: "What type of facility is it (factory, warehouse, workshop, plant)?",
    kind: "choice",
    options: [
      { id: "factory", label: "Factory" },
      { id: "warehouse", label: "Warehouse" },
      { id: "workshop", label: "Workshop" },
      { id: "plant", label: "Plant" },
      { id: "other", label: "Other" },
    ],
  },
  d_warranty: {
    id: "d_warranty",
    question:
      "Is the equipment still under warranty or does it have specific brand requirements?",
    kind: "choice",
    options: YES_NO,
  },
  d_production: {
    id: "d_production",
    question: "Is production currently stopped because of this fault?",
    kind: "choice",
    options: YES_NO,
  },
  d_safety: {
    id: "d_safety",
    question:
      "Are there any immediate safety risks (exposed conductors, overheating, etc.)?",
    kind: "choice",
    options: YES_NO,
  },
  // Branch E — Something else / I'm not sure
  e_describe: {
    id: "e_describe",
    question: "Please describe in your own words what is happening.",
    kind: "text",
  },
  e_related: {
    id: "e_related",
    question: "Is it related to:",
    kind: "choice",
    options: [
      { id: "battery", label: "Vehicle starting or battery" },
      { id: "tyre", label: "Tyre or wheel" },
      { id: "tow", label: "Vehicle cannot move" },
      { id: "body", label: "Body damage" },
      { id: "ac", label: "Air conditioning" },
      { id: "power", label: "Power generation" },
      { id: "house", label: "House plumbing or carpentry" },
      { id: "painting", label: "Painting" },
      { id: "fashion", label: "Clothing / tailoring" },
      { id: "electrical", label: "Still electrical" },
    ],
  },
};

const START_NEXT: Record<string, string> = {
  A: "vehicle",
  B: "b_main",
  C: "c_main",
  D: "d_main",
  E: "e_describe",
};

export function electricalScreen(
  id: string
): ElectricalScreen | undefined {
  return ELECTRICAL_SCREENS[id];
}

export function nextElectricalScreen(
  current: string,
  answerId: string,
  _answers: Record<string, string>
): string {
  if (current === "start") return START_NEXT[answerId] || "e_describe";

  if (current === "a_symptom") return "a_after";
  if (current === "a_after") return "a_smell";
  if (current === "a_smell") return "a_start";
  if (current === "a_start") return "a_safe";
  if (current === "a_safe") return "final";

  if (current === "b_main") return "b_board";
  if (current === "b_board") return "b_after";
  if (current === "b_after") return "b_smell";
  if (current === "b_smell") return "b_emergency";
  if (current === "b_emergency") return "final";

  if (current === "c_main") return "c_scope";
  if (current === "c_scope") return "c_three";
  if (current === "c_three") return "c_critical";
  if (current === "c_critical") return "c_emergency";
  if (current === "c_emergency") return "final";

  if (current === "d_main") return "d_facility";
  if (current === "d_facility") return "d_warranty";
  if (current === "d_warranty") return "d_production";
  if (current === "d_production") return "d_safety";
  if (current === "d_safety") return "final";

  if (current === "e_describe") return "e_related";
  if (current === "e_related") return "final";

  return "final";
}

/**
 * Electric is a capture-only cascade: no trade switching anywhere. The job
 * always dispatches as Electric; the final tow question (vehicle branch
 * only) routes to Tow.
 */
export function resolveElectricalRoute(
  _answers: Record<string, string>
): ElectricalRoute {
  return { trade: "electrical", needsConfirm: false };
}

export function composeElectricalProblem(
  answers: Record<string, string>,
  extra: string,
  landmark: string
): string {
  const lines: string[] = [];
  const start = electricalScreen("start");
  if (start) {
    lines.push(start.question);
    const picked = ELECTRICAL_START_OPTIONS.find(
      (o) => o.id === answers.start
    );
    if (picked) lines.push(picked.label);
  }

  const order = Object.keys(answers).filter(
    (k) => k !== "start" && !k.endsWith("_label")
  );
  for (const id of order) {
    const screen = electricalScreen(id);
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
    lines.push(ELECTRICAL_FINAL_COPY.location);
    lines.push(landmark.trim());
  }
  if (extra.trim()) {
    lines.push(ELECTRICAL_FINAL_COPY.extra);
    lines.push(extra.trim());
  }
  return lines.filter(Boolean).join("\n");
}

export function canAdvanceText(value: string): boolean {
  return value.trim().length >= 2;
}

export function canFindElectricalPro(photoCount: number): boolean {
  return photoCount >= ELECTRICAL_MIN_PHOTOS;
}

export function electricalBreadcrumb(stack: string[]): string {
  const bits: string[] = ["Electric"];
  if (stack.length > 1) {
    const firstBranch = stack[1];
    const letter = Object.entries(START_NEXT).find(
      ([, id]) => id === firstBranch
    )?.[0];
    if (letter) bits.push(letter);
  }
  return bits.join(" · ");
}