import type { ProService } from "@/lib/types";
import { qaLinesForPath } from "@/lib/help-flow-progress";

export const AC_START_QUESTION =
  "What is the main air-conditioning problem you are experiencing?";

export const AC_UNIT_QUESTION = "Is this a vehicle A/C or a home/office A/C?";

export const AC_FINAL_COPY = {
  urgency: "Urgency",
  normal: "Normal",
  emergency: "Emergency",
  remote: "Remote location",
  night: "Night service needed",
  photos:
    "Add clear photos (if accessible) of the A/C controls, vents, or outdoor unit",
  voice: "Record a short voice note describing the problem or the noise",
  location: "Current Location",
  extra: "Any other detail you want the technician to know?",
} as const;

export const AC_MIN_PHOTOS = 0;
export const AC_MAX_PHOTOS = 4;

export type AcScreenKind = "choice" | "text";

export type AcOption = {
  id: string;
  label: string;
};

export type AcScreen = {
  id: string;
  question: string;
  kind: AcScreenKind;
  options?: AcOption[];
  placeholder?: string;
};

export type AcRoute = {
  trade: ProService;
  needsConfirm: boolean;
};

export const AC_UNIT_OPTIONS: AcOption[] = [
  { id: "vehicle", label: "Vehicle A/C" },
  { id: "home", label: "Home or office A/C" },
];

export const AC_START_OPTIONS: AcOption[] = [
  { id: "A", label: "No cold air at all" },
  { id: "B", label: "Weak or insufficient cooling" },
  { id: "C", label: "Strange noise when A/C is turned on" },
  { id: "D", label: "Bad smell coming from the vents" },
  { id: "E", label: "A/C was working then suddenly stopped" },
  {
    id: "F",
    label: "Water leaking inside the vehicle or from the A/C unit",
  },
  { id: "G", label: "Something else / I'm not sure" },
];

const YES_NO: AcOption[] = [
  { id: "yes", label: "Yes" },
  { id: "no", label: "No" },
];

const YES_NO_UNSURE: AcOption[] = [
  { id: "yes", label: "Yes" },
  { id: "no", label: "No" },
  { id: "unsure", label: "I'm not sure" },
];

export const AC_SCREENS: Record<string, AcScreen> = {
  unit: {
    id: "unit",
    question: AC_UNIT_QUESTION,
    kind: "choice",
    options: AC_UNIT_OPTIONS,
  },
  u_type: {
    id: "u_type",
    question: "What type of A/C unit is it?",
    kind: "text",
    placeholder: "e.g. window unit, split unit, central, mini-split…",
  },
  start: {
    id: "start",
    question: AC_START_QUESTION,
    kind: "choice",
    options: AC_START_OPTIONS,
  },
  a_fan: {
    id: "a_fan",
    question: "Does the A/C fan blow air (even if the air is not cold)?",
    kind: "choice",
    options: YES_NO,
  },
  a_click: {
    id: "a_click",
    question:
      "Do you hear the compressor click or engage when you switch A/C on?",
    kind: "choice",
    options: YES_NO_UNSURE,
  },
  a_last_service: {
    id: "a_last_service",
    question: "When was the last time the A/C gas was refilled or serviced?",
    kind: "choice",
    options: [
      { id: "within_6m", label: "Within the last 6 months" },
      { id: "within_year", label: "Within the last year" },
      { id: "over_year", label: "Over a year ago" },
      { id: "never", label: "Never" },
      { id: "unsure", label: "Don't know" },
    ],
  },
  a_recent_work: {
    id: "a_recent_work",
    question: "Any recent work done on the A/C or electrical system?",
    kind: "choice",
    options: YES_NO,
  },
  b_behavior: {
    id: "b_behavior",
    question:
      "Does it cool a little and then become warm, or is it always weak?",
    kind: "choice",
    options: [
      { id: "then_warm", label: "Cools a little, then becomes warm" },
      { id: "always_weak", label: "Always weak" },
    ],
  },
  b_idle: {
    id: "b_idle",
    question:
      "Is the problem worse when the vehicle is idling or when driving?",
    kind: "choice",
    options: [
      { id: "idling", label: "Worse when idling" },
      { id: "driving", label: "Worse when driving" },
      { id: "same", label: "Same both ways" },
    ],
  },
  b_sides: {
    id: "b_sides",
    question: "Are both driver and passenger sides affected equally?",
    kind: "choice",
    options: [
      { id: "equal", label: "Yes, both equal" },
      { id: "one_side", label: "No, one side is worse" },
      { id: "unsure", label: "I'm not sure" },
    ],
  },
  b_noise: {
    id: "b_noise",
    question: "Any unusual noise or vibration when A/C is on?",
    kind: "choice",
    options: YES_NO,
  },
  c_sound: {
    id: "c_sound",
    question: "What does the noise sound like?",
    kind: "choice",
    options: [
      { id: "squealing", label: "Squealing / screeching" },
      { id: "rattling", label: "Rattling" },
      { id: "grinding", label: "Grinding" },
      { id: "clicking", label: "Clicking / knocking" },
      { id: "whining", label: "Whining" },
    ],
  },
  c_when: {
    id: "c_when",
    question:
      "Does the noise happen only when A/C is on, or also when it is off?",
    kind: "choice",
    options: [
      { id: "only_ac", label: "Only when A/C is on" },
      { id: "also_off", label: "Also when A/C is off" },
    ],
  },
  c_where: {
    id: "c_where",
    question:
      "Is the noise coming from the engine bay or from inside the dashboard?",
    kind: "choice",
    options: [
      { id: "engine_bay", label: "Engine bay" },
      { id: "dashboard", label: "Inside the dashboard" },
      { id: "unsure", label: "I'm not sure" },
    ],
  },
  d_smell: {
    id: "d_smell",
    question: "What kind of smell is it?",
    kind: "choice",
    options: [
      { id: "musty", label: "Musty / mouldy" },
      { id: "burning", label: "Burning / electrical" },
      { id: "sweet", label: "Sweet / chemical" },
      { id: "other", label: "Other" },
    ],
  },
  d_when_smell: {
    id: "d_when_smell",
    question:
      "Does the smell appear only when A/C is on or also with normal fan?",
    kind: "choice",
    options: [
      { id: "only_ac", label: "Only when A/C is on" },
      { id: "also_fan", label: "Also with normal fan" },
    ],
  },
  d_damp: {
    id: "d_damp",
    question:
      "Has the vehicle been parked for a long time or in a damp environment?",
    kind: "choice",
    options: YES_NO,
  },
  e_stopped: {
    id: "e_stopped",
    question: "Did it stop producing cold air suddenly or gradually?",
    kind: "choice",
    options: [
      { id: "suddenly", label: "Suddenly" },
      { id: "gradually", label: "Gradually" },
    ],
  },
  e_warning: {
    id: "e_warning",
    question: "Any warning lights on the dashboard?",
    kind: "choice",
    options: YES_NO,
  },
  e_noise_smell: {
    id: "e_noise_smell",
    question:
      "Did you hear a loud noise or smell something just before it stopped?",
    kind: "choice",
    options: YES_NO,
  },
  e_fuse: {
    id: "e_fuse",
    question: "Have you checked the A/C fuse or relay (if known)?",
    kind: "choice",
    options: [
      { id: "yes", label: "Yes, checked" },
      { id: "no", label: "No, not checked" },
      { id: "unsure", label: "Not sure / don't know where" },
    ],
  },
  f_where: {
    id: "f_where",
    question: "Where is the water leaking from?",
    kind: "choice",
    options: [
      {
        id: "cabin",
        label: "Inside the cabin (passenger footwell, etc.)",
      },
      { id: "under", label: "Under the vehicle" },
      { id: "unit", label: "From the A/C unit itself (home/office)" },
    ],
  },
  f_running: {
    id: "f_running",
    question: "Does the leak happen only when A/C is running?",
    kind: "choice",
    options: YES_NO,
  },
  f_amount: {
    id: "f_amount",
    question: "Is the amount of water small or significant?",
    kind: "choice",
    options: [
      { id: "small", label: "Small" },
      { id: "significant", label: "Significant" },
    ],
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
      { id: "engine", label: "Engine, starting or mechanical problem" },
      { id: "battery", label: "Battery or starting issue" },
      { id: "tyre", label: "Tyre or wheel problem" },
      { id: "body", label: "Body damage" },
      { id: "electrical", label: "Wiring or general electrical" },
      { id: "power", label: "Power generation at home/shop" },
      { id: "house", label: "House repair" },
      { id: "clothing", label: "Clothing" },
      { id: "ac", label: "Still A/C related" },
    ],
  },
};

const START_NEXT: Record<string, string> = {
  A: "a_fan",
  B: "b_behavior",
  C: "c_sound",
  D: "d_smell",
  E: "e_stopped",
  F: "f_where",
  G: "g_describe",
};

export function acScreen(id: string): AcScreen | undefined {
  return AC_SCREENS[id];
}

export function nextAcScreen(
  current: string,
  answerId: string,
  _answers: Record<string, string>,
): string {
  if (current === "unit") return answerId === "vehicle" ? "vehicle" : "u_type";
  if (current === "u_type") return "start";
  if (current === "start") return START_NEXT[answerId] || "g_describe";

  if (current === "a_fan") return "a_click";
  if (current === "a_click") return "a_last_service";
  if (current === "a_last_service") return "a_recent_work";
  if (current === "a_recent_work") return "final";

  if (current === "b_behavior") return "b_idle";
  if (current === "b_idle") return "b_sides";
  if (current === "b_sides") return "b_noise";
  if (current === "b_noise") return "final";

  if (current === "c_sound") return "c_when";
  if (current === "c_when") return "c_where";
  if (current === "c_where") return "final";

  if (current === "d_smell") return "d_when_smell";
  if (current === "d_when_smell") return "d_damp";
  if (current === "d_damp") return "final";

  if (current === "e_stopped") return "e_warning";
  if (current === "e_warning") return "e_noise_smell";
  if (current === "e_noise_smell") return "e_fuse";
  if (current === "e_fuse") return "final";

  if (current === "f_where") return "f_running";
  if (current === "f_running") return "f_amount";
  if (current === "f_amount") return "final";

  if (current === "g_describe") return "g_related";
  if (current === "g_related") return "final";

  return "final";
}

/**
 * A/C is a single-trade flow: no trade switching and no Tow anywhere.
 * Every path resolves to A/C without a confirm card.
 */
export function resolveAcRoute(_answers: Record<string, string>): AcRoute {
  return { trade: "ac", needsConfirm: false };
}

export function composeAcProblem(
  answers: Record<string, string>,
  extra: string,
  landmark: string,
): string {
  const lines = qaLinesForPath({
    answers,
    next: nextAcScreen,
    screenOf: acScreen,
    startId: answers.unit ? "unit" : "start",
    bridge: { vehicle: "start" },
  });

  if (landmark.trim()) {
    lines.push(AC_FINAL_COPY.location);
    lines.push(landmark.trim());
  }
  if (extra.trim()) {
    lines.push(AC_FINAL_COPY.extra);
    lines.push(extra.trim());
  }
  return lines.filter(Boolean).join("\n");
}

export function canAdvanceText(value: string): boolean {
  return value.trim().length >= 2;
}

export function canFindAcPro(photoCount: number): boolean {
  return photoCount >= AC_MIN_PHOTOS;
}

export function acBreadcrumb(stack: string[]): string {
  const bits: string[] = ["A/C"];
  if (stack.length > 1) {
    const firstBranch = stack[1];
    const letter = Object.entries(START_NEXT).find(
      ([, id]) => id === firstBranch,
    )?.[0];
    if (letter) bits.push(letter);
  }
  if (stack[stack.length - 1] === "final") bits.push("Send");
  return bits.join(" · ");
}
