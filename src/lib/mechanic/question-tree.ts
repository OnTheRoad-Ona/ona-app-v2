import type { ProService } from "@/lib/types";

export const MECHANIC_START_QUESTION = "What's wrong with your vehicle?";

export const MECHANIC_FINAL_COPY = {
  urgency: "Urgency",
  normal: "Normal",
  emergency: "Emergency",
  remote: "Remote location",
  night: "Night service needed",
  photos: "Add clear photos (at most 4)",
  voice: "Record a short voice note describing the problem",
  location: "Current Location",
  extra: "Any other detail you want the repair pro to know?",
  diagnosis: "Likely problem",
} as const;

export const MECHANIC_MIN_PHOTOS = 0;
export const MECHANIC_MAX_PHOTOS = 4;

export type MechanicScreenKind = "choice" | "text";

export type MechanicOption = {
  id: string;
  label: string;
};

export type MechanicScreen = {
  id: string;
  question: string;
  kind: MechanicScreenKind;
  options?: MechanicOption[];
  placeholder?: string;
};

export type MechanicRoute = {
  trade: ProService;
  alternate?: ProService;
  needsConfirm: boolean;
  diagnosis?: string;
};

export const MECHANIC_START_OPTIONS: MechanicOption[] = [
  { id: "A", label: "The vehicle will not start at all" },
  {
    id: "B",
    label: "The vehicle starts but stops, loses power, or stalls while driving",
  },
  { id: "C", label: "Strange noise coming from the vehicle" },
  { id: "D", label: "Overheating or temperature warning" },
  { id: "E", label: "Smoke, burning smell, or unusual smell" },
  { id: "F", label: "Fluid leak (oil, water, fuel, etc.)" },
  { id: "G", label: "Transmission / gear / clutch problem" },
  { id: "H", label: "Body damage, dent, or accident-related" },
  { id: "I", label: "Tyre or wheel problem" },
  { id: "J", label: "Something else / I am not sure" },
  { id: "K", label: "Electric vehicle (EV) problem" },
];

const YES_NO: MechanicOption[] = [
  { id: "yes", label: "Yes" },
  { id: "no", label: "No" },
];

export const MECHANIC_SCREENS: Record<string, MechanicScreen> = {
  start: {
    id: "start",
    question: MECHANIC_START_QUESTION,
    kind: "choice",
    options: MECHANIC_START_OPTIONS,
  },
  a_what: {
    id: "a_what",
    question: "When you turn the key or press the start button, what happens?",
    kind: "choice",
    options: [
      { id: "silent", label: "Completely silent / nothing happens" },
      { id: "lights_no_crank", label: "Lights come on but no cranking sound" },
      { id: "cranks_no_start", label: "Cranks normally but does not start" },
      { id: "weak_crank", label: "Cranks very slowly / weakly" },
    ],
  },
  a_lights: {
    id: "a_lights",
    question: "Are the dashboard lights and headlights working?",
    kind: "choice",
    options: [
      { id: "normal", label: "Yes, normal" },
      { id: "dim", label: "Yes, but very dim" },
      { id: "none", label: "No lights at all" },
    ],
  },
  a_when: {
    id: "a_when",
    question:
      "Did this happen suddenly or after the car was parked for a long time?",
    kind: "choice",
    options: [
      { id: "suddenly", label: "Suddenly" },
      {
        id: "parked_long",
        label: "After the car was parked for a long time",
      },
    ],
  },
  a_recent: {
    id: "a_recent",
    question: "Any recent battery, electrical, or jump-start work?",
    kind: "choice",
    options: YES_NO,
  },
  a_danger: {
    id: "a_danger",
    question: "Is the vehicle in a dangerous location?",
    kind: "choice",
    options: YES_NO,
  },
  b_how: {
    id: "b_how",
    question: "How did it stop?",
    kind: "choice",
    options: [
      { id: "suddenly", label: "Suddenly like someone switched it off" },
      { id: "shook", label: "Shook, jerked or sputtered first" },
      { id: "gradual", label: "Lost power gradually" },
    ],
  },
  b_warning: {
    id: "b_warning",
    question: "Any warning light on before or when it stopped?",
    kind: "choice",
    options: [
      { id: "battery", label: "Battery light" },
      { id: "check_engine", label: "Check engine light" },
      { id: "temperature", label: "Temperature light" },
      { id: "oil", label: "Oil light" },
      { id: "none", label: "None" },
    ],
  },
  b_restart: {
    id: "b_restart",
    question: "Does it restart after waiting a few minutes?",
    kind: "choice",
    options: YES_NO,
  },
  b_load: {
    id: "b_load",
    question:
      "Did this happen under load (climbing, accelerating) or at any time?",
    kind: "choice",
    options: [
      { id: "under_load", label: "Under load (climbing, accelerating)" },
      { id: "any_time", label: "At any time" },
    ],
  },
  b_move: {
    id: "b_move",
    question: "Can the vehicle move safely?",
    kind: "choice",
    options: YES_NO,
  },
  c_where: {
    id: "c_where",
    question: "Where is the noise coming from?",
    kind: "choice",
    options: [
      { id: "engine", label: "Engine area (front)" },
      { id: "under", label: "Under the car" },
      { id: "wheels", label: "Wheels / tyres" },
      { id: "exhaust", label: "Exhaust" },
      { id: "cabin", label: "Inside the cabin" },
    ],
  },
  c_when: {
    id: "c_when",
    question: "When does the noise happen?",
    kind: "choice",
    options: [
      { id: "idle", label: "Only when the engine is running (idle)" },
      { id: "moving", label: "Only when moving" },
      { id: "turning", label: "When turning" },
      { id: "braking", label: "When braking" },
      { id: "always", label: "Always" },
    ],
  },
  c_sound: {
    id: "c_sound",
    question: "What does the noise sound like?",
    kind: "choice",
    options: [
      { id: "knocking", label: "Knocking / metallic" },
      { id: "whining", label: "Whining / whistling" },
      { id: "grinding", label: "Grinding" },
      { id: "squealing", label: "Squealing" },
      { id: "rattling", label: "Rattling" },
    ],
  },
  c_safe: {
    id: "c_safe",
    question: "Is the vehicle safe to drive?",
    kind: "choice",
    options: YES_NO,
  },
  d_red: {
    id: "d_red",
    question:
      "Is the temperature needle in the red or is there a warning light?",
    kind: "choice",
    options: YES_NO,
  },
  d_steam: {
    id: "d_steam",
    question: "Is there steam or coolant leaking under the car?",
    kind: "choice",
    options: YES_NO,
  },
  d_fan: {
    id: "d_fan",
    question: "Does the engine fan come on?",
    kind: "choice",
    options: YES_NO,
  },
  d_when: {
    id: "d_when",
    question:
      "When did it start overheating? (After long drive / in traffic / suddenly)",
    kind: "choice",
    options: [
      { id: "long_drive", label: "After long drive" },
      { id: "traffic", label: "In traffic" },
      { id: "suddenly", label: "Suddenly" },
    ],
  },
  d_ac: {
    id: "d_ac",
    question: "Was the A/C recently worked on?",
    kind: "choice",
    options: YES_NO,
  },
  d_safe: {
    id: "d_safe",
    question: "Is it safe to drive?",
    kind: "choice",
    options: YES_NO,
  },
  e_color: {
    id: "e_color",
    question: "What colour is the smoke?",
    kind: "choice",
    options: [
      { id: "white", label: "White" },
      { id: "blue", label: "Blue / grey" },
      { id: "black", label: "Black" },
      { id: "smell_only", label: "No smoke, only burning smell" },
    ],
  },
  e_where: {
    id: "e_where",
    question:
      "Where is the smoke coming from? (Bonnet / exhaust / under the car)",
    kind: "choice",
    options: [
      { id: "bonnet", label: "Bonnet" },
      { id: "exhaust", label: "Exhaust" },
      { id: "under", label: "Under the car" },
    ],
  },
  f_color: {
    id: "f_color",
    question: "What colour is the fluid?",
    kind: "choice",
    options: [
      { id: "oil", label: "Black / brown (oil)" },
      { id: "coolant", label: "Green / red / blue (coolant)" },
      { id: "clear", label: "Clear / yellowish (fuel or brake fluid)" },
      { id: "unknown", label: "I don’t know" },
    ],
  },
  f_where: {
    id: "f_where",
    question: "Where is the leak coming from?",
    kind: "text",
    placeholder: "Where is the leak coming from?",
  },
  f_safe: {
    id: "f_safe",
    question: "Is the vehicle safe to drive?",
    kind: "choice",
    options: YES_NO,
  },
  g_type: {
    id: "g_type",
    question: "Manual or Automatic transmission?",
    kind: "choice",
    options: [
      { id: "manual", label: "Manual" },
      { id: "automatic", label: "Automatic" },
      { id: "hybrid", label: "Hybrid" },
      { id: "electric", label: "Electric" },
    ],
  },
  g_ev: {
    id: "g_ev",
    question: "Which EV drivetrain symptom?",
    kind: "choice",
    options: [
      { id: "no_drive", label: "No drive / won't move" },
      { id: "loss_power", label: "Loss of power while driving" },
      { id: "noise", label: "Whining or unusual noise" },
      { id: "warning", label: "Motor or powertrain warning light" },
    ],
  },
  g_what: {
    id: "g_what",
    question:
      "What exactly is happening? (Hard to change gear / slipping / no drive / noise when changing gear)",
    kind: "choice",
    options: [
      { id: "hard", label: "Hard to change gear" },
      { id: "slipping", label: "Slipping" },
      { id: "no_drive", label: "No drive" },
      { id: "noise", label: "Noise when changing gear" },
    ],
  },
  h_light: {
    id: "h_light",
    question: "Which light(s) are on?",
    kind: "choice",
    options: [
      { id: "battery", label: "Battery / charging light" },
      { id: "check_engine", label: "Check engine light" },
      { id: "multiple", label: "Multiple lights" },
      { id: "other", label: "Other" },
    ],
  },
  h_parts: {
    id: "h_parts",
    question:
      "Are any electrical parts not working (windows, radio, lights, etc.)?",
    kind: "choice",
    options: YES_NO,
  },
  i_accident: {
    id: "i_accident",
    question: "Was there an accident or collision?",
    kind: "choice",
    options: YES_NO,
  },
  i_parts: {
    id: "i_parts",
    question: "Which parts are damaged?",
    kind: "text",
    placeholder: "Which parts are damaged?",
  },
  i_driveable: {
    id: "i_driveable",
    question: "Is the vehicle still driveable?",
    kind: "choice",
    options: YES_NO,
  },
  i_paint: {
    id: "i_paint",
    question: "Is painting also needed?",
    kind: "choice",
    options: YES_NO,
  },
  j_kind: {
    id: "j_kind",
    question: "Flat, burst, slow puncture, or damaged rim?",
    kind: "choice",
    options: [
      { id: "flat", label: "Flat" },
      { id: "burst", label: "Burst" },
      { id: "puncture", label: "Slow puncture" },
      { id: "rim", label: "Damaged rim" },
    ],
  },
  j_which: {
    id: "j_which",
    question: "Which tyre(s)?",
    kind: "text",
    placeholder: "Which tyre(s)?",
  },
  j_spare: {
    id: "j_spare",
    question: "Do you have a good spare?",
    kind: "choice",
    options: YES_NO,
  },
  j_multi: {
    id: "j_multi",
    question: "Multiple tyres or unsafe location?",
    kind: "choice",
    options: YES_NO,
  },
  k_vehicle: {
    id: "k_vehicle",
    question: "Is it vehicle A/C?",
    kind: "choice",
    options: YES_NO,
  },
  k_issue: {
    id: "k_issue",
    question: "No cold air / weak cooling / noise / bad smell?",
    kind: "choice",
    options: [
      { id: "no_cold", label: "No cold air" },
      { id: "weak", label: "Weak cooling" },
      { id: "noise", label: "Noise" },
      { id: "smell", label: "Bad smell" },
    ],
  },
  l_describe: {
    id: "l_describe",
    question: "Please describe in your own words what is happening.",
    kind: "text",
    placeholder: "Please describe in your own words what is happening.",
  },
  l_related: {
    id: "l_related",
    question: "Is it related to:",
    kind: "choice",
    options: [
      { id: "power", label: "Power generation at home/shop" },
      { id: "house", label: "House/office repair" },
      { id: "clothing", label: "Clothing / fabric work" },
      { id: "vehicle", label: "Still vehicle related" },
    ],
  },
  l_power: {
    id: "l_power",
    question: "Power generation at home/shop",
    kind: "choice",
    options: [
      { id: "generator", label: "Generator" },
      { id: "solar", label: "Solar" },
    ],
  },
  l_house: {
    id: "l_house",
    question: "House/office repair",
    kind: "choice",
    options: [
      { id: "carpenter", label: "Carpenter" },
      { id: "plumber", label: "Plumber" },
      { id: "painter", label: "Painter" },
    ],
  },
  ev_issue: {
    id: "ev_issue",
    question: "Which EV issue?",
    kind: "choice",
    options: [
      { id: "charging", label: "Charging problem / won't charge" },
      { id: "battery", label: "Battery / range problem" },
      { id: "motor_no_drive", label: "No drive / motor problem" },
      { id: "won_t_start", label: "Won't start (silent or weak)" },
      { id: "other", label: "Other EV issue" },
    ],
  },
  ev_other: {
    id: "ev_other",
    question: "Please describe the EV problem in your own words.",
    kind: "text",
    placeholder: "Please describe the EV problem in your own words.",
  },
};

const START_NEXT: Record<string, string> = {
  A: "a_what",
  B: "b_how",
  C: "c_where",
  D: "d_red",
  E: "e_color",
  F: "f_color",
  G: "g_type",
  H: "i_accident",
  I: "j_kind",
  J: "l_describe",
  K: "ev_issue",
};

function resolveScreen(answers: Record<string, string>): "confirm" | "final" {
  return resolveMechanicRoute(answers).needsConfirm ? "confirm" : "final";
}

export function mechanicScreen(id: string): MechanicScreen | undefined {
  return MECHANIC_SCREENS[id];
}

export function nextMechanicScreen(
  current: string,
  answerId: string,
  answers: Record<string, string>,
): string {
  if (current === "start") {
    if (answers.powertrain === "Electric" && answerId === "G") {
      return "g_ev";
    }
    return START_NEXT[answerId] || "l_describe";
  }

  if (current === "a_what") return "a_lights";
  if (current === "a_lights") return "a_when";
  if (current === "a_when") return "a_recent";
  if (current === "a_recent") return "a_danger";
  if (current === "a_danger") return resolveScreen(answers);

  if (current === "b_how") return "b_warning";
  if (current === "b_warning") return "b_restart";
  if (current === "b_restart") return "b_load";
  if (current === "b_load") return "b_move";
  if (current === "b_move") return resolveScreen(answers);

  if (current === "c_where") return "c_when";
  if (current === "c_when") return "c_sound";
  if (current === "c_sound") return "c_safe";
  if (current === "c_safe") return resolveScreen(answers);

  if (current === "d_red") return "d_steam";
  if (current === "d_steam") return "d_fan";
  if (current === "d_fan") return "d_when";
  if (current === "d_when") return "d_ac";
  if (current === "d_ac") return "d_safe";
  if (current === "d_safe") return resolveScreen(answers);

  if (current === "e_color") return "e_where";
  if (current === "e_where") return resolveScreen(answers);

  if (current === "f_color") return "f_where";
  if (current === "f_where") return "f_safe";
  if (current === "f_safe") return resolveScreen(answers);

  if (current === "g_type") {
    if (answerId === "electric") return "g_ev";
    return "g_what";
  }
  if (current === "g_what") return resolveScreen(answers);
  if (current === "g_ev") return resolveScreen(answers);

  if (current === "h_light") return "h_parts";
  if (current === "h_parts") return resolveScreen(answers);

  if (current === "i_accident") return "i_parts";
  if (current === "i_parts") return "i_driveable";
  if (current === "i_driveable") return "i_paint";
  if (current === "i_paint") return resolveScreen(answers);

  if (current === "j_kind") return "j_which";
  if (current === "j_which") return "j_spare";
  if (current === "j_spare") return "j_multi";
  if (current === "j_multi") return resolveScreen(answers);

  if (current === "k_vehicle") return "k_issue";
  if (current === "k_issue") return resolveScreen(answers);

  if (current === "l_describe") return "l_related";
  if (current === "l_related") {
    if (answerId === "power") return "l_power";
    if (answerId === "house") return "l_house";
    return resolveScreen(answers);
  }
  if (current === "l_power" || current === "l_house") {
    return resolveScreen(answers);
  }

  if (current === "ev_issue") {
    if (answerId === "other") return "ev_other";
    return resolveScreen(answers);
  }
  if (current === "ev_other") return resolveScreen(answers);

  return "final";
}

/**
 * Narrow the answers down to the most likely problem. This is a plain-language
 * "Likely problem" line that rides along in the job summary so the pro arrives
 * with the real issue already identified not a trade guess.
 */
export function mechanicDiagnosis(
  answers: Record<string, string>,
): string | undefined {
  const main = answers.start;

  if (main === "A") {
    const what = answers.a_what;
    const lights = answers.a_lights;
    if (what === "silent" && lights === "none") {
      return "Likely a dead battery or a blown fuse";
    }
    if (what === "lights_no_crank") {
      return "Likely a battery or starting-circuit fault";
    }
    if (what === "weak_crank") {
      return "Likely a weak or failing battery";
    }
    if (what === "silent") {
      return "Likely a starter or electrical fault";
    }
    return "Likely a fuel, spark, or sensor fault preventing start";
  }

  if (main === "B") {
    if (answers.b_how === "suddenly" && answers.b_warning === "battery") {
      return "Likely a charging or electrical fault";
    }
    if (answers.b_how === "suddenly") {
      return "Likely a fuel or ignition fault that cut power";
    }
    if (answers.b_how === "shook") {
      return "Likely a fuel or ignition fault under load";
    }
    return "Likely a fuel or engine-management fault";
  }

  if (main === "C") {
    if (
      answers.c_where === "wheels" ||
      answers.c_when === "turning" ||
      answers.c_when === "braking"
    ) {
      return "Likely a wheel, brake, or suspension issue";
    }
    if (answers.c_where === "under") {
      return "Likely an exhaust, mount, or underbody issue";
    }
    return "Likely an engine or drivetrain noise";
  }

  if (main === "D") {
    if (answers.d_ac === "yes") return "Likely related to recent A/C work";
    if (answers.d_red === "yes") {
      return "Likely a cooling-system fault (thermostat, fan, or coolant)";
    }
    return "Likely a cooling-system fault";
  }

  if (main === "E") {
    if (answers.e_color === "white") return "Likely coolant burning";
    if (answers.e_color === "blue")
      return "Likely oil burning (engine or turbo)";
    if (answers.e_color === "black")
      return "Likely a fuel or air mixture issue";
    return "Likely an electrical short or burnt component";
  }

  if (main === "F") {
    if (answers.f_color === "coolant") return "Likely a coolant leak";
    if (answers.f_color === "oil") return "Likely an oil leak";
    return "Likely a fuel or brake-fluid leak";
  }

  if (main === "G") {
    if (answers.g_type === "electric" || answers.g_ev) {
      if (answers.g_ev === "no_drive")
        return "Vehicle has no drive (EV motor or inverter fault)";
      if (answers.g_ev === "loss_power")
        return "Likely an EV motor or inverter fault";
      if (answers.g_ev === "warning") return "EV powertrain warning light on";
      return "Likely an EV motor or drivetrain noise";
    }
    if (answers.g_what === "no_drive") return "Vehicle has no drive";
    if (answers.g_what === "slipping")
      return "Likely a slipping clutch or transmission";
    if (answers.g_what === "hard")
      return "Likely a gearbox or clutch engagement fault";
    return "Likely a transmission fault";
  }

  if (main === "K") {
    if (answers.ev_issue === "charging") {
      return "Likely an EV charging fault (charger, cable, or charge port)";
    }
    if (answers.ev_issue === "battery") {
      return "Likely an EV high-voltage (HV) battery or range fault";
    }
    if (answers.ev_issue === "motor_no_drive") {
      return "Likely an EV motor or inverter fault";
    }
    if (answers.ev_issue === "won_t_start") {
      return "Likely an EV 12V auxiliary battery or start-controller fault";
    }
    return "EV problem (customer described)";
  }

  if (main === "H") return "Body and panel damage";
  if (main === "I") return "Tyre or wheel issue";

  return undefined;
}

/**
 * Pick the trade from the filled answers. Leaving Mechanic always
 * needs a confirm card. Two-trade forks pick the stronger one first.
 */
export function resolveMechanicRoute(
  answers: Record<string, string>,
): MechanicRoute {
  const diagnosis = mechanicDiagnosis(answers);
  const stay = (): MechanicRoute => ({
    trade: "mechanic",
    needsConfirm: false,
    diagnosis,
  });
  const leave = (trade: ProService, alternate?: ProService): MechanicRoute => ({
    trade,
    alternate,
    needsConfirm: trade !== "mechanic",
    diagnosis,
  });

  // Tow rule: the customer said the vehicle can still move (safe-to-drive
  // answer "yes") → never route to Tow from a driveability answer. A
  // dangerous-location / multi-tyre flag may still warrant Tow on its own.
  const unsafeToDrive =
    answers.b_move === "no" ||
    answers.c_safe === "no" ||
    answers.d_safe === "no" ||
    answers.f_safe === "no" ||
    answers.i_driveable === "no";
  const unsafeLocation =
    answers.a_danger === "yes" || answers.j_multi === "yes";

  if (unsafeToDrive || unsafeLocation) {
    return leave("towing");
  }

  const main = answers.start;

  if (main === "A") {
    const what = answers.a_what;
    const lights = answers.a_lights;
    if (what === "silent" && lights === "none") {
      return leave("battery", "electrical");
    }
    if (what === "lights_no_crank") {
      return leave("electrical", "battery");
    }
    if (what === "weak_crank") {
      return leave("battery");
    }
    if (what === "silent" && lights !== "none") {
      return leave("electrical", "battery");
    }
    return stay();
  }

  if (main === "B") {
    if (answers.b_how === "suddenly" && answers.b_warning === "battery") {
      return leave("electrical", "battery");
    }
    return stay();
  }

  if (main === "C") {
    if (
      answers.c_where === "wheels" ||
      answers.c_when === "turning" ||
      answers.c_when === "braking"
    ) {
      return leave("vulcanizer");
    }
    return stay();
  }

  if (main === "D") {
    if (answers.d_ac === "yes") return leave("ac");
    return stay();
  }

  if (main === "E") {
    if (answers.e_color === "smell_only") return leave("electrical");
    return stay();
  }

  if (main === "F") return stay();

  if (main === "G") {
    if (answers.g_what === "no_drive" || answers.g_ev === "no_drive") {
      return leave("towing");
    }
    if (answers.g_type === "electric" || answers.g_ev) {
      return leave("electrical", "mechanic");
    }
    return stay();
  }

  if (main === "K") {
    if (answers.ev_issue === "charging") return leave("electrical", "mechanic");
    if (answers.ev_issue === "battery") return leave("battery", "electrical");
    if (answers.ev_issue === "motor_no_drive") {
      return leave("towing");
    }
    if (answers.ev_issue === "won_t_start")
      return leave("battery", "electrical");
    return stay();
  }

  if (main === "H") {
    return leave("body");
  }

  if (main === "I") {
    return leave("vulcanizer");
  }

  if (main === "J") {
    if (answers.l_related === "clothing") return leave("fashion");
    if (answers.l_related === "power") {
      if (answers.l_power === "solar") return leave("solar");
      return leave("generator");
    }
    if (answers.l_related === "house") {
      if (answers.l_house === "plumber") return leave("plumber");
      if (answers.l_house === "painter") return leave("painter");
      return leave("carpenter");
    }
    return stay();
  }

  return stay();
}

export function applyConfirmChoice(
  route: MechanicRoute,
  yes: boolean,
): ProService {
  if (yes) return route.trade;
  if (route.alternate) return route.alternate;
  return "mechanic";
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

export function composeMechanicProblem(
  answers: Record<string, string>,
  extra: string,
  landmark: string,
): string {
  const lines: string[] = [];
  const start = mechanicScreen("start");
  if (start) {
    lines.push(start.question);
    const picked = MECHANIC_START_OPTIONS.find((o) => o.id === answers.start);
    if (picked) lines.push(picked.label);
  }

  const order = Object.keys(answers).filter(
    (k) => k !== "start" && !k.endsWith("_label"),
  );
  for (const id of order) {
    const screen = mechanicScreen(id);
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
    lines.push(MECHANIC_FINAL_COPY.location);
    lines.push(landmark.trim());
  }
  if (extra.trim()) {
    lines.push(MECHANIC_FINAL_COPY.extra);
    lines.push(extra.trim());
  }
  const diagnosis = mechanicDiagnosis(answers);
  if (diagnosis) {
    lines.push(MECHANIC_FINAL_COPY.diagnosis);
    lines.push(diagnosis);
  }
  return lines.filter(Boolean).join("\n");
}

export function canAdvanceText(value: string): boolean {
  return value.trim().length >= 2;
}

export function canFindMechanicPro(photoCount: number): boolean {
  return photoCount >= MECHANIC_MIN_PHOTOS;
}

export function mechanicBreadcrumb(stack: string[]): string {
  const bits: string[] = ["Mechanic"];
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
