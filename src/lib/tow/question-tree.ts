import type { ProService } from "@/lib/types";

export const TOW_START_QUESTION = "Why do you need towing service?";

export const TOW_FINAL_COPY = {
  urgency: "Urgency",
  normal: "Normal",
  emergency: "Emergency",
  remote: "Remote location",
  night: "Night service needed",
  photos: "Add clear photos (minimum 2) of the vehicle and its current position",
  voice: "Record a short voice note describing the situation",
  location: "Exact location / landmark",
  destination: "Preferred destination (workshop name or area)?",
  colour: "Vehicle colour",
  extra: "Any other detail you want the tow operator to know?",
  meetPro: "Do you also need a repair pro to meet you at the destination?",
  meetProYes: "Yes, also send a repair pro",
  meetProNo: "No, proceed with Tow only",
} as const;

export const TOW_MIN_PHOTOS = 2;
export const TOW_MAX_PHOTOS = 4;

export type TowScreenKind = "choice" | "text";

export type TowOption = {
  id: string;
  label: string;
};

export type TowScreen = {
  id: string;
  question: string;
  kind: TowScreenKind;
  options?: TowOption[];
  placeholder?: string;
};

export type TowRoute = {
  trade: ProService;
  alternate?: ProService;
  needsConfirm: boolean;
  /** Branch C — dangerous location: prioritize the tow as an emergency. */
  emergency?: boolean;
};

export const TOW_START_OPTIONS: TowOption[] = [
  { id: "A", label: "Vehicle completely broken down and cannot move" },
  { id: "B", label: "Accident or collision" },
  {
    id: "C",
    label: "Vehicle is in a dangerous location (highway, middle of the road, etc.)",
  },
  { id: "D", label: "Flat or burst tyre(s) and I cannot change it" },
  { id: "E", label: "Need to move the vehicle to a workshop or safer place" },
  { id: "F", label: "Vehicle sank, stuck in mud, sand or ditch" },
  { id: "G", label: "Something else / I'm not sure" },
];

const YES_NO: TowOption[] = [
  { id: "yes", label: "Yes" },
  { id: "no", label: "No" },
];

const VEHICLE_TYPES: TowOption[] = [
  { id: "saloon", label: "Saloon / Car" },
  { id: "suv", label: "SUV / Crossover" },
  { id: "bus", label: "Bus / Van" },
  { id: "pickup", label: "Pickup / Truck" },
  { id: "other", label: "Other" },
];

const BODY_PARTS: TowOption[] = [
  { id: "front", label: "Front (bumper, bonnet, lights)" },
  { id: "rear", label: "Rear (bumper, boot)" },
  { id: "side", label: "Side doors / panels" },
  { id: "wheels", label: "Wheels / suspension" },
  { id: "undercarriage", label: "Undercarriage / chassis" },
  { id: "multiple", label: "Multiple areas" },
];

export const TOW_SCREENS: Record<string, TowScreen> = {
  start: {
    id: "start",
    question: TOW_START_QUESTION,
    kind: "choice",
    options: TOW_START_OPTIONS,
  },
  // Branch A — completely broken down
  a_what: {
    id: "a_what",
    question: "What exactly happened to the vehicle?",
    kind: "choice",
    options: [
      { id: "will_not_start", label: "Will not start at all" },
      { id: "stalled", label: "Started then stopped / stalled" },
      { id: "strange_noise", label: "Strange noise then stopped" },
      { id: "overheating", label: "Overheating" },
      { id: "transmission", label: "Transmission / gear problem" },
      { id: "other", label: "Other mechanical issue" },
    ],
  },
  a_roll: {
    id: "a_roll",
    question: "Can the wheels still roll freely when the vehicle is pushed?",
    kind: "choice",
    options: YES_NO,
  },
  a_safe: {
    id: "a_safe",
    question: "Is the vehicle currently in a safe location?",
    kind: "choice",
    options: YES_NO,
  },
  a_vehicle: {
    id: "a_vehicle",
    question: "What type of vehicle is it?",
    kind: "choice",
    options: VEHICLE_TYPES,
  },
  // Branch B — accident or collision
  b_serious: {
    id: "b_serious",
    question: "How serious is the damage?",
    kind: "choice",
    options: [
      { id: "minor", label: "Minor (still driveable)" },
      { id: "moderate", label: "Moderate" },
      { id: "severe", label: "Severe (cannot move)" },
    ],
  },
  b_injured: {
    id: "b_injured",
    question: "Is anyone injured?",
    kind: "choice",
    options: YES_NO,
  },
  b_parts: {
    id: "b_parts",
    question: "Which parts of the vehicle are damaged?",
    kind: "choice",
    options: BODY_PARTS,
  },
  b_blocking: {
    id: "b_blocking",
    question: "Is the vehicle blocking the road or in a dangerous position?",
    kind: "choice",
    options: YES_NO,
  },
  b_paint: {
    id: "b_paint",
    question: "Will the damaged panels need repainting?",
    kind: "choice",
    options: YES_NO,
  },
  // Branch C — dangerous location
  c_location: {
    id: "c_location",
    question: "Exact type of location:",
    kind: "choice",
    options: [
      { id: "highway", label: "Highway / expressway" },
      { id: "busy_road", label: "Busy city road" },
      { id: "bridge", label: "Bridge or flyover" },
      { id: "dark_remote", label: "Dark or remote area" },
      { id: "estate", label: "Estate / residential" },
    ],
  },
  c_hazard: {
    id: "c_hazard",
    question: "Are the hazard lights working?",
    kind: "choice",
    options: YES_NO,
  },
  c_drive: {
    id: "c_drive",
    question:
      "Is the vehicle still driveable for a very short distance to a safer spot?",
    kind: "choice",
    options: YES_NO,
  },
  // Branch D — flat / burst tyre, cannot change
  d_count: {
    id: "d_count",
    question: "How many tyres are affected?",
    kind: "choice",
    options: [
      { id: "one", label: "One" },
      { id: "two", label: "Two" },
      { id: "more", label: "More than two" },
    ],
  },
  d_spare: {
    id: "d_spare",
    question: "Do you have a good spare tyre?",
    kind: "choice",
    options: YES_NO,
  },
  d_tools: {
    id: "d_tools",
    question: "Do you have a jack and tools?",
    kind: "choice",
    options: YES_NO,
  },
  d_safe: {
    id: "d_safe",
    question: "Is the vehicle in a safe location?",
    kind: "choice",
    options: [
      { id: "safe", label: "Safe location" },
      { id: "road", label: "On the road / unsafe" },
    ],
  },
  // Branch E — move to workshop / safer place
  e_reason: {
    id: "e_reason",
    question: "Why does it need to be moved?",
    kind: "choice",
    options: [
      { id: "workshop", label: "Going to a workshop for repairs" },
      { id: "home", label: "Going home" },
      { id: "safer_place", label: "Moving to a safer place" },
      { id: "other", label: "Other" },
    ],
  },
  e_drive: {
    id: "e_drive",
    question: "Is the vehicle currently driveable?",
    kind: "choice",
    options: YES_NO,
  },
  // Branch F — stuck / sank
  f_deep: {
    id: "f_deep",
    question: "How deeply is it stuck?",
    kind: "choice",
    options: [
      { id: "slightly", label: "Slightly stuck" },
      { id: "moderate", label: "Moderately stuck" },
      { id: "deeply", label: "Deeply stuck / sank" },
    ],
  },
  f_recovery: {
    id: "f_recovery",
    question:
      "Is a normal tow truck enough, or do you need a heavy-duty / winch recovery?",
    kind: "choice",
    options: [
      { id: "normal", label: "Normal tow truck is enough" },
      { id: "heavy", label: "Heavy-duty / winch recovery" },
    ],
  },
  f_vehicle: {
    id: "f_vehicle",
    question: "What type of vehicle is it?",
    kind: "choice",
    options: VEHICLE_TYPES,
  },
  // Branch G — something else / not sure
  g_desc: {
    id: "g_desc",
    question: "Please describe in your own words what is happening.",
    kind: "text",
    placeholder: "Please describe in your own words what is happening.",
  },
  g_related: {
    id: "g_related",
    question: "Is it related to:",
    kind: "choice",
    options: [
      { id: "engine_mech", label: "Engine or mechanical problem" },
      { id: "tyre_wheel", label: "Tyre or wheel problem" },
      { id: "battery_electrical", label: "Battery or electrical issue" },
      { id: "body", label: "Body damage" },
      { id: "ac", label: "Air conditioning" },
      { id: "power", label: "Power at home / shop" },
      { id: "house", label: "House repair" },
      { id: "clothing", label: "Clothing work" },
      { id: "moving", label: "Still needs moving" },
    ],
  },
  g_power: {
    id: "g_power",
    question: "Power at home / shop",
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
};

const START_NEXT: Record<string, string> = {
  A: "a_what",
  B: "b_serious",
  C: "c_location",
  D: "d_count",
  E: "e_reason",
  F: "f_deep",
  G: "g_desc",
};

function resolveScreen(answers: Record<string, string>): "confirm" | "final" {
  return resolveTowRoute(answers).needsConfirm ? "confirm" : "final";
}

export function towScreen(id: string): TowScreen | undefined {
  return TOW_SCREENS[id];
}

export function nextTowScreen(
  current: string,
  answerId: string,
  answers: Record<string, string>
): string {
  if (current === "start") return START_NEXT[answerId] || "g_desc";

  if (current === "a_what") return "a_roll";
  if (current === "a_roll") return "a_safe";
  if (current === "a_safe") return "a_vehicle";
  if (current === "a_vehicle") return resolveScreen(answers);

  if (current === "b_serious") return "b_injured";
  if (current === "b_injured") return "b_parts";
  if (current === "b_parts") return "b_blocking";
  if (current === "b_blocking") return "b_paint";
  if (current === "b_paint") return resolveScreen(answers);

  if (current === "c_location") return "c_hazard";
  if (current === "c_hazard") return "c_drive";
  if (current === "c_drive") return resolveScreen(answers);

  if (current === "d_count") return "d_spare";
  if (current === "d_spare") return "d_tools";
  if (current === "d_tools") return "d_safe";
  if (current === "d_safe") return resolveScreen(answers);

  if (current === "e_reason") return "e_drive";
  if (current === "e_drive") return resolveScreen(answers);

  if (current === "f_deep") return "f_recovery";
  if (current === "f_recovery") return "f_vehicle";
  if (current === "f_vehicle") return resolveScreen(answers);

  if (current === "g_desc") return "g_related";
  if (current === "g_related") {
    if (answerId === "power") return "g_power";
    if (answerId === "house") return "g_house";
    return resolveScreen(answers);
  }
  if (current === "g_power" || current === "g_house") {
    return resolveScreen(answers);
  }

  return "final";
}

/**
 * Pick the trade from the filled answers. Most branches stay with Tow and let
 * the final "meet a repair pro at the destination" question handle follow-up
 * pros (Mechanic / Vulcanizer / Body / etc.). Branch D prefers Vulcanizer for
 * a single safe tyre; Branch G offers the related trade for odd requests.
 */
export function resolveTowRoute(answers: Record<string, string>): TowRoute {
  const stay = (extra?: Partial<TowRoute>): TowRoute => ({
    trade: "towing",
    needsConfirm: false,
    ...extra,
  });
  const leave = (
    trade: ProService,
    alternate?: ProService,
    extra?: Partial<TowRoute>
  ): TowRoute => ({
    trade,
    alternate,
    needsConfirm: true,
    ...extra,
  });

  const main = answers.start;

  if (main === "A") return stay();
  if (main === "B") return stay();
  if (main === "C") return stay({ emergency: true });

  if (main === "D") {
    const safeSingle = answers.d_count === "one" && answers.d_safe === "safe";
    if (safeSingle) return leave("vulcanizer", "towing");
    return leave("towing", "vulcanizer");
  }

  if (main === "E") return stay();
  if (main === "F") return stay();

  if (main === "G") {
    if (answers.g_related === "engine_mech") return leave("towing", "mechanic");
    if (answers.g_related === "tyre_wheel") return leave("towing", "vulcanizer");
    if (answers.g_related === "battery_electrical")
      return leave("towing", "battery");
    if (answers.g_related === "body") return leave("towing", "body");
    if (answers.g_related === "ac") return leave("towing", "ac");
    if (answers.g_related === "power") {
      if (answers.g_power === "solar") return leave("towing", "solar");
      return leave("towing", "generator");
    }
    if (answers.g_related === "house") {
      if (answers.g_house === "plumber") return leave("towing", "plumber");
      if (answers.g_house === "painter") return leave("towing", "painter");
      return leave("towing", "carpenter");
    }
    if (answers.g_related === "clothing") return leave("towing", "fashion");
    return stay();
  }

  return stay();
}

export function applyTowConfirmChoice(route: TowRoute, yes: boolean): ProService {
  if (yes) return route.trade;
  if (route.alternate) return route.alternate;
  return "towing";
}

export function composeTowProblem(
  answers: Record<string, string>,
  extra: string,
  landmark: string,
  opts?: {
    destination?: string;
    colour?: string;
  }
): string {
  const lines: string[] = [];
  const start = towScreen("start");
  if (start) {
    lines.push(start.question);
    const picked = TOW_START_OPTIONS.find((o) => o.id === answers.start);
    if (picked) lines.push(picked.label);
  }

  const order = Object.keys(answers).filter(
    (k) => k !== "start" && !k.endsWith("_label")
  );
  for (const id of order) {
    const screen = towScreen(id);
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

  if (answers.start === "F" && answers.f_recovery === "heavy") {
    lines.push("Heavy-duty / winch recovery needed");
  }
  if (answers.start === "B" && answers.b_injured === "yes") {
    lines.push("There are injuries on site — treat with priority");
  }
  if (answers.start === "B" && answers.b_paint === "yes") {
    lines.push("Damaged panels need repainting — a Painter may follow up");
  }

  if (landmark.trim()) {
    lines.push(TOW_FINAL_COPY.location);
    lines.push(landmark.trim());
  }
  if (opts?.destination?.trim()) {
    lines.push(TOW_FINAL_COPY.destination);
    lines.push(opts.destination.trim());
  }
  if (opts?.colour?.trim()) {
    lines.push(TOW_FINAL_COPY.colour);
    lines.push(opts.colour.trim());
  }
  if (extra.trim()) {
    lines.push(TOW_FINAL_COPY.extra);
    lines.push(extra.trim());
  }
  return lines.filter(Boolean).join("\n");
}

export function canFindTowPro(photoCount: number): boolean {
  return photoCount >= TOW_MIN_PHOTOS;
}

export { canAdvanceText, confirmQuestion } from "@/lib/mechanic/question-tree";