/** Deep cascading question flow for the Painter trade. */

export const PAINTER_START_QUESTION =
  "What kind of painting work do you need?";

export const PAINTER_MIN_PHOTOS = 2;
export const PAINTER_MAX_PHOTOS = 4;

export interface PainterOption {
  id: string;
  label: string;
  hint?: string;
}

export interface PainterScreen {
  question: string;
  kind: "choice" | "text";
  options?: PainterOption[];
  placeholder?: string;
}

export const PAINTER_START_OPTIONS: PainterOption[] = [
  { id: "A", label: "Residential house painting" },
  { id: "B", label: "Commercial / Shop / Office painting" },
  { id: "C", label: "Industrial / Factory / Warehouse painting" },
  { id: "D", label: "Roadside, market stall or kiosk painting" },
  { id: "E", label: "Gate, fence, railing or burglary proof" },
  { id: "F", label: "Roof painting" },
  { id: "G", label: "Church, school, mosque or public building" },
  { id: "H", label: "Sign writing, branding or wall design" },
  { id: "I", label: "Something else / I’m not sure" },
];

export const PAINTER_FINAL_COPY = {
  urgency: "How urgent is the work?",
  normal: "Normal",
  emergency: "Emergency",
  remote: "Remote location",
  night: "Night service / weekend work needed",
  photos: "Add clear photos of the area to be painted (2–4)",
  voice: "Record a short voice note explaining exactly what you want",
  location: "Exact location / landmark",
  supply: "Who is supplying the paint and materials?",
  scaffold: "Do you need the painter to bring scaffolding or ladder?",
  extra: "Any other detail you want the painter to know?",
};

export const PAINTER_SUPPLY_OPTIONS: PainterOption[] = [
  { id: "i-will-supply", label: "I will supply" },
  { id: "painter-supplies", label: "Painter should supply" },
];

export const PAINTER_SCAFFOLD_OPTIONS: PainterOption[] = [
  { id: "yes", label: "Yes" },
  { id: "no", label: "No" },
];

export const PAINTER_SCREENS: Record<string, PainterScreen> = {
  start: {
    question: PAINTER_START_QUESTION,
    kind: "choice",
    options: PAINTER_START_OPTIONS,
  },

  // Branch A — residential house painting
  a_scope: {
    question: "Is it interior, exterior, or both?",
    kind: "choice",
    options: [
      { id: "interior", label: "Interior" },
      { id: "exterior", label: "Exterior" },
      { id: "both", label: "Both" },
    ],
  },
  a_building: {
    question: "Is the house newly built or an old house that needs repainting?",
    kind: "choice",
    options: [
      { id: "newly-built", label: "Newly built" },
      { id: "old-repaint", label: "Old house – repainting" },
      { id: "not-sure", label: "Not sure" },
    ],
  },
  a_size: {
    question: "How many rooms / what is the approximate size of the area?",
    kind: "text",
    placeholder: "e.g. 3-bedroom flat, about 4 rooms",
  },
  a_paint: {
    question: "What type of paint do you prefer?",
    kind: "choice",
    options: [
      { id: "emulsion", label: "Emulsion" },
      { id: "gloss", label: "Gloss" },
      { id: "textured", label: "Textured" },
      { id: "weather-shield", label: "Weather Shield / Exterior paint" },
      { id: "advise", label: "I don’t know – advise me" },
    ],
  },
  a_supply: {
    question: "Who is supplying the paint and materials?",
    kind: "choice",
    options: [
      { id: "i-will-supply", label: "I will supply" },
      { id: "painter-supplies", label: "Painter should supply" },
    ],
  },
  a_scaffold: {
    question: "Do you need scaffolding or can the work be done with ladder?",
    kind: "choice",
    options: [
      { id: "scaffolding", label: "Scaffolding needed" },
      { id: "ladder", label: "Ladder is enough" },
      { id: "not-sure", label: "Not sure" },
    ],
  },

  // Branch B — commercial / shop / office painting
  b_place: {
    question: "What type of place is it?",
    kind: "choice",
    options: [
      { id: "shop", label: "Shop / market store" },
      { id: "office", label: "Office" },
      { id: "hotel", label: "Hotel / restaurant" },
      { id: "plaza", label: "Plaza / complex" },
      { id: "other", label: "Other commercial space" },
    ],
  },
  b_scope: {
    question: "Interior, exterior, or both?",
    kind: "choice",
    options: [
      { id: "interior", label: "Interior" },
      { id: "exterior", label: "Exterior" },
      { id: "both", label: "Both" },
    ],
  },
  b_front: {
    question: "Do you need the shop front / signboard area painted as well?",
    kind: "choice",
    options: [
      { id: "yes", label: "Yes" },
      { id: "no", label: "No" },
    ],
  },
  b_building: {
    question: "Is the building new or due for repainting?",
    kind: "choice",
    options: [
      { id: "newly-built", label: "Newly built" },
      { id: "repainting", label: "Due for repainting" },
      { id: "not-sure", label: "Not sure" },
    ],
  },
  b_supply: {
    question: "Who is supplying the paint?",
    kind: "choice",
    options: [
      { id: "i-will-supply", label: "I will supply" },
      { id: "painter-supplies", label: "Painter should supply" },
    ],
  },

  // Branch C — industrial / factory / warehouse painting
  c_facility: {
    question: "What type of facility is it?",
    kind: "choice",
    options: [
      { id: "factory", label: "Factory" },
      { id: "warehouse", label: "Warehouse" },
      { id: "workshop", label: "Workshop" },
      { id: "plant", label: "Plant / production area" },
      { id: "other", label: "Other industrial building" },
    ],
  },
  c_surface: {
    question: "Is it mainly walls, steel structures, machines, or floor marking?",
    kind: "choice",
    options: [
      { id: "walls", label: "Walls" },
      { id: "steel", label: "Steel structures" },
      { id: "machines", label: "Machines" },
      { id: "floor", label: "Floor marking" },
      { id: "combination", label: "A combination" },
    ],
  },
  c_req: {
    question:
      "Are there any special requirements (anti-rust, chemical resistant, heat resistant paint, etc.)?",
    kind: "text",
    placeholder: "e.g. Anti-rust paint for steel beams",
  },
  c_vacate: {
    question:
      "Is production still ongoing or can the area be vacated for painting?",
    kind: "choice",
    options: [
      { id: "ongoing", label: "Production ongoing" },
      { id: "vacated", label: "Can be vacated" },
      { id: "not-sure", label: "Not sure" },
    ],
  },

  // Branch D — roadside, market stall or kiosk painting
  d_need: {
    question: "What exactly needs painting?",
    kind: "choice",
    options: [
      { id: "stall-table", label: "Market stall / table" },
      { id: "kiosk", label: "Roadside kiosk or container" },
      { id: "booth", label: "Temporary booth" },
      { id: "display", label: "Display shelves or boards" },
    ],
  },
  d_fresh: {
    question: "Is it a fresh paint or repainting of an old stall?",
    kind: "choice",
    options: [
      { id: "fresh", label: "Fresh paint" },
      { id: "repaint", label: "Repainting of old stall" },
    ],
  },
  d_sign: {
    question: "Do you need any sign writing or product names written on it?",
    kind: "choice",
    options: [
      { id: "yes", label: "Yes" },
      { id: "no", label: "No" },
    ],
  },

  // Branch E — gate, fence, railing or burglary proof
  e_need: {
    question: "What needs painting?",
    kind: "choice",
    options: [
      { id: "gate", label: "Main gate" },
      { id: "fence", label: "Fence / perimeter" },
      { id: "railing", label: "Railing / balcony" },
      { id: "burglary", label: "Burglary proof" },
      { id: "all", label: "All of the above" },
    ],
  },
  e_material: {
    question: "Is it metal, wood, or concrete?",
    kind: "choice",
    options: [
      { id: "metal", label: "Metal" },
      { id: "wood", label: "Wood" },
      { id: "concrete", label: "Concrete" },
      { id: "combination", label: "A combination" },
    ],
  },
  e_rust: {
    question: "Does it need anti-rust treatment before painting?",
    kind: "choice",
    options: [
      { id: "yes", label: "Yes" },
      { id: "no", label: "No" },
      { id: "not-sure", label: "Not sure" },
    ],
  },
  e_colour: {
    question: "What colour or finish do you want?",
    kind: "text",
    placeholder: "e.g. Black gloss or dark green",
  },

  // Branch F — roof painting
  f_roof: {
    question: "What type of roof is it?",
    kind: "choice",
    options: [
      { id: "corrugated", label: "Corrugated iron sheet" },
      { id: "aluminium", label: "Aluminium long-span" },
      { id: "concrete", label: "Concrete roof" },
      { id: "other", label: "Other" },
    ],
  },
  f_purpose: {
    question: "Is the main purpose beautification, heat reduction, or waterproofing?",
    kind: "choice",
    options: [
      { id: "beautification", label: "Beautification" },
      { id: "heat-reduction", label: "Heat reduction" },
      { id: "waterproofing", label: "Waterproofing" },
      { id: "combination", label: "A combination" },
    ],
  },
  f_paint: {
    question:
      "Do you already have the special roof paint or should the painter supply it?",
    kind: "choice",
    options: [
      { id: "i-have", label: "I already have it" },
      { id: "painter-supplies", label: "Painter should supply it" },
    ],
  },
  f_height: {
    question: "How high is the building (storey)?",
    kind: "text",
    placeholder: "e.g. Single storey",
  },

  // Branch G — church, school, mosque or public building
  g_type: {
    question: "What type of building is it?",
    kind: "text",
    placeholder: "e.g. Church or school hall",
  },
  g_scope: {
    question: "Interior, exterior, or both?",
    kind: "choice",
    options: [
      { id: "interior", label: "Interior" },
      { id: "exterior", label: "Exterior" },
      { id: "both", label: "Both" },
    ],
  },
  g_size: {
    question: "Approximate size or number of rooms/halls?",
    kind: "text",
    placeholder: "e.g. 2 halls and 4 classrooms",
  },
  g_colour: {
    question:
      "Any special colour or design requirement (e.g. church colours, school colours)?",
    kind: "text",
    placeholder: "e.g. Church blue and white",
  },
  g_supply: {
    question: "Who is supplying the paint?",
    kind: "choice",
    options: [
      { id: "i-will-supply", label: "I will supply" },
      { id: "painter-supplies", label: "Painter should supply" },
    ],
  },

  // Branch H — sign writing, branding or wall design
  h_need: {
    question: "What do you need?",
    kind: "choice",
    options: [
      { id: "shop-name-logo", label: "Shop name and logo on the wall" },
      { id: "mural", label: "Full wall branding / mural" },
      { id: "directional", label: "Directional signs" },
      { id: "price-list", label: "Product list or price list on wall" },
      { id: "decorative", label: "Decorative wall design" },
    ],
  },
  h_design: {
    question: "Do you already have the design or logo in soft copy?",
    kind: "choice",
    options: [
      { id: "yes", label: "Yes" },
      { id: "no", label: "No" },
      { id: "not-yet", label: "Not yet" },
    ],
  },
  h_wall: {
    question: "Is it for indoor or outdoor wall?",
    kind: "choice",
    options: [
      { id: "indoor", label: "Indoor" },
      { id: "outdoor", label: "Outdoor" },
      { id: "both", label: "Both" },
    ],
  },

  // Branch I — something else / not sure
  i_describe: {
    question: "Please describe the painting work you need in your own words.",
    kind: "text",
    placeholder: "Describe the painting work…",
  },
  i_location: {
    question: "Is it for house, shop, roadside, factory, or another location?",
    kind: "choice",
    options: [
      { id: "house", label: "House" },
      { id: "shop", label: "Shop" },
      { id: "roadside", label: "Roadside" },
      { id: "factory", label: "Factory" },
      { id: "other", label: "Other" },
    ],
  },
};

const START_NEXT: Record<string, string> = {
  A: "a_scope",
  B: "b_place",
  C: "c_facility",
  D: "d_need",
  E: "e_need",
  F: "f_roof",
  G: "g_type",
  H: "h_need",
  I: "i_describe",
};

export function painterScreen(id: string): PainterScreen | undefined {
  return PAINTER_SCREENS[id];
}

/** Advance helper for the choice rows; returns the next screen id or "final". */
export function nextPainterScreen(
  current: string,
  _answerId: string,
  _answers: Record<string, string>
): string {
  const map: Record<string, string> = {
    a_scope: "a_building",
    a_building: "a_size",
    a_size: "a_paint",
    a_paint: "a_supply",
    a_supply: "a_scaffold",
    a_scaffold: "final",

    b_place: "b_scope",
    b_scope: "b_front",
    b_front: "b_building",
    b_building: "b_supply",
    b_supply: "final",

    c_facility: "c_surface",
    c_surface: "c_req",
    c_req: "c_vacate",
    c_vacate: "final",

    d_need: "d_fresh",
    d_fresh: "d_sign",
    d_sign: "final",

    e_need: "e_material",
    e_material: "e_rust",
    e_rust: "e_colour",
    e_colour: "final",

    f_roof: "f_purpose",
    f_purpose: "f_paint",
    f_paint: "f_height",
    f_height: "final",

    g_type: "g_scope",
    g_scope: "g_size",
    g_size: "g_colour",
    g_colour: "g_supply",
    g_supply: "final",

    h_need: "h_design",
    h_design: "h_wall",
    h_wall: "final",

    i_describe: "i_location",
    i_location: "final",
  };
  if (current === "start") {
    return START_NEXT[_answerId] ?? "final";
  }
  return map[current] ?? "final";
}

/**
 * Strictly painting works: the flow is capture-only and always dispatches as
 * "painter" — no confirm cards, no reroute to any other service.
 */
export function resolvePainterRoute(
  _answers: Record<string, string>
): { trade: "painter"; needsConfirm: false } {
  return { trade: "painter", needsConfirm: false };
}

export function canAdvanceText(value: string): boolean {
  return value.trim().length > 0;
}

export function canFindPainterPro(photoCount: number): boolean {
  return photoCount >= PAINTER_MIN_PHOTOS;
}

export function composePainterJob(
  answers: Record<string, string>,
  extra: string,
  landmark: string
): string {
  const lines: string[] = [];
  const startLabel = answers.start_label || answers.start || "";
  lines.push(`Painting work: ${startLabel} (${PAINTER_START_QUESTION})`);
  const orderedIds = [
    "a_scope",
    "a_building",
    "a_size",
    "a_paint",
    "a_supply",
    "a_scaffold",
    "b_place",
    "b_scope",
    "b_front",
    "b_building",
    "b_supply",
    "c_facility",
    "c_surface",
    "c_req",
    "c_vacate",
    "d_need",
    "d_fresh",
    "d_sign",
    "e_need",
    "e_material",
    "e_rust",
    "e_colour",
    "f_roof",
    "f_purpose",
    "f_paint",
    "f_height",
    "g_type",
    "g_scope",
    "g_size",
    "g_colour",
    "g_supply",
    "h_need",
    "h_design",
    "h_wall",
    "i_describe",
    "i_location",
  ];
  for (const id of orderedIds) {
    const value = answers[`${id}_label`] || answers[id];
    if (!value) continue;
    const screen = PAINTER_SCREENS[id];
    if (!screen) continue;
    lines.push(`${screen.question} ${value}`);
  }
  if (landmark.trim()) lines.push(`Location: ${landmark.trim()}`);
  if (extra.trim()) lines.push(`Extra: ${extra.trim()}`);
  return lines.join("\n");
}

export function painterBreadcrumb(stack: string[]): string {
  const step = stack[stack.length - 1];
  if (!step || step === "start") return "Painter";
  if (step === "final") return "Painter · Send";
  return `Painter · ${step.charAt(0).toUpperCase()}`;
}