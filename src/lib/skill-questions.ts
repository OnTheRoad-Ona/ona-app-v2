import type { ProService } from "@/lib/types";

/**
 * Skill-specific signup questions shown after a Repair Pro picks one skill.
 * Specialties use plain language a roadside repairer understands.
 * Max 6 specialty choices.
 */

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
  options?: string[];
  placeholder?: string;
  /** Max selections for multiselect (default 6 for specialties) */
  maxSelect?: number;
  /** Show this answer on public motorist-facing profile */
  public?: boolean;
  accept?: string;
};

export type SkillFlow = {
  skill: ProService;
  title: string;
  intro: string;
  questions: SkillQuestion[];
};

const YES_NO = ["Yes", "No"];

/** Max specialties a pro can pick on skill signup */
export const MAX_SPECIALTIES = 6;

/**
 * Specialties are strictly per skill — never mixed across trades.
 * Plain language a roadside repairer understands.
 */
export const SPECIALTIES_BY_SKILL: Record<ProService, readonly string[]> = {
  /** Compact labels — equal boxes, fit on one screen */
  mechanic: [
    "Engine problems",
    "Oil change",
    "Brake repair",
    "Gearbox",
    "Clutch",
    "Suspension",
    "Steering",
    "Radiator",
    "Fuel system",
    "Spark plugs",
    "Exhaust",
    "Fan belt",
    "Drive shaft",
    "General service",
    "Roadside fix",
  ],
  vulcanizer: [
    "Puncture repair",
    "Tube change",
    "Tyre change",
    "Wheel balancing",
    "Air / inflate tyres",
    "Sell tyres",
    "Motorcycle tyres",
    "Light truck tyres",
    "Remove stuck wheel",
    "Check tyre pressure",
  ],
  towing: [
    "Flatbed (car on bed)",
    "Wheel lift tow",
    "Rope / chain pull",
    "Winch pull-out",
    "Motorcycle tow",
    "Heavy truck tow",
    "Accident recovery",
    "Highway recovery",
    "Stuck in mud / ditch",
    "Long-distance tow",
  ],
  battery: [
    "Jump start",
    "Test battery",
    "Sell & fit battery",
    "Charge battery",
    "Check alternator",
    "Check starter",
    "Clean terminals",
    "Car batteries (12V)",
    "Truck batteries (24V)",
    "Motorcycle batteries",
  ],
  ac: [
    "Refill A/C gas",
    "Find A/C leaks",
    "A/C not cooling",
    "Compressor repair",
    "Change cabin filter",
    "A/C full check",
    "Blower / fan not working",
    "Strange A/C noise",
    "Bad A/C smell",
    "Mobile A/C service",
  ],
  body: [
    "Remove dents",
    "Panel beating",
    "Spray paint",
    "Bumper repair",
    "Windscreen help",
    "Polish / shine",
    "Rust treatment",
    "Scratch repair",
    "Headlamp restore",
    "Accident body repair",
  ],
  electrical: [
    "Wiring problems",
    "Lights not working",
    "Alternator / charging",
    "Starter not turning",
    "Fuses & relays",
    "Car alarm / lock",
    "Power windows",
    "Sensors",
    "Horn / wipers",
    "Battery drain",
  ],
  diagnostics: [
    "Scan / computer check",
    "Plug in scan tool",
    "Read fault codes",
    "Clear check-engine light",
    "Live data check",
    "Battery health test",
    "ABS light problems",
    "Gearbox codes",
    "Sensor faults",
    "Give written report",
  ],
  wash: [
    "Exterior wash",
    "Interior cleaning",
    "Full wash & vacuum",
    "Engine bay wash",
    "Polish / wax",
    "Mobile wash (come to you)",
    "Seat cleaning",
    "Dashboard clean",
    "Headlamp polish",
    "Fleet / company wash",
  ],
};

/** @deprecated use SPECIALTIES_BY_SKILL.mechanic — kept for imports */
export const CORE_SPECIALTIES = SPECIALTIES_BY_SKILL.mechanic;

export const CERTIFICATION_WARNING =
  "NOTE THAT YOU MAY LOSE YOUR ACCOUNT AND GET CHARGED IF FOUND GUILTY OF FALSIFYING DOCUMENT";

const CERT_UPLOAD: SkillQuestion = {
  id: "certificationUpload",
  label: "Upload your certificate",
  hint: "Required · PDF, JPG, or PNG (trade paper, training, or license)",
  type: "file",
  required: true,
  public: false,
  accept: "image/*,.pdf,application/pdf",
};

function withCertAndSpecialties(
  flow: Omit<SkillFlow, "questions"> & {
    questions: SkillQuestion[];
  }
): SkillFlow {
  /** Always use this skill’s own list — never borrow from another trade */
  const specialtyOptions = [...SPECIALTIES_BY_SKILL[flow.skill]];
  const questions: SkillQuestion[] = [
    {
      id: "specialties",
      label: "What you can fix",
      hint: `Pick up to ${MAX_SPECIALTIES} — only ${flow.title.replace(" details", "")} jobs`,
      type: "multiselect",
      required: true,
      public: true,
      maxSelect: MAX_SPECIALTIES,
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
    intro: "Mechanical jobs only — not tyres, scan tools, wash, or body paint.",
    questions: [
      {
        id: "mobileTools",
        label: "Do you carry tools in your vehicle?",
        type: "select",
        required: true,
        public: true,
        options: YES_NO,
      },
      {
        id: "certifications",
        label: "Name of your certificate / training",
        type: "text",
        required: true,
        public: true,
        placeholder: "e.g. Trade test, workshop training, apprenticeship",
      },
      {
        id: "callout",
        label: "Can you come out at night / weekends?",
        type: "select",
        required: true,
        public: true,
        options: YES_NO,
      },
    ],
  }),
  vulcanizer: withCertAndSpecialties({
    skill: "vulcanizer",
    title: "Vulcanizer details",
    intro: "Tyre and wheel jobs only — not engine, electrics, or towing.",
    questions: [
      {
        id: "mobileCompressor",
        label: "Do you have a compressor (air machine)?",
        type: "select",
        required: true,
        public: true,
        options: YES_NO,
      },
      {
        id: "tyreSizes",
        label: "Tyre sizes you work with",
        type: "text",
        public: true,
        placeholder: "e.g. small cars, buses, motorcycles",
      },
      {
        id: "spareSales",
        label: "Do you sell spare tyres?",
        type: "select",
        public: true,
        options: YES_NO,
      },
    ],
  }),
  towing: withCertAndSpecialties({
    skill: "towing",
    title: "Towing details",
    intro: "Tow and recovery only — not repairs, tyres, or wash.",
    questions: [
      {
        id: "maxWeight",
        label: "Biggest vehicle you can tow",
        type: "select",
        required: true,
        public: true,
        options: [
          "Small cars only",
          "Cars & SUVs",
          "Light trucks",
          "Buses / heavy trucks",
          "Any size",
        ],
      },
      {
        id: "truckCount",
        label: "How many tow trucks do you have?",
        type: "select",
        required: true,
        public: true,
        options: ["1", "2", "3", "4 or more"],
      },
      {
        id: "coverage",
        label: "Do you work on expressways?",
        type: "select",
        public: true,
        options: YES_NO,
      },
    ],
  }),
  battery: withCertAndSpecialties({
    skill: "battery",
    title: "Battery details",
    intro: "Battery and jump-start work only — not full electrics or scan.",
    questions: [
      {
        id: "stockBrands",
        label: "Battery brands you sell",
        type: "text",
        public: true,
        placeholder: "e.g. Exide, Rocket, Bosch",
      },
      {
        id: "sameDayInstall",
        label: "Can you fit a battery same day on the road?",
        type: "select",
        public: true,
        options: YES_NO,
      },
    ],
  }),
  ac: withCertAndSpecialties({
    skill: "ac",
    title: "A/C details",
    intro: "Air-conditioning only — not general electrics or bodywork.",
    questions: [
      {
        id: "mobileKit",
        label: "Do you have mobile A/C tools?",
        type: "select",
        required: true,
        public: true,
        options: YES_NO,
      },
      {
        id: "warranty",
        label: "Do you give warranty on the job?",
        type: "select",
        public: true,
        options: ["No", "7 days", "30 days", "90 days"],
      },
    ],
  }),
  body: withCertAndSpecialties({
    skill: "body",
    title: "Bodywork details",
    intro: "Body and paint only — not mechanical or tyre work.",
    questions: [
      {
        id: "mobilePaint",
        label: "Can you paint / fix on the roadside?",
        type: "select",
        required: true,
        public: true,
        options: YES_NO,
      },
      {
        id: "workshop",
        label: "Do you have a workshop for big jobs?",
        type: "select",
        public: true,
        options: YES_NO,
      },
    ],
  }),
  electrical: withCertAndSpecialties({
    skill: "electrical",
    title: "Electrical details",
    intro: "Car electrics and wiring only — not A/C gas or full diagnostics.",
    questions: [
      {
        id: "scanTools",
        label: "Do you have a meter / scan tool?",
        type: "select",
        required: true,
        public: true,
        options: YES_NO,
      },
      {
        id: "cert",
        label: "Name of your electrical training",
        type: "text",
        required: true,
        public: true,
        placeholder: "e.g. auto-electric training",
      },
    ],
  }),
  diagnostics: withCertAndSpecialties({
    skill: "diagnostics",
    title: "Scan / diagnostics details",
    intro: "Computer scan and fault codes only — not tyre or body work.",
    questions: [
      {
        id: "brands",
        label: "Car brands you scan best",
        type: "text",
        required: true,
        public: true,
        placeholder: "e.g. Toyota, Mercedes, Hyundai",
      },
      {
        id: "report",
        label: "Do you give a written report?",
        type: "select",
        public: true,
        options: YES_NO,
      },
    ],
  }),
  wash: withCertAndSpecialties({
    skill: "wash",
    title: "Car wash details",
    intro: "Wash and cleaning only — not repairs or towing.",
    questions: [
      {
        id: "waterSource",
        label: "How do you get water?",
        type: "select",
        required: true,
        public: true,
        options: ["I carry water", "Fixed wash bay", "Both"],
      },
      {
        id: "duration",
        label: "How long for a full wash?",
        type: "select",
        public: true,
        options: ["Under 30 min", "30–60 min", "1–2 hours", "Over 2 hours"],
      },
    ],
  }),
};

export function getSkillFlow(skill: ProService): SkillFlow {
  return SKILL_FLOWS[skill];
}

export function isSkillFileValue(v: unknown): v is SkillFileValue {
  return (
    typeof v === "object" &&
    v != null &&
    "dataUrl" in v &&
    "name" in v &&
    typeof (v as SkillFileValue).dataUrl === "string"
  );
}

export function skillAnswersValid(
  skill: ProService,
  answers: Record<string, SkillAnswerValue>
): boolean {
  const flow = getSkillFlow(skill);
  return flow.questions.every((q) => {
    if (!q.required) return true;
    const v = answers[q.id];
    if (q.type === "multiselect") {
      if (!Array.isArray(v) || v.length === 0) return false;
      if (q.maxSelect != null && v.length > q.maxSelect) return false;
      return true;
    }
    if (q.type === "file") {
      return isSkillFileValue(v) && v.dataUrl.length > 0 && v.name.length > 0;
    }
    return typeof v === "string" && v.trim().length > 0;
  });
}

/** Flatten public answers for motorist profile view (skip raw file blobs) */
export function publicSkillRows(
  skill: ProService,
  answers: Record<string, SkillAnswerValue> | undefined
): { label: string; value: string }[] {
  if (!answers) return [];
  const flow = getSkillFlow(skill);
  return flow.questions
    .filter((q) => q.public)
    .map((q) => {
      const v = answers[q.id];
      if (v == null || v === "") return null;
      if (isSkillFileValue(v)) {
        return { label: q.label, value: `Uploaded · ${v.name}` };
      }
      const value = Array.isArray(v) ? v.join(", ") : String(v);
      if (!value.trim()) return null;
      return { label: q.label, value };
    })
    .filter((r): r is { label: string; value: string } => r != null);
}
