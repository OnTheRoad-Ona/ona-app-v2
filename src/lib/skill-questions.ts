import type { ProService } from "@/lib/types";

export type SkillFieldType =
  | "text"
  | "select"
  | "multiselect"
  | "boolean"
  | "file";

export type SkillFileValue = {
  name: string;
  dataUrl: string;
  mime: string;
};

export type SkillAnswerValue = string | string[] | SkillFileValue;

export type SkillQuestion = {
  id: string;
  label: string;
  hint?: string;
  type: SkillFieldType;
  required?: boolean;
  /** Show on public profile for motorists */
  public?: boolean;
  options?: string[];
  placeholder?: string;
  accept?: string;
  /** Max selections for multiselect (default 6 for specialties) */
  maxSelect?: number;
};

export type SkillFlow = {
  skill: ProService;
  title: string;
  intro: string;
  questions: SkillQuestion[];
};

const YES_NO = ["Yes", "No"] as const;

/** Mechanic can pick more; other skills max 4 */
export const MAX_SPECIALTIES = 6;
export const MAX_SPECIALTIES_OTHER = 4;

export function specialtyMaxForSkill(skill: ProService): number {
  return skill === "mechanic" ? MAX_SPECIALTIES : MAX_SPECIALTIES_OTHER;
}

/**
 * Specialties are strictly per skill. Never mixed across trades.
 * Compact labels, equal boxes, fit on one screen.
 */
/**
 * Core focus tags (strongholds) within each profession.
 * Selecting a skill means the pro can do ALL work in that trade;
 * these tags only highlight their strongest areas.
 */
export const SPECIALTIES_BY_SKILL: Record<ProService, readonly string[]> = {
  mechanic: [
    "Engine",
    "Brakes",
    "Suspension",
    "Clutch",
    "Gearbox",
    "Steering service",
    "Roadside service",
    "Cooling",
    "Exhaust",
    "Fuel system",
    "Belts & pulleys",
    "General service",
  ],
  vulcanizer: [
    "Puncture",
    "Tyre change",
    "Wheel balance",
    "Alignment",
    "Inflation",
    "TPMS",
    "Tubeless repair",
    "Spare mount",
  ],
  towing: [
    "Flatbed",
    "Wheel lift",
    "Winch",
    "Breakdown",
    "Accident",
    "Long distance",
    "Motorcycle tow",
    "Heavy recovery",
  ],
  battery: [
    "Jump start",
    "Battery replace",
    "Battery test",
    "Charging",
    "Terminal clean",
    "AGM battery",
  ],
  ac: [
    "Gas refill",
    "Cooling weak",
    "Compressor",
    "Cabin filter",
    "Leak check",
    "No cold air",
  ],
  body: [
    "Dent repair",
    "Panel beat",
    "Spray paint",
    "Bumper",
    "Windscreen",
    "Rust work",
    "Polish",
  ],
  electrical: [
    "Wiring",
    "Alternator",
    "Starter",
    "Lights",
    "Fuses",
    "Sensors",
    "Central lock",
    "Alarm",
  ],
  diagnostics: [
    "OBD scan",
    "Engine light",
    "ABS light",
    "Airbag light",
    "Coding",
    "Live data",
    "ECU check",
  ],
  wash: [
    "Exterior wash",
    "Interior clean",
    "Full detail",
    "Polish",
    "Engine bay",
    "Underbody",
    "Wax",
  ],
};

/** @deprecated use SPECIALTIES_BY_SKILL.mechanic */
export const CORE_SPECIALTIES = SPECIALTIES_BY_SKILL.mechanic;

export const CERTIFICATION_WARNING =
  "NOTE: If you upload fake papers, your account can be closed and you may face charges.";

const CERT_UPLOAD: SkillQuestion = {
  id: "certificationUpload",
  label: "Upload your certificate",
  hint: "Needed. Use PDF, JPG or PNG (trade paper, training letter or licence)",
  type: "file",
  required: true,
  public: false,
  accept: "image/*,.pdf,application/pdf",
};

/** Skill-specific agreement: full profession capability for selected brands. */
export const SKILL_AGREEMENTS: Record<ProService, string> = {
  mechanic:
    "By completing this process, you agree you can fix all engine and mechanical works of the selected motor brand(s).",
  vulcanizer:
    "By completing this process, you agree you can fix all tyre and wheel works of the selected motor brand(s).",
  towing:
    "By completing this process, you agree you can provide full tow and recovery for the selected motor brand(s).",
  battery:
    "By completing this process, you agree you can handle all battery and jump-start works of the selected motor brand(s).",
  ac: "By completing this process, you agree you can fix all air-conditioning works of the selected motor brand(s).",
  body: "By completing this process, you agree you can fix all body and paint works of the selected motor brand(s).",
  electrical:
    "By completing this process, you agree you can fix all electrical and wiring works of the selected motor brand(s).",
  diagnostics:
    "By completing this process, you agree you can run full diagnostics and scan works of the selected motor brand(s).",
  wash: "By completing this process, you agree you can provide full wash and detailing for the selected motor brand(s).",
};

function withCertAndSpecialties(
  flow: Omit<SkillFlow, "questions"> & {
    questions: SkillQuestion[];
  }
): SkillFlow {
  const specialtyOptions = [...SPECIALTIES_BY_SKILL[flow.skill]];
  const skillShort = flow.title
    .replace(" details", "")
    .replace(" questions", "");
  const maxSelect = specialtyMaxForSkill(flow.skill);
  const questions: SkillQuestion[] = [
    {
      id: "specialties",
      label: "My Repair Core Focus",
      hint: `Your strongholds within ${skillShort} (up to ${maxSelect}). You can still do all work in this profession.`,
      type: "multiselect",
      required: true,
      public: true,
      maxSelect,
      options: specialtyOptions,
    },
    ...flow.questions.filter((q) => q.id !== "specialties"),
    CERT_UPLOAD,
  ];
  return {
    skill: flow.skill,
    title: flow.title,
    intro: flow.intro,
    questions,
  };
}

export const SKILL_FLOWS: Record<ProService, SkillFlow> = {
  mechanic: withCertAndSpecialties({
    skill: "mechanic",
    title: "Mechanic details",
    intro: SKILL_AGREEMENTS.mechanic,
    questions: [
      {
        id: "mobileTools",
        label: "Do you come with tools?",
        type: "select",
        required: true,
        public: true,
        options: [...YES_NO],
      },
      {
        id: "certifications",
        label: "Name of your certificate or training",
        type: "text",
        required: true,
        public: true,
        placeholder: "e.g. Trade test, workshop training, apprenticeship",
      },
      {
        id: "callout",
        label: "Can you work at night or on weekends?",
        type: "select",
        required: true,
        public: true,
        options: [...YES_NO],
      },
    ],
  }),
  vulcanizer: withCertAndSpecialties({
    skill: "vulcanizer",
    title: "Vulcanizer details",
    intro: SKILL_AGREEMENTS.vulcanizer,
    questions: [
      {
        id: "mobileCompressor",
        label: "Do you have a compressor (air machine)?",
        type: "select",
        required: true,
        public: true,
        options: [...YES_NO],
      },
      {
        id: "tyreSizes",
        label: "Tyre sizes you work with",
        type: "text",
        public: true,
        placeholder: "e.g. small cars, buses, motorcycles",
      },
      {
        id: "callout",
        label: "Can you work at night or on weekends?",
        type: "select",
        required: true,
        public: true,
        options: [...YES_NO],
      },
    ],
  }),
  towing: withCertAndSpecialties({
    skill: "towing",
    title: "Towing details",
    intro: SKILL_AGREEMENTS.towing,
    questions: [
      {
        id: "towType",
        label: "What kind of tow vehicle do you use?",
        type: "text",
        required: true,
        public: true,
        placeholder: "e.g. flatbed, wheel lift, wrecker",
      },
      {
        id: "coverage",
        label: "How far can you go?",
        type: "text",
        public: true,
        placeholder: "e.g. within Lagos, interstate",
      },
      {
        id: "callout",
        label: "Can you work at night or on weekends?",
        type: "select",
        required: true,
        public: true,
        options: [...YES_NO],
      },
    ],
  }),
  battery: withCertAndSpecialties({
    skill: "battery",
    title: "Battery details",
    intro: SKILL_AGREEMENTS.battery,
    questions: [
      {
        id: "stock",
        label: "Do you carry spare batteries?",
        type: "select",
        required: true,
        public: true,
        options: [...YES_NO],
      },
      {
        id: "callout",
        label: "Can you work at night or on weekends?",
        type: "select",
        required: true,
        public: true,
        options: [...YES_NO],
      },
    ],
  }),
  ac: withCertAndSpecialties({
    skill: "ac",
    title: "A/C details",
    intro: SKILL_AGREEMENTS.ac,
    questions: [
      {
        id: "gasType",
        label: "Gas types you work with",
        type: "text",
        public: true,
        placeholder: "e.g. R134a, R1234yf",
      },
      {
        id: "callout",
        label: "Can you work at night or on weekends?",
        type: "select",
        required: true,
        public: true,
        options: [...YES_NO],
      },
    ],
  }),
  body: withCertAndSpecialties({
    skill: "body",
    title: "Body work details",
    intro: SKILL_AGREEMENTS.body,
    questions: [
      {
        id: "mobile",
        label: "Can you work at the customer location?",
        type: "select",
        required: true,
        public: true,
        options: [...YES_NO],
      },
      {
        id: "callout",
        label: "Can you work at night or on weekends?",
        type: "select",
        required: true,
        public: true,
        options: [...YES_NO],
      },
    ],
  }),
  electrical: withCertAndSpecialties({
    skill: "electrical",
    title: "Electrical details",
    intro: SKILL_AGREEMENTS.electrical,
    questions: [
      {
        id: "mobileTools",
        label: "Do you carry electrical tools?",
        type: "select",
        required: true,
        public: true,
        options: [...YES_NO],
      },
      {
        id: "callout",
        label: "Can you work at night or on weekends?",
        type: "select",
        required: true,
        public: true,
        options: [...YES_NO],
      },
    ],
  }),
  diagnostics: withCertAndSpecialties({
    skill: "diagnostics",
    title: "Diagnostics details",
    intro: SKILL_AGREEMENTS.diagnostics,
    questions: [
      {
        id: "scanTool",
        label: "Scan tool you use",
        type: "text",
        required: true,
        public: true,
        placeholder: "e.g. Launch, Autel, dealer tool",
      },
      {
        id: "callout",
        label: "Can you work at night or on weekends?",
        type: "select",
        required: true,
        public: true,
        options: [...YES_NO],
      },
    ],
  }),
  wash: withCertAndSpecialties({
    skill: "wash",
    title: "Car wash details",
    intro: SKILL_AGREEMENTS.wash,
    questions: [
      {
        id: "mobile",
        label: "Do you wash at the customer location?",
        type: "select",
        required: true,
        public: true,
        options: [...YES_NO],
      },
      {
        id: "callout",
        label: "Can you work at night or on weekends?",
        type: "select",
        required: true,
        public: true,
        options: [...YES_NO],
      },
    ],
  }),
};

export function getSkillFlow(skill: ProService): SkillFlow {
  return SKILL_FLOWS[skill];
}

export function isSkillFileValue(v: unknown): v is SkillFileValue {
  return (
    !!v &&
    typeof v === "object" &&
    "name" in v &&
    "dataUrl" in v &&
    typeof (v as SkillFileValue).name === "string"
  );
}

export function skillAnswersValid(
  skill: ProService,
  answers: Record<string, SkillAnswerValue>
): boolean {
  const flow = getSkillFlow(skill);
  for (const q of flow.questions) {
    if (!q.required) continue;
    const v = answers[q.id];
    if (q.type === "file") {
      if (!isSkillFileValue(v)) return false;
      continue;
    }
    if (q.type === "multiselect") {
      if (!Array.isArray(v) || v.length === 0) return false;
      continue;
    }
    if (typeof v !== "string" || !v.trim()) return false;
  }
  return true;
}

export function publicSkillRows(
  skill: ProService,
  answers?: Record<string, SkillAnswerValue>
): { label: string; value: string }[] {
  if (!answers) return [];
  const flow = getSkillFlow(skill);
  const rows: { label: string; value: string }[] = [];
  for (const q of flow.questions) {
    if (!q.public) continue;
    const v = answers[q.id];
    if (v == null) continue;
    if (isSkillFileValue(v)) {
      rows.push({ label: q.label, value: `Uploaded: ${v.name}` });
      continue;
    }
    if (Array.isArray(v)) {
      // Use stable public label for core focus
      const label =
        q.id === "specialties" ? "My Repair Core Focus" : q.label;
      if (v.length) rows.push({ label, value: v.join(", ") });
      continue;
    }
    if (String(v).trim()) rows.push({ label: q.label, value: String(v) });
  }
  return rows;
}

/** Pending docs = pro discovery radius capped at 2 km until admin approves. */
export const DOCS_PENDING_MAX_RADIUS_KM = 2;
