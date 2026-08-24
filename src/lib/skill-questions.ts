import type { ProService } from "@/lib/types";

export type SkillFieldType =
  "text" | "select" | "multiselect" | "boolean" | "file";

export type SkillFileValue = {
  name: string;
  /** May be omitted when payload was capped for size (signup still valid). */
  dataUrl?: string;
  mime?: string;
  hasFile?: boolean;
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
  /**
   * Specialty-picker trades: labels MUST match ARTISAN_TRADE_CATALOG
   * so signup focus + home Home/Office chips + skill flow stay aligned.
   */
  ac: ["Vehicle", "Residential (Homes)", "Commercial", "Industrial"],
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
    "Vehicle",
    "Residential (Homes)",
    "Commercial",
    "Industrial",
    "Electronics",
    "Mobile",
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
  fashion: [
    "Bespoke tailoring",
    "Alterations",
    "Bridal wear",
    "Corporate wear",
    "Dress making",
    "Embroidery",
    "Native/traditional wear",
  ],
  plumber: [
    "Residential (Homes)",
    "Offices",
    "Commercial Plumbing",
    "Industrial Plumbing",
  ],
  carpenter: [
    "Residential (Homes)",
    "Offices",
    "Commercial Carpentry",
    "Industrial Carpentry",
    "Furniture & Fit-out",
  ],
  painter: [
    "Residential (Homes)",
    "Offices",
    "Commercial Painting",
    "Industrial Painting",
    "Exterior / Facade",
  ],
  solar: [
    "Residential (Homes)",
    "Offices",
    "Commercial Solar",
    "Industrial Solar",
  ],
  generator: [
    "Residential (Homes)",
    "Offices",
    "Commercial Generators",
    "Industrial Generators",
  ],
};

/** @deprecated use SPECIALTIES_BY_SKILL.mechanic */
export const CORE_SPECIALTIES = SPECIALTIES_BY_SKILL.mechanic;

export const CERTIFICATION_WARNING =
  "NOTE: If you upload fake papers, your account can be closed and you may face charges.";

const CERT_UPLOAD: SkillQuestion = {
  id: "certificationUpload",
  label: "Upload your certificate",
  hint: "Optional. PDF, JPG or PNG (trade paper, training letter or licence)",
  type: "file",
  required: false,
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
  fashion:
    "By completing this process, you agree you can provide fashion design and tailoring services for the jobs you accept.",
  plumber:
    "By completing this process, you agree you can handle plumbing and water works for the jobs you accept.",
  carpenter:
    "By completing this process, you agree you can handle carpentry and woodwork for the jobs you accept.",
  painter:
    "By completing this process, you agree you can handle painting and surface finishing for the jobs you accept.",
  solar:
    "By completing this process, you agree you can handle solar and inverter works for the jobs you accept.",
  generator:
    "By completing this process, you agree you can service and repair generators for the jobs you accept.",
};

function withCertAndSpecialties(
  flow: Omit<SkillFlow, "questions"> & {
    questions: SkillQuestion[];
  },
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
      hint: `Your strongholds within ${skillShort} (up to ${maxSelect}). By proceeding you accept to being able to do all work in this profession.`,
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
  fashion: withCertAndSpecialties({
    skill: "fashion",
    title: "Fashion design details",
    intro: SKILL_AGREEMENTS.fashion,
    questions: [
      {
        id: "mobile",
        label: "Do you visit customers for fittings?",
        type: "select",
        required: true,
        public: true,
        options: [...YES_NO],
      },
      {
        id: "callout",
        label: "Can you work evenings or at weekends?",
        type: "select",
        required: true,
        public: true,
        options: [...YES_NO],
      },
    ],
  }),
  plumber: withCertAndSpecialties({
    skill: "plumber",
    title: "Plumber details",
    intro: SKILL_AGREEMENTS.plumber,
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
        id: "callout",
        label: "Can you work at night or on weekends?",
        type: "select",
        required: true,
        public: true,
        options: [...YES_NO],
      },
    ],
  }),
  carpenter: withCertAndSpecialties({
    skill: "carpenter",
    title: "Carpenter details",
    intro: SKILL_AGREEMENTS.carpenter,
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
        id: "callout",
        label: "Can you work at night or on weekends?",
        type: "select",
        required: true,
        public: true,
        options: [...YES_NO],
      },
    ],
  }),
  painter: withCertAndSpecialties({
    skill: "painter",
    title: "Painter details",
    intro: SKILL_AGREEMENTS.painter,
    questions: [
      {
        id: "mobileTools",
        label: "Do you come with tools and materials?",
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
  solar: withCertAndSpecialties({
    skill: "solar",
    title: "Solar details",
    intro: SKILL_AGREEMENTS.solar,
    questions: [
      {
        id: "mobileTools",
        label: "Do you install on-site?",
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
  generator: withCertAndSpecialties({
    skill: "generator",
    title: "Generator details",
    intro: SKILL_AGREEMENTS.generator,
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
  // Fallback protects every trade if a key is ever missing
  return SKILL_FLOWS[skill] ?? SKILL_FLOWS.mechanic;
}

export function isSkillFileValue(v: unknown): v is SkillFileValue {
  if (!v || typeof v !== "object" || !("name" in v)) return false;
  const f = v as SkillFileValue;
  if (typeof f.name !== "string" || !f.name.trim()) return false;
  // Valid when we have bytes or at least a named upload
  return Boolean(f.dataUrl || f.hasFile || f.name);
}

export function skillAnswersValid(
  skill: ProService,
  answers: Record<string, SkillAnswerValue>,
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
  answers?: Record<string, SkillAnswerValue>,
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
      const label = q.id === "specialties" ? "My Repair Core Focus" : q.label;
      if (v.length) rows.push({ label, value: v.join(", ") });
      continue;
    }
    if (String(v).trim()) rows.push({ label: q.label, value: String(v) });
  }
  return rows;
}

/** Pending docs = pro discovery radius capped at 2 km until admin approves. */
export const DOCS_PENDING_MAX_RADIUS_KM = 2;
