import type { ProService } from "@/lib/types";

export const FASHION_START_QUESTION =
  "What fashion or tailoring service do you need?";

export const FASHION_FINAL_COPY = {
  urgency: "How urgent is this request?",
  normal: "Normal",
  emergency: "Emergency",
  remote: "Remote location",
  night: "Night service needed",
  photos:
    "Add clear photos (minimum 2–4): style inspiration, fabric, or the current garment",
  voice: "Record a short voice note describing the exact style, event, or preference",
  location: "Exact location / landmark",
  extra: "Any other detail you want the tailor / fashion designer to know?",
  home: "Do you need home service (measurement or delivery) or will you visit the tailor?",
} as const;

export const FASHION_MIN_PHOTOS = 2;
export const FASHION_MAX_PHOTOS = 4;

export type FashionScreenKind = "choice" | "text";

export type FashionOption = {
  id: string;
  label: string;
};

export type FashionScreen = {
  id: string;
  question: string;
  kind: FashionScreenKind;
  options?: FashionOption[];
  placeholder?: string;
};

export type FashionRoute = {
  trade: ProService;
  needsConfirm: boolean;
};

export const FASHION_START_OPTIONS: FashionOption[] = [
  { id: "A", label: "New custom-made outfit (Native or English)" },
  { id: "B", label: "Aso-Ebi / Group or family uniform" },
  { id: "C", label: "Alteration, adjustment or restyling of existing clothes" },
  { id: "D", label: "Repair of torn, damaged or worn clothes" },
  { id: "E", label: "Ready-to-wear / Off-the-rack purchase & fitting" },
  { id: "F", label: "Fashion design consultation or style advice" },
  { id: "G", label: "Something else / I'm not sure" },
];

const YES_NO: FashionOption[] = [
  { id: "yes", label: "Yes" },
  { id: "no", label: "No" },
];

export const FASHION_SCREENS: Record<string, FashionScreen> = {
  start: {
    id: "start",
    question: FASHION_START_QUESTION,
    kind: "choice",
    options: FASHION_START_OPTIONS,
  },
  // Branch A — New custom-made outfit (Native or English)
  a_who: {
    id: "a_who",
    question: "Who is the outfit for?",
    kind: "choice",
    options: [
      { id: "men", label: "Men" },
      { id: "women", label: "Women" },
      { id: "children", label: "Children" },
      { id: "unisex", label: "Unisex / Couple" },
    ],
  },
  a_style: {
    id: "a_style",
    question: "What style do you want?",
    kind: "choice",
    options: [
      {
        id: "native",
        label:
          "Native / Traditional (Agbada, Buba & Sokoto, Iro & Buba, Kaftan, Dashiki, Senator, etc.)",
      },
      { id: "english", label: "English / Corporate" },
      { id: "african", label: "Contemporary African (Ankara mix, modern native)" },
      { id: "wedding", label: "Wedding / Bridal" },
      { id: "party", label: "Party / Owambe / Reception" },
      { id: "church", label: "Church / Formal event" },
      { id: "casual", label: "Casual" },
    ],
  },
  a_fabric: {
    id: "a_fabric",
    question: "Do you already have the fabric?",
    kind: "choice",
    options: [
      { id: "yes", label: "Yes, I have the material" },
      {
        id: "no",
        label:
          "No, I need the tailor to source it (Ankara, Lace, Aso-oke, George, Sequins, Velvet, etc.)",
      },
    ],
  },
  a_style_ref: {
    id: "a_style_ref",
    question: "Do you have a style reference (photo, screenshot, or celebrity look)?",
    kind: "choice",
    options: YES_NO,
  },
  a_ready: {
    id: "a_ready",
    question:
      "When do you need the outfit ready? (Especially important for owambe, wedding, or weekend events)",
    kind: "choice",
    options: [
      { id: "thisweek", label: "This week" },
      { id: "nextweek", label: "Next week" },
      { id: "thismonth", label: "Within the month" },
      { id: "notsure", label: "I'm not sure" },
    ],
  },
  // Branch B — Aso-Ebi / Group or family uniform
  b_count: {
    id: "b_count",
    question: "How many people are involved?",
    kind: "choice",
    options: [
      { id: "few", label: "1 – 2" },
      { id: "group", label: "3 – 5" },
      { id: "large", label: "6 – 10" },
      { id: "bulk", label: "More than 10" },
    ],
  },
  b_group: {
    id: "b_group",
    question: "Is it for:",
    kind: "choice",
    options: [
      { id: "family", label: "Family" },
      { id: "friends", label: "Friends / Age-grade" },
      { id: "church", label: "Church / Fellowship" },
      { id: "wedding", label: "Wedding guests" },
      { id: "association", label: "Political / Association" },
      { id: "other", label: "Other group" },
    ],
  },
  b_fabric: {
    id: "b_fabric",
    question: "Preferred fabric (Ankara, Lace, Aso-oke, George, etc.)?",
    kind: "choice",
    options: [
      { id: "ankara", label: "Ankara" },
      { id: "lace", label: "Lace" },
      { id: "aso", label: "Aso-oke" },
      { id: "george", label: "George" },
      { id: "other", label: "Other" },
      { id: "notsure", label: "Not sure" },
    ],
  },
  b_have: {
    id: "b_have",
    question: "Do you already have the fabric or should it be sourced?",
    kind: "choice",
    options: [
      { id: "have", label: "Yes, I have it" },
      { id: "source", label: "Please source it" },
    ],
  },
  b_same: {
    id: "b_same",
    question:
      "Do you want the same style for everyone or slight variations (men/women/children)?",
    kind: "choice",
    options: [
      { id: "same", label: "Same style for everyone" },
      { id: "variations", label: "Slight variations" },
    ],
  },
  b_date: {
    id: "b_date",
    question: "Event date?",
    kind: "text",
    placeholder: "e.g. 25 December",
  },
  // Branch C — Alteration, adjustment or restyling of existing clothes
  c_what: {
    id: "c_what",
    question: "What needs to be done?",
    kind: "choice",
    options: [
      { id: "size", label: "Taking in / letting out (size adjustment)" },
      { id: "length", label: "Shortening or lengthening" },
      {
        id: "restyle",
        label: "Changing the style completely (e.g. old agbada to modern cut)",
      },
      {
        id: "trim",
        label: "Adding or removing embroidery, stones, or lace",
      },
      { id: "repair", label: "Zip, button, or lining repair while adjusting" },
    ],
  },
  c_native: {
    id: "c_native",
    question: "Is the original garment native or English wear?",
    kind: "choice",
    options: [
      { id: "native", label: "Native" },
      { id: "english", label: "English" },
      { id: "notsure", label: "Not sure" },
    ],
  },
  c_have: {
    id: "c_have",
    question:
      "Do you have the garment with you or will the tailor need to pick up / you will drop it?",
    kind: "choice",
    options: [
      { id: "have", label: "I have it" },
      { id: "pickup", label: "Tailor picks up" },
      { id: "drop", label: "I will drop it off" },
    ],
  },
  // Branch D — Repair of torn, damaged or worn clothes
  d_damage: {
    id: "d_damage",
    question: "What is the damage?",
    kind: "choice",
    options: [
      { id: "tear", label: "Tear or rip" },
      { id: "worn", label: "Worn-out elbows, knees or seat" },
      { id: "embroidery", label: "Damaged embroidery or beads" },
      { id: "stain", label: "Colour run or stain that needs attention" },
      { id: "other", label: "Other" },
    ],
  },
  d_value: {
    id: "d_value",
    question:
      "Is it a high-value native wear (Aso-oke, heavy lace, agbada) or regular clothing?",
    kind: "choice",
    options: [
      { id: "high", label: "High-value native wear" },
      { id: "regular", label: "Regular clothing" },
    ],
  },
  d_repair: {
    id: "d_repair",
    question: "Do you want it repaired to look almost new or just functional?",
    kind: "choice",
    options: [
      { id: "new", label: "Almost new" },
      { id: "functional", label: "Just functional" },
    ],
  },
  // Branch E — Ready-to-wear / Off-the-rack purchase & fitting
  e_looking: {
    id: "e_looking",
    question: "Are you looking for:",
    kind: "choice",
    options: [
      { id: "native", label: "Native wear already sewn" },
      { id: "english", label: "English / Corporate wear" },
      { id: "ankara", label: "Ankara ready-to-wear" },
      { id: "children", label: "Children's wear" },
      { id: "accessories", label: "Accessories (fila, gele, shoes, bags – if offered)" },
    ],
  },
  e_fitting: {
    id: "e_fitting",
    question: "Do you need fitting and minor adjustment after purchase?",
    kind: "choice",
    options: YES_NO,
  },
  // Branch F — Fashion design consultation or style advice
  f_advice: {
    id: "f_advice",
    question: "What do you need advice on?",
    kind: "choice",
    options: [
      {
        id: "style",
        label: "Choosing the right native style for your body type or event",
      },
      { id: "fabric", label: "Fabric selection (Ankara vs Lace vs Aso-oke etc.)" },
      { id: "colour", label: "Colour combination for owambe or wedding" },
      { id: "modern", label: "Modern twist on traditional wear" },
      { id: "wardrobe", label: "Full wardrobe planning" },
    ],
  },
  f_budget: {
    id: "f_budget",
    question: "Do you already have a budget range or event date?",
    kind: "choice",
    options: YES_NO,
  },
  // Branch G — Something else / I'm not sure
  g_describe: {
    id: "g_describe",
    question: "Please describe in your own words what you need.",
    kind: "text",
  },
  g_related: {
    id: "g_related",
    question: "Is it related to:",
    kind: "choice",
    options: [
      { id: "vehicle", label: "Vehicle or mechanical issue" },
      { id: "house", label: "House repair" },
      { id: "power", label: "Power solutions" },
      { id: "clothing", label: "Still clothing / fabric / design related" },
    ],
  },
};

const START_NEXT: Record<string, string> = {
  A: "a_who",
  B: "b_count",
  C: "c_what",
  D: "d_damage",
  E: "e_looking",
  F: "f_advice",
  G: "g_describe",
};

export function fashionScreen(id: string): FashionScreen | undefined {
  return FASHION_SCREENS[id];
}

export function nextFashionScreen(
  current: string,
  _answerId: string,
  _answers: Record<string, string>
): string {
  if (current === "start") return START_NEXT[_answerId] || "g_describe";

  if (current === "a_who") return "a_style";
  if (current === "a_style") return "a_fabric";
  if (current === "a_fabric") return "a_style_ref";
  if (current === "a_style_ref") return "a_ready";
  if (current === "a_ready") return "final";

  if (current === "b_count") return "b_group";
  if (current === "b_group") return "b_fabric";
  if (current === "b_fabric") return "b_have";
  if (current === "b_have") return "b_same";
  if (current === "b_same") return "b_date";
  if (current === "b_date") return "final";

  if (current === "c_what") return "c_native";
  if (current === "c_native") return "c_have";
  if (current === "c_have") return "final";

  if (current === "d_damage") return "d_value";
  if (current === "d_value") return "d_repair";
  if (current === "d_repair") return "final";

  if (current === "e_looking") return "e_fitting";
  if (current === "e_fitting") return "final";

  if (current === "f_advice") return "f_budget";
  if (current === "f_budget") return "final";

  if (current === "g_describe") return "g_related";
  if (current === "g_related") return "final";

  return "final";
}

/**
 * Fashion is a capture-only cascade: every branch stays with Fashion and the
 * Branch G hints (Mechanic / Carpenter / Generator etc.) are kept as notes,
 * never a trade switch.
 */
export function resolveFashionRoute(
  _answers: Record<string, string>
): FashionRoute {
  return { trade: "fashion", needsConfirm: false };
}

export function composeFashionProblem(
  answers: Record<string, string>,
  extra: string,
  landmark: string
): string {
  const lines: string[] = [];
  const start = fashionScreen("start");
  if (start) {
    lines.push(start.question);
    const picked = FASHION_START_OPTIONS.find((o) => o.id === answers.start);
    if (picked) lines.push(picked.label);
  }

  const order = Object.keys(answers).filter(
    (k) => k !== "start" && !k.endsWith("_label")
  );
  for (const id of order) {
    const screen = fashionScreen(id);
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
    lines.push(FASHION_FINAL_COPY.location);
    lines.push(landmark.trim());
  }
  if (extra.trim()) {
    lines.push(FASHION_FINAL_COPY.extra);
    lines.push(extra.trim());
  }
  return lines.filter(Boolean).join("\n");
}

export function canAdvanceText(value: string): boolean {
  return value.trim().length >= 2;
}

export function canFindFashionPro(photoCount: number): boolean {
  return photoCount >= FASHION_MIN_PHOTOS;
}

export function fashionBreadcrumb(stack: string[]): string {
  const bits: string[] = ["Fashion"];
  const firstBranch = stack.find(
    (id) => id !== "start" && id !== "final"
  );
  if (firstBranch) {
    const letter = Object.entries(START_NEXT).find(
      ([, id]) => id === firstBranch
    )?.[0];
    if (letter) bits.push(letter);
  }
  if (stack[stack.length - 1] === "final") bits.push("Send");
  return bits.join(" · ");
}