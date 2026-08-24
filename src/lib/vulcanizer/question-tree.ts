import type { ProService } from "@/lib/types";

export const VULCANIZER_START_QUESTION =
  "What is the main tyre or wheel problem you are experiencing?";

export const VULCANIZER_FINAL_COPY = {
  urgency: "Urgency",
  normal: "Normal",
  emergency: "Emergency",
  remote: "Remote location",
  night: "Night service needed",
  photos: "Add clear photos of the affected tyre(s) and rim(s)",
  voice: "Record a short voice note describing the problem",
  location: "Current Location",
  extra: "Any other detail you want the repair pro to know?",
  diagnosis: "Likely problem",
  tow: "Do you need the vehicle towed to a safer place or workshop?",
  towYes: "Yes I need a tow",
  towNo: "No proceed with Vulcanizer",
} as const;

export const VULCANIZER_MIN_PHOTOS = 0;
export const VULCANIZER_MAX_PHOTOS = 4;

export type VulcanizerScreenKind = "choice" | "text";

export type VulcanizerOption = {
  id: string;
  label: string;
};

export type VulcanizerScreen = {
  id: string;
  question: string;
  kind: VulcanizerScreenKind;
  options?: VulcanizerOption[];
  placeholder?: string;
};

export type VulcanizerRoute = {
  trade: ProService;
  alternate?: ProService;
  needsConfirm: boolean;
  diagnosis?: string;
};

export const VULCANIZER_START_OPTIONS: VulcanizerOption[] = [
  { id: "A", label: "Flat tyre / puncture" },
  { id: "B", label: "Burst or blown tyre" },
  { id: "C", label: "Tyre losing air slowly (slow puncture)" },
  { id: "D", label: "Damaged, bent or cracked rim / wheel" },
  { id: "E", label: "Need wheel balancing or alignment" },
  { id: "F", label: "Need new tyre(s) or tyre replacement" },
  { id: "G", label: "Multiple tyres affected" },
  { id: "H", label: "Something else / I'm not sure" },
];

const YES_NO: VulcanizerOption[] = [
  { id: "yes", label: "Yes" },
  { id: "no", label: "No" },
];

const TYRE_POSITIONS: VulcanizerOption[] = [
  { id: "front_left", label: "Front left" },
  { id: "front_right", label: "Front right" },
  { id: "rear_left", label: "Rear left" },
  { id: "rear_right", label: "Rear right" },
  { id: "spare", label: "Spare" },
];

export const VULCANIZER_SCREENS: Record<string, VulcanizerScreen> = {
  start: {
    id: "start",
    question: VULCANIZER_START_QUESTION,
    kind: "choice",
    options: VULCANIZER_START_OPTIONS,
  },
  // Branch A flat tyre / puncture
  a_which: {
    id: "a_which",
    question: "Which tyre(s) is affected?",
    kind: "choice",
    options: [...TYRE_POSITIONS, { id: "more", label: "More than one" }],
  },
  a_object: {
    id: "a_object",
    question: "Is the object (nail, screw, etc.) still visible in the tyre?",
    kind: "choice",
    options: YES_NO,
  },
  a_spare: {
    id: "a_spare",
    question: "Do you have a good spare tyre?",
    kind: "choice",
    options: YES_NO,
  },
  a_jack: {
    id: "a_jack",
    question: "Do you have a jack and wheel spanner with you?",
    kind: "choice",
    options: YES_NO,
  },
  a_safe: {
    id: "a_safe",
    question:
      "Is the vehicle currently in a safe location or still on the road/highway?",
    kind: "choice",
    options: [
      { id: "safe", label: "Safe location" },
      { id: "road", label: "On the road / highway" },
    ],
  },
  // Branch B burst or blown tyre
  b_which: {
    id: "b_which",
    question: "Which tyre burst?",
    kind: "choice",
    options: TYRE_POSITIONS,
  },
  b_pull: {
    id: "b_pull",
    question: "Did the vehicle pull strongly to one side when it happened?",
    kind: "choice",
    options: YES_NO,
  },
  b_rim: {
    id: "b_rim",
    question: "Is the rim damaged?",
    kind: "choice",
    options: YES_NO,
  },
  b_spare: {
    id: "b_spare",
    question: "Do you have a good spare?",
    kind: "choice",
    options: YES_NO,
  },
  b_safe: {
    id: "b_safe",
    question: "Is the vehicle safe to stay where it is?",
    kind: "choice",
    options: YES_NO,
  },
  // Branch C slow puncture
  c_time: {
    id: "c_time",
    question: "How long has the tyre been losing air?",
    kind: "choice",
    options: [
      { id: "hours", label: "A few hours" },
      { id: "days", label: "A few days" },
      { id: "week", label: "A week or more" },
      { id: "unsure", label: "Not sure" },
    ],
  },
  c_damage: {
    id: "c_damage",
    question: "Do you see any nail, screw or damage on the tread or sidewall?",
    kind: "choice",
    options: [
      { id: "tread", label: "Yes nail / screw on the tread" },
      { id: "sidewall", label: "Yes damage on the sidewall" },
      { id: "none", label: "Nothing visible" },
    ],
  },
  c_air: {
    id: "c_air",
    question: "Have you added air more than once already?",
    kind: "choice",
    options: YES_NO,
  },
  c_which: {
    id: "c_which",
    question: "Which tyre is affected?",
    kind: "choice",
    options: TYRE_POSITIONS,
  },
  // Branch D damaged rim / wheel
  d_how: {
    id: "d_how",
    question: "How did the rim get damaged?",
    kind: "choice",
    options: [
      { id: "pothole", label: "Pothole" },
      { id: "accident", label: "Accident / collision" },
      { id: "impact", label: "Impact with a curb or object" },
      { id: "rust", label: "Rust / wear" },
      { id: "other", label: "Other / not sure" },
    ],
  },
  d_air: {
    id: "d_air",
    question: "Is the tyre still holding air?",
    kind: "choice",
    options: YES_NO,
  },
  d_use: {
    id: "d_use",
    question: "Is the wheel still usable or is it unsafe to drive?",
    kind: "choice",
    options: [
      { id: "usable", label: "Still usable" },
      { id: "unsafe", label: "Unsafe to drive" },
    ],
  },
  d_need: {
    id: "d_need",
    question: "Do you need only rim repair or full wheel replacement?",
    kind: "choice",
    options: [
      { id: "repair", label: "Rim repair" },
      { id: "replace", label: "Full wheel replacement" },
    ],
  },
  // Branch E balancing / alignment
  e_symptoms: {
    id: "e_symptoms",
    question: "What symptoms are you noticing?",
    kind: "choice",
    options: [
      { id: "vibration", label: "Steering wheel vibration" },
      { id: "pull", label: "Car pulling to one side" },
      { id: "wear", label: "Uneven tyre wear" },
      { id: "loose", label: "Steering feels loose / off-centre" },
    ],
  },
  e_last: {
    id: "e_last",
    question: "When did you last do balancing or alignment?",
    kind: "choice",
    options: [
      { id: "recent", label: "Recently" },
      { id: "months", label: "A few months ago" },
      { id: "year", label: "A year or more" },
      { id: "never", label: "Never / not sure" },
    ],
  },
  e_trigger: {
    id: "e_trigger",
    question:
      "Did this start after hitting a pothole or after new tyres were fitted?",
    kind: "choice",
    options: [
      { id: "pothole", label: "After hitting a pothole" },
      { id: "new_tyres", label: "After new tyres were fitted" },
      { id: "gradual", label: "No gradual" },
    ],
  },
  // Branch F new tyres / replacement
  f_which: {
    id: "f_which",
    question: "Which tyre(s) need replacement?",
    kind: "choice",
    options: [
      { id: "front_left", label: "Front left" },
      { id: "front_right", label: "Front right" },
      { id: "rear_left", label: "Rear left" },
      { id: "rear_right", label: "Rear right" },
      { id: "both_front", label: "Both front" },
      { id: "both_rear", label: "Both rear" },
      { id: "all_four", label: "All four" },
    ],
  },
  f_supply: {
    id: "f_supply",
    question:
      "Do you already have the new tyre(s) or should the Vulcanizer supply them?",
    kind: "choice",
    options: [
      { id: "have", label: "I already have them" },
      { id: "supply", label: "Vulcanizer should supply" },
      { id: "unsure", label: "Not sure" },
    ],
  },
  f_brand: {
    id: "f_brand",
    question: "Preferred tyre brand or size (if known)?",
    kind: "text",
    placeholder: "Preferred tyre brand or size (if known)?",
  },
  f_balance: {
    id: "f_balance",
    question: "Do you also want balancing after fitting?",
    kind: "choice",
    options: YES_NO,
  },
  // Branch G multiple tyres
  g_howmany: {
    id: "g_howmany",
    question: "How many tyres are affected?",
    kind: "choice",
    options: [
      { id: "two", label: "Two" },
      { id: "three", label: "Three" },
      { id: "four", label: "Four or more" },
    ],
  },
  g_what: {
    id: "g_what",
    question: "What is wrong with them (flat, burst, worn, damaged rim)?",
    kind: "text",
    placeholder: "What is wrong with them?",
  },
  g_spare: {
    id: "g_spare",
    question: "Do you have a good spare?",
    kind: "choice",
    options: YES_NO,
  },
  g_drive: {
    id: "g_drive",
    question: "Is the vehicle currently driveable for a short distance?",
    kind: "choice",
    options: YES_NO,
  },
  // Branch H something else
  h_describe: {
    id: "h_describe",
    question:
      "Please describe in your own words what is happening with the wheels or tyres.",
    kind: "text",
    placeholder:
      "Please describe in your own words what is happening with the wheels or tyres.",
  },
  h_related: {
    id: "h_related",
    question: "Is it related to:",
    kind: "choice",
    options: [
      { id: "engine", label: "Engine, starting, or mechanical problem" },
      { id: "battery", label: "Electrical or battery issue" },
      { id: "body", label: "Body damage or accident" },
      { id: "tow", label: "Vehicle completely stuck and needs moving" },
      { id: "power", label: "Home/shop power" },
      { id: "house", label: "House repair" },
      { id: "clothing", label: "Clothing work" },
      { id: "tyre", label: "Still tyre / wheel related" },
    ],
  },
  h_power: {
    id: "h_power",
    question: "Home/shop power",
    kind: "choice",
    options: [
      { id: "generator", label: "Generator" },
      { id: "solar", label: "Solar" },
    ],
  },
  h_house: {
    id: "h_house",
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
  A: "a_which",
  B: "b_which",
  C: "c_time",
  D: "d_how",
  E: "e_symptoms",
  F: "f_which",
  G: "g_howmany",
  H: "h_describe",
};

function resolveScreen(answers: Record<string, string>): "confirm" | "final" {
  return resolveVulcanizerRoute(answers).needsConfirm ? "confirm" : "final";
}

export function vulcanizerScreen(id: string): VulcanizerScreen | undefined {
  return VULCANIZER_SCREENS[id];
}

export function nextVulcanizerScreen(
  current: string,
  answerId: string,
  answers: Record<string, string>,
): string {
  if (current === "start") return START_NEXT[answerId] || "h_describe";

  if (current === "a_which") {
    if (answerId === "more") return "g_howmany";
    return "a_object";
  }
  if (current === "a_object") return "a_spare";
  if (current === "a_spare") return "a_jack";
  if (current === "a_jack") return "a_safe";
  if (current === "a_safe") return resolveScreen(answers);

  if (current === "b_which") return "b_pull";
  if (current === "b_pull") return "b_rim";
  if (current === "b_rim") return "b_spare";
  if (current === "b_spare") return "b_safe";
  if (current === "b_safe") return resolveScreen(answers);

  if (current === "c_time") return "c_damage";
  if (current === "c_damage") return "c_air";
  if (current === "c_air") return "c_which";
  if (current === "c_which") return resolveScreen(answers);

  if (current === "d_how") return "d_air";
  if (current === "d_air") return "d_use";
  if (current === "d_use") return "d_need";
  if (current === "d_need") return resolveScreen(answers);

  if (current === "e_symptoms") return "e_last";
  if (current === "e_last") return "e_trigger";
  if (current === "e_trigger") return resolveScreen(answers);

  if (current === "f_which") return "f_supply";
  if (current === "f_supply") return "f_brand";
  if (current === "f_brand") return "f_balance";
  if (current === "f_balance") return resolveScreen(answers);

  if (current === "g_howmany") return "g_what";
  if (current === "g_what") return "g_spare";
  if (current === "g_spare") return "g_drive";
  if (current === "g_drive") return resolveScreen(answers);

  if (current === "h_describe") return "h_related";
  if (current === "h_related") {
    if (answerId === "power") return "h_power";
    if (answerId === "house") return "h_house";
    return resolveScreen(answers);
  }
  if (current === "h_power" || current === "h_house") {
    return resolveScreen(answers);
  }

  return "final";
}

/**
 * Narrow the tyre answers down to the most likely problem so the pro
 * arrives with the real issue already identified.
 */
export function vulcanizerDiagnosis(
  answers: Record<string, string>,
): string | undefined {
  const main = answers.start;

  if (main === "A") {
    if (answers.a_which === "more") {
      return "Multiple tyres affected likely a puncture or worn tyres";
    }
    if (answers.a_spare === "no") {
      return "No spare available tyre beyond a roadside fix";
    }
    return "Likely a puncture or flat tyre";
  }

  if (main === "B") return "Likely a burst or blown tyre";

  if (main === "C") return "Slow puncture or air loss";

  if (main === "D") {
    if (answers.d_how === "accident")
      return "Likely rim or wheel damage from an accident";
    return "Likely a damaged, bent, or cracked rim";
  }

  if (main === "E") return "Likely a wheel-balancing or alignment issue";

  if (main === "F") return "Tyre replacement needed";

  if (main === "G") {
    return "Multiple tyres affected likely worn or damaged tyres";
  }

  return undefined;
}

/**
 * Pick the trade from the filled answers. Tyre problems stay with Vulcanizer
 * unless the vehicle is unsafe, the tyres are beyond a fix, or the answers
 * clearly point to another trade.
 */
export function resolveVulcanizerRoute(
  answers: Record<string, string>,
): VulcanizerRoute {
  const diagnosis = vulcanizerDiagnosis(answers);
  const stay = (): VulcanizerRoute => ({
    trade: "vulcanizer",
    needsConfirm: false,
    diagnosis,
  });
  const leave = (
    trade: ProService,
    alternate?: ProService,
  ): VulcanizerRoute => ({
    trade,
    alternate,
    needsConfirm: true,
    diagnosis,
  });

  const main = answers.start;

  if (main === "A") {
    if (answers.a_which === "more") {
      return answers.g_drive === "no" ? leave("towing") : stay();
    }
    if (answers.a_spare === "no" || answers.a_safe === "road") {
      return leave("towing");
    }
    return stay();
  }

  if (main === "B") {
    if (answers.b_safe === "no" || answers.b_spare === "no") {
      return leave("towing", "vulcanizer");
    }
    if (answers.b_pull === "yes") {
      return leave("mechanic", "vulcanizer");
    }
    return stay();
  }

  if (main === "C") {
    return stay();
  }

  if (main === "D") {
    if (answers.d_use === "unsafe") {
      return leave("towing", "vulcanizer");
    }
    if (answers.d_how === "accident") {
      return leave("body", "vulcanizer");
    }
    return stay();
  }

  if (main === "E") {
    if (answers.e_symptoms === "loose") {
      return leave("mechanic", "vulcanizer");
    }
    return stay();
  }

  if (main === "F") {
    return stay();
  }

  if (main === "G") {
    return answers.g_drive === "no" ? leave("towing") : stay();
  }

  if (main === "H") {
    if (answers.h_related === "engine") return leave("mechanic");
    if (answers.h_related === "battery") return leave("battery", "electrical");
    if (answers.h_related === "body") return leave("body");
    if (answers.h_related === "tow") return leave("towing");
    if (answers.h_related === "power") {
      if (answers.h_power === "solar") return leave("solar");
      return leave("generator");
    }
    if (answers.h_related === "house") {
      if (answers.h_house === "plumber") return leave("plumber");
      if (answers.h_house === "painter") return leave("painter");
      return leave("carpenter");
    }
    if (answers.h_related === "clothing") return leave("fashion");
    return stay();
  }

  return stay();
}

export function applyVulcanizerConfirmChoice(
  route: VulcanizerRoute,
  yes: boolean,
): ProService {
  if (yes) return route.trade;
  if (route.alternate) return route.alternate;
  return "vulcanizer";
}

export function composeVulcanizerProblem(
  answers: Record<string, string>,
  extra: string,
  landmark: string,
): string {
  const lines: string[] = [];
  const start = vulcanizerScreen("start");
  if (start) {
    lines.push(start.question);
    const picked = VULCANIZER_START_OPTIONS.find((o) => o.id === answers.start);
    if (picked) lines.push(picked.label);
  }

  const order = Object.keys(answers).filter(
    (k) => k !== "start" && !k.endsWith("_label"),
  );
  for (const id of order) {
    const screen = vulcanizerScreen(id);
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
    lines.push(VULCANIZER_FINAL_COPY.location);
    lines.push(landmark.trim());
  }
  if (extra.trim()) {
    lines.push(VULCANIZER_FINAL_COPY.extra);
    lines.push(extra.trim());
  }
  const diagnosis = vulcanizerDiagnosis(answers);
  if (diagnosis) {
    lines.push(VULCANIZER_FINAL_COPY.diagnosis);
    lines.push(diagnosis);
  }
  return lines.filter(Boolean).join("\n");
}

export function canFindVulcanizerPro(photoCount: number): boolean {
  return photoCount >= VULCANIZER_MIN_PHOTOS;
}

export { canAdvanceText, confirmQuestion } from "@/lib/mechanic/question-tree";
