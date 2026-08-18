import type { ProService } from "@/lib/types";

export const BODY_START_QUESTION =
  "What is the main body or panel problem you are experiencing?";

export const BODY_FINAL_COPY = {
  urgency: "How urgent is this request?",
  normal: "Normal",
  emergency: "Emergency",
  remote: "Remote location",
  night: "Night service needed",
  photos:
    "Add 4 clear photos of the damaged area from different angles",
  voice: "Record a short voice note describing the damage",
  location: "Where is the vehicle?",
  extra: "Any other detail you want the technician to know?",
  tow: "Do you need the vehicle towed to a safer place or workshop?",
} as const;

export const BODY_MIN_PHOTOS = 4;
export const BODY_MAX_PHOTOS = 4;

export type BodyScreenKind = "choice" | "text";

export type BodyOption = {
  id: string;
  label: string;
};

export type BodyScreen = {
  id: string;
  question: string;
  kind: BodyScreenKind;
  options?: BodyOption[];
  placeholder?: string;
};

export type BodyRoute = {
  trade: ProService;
  needsConfirm: boolean;
};

export const BODY_START_OPTIONS: BodyOption[] = [
  { id: "A", label: "Accident or collision damage" },
  { id: "B", label: "Dent(s) on the body" },
  { id: "C", label: "Scratch or paint damage" },
  { id: "D", label: "Bumper damaged or hanging" },
  { id: "E", label: "Door, fender, or bonnet damage" },
  { id: "F", label: "Need full panel beating and spraying" },
  { id: "G", label: "Something else / I'm not sure" },
];

const YES_NO: BodyOption[] = [
  { id: "yes", label: "Yes" },
  { id: "no", label: "No" },
];

export const BODY_SCREENS: Record<string, BodyScreen> = {
  start: {
    id: "start",
    question: BODY_START_QUESTION,
    kind: "choice",
    options: BODY_START_OPTIONS,
  },
  // Branch A — Accident or collision damage
  a_serious: {
    id: "a_serious",
    question: "How serious is the damage?",
    kind: "choice",
    options: [
      { id: "minor", label: "Minor (still driveable)" },
      { id: "moderate", label: "Moderate" },
      { id: "severe", label: "Severe (vehicle cannot move safely)" },
    ],
  },
  a_parts: {
    id: "a_parts",
    question: "Which parts of the vehicle are affected?",
    kind: "text",
  },
  a_driveable: {
    id: "a_driveable",
    question: "Is the vehicle currently driveable?",
    kind: "choice",
    options: YES_NO,
  },
  a_insurance: {
    id: "a_insurance",
    question: "Is insurance involved?",
    kind: "choice",
    options: YES_NO,
  },
  a_safe: {
    id: "a_safe",
    question: "Is the vehicle in a safe location right now?",
    kind: "choice",
    options: YES_NO,
  },
  // Branch B — Dent(s) on the body
  b_count: {
    id: "b_count",
    question: "How many dents are there?",
    kind: "text",
  },
  b_panels: {
    id: "b_panels",
    question:
      "Which panel(s) are affected (door, fender, bonnet, boot, roof, etc.)?",
    kind: "text",
  },
  b_depth: {
    id: "b_depth",
    question: "Are the dents deep or shallow?",
    kind: "choice",
    options: [
      { id: "deep", label: "Deep" },
      { id: "shallow", label: "Shallow" },
      { id: "mixed", label: "Mixed" },
    ],
  },
  b_paint: {
    id: "b_paint",
    question: "Is the paint cracked or just the metal pushed in?",
    kind: "choice",
    options: [
      { id: "paint", label: "Paint cracked" },
      { id: "metal", label: "Metal pushed in" },
      { id: "both", label: "Both" },
    ],
  },
  b_repair: {
    id: "b_repair",
    question: "Do you want paintless dent repair or full panel beating?",
    kind: "choice",
    options: [
      { id: "pdr", label: "Paintless dent repair" },
      { id: "full", label: "Full panel beating" },
    ],
  },
  // Branch C — Scratch or paint damage
  c_depth: {
    id: "c_depth",
    question: "How deep is the scratch?",
    kind: "choice",
    options: [
      { id: "surface", label: "Surface only (clear coat)" },
      { id: "colour", label: "Through to the colour" },
      { id: "metal", label: "Down to the metal" },
    ],
  },
  c_size: {
    id: "c_size",
    question: "Size of the affected area?",
    kind: "text",
  },
  c_respray: {
    id: "c_respray",
    question: "Do you want only touch-up or full panel respray?",
    kind: "choice",
    options: [
      { id: "touchup", label: "Only touch-up" },
      { id: "respray", label: "Full panel respray" },
    ],
  },
  c_paint: {
    id: "c_paint",
    question: "Is the rest of the vehicle paint in good condition?",
    kind: "choice",
    options: YES_NO,
  },
  // Branch D — Bumper damaged or hanging
  d_state: {
    id: "d_state",
    question: "Is the bumper cracked, broken, or completely hanging off?",
    kind: "choice",
    options: [
      { id: "cracked", label: "Cracked" },
      { id: "broken", label: "Broken" },
      { id: "hanging", label: "Completely hanging off" },
    ],
  },
  d_position: {
    id: "d_position",
    question: "Front or rear bumper?",
    kind: "choice",
    options: [
      { id: "front", label: "Front" },
      { id: "rear", label: "Rear" },
    ],
  },
  d_mounts: {
    id: "d_mounts",
    question: "Are the mounting points or brackets damaged?",
    kind: "choice",
    options: YES_NO,
  },
  d_drive: {
    id: "d_drive",
    question: "Is the vehicle still safe to drive?",
    kind: "choice",
    options: YES_NO,
  },
  // Branch E — Door, fender, or bonnet damage
  e_part: {
    id: "e_part",
    question: "Which specific part is damaged?",
    kind: "choice",
    options: [
      { id: "door", label: "Door" },
      { id: "fender", label: "Fender" },
      { id: "bonnet", label: "Bonnet" },
      { id: "boot", label: "Boot" },
      { id: "multiple", label: "More than one" },
    ],
  },
  e_opens: {
    id: "e_opens",
    question: "Does the door/bonnet still open and close properly?",
    kind: "choice",
    options: YES_NO,
  },
  e_alignment: {
    id: "e_alignment",
    question: "Is there any misalignment?",
    kind: "choice",
    options: YES_NO,
  },
  e_mechanical: {
    id: "e_mechanical",
    question:
      "Any related mechanical issue (e.g. door not locking, hinge problem)?",
    kind: "text",
  },
  // Branch F — Need full panel beating and spraying
  f_areas: {
    id: "f_areas",
    question: "Which areas of the vehicle need work?",
    kind: "text",
  },
  f_quotation: {
    id: "f_quotation",
    question: "Do you already have a quotation or insurance approval?",
    kind: "choice",
    options: [
      { id: "quotation", label: "Quotation" },
      { id: "approval", label: "Insurance approval" },
      { id: "neither", label: "Neither yet" },
    ],
  },
  f_colour: {
    id: "f_colour",
    question: "Do you want the same colour or a different colour?",
    kind: "choice",
    options: [
      { id: "same", label: "Same colour" },
      { id: "different", label: "Different colour" },
    ],
  },
  f_driveable: {
    id: "f_driveable",
    question: "Is the vehicle currently driveable to the workshop?",
    kind: "choice",
    options: YES_NO,
  },
  // Branch G — Something else / I'm not sure
  g_describe: {
    id: "g_describe",
    question: "Please describe in your own words what is happening.",
    kind: "text",
  },
  g_related: {
    id: "g_related",
    question: "Is it related to:",
    kind: "choice",
    options: [
      { id: "mechanic", label: "Engine or mechanical problem" },
      { id: "vulcanizer", label: "Tyre or wheel problem" },
      { id: "battery", label: "Battery or starting issue" },
      { id: "towing", label: "Vehicle cannot move" },
      { id: "ac", label: "Air conditioning" },
      { id: "electrical", label: "Electrical or wiring" },
      { id: "power", label: "Power at home/shop" },
      { id: "house", label: "House repair" },
      { id: "fashion", label: "Clothing" },
      { id: "body", label: "Still body/panel related" },
    ],
  },
};

const START_NEXT: Record<string, string> = {
  A: "a_serious",
  B: "b_count",
  C: "c_depth",
  D: "d_state",
  E: "e_part",
  F: "f_areas",
  G: "g_describe",
};

export function bodyScreen(id: string): BodyScreen | undefined {
  return BODY_SCREENS[id];
}

export function nextBodyScreen(
  current: string,
  answerId: string,
  _answers: Record<string, string>
): string {
  if (current === "start") return START_NEXT[answerId] || "g_describe";

  if (current === "a_serious") return "a_parts";
  if (current === "a_parts") return "a_driveable";
  if (current === "a_driveable") return "a_insurance";
  if (current === "a_insurance") return "a_safe";
  if (current === "a_safe") return "final";

  if (current === "b_count") return "b_panels";
  if (current === "b_panels") return "b_depth";
  if (current === "b_depth") return "b_paint";
  if (current === "b_paint") return "b_repair";
  if (current === "b_repair") return "final";

  if (current === "c_depth") return "c_size";
  if (current === "c_size") return "c_respray";
  if (current === "c_respray") return "c_paint";
  if (current === "c_paint") return "final";

  if (current === "d_state") return "d_position";
  if (current === "d_position") return "d_mounts";
  if (current === "d_mounts") return "d_drive";
  if (current === "d_drive") return "final";

  if (current === "e_part") return "e_opens";
  if (current === "e_opens") return "e_alignment";
  if (current === "e_alignment") return "e_mechanical";
  if (current === "e_mechanical") return "final";

  if (current === "f_areas") return "f_quotation";
  if (current === "f_quotation") return "f_colour";
  if (current === "f_colour") return "f_driveable";
  if (current === "f_driveable") return "final";

  if (current === "g_describe") return "g_related";
  if (current === "g_related") return "final";

  return "final";
}

/**
 * Body is a capture-only cascade: no trade switching anywhere. The job
 * always dispatches as Body; the final tow question routes to Tow.
 */
export function resolveBodyRoute(
  _answers: Record<string, string>
): BodyRoute {
  return { trade: "body", needsConfirm: false };
}

export function composeBodyProblem(
  answers: Record<string, string>,
  extra: string,
  landmark: string
): string {
  const lines: string[] = [];
  const start = bodyScreen("start");
  if (start) {
    lines.push(start.question);
    const picked = BODY_START_OPTIONS.find((o) => o.id === answers.start);
    if (picked) lines.push(picked.label);
  }

  const order = Object.keys(answers).filter(
    (k) => k !== "start" && !k.endsWith("_label")
  );
  for (const id of order) {
    const screen = bodyScreen(id);
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
    lines.push(BODY_FINAL_COPY.location);
    lines.push(landmark.trim());
  }
  if (extra.trim()) {
    lines.push(BODY_FINAL_COPY.extra);
    lines.push(extra.trim());
  }
  return lines.filter(Boolean).join("\n");
}

export function canAdvanceText(value: string): boolean {
  return value.trim().length >= 2;
}

export function canFindBodyPro(photoCount: number): boolean {
  return photoCount >= BODY_MIN_PHOTOS;
}

export function bodyBreadcrumb(stack: string[]): string {
  const bits: string[] = ["Body"];
  if (stack.length > 1) {
    const firstBranch = stack[1];
    const letter = Object.entries(START_NEXT).find(
      ([, id]) => id === firstBranch
    )?.[0];
    if (letter) bits.push(letter);
  }
  return bits.join(" · ");
}