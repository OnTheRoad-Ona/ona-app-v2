/** Deep cascading question flow for the Furniture / Carpentry trade. */

export const CARPENTER_START_QUESTION =
  "What kind of furniture or carpentry work do you need?";

export const CARPENTER_MIN_PHOTOS = 2;
export const CARPENTER_MAX_PHOTOS = 4;

export interface CarpenterOption {
  id: string;
  label: string;
  hint?: string;
}

export interface CarpenterScreen {
  question: string;
  kind: "choice" | "text";
  options?: CarpenterOption[];
  placeholder?: string;
}

export const CARPENTER_START_OPTIONS: CarpenterOption[] = [
  { id: "A", label: "New furniture making" },
  { id: "B", label: "Furniture repair or restoration" },
  { id: "C", label: "Doors, windows and door frames" },
  { id: "D", label: "Roofing, ceiling or woodwork in the house" },
  { id: "E", label: "Kitchen cabinets, wardrobe or storage" },
  { id: "F", label: "Office, shop, church or commercial furniture" },
  { id: "G", label: "Roadside, market stall or temporary structure" },
  { id: "H", label: "General carpentry and other woodworks" },
  { id: "I", label: "Something else / I’m not sure" },
];

export const CARPENTER_FINAL_COPY = {
  urgency: "How urgent is the work?",
  normal: "Normal",
  emergency: "Emergency",
  remote: "Remote location",
  night: "Night service / weekend work needed",
  photos:
    "Add clear photos (2-4): the space or existing furniture, design or style inspiration, and wood or materials if you already have them",
  voice: "Record a short voice note explaining exactly what you want",
  location: "Exact location / landmark",
  measurements: "Do you need the carpenter to come and take measurements?",
  extra: "Any other detail you want the furniture maker to know?",
};

export const CARPENTER_MEASUREMENTS_OPTIONS: CarpenterOption[] = [
  { id: "yes", label: "Yes" },
  { id: "no", label: "No" },
];

export const CARPENTER_SCREENS: Record<string, CarpenterScreen> = {
  start: {
    question: CARPENTER_START_QUESTION,
    kind: "choice",
    options: CARPENTER_START_OPTIONS,
  },

  // Branch A new furniture making
  a_type: {
    question: "What type of furniture do you want?",
    kind: "choice",
    options: [
      { id: "bed", label: "Bed (with or without storage)" },
      { id: "sofa", label: "Sofa / couch / settee" },
      { id: "dining", label: "Dining table and chairs" },
      { id: "centre-table", label: "Centre table / side stools" },
      { id: "tv-stand", label: "TV stand / entertainment unit" },
      { id: "bookshelf", label: "Bookshelf or display cabinet" },
      { id: "office-table", label: "Office table and chair" },
      { id: "other", label: "Other (please specify)" },
    ],
  },
  a_wood: {
    question: "Who is supplying the wood/material?",
    kind: "choice",
    options: [
      { id: "i-have", label: "I already have the wood" },
      {
        id: "carpenter-supplies",
        label: "Furniture maker should supply the wood",
      },
    ],
  },
  a_woodtype: {
    question: "Preferred type of wood (if known)?",
    kind: "choice",
    options: [
      { id: "mahogany", label: "Mahogany" },
      { id: "iroko", label: "Iroko" },
      { id: "opepe", label: "Opepe / hardwood" },
      { id: "plywood", label: "Plywood / MDF / Particle board" },
      { id: "soft-wood", label: "Soft wood" },
      { id: "advise", label: "I don’t know, advise me" },
    ],
  },
  a_design: {
    question: "Do you have a design or picture of what you want?",
    kind: "choice",
    options: [
      { id: "yes", label: "Yes" },
      { id: "no", label: "No" },
      { id: "not-yet", label: "Not yet" },
    ],
  },
  a_measure: {
    question: "Do you need measurement at your house/office?",
    kind: "choice",
    options: [
      { id: "yes", label: "Yes" },
      { id: "no", label: "No" },
    ],
  },

  // Branch B furniture repair or restoration
  b_problem: {
    question: "What is wrong with the furniture?",
    kind: "choice",
    options: [
      { id: "broken-frame", label: "Broken leg or frame" },
      { id: "loose-joints", label: "Loose joints" },
      { id: "torn-upholstery", label: "Damaged or torn upholstery" },
      { id: "scratched-surface", label: "Scratch, crack or worn-out surface" },
      { id: "squeaking", label: "Squeaking or unstable" },
      {
        id: "full-restoration",
        label: "Complete restoration (make it look new)",
      },
    ],
  },
  b_type: {
    question: "What type of furniture is it?",
    kind: "text",
    placeholder: "e.g. Sofa, dining table or wardrobe",
  },
  b_parts: {
    question: "Do you still have the original wood or parts?",
    kind: "choice",
    options: [
      { id: "yes", label: "Yes" },
      { id: "no", label: "No" },
      { id: "not-sure", label: "I'm not sure" },
    ],
  },
  b_where: {
    question:
      "Do you want it repaired at your location or should it be taken to the workshop?",
    kind: "choice",
    options: [
      { id: "at-location", label: "Repair at my location" },
      { id: "workshop", label: "Take it to the workshop" },
      { id: "not-sure", label: "I'm not sure" },
    ],
  },

  // Branch C doors, windows and door frames
  c_need: {
    question: "What exactly do you need?",
    kind: "choice",
    options: [
      {
        id: "new-door",
        label: "New door (panel door, flush door, security door, etc.)",
      },
      { id: "door-frame", label: "Door frame only" },
      { id: "window-frames", label: "Window frames and shutters" },
      { id: "repair-door", label: "Repair of existing door or frame" },
      { id: "door-alignment", label: "Door not closing or aligning properly" },
      { id: "lock-handle", label: "Lock and handle installation/repair" },
    ],
  },
  c_building: {
    question:
      "Is it for residential house, shop, office or industrial building?",
    kind: "choice",
    options: [
      { id: "residential", label: "Residential house" },
      { id: "shop", label: "Shop" },
      { id: "office", label: "Office" },
      { id: "industrial", label: "Industrial building" },
      { id: "not-sure", label: "I'm not sure" },
    ],
  },
  c_wood: {
    question: "Do you already have the door/wood or should it be supplied?",
    kind: "choice",
    options: [
      { id: "i-have", label: "I already have it" },
      { id: "carpenter-supplies", label: "Carpenter should supply it" },
    ],
  },
  c_install: {
    question:
      "Do you need the carpenter to remove the old one and install the new one?",
    kind: "choice",
    options: [
      {
        id: "remove-and-install",
        label: "Yes, remove the old one and install",
      },
      { id: "just-install", label: "Just install the new one" },
      { id: "no", label: "No" },
    ],
  },

  // Branch D roofing, ceiling or woodwork in the house
  d_work: {
    question: "What work is needed?",
    kind: "choice",
    options: [
      {
        id: "roofing-woodwork",
        label: "Roofing woodwork (rafters, purlins, etc.)",
      },
      {
        id: "ceiling",
        label: "Ceiling (POP related woodwork, nailing, framing)",
      },
      { id: "fascia", label: "Fascia board / barge board" },
      { id: "carport", label: "Carport or shade structure" },
      {
        id: "roof-repair",
        label: "Repair of leaking or damaged roof woodwork",
      },
    ],
  },
  d_building: {
    question: "Is it a new building or an existing house that needs repair?",
    kind: "choice",
    options: [
      { id: "new-building", label: "New building" },
      { id: "existing-repair", label: "Existing house, repair" },
      { id: "not-sure", label: "I'm not sure" },
    ],
  },
  d_sheet: {
    question: "What type of roofing sheet will be used (if known)?",
    kind: "text",
    placeholder: "e.g. Long span aluminium or stone-coated",
  },
  d_scaffold: {
    question: "Do you need scaffolding or can the work be done from inside?",
    kind: "choice",
    options: [
      { id: "scaffolding", label: "Scaffolding needed" },
      { id: "from-inside", label: "Can be done from inside" },
      { id: "not-sure", label: "I'm not sure" },
    ],
  },

  // Branch E kitchen cabinets, wardrobe or storage
  e_need: {
    question: "What do you need?",
    kind: "choice",
    options: [
      { id: "kitchen-cabinets", label: "Kitchen cabinets (upper and lower)" },
      { id: "wardrobe", label: "Wardrobe (sliding or hinged)" },
      { id: "tv-unit", label: "TV unit / wall unit" },
      { id: "pantry", label: "Store or pantry shelves" },
      { id: "shoe-rack", label: "Shoe rack or other storage" },
    ],
  },
  e_space: {
    question:
      "Is the space already tiled/finished or still under construction?",
    kind: "choice",
    options: [
      { id: "finished", label: "Tiled / finished" },
      { id: "under-construction", label: "Still under construction" },
      { id: "not-sure", label: "I'm not sure" },
    ],
  },
  e_design: {
    question: "Do you have the design or measurements?",
    kind: "choice",
    options: [
      { id: "design-and-measurements", label: "Yes, design and measurements" },
      { id: "measurements-only", label: "I have measurements only" },
      { id: "no", label: "No, let the carpenter advise" },
    ],
  },
  e_material: {
    question:
      "Who is supplying the material (plywood, MDF, formica, handles, etc.)?",
    kind: "choice",
    options: [
      { id: "i-have", label: "I already have the material" },
      {
        id: "carpenter-supplies",
        label: "Carpenter should supply the material",
      },
      { id: "not-sure", label: "I'm not sure" },
    ],
  },

  // Branch F office, shop, church or commercial furniture
  f_place: {
    question: "What type of place is it?",
    kind: "choice",
    options: [
      { id: "office", label: "Office" },
      { id: "shop", label: "Shop / market store" },
      { id: "church", label: "Church / mosque / fellowship" },
      { id: "school", label: "School or training centre" },
      { id: "hotel", label: "Hotel / restaurant" },
      { id: "other", label: "Other commercial space" },
    ],
  },
  f_items: {
    question: "What items do you need?",
    kind: "choice",
    options: [
      { id: "desks-chairs", label: "Office desks and chairs" },
      { id: "reception-desk", label: "Reception desk" },
      { id: "shelves-display", label: "Shelves and display units" },
      { id: "pews-benches", label: "Church pews / benches" },
      { id: "counter-bar", label: "Counter or bar" },
      { id: "partitioning", label: "Full office partitioning with wood" },
    ],
  },
  f_setup: {
    question: "Is it a new setup or renovation of existing furniture?",
    kind: "choice",
    options: [
      { id: "new-setup", label: "New setup" },
      { id: "renovation", label: "Renovation of existing" },
      { id: "both", label: "Both" },
    ],
  },

  // Branch G roadside, market stall or temporary structure
  g_need: {
    question: "What do you need?",
    kind: "choice",
    options: [
      { id: "stall-table", label: "Market stall / table" },
      { id: "kiosk", label: "Roadside kiosk or container woodwork" },
      { id: "event-booth", label: "Temporary event booth or canopy structure" },
      { id: "display-shelves", label: "Display shelves for goods" },
      { id: "stall-repair", label: "Repair of existing stall" },
    ],
  },
  g_duration: {
    question:
      "Is it for permanent use or temporary (e.g. for a few weeks/months)?",
    kind: "choice",
    options: [
      { id: "permanent", label: "Permanent use" },
      { id: "temporary", label: "Temporary use" },
      { id: "not-sure", label: "I'm not sure" },
    ],
  },
  g_mobile: {
    question: "Do you need it made mobile (with wheels) or fixed?",
    kind: "choice",
    options: [
      { id: "mobile", label: "Mobile (with wheels)" },
      { id: "fixed", label: "Fixed" },
      { id: "not-sure", label: "I'm not sure" },
    ],
  },

  // Branch H general carpentry and other woodworks
  h_describe: {
    question: "Please describe the work you need in your own words.",
    kind: "text",
    placeholder: "Describe the woodwork you want…",
  },
  h_location: {
    question: "Is it indoor or outdoor work?",
    kind: "choice",
    options: [
      { id: "indoor", label: "Indoor" },
      { id: "outdoor", label: "Outdoor" },
      { id: "both", label: "Both" },
    ],
  },
  h_wood: {
    question: "Do you already have the wood and materials?",
    kind: "choice",
    options: [
      { id: "yes", label: "Yes, I have them" },
      { id: "no", label: "No, carpenter should supply" },
      { id: "not-sure", label: "I'm not sure" },
    ],
  },

  // Branch I something else / not sure
  i_explain: {
    question:
      "Just explain what you want the furniture maker / carpenter to do.",
    kind: "text",
    placeholder: "Describe what you want…",
  },
  i_location: {
    question: "Is it for house, shop, office, roadside, or another location?",
    kind: "choice",
    options: [
      { id: "house", label: "House" },
      { id: "shop", label: "Shop" },
      { id: "office", label: "Office" },
      { id: "roadside", label: "Roadside / market" },
      { id: "other", label: "Other" },
    ],
  },
};

const START_NEXT: Record<string, string> = {
  A: "a_type",
  B: "b_problem",
  C: "c_need",
  D: "d_work",
  E: "e_need",
  F: "f_place",
  G: "g_need",
  H: "h_describe",
  I: "i_explain",
};

export function carpenterScreen(id: string): CarpenterScreen | undefined {
  return CARPENTER_SCREENS[id];
}

/** Advance helper for the choice rows; returns the next screen id or "final". */
export function nextCarpenterScreen(
  current: string,
  _answerId: string,
  _answers: Record<string, string>,
): string {
  const map: Record<string, string> = {
    a_type: "a_wood",
    a_wood: "a_woodtype",
    a_woodtype: "a_design",
    a_design: "a_measure",
    a_measure: "final",

    b_problem: "b_type",
    b_type: "b_parts",
    b_parts: "b_where",
    b_where: "final",

    c_need: "c_building",
    c_building: "c_wood",
    c_wood: "c_install",
    c_install: "final",

    d_work: "d_building",
    d_building: "d_sheet",
    d_sheet: "d_scaffold",
    d_scaffold: "final",

    e_need: "e_space",
    e_space: "e_design",
    e_design: "e_material",
    e_material: "final",

    f_place: "f_items",
    f_items: "f_setup",
    f_setup: "final",

    g_need: "g_duration",
    g_duration: "g_mobile",
    g_mobile: "final",

    h_describe: "h_location",
    h_location: "h_wood",
    h_wood: "final",

    i_explain: "i_location",
    i_location: "final",
  };
  if (current === "start") {
    return START_NEXT[_answerId] ?? "final";
  }
  return map[current] ?? "final";
}

/**
 * Strictly furniture making & carpentry: the flow is capture-only and always
 * dispatches as "carpenter" no confirm cards, no reroute to any other service.
 */
export function resolveCarpenterRoute(_answers: Record<string, string>): {
  trade: "carpenter";
  needsConfirm: false;
} {
  return { trade: "carpenter", needsConfirm: false };
}

export function canAdvanceText(value: string): boolean {
  return value.trim().length > 0;
}

export function canFindCarpenterPro(photoCount: number): boolean {
  return photoCount >= CARPENTER_MIN_PHOTOS;
}

export function composeCarpenterJob(
  answers: Record<string, string>,
  extra: string,
  landmark: string,
): string {
  const lines: string[] = [];
  const startLabel = answers.start_label || answers.start || "";
  lines.push(`Work needed: ${startLabel} (${CARPENTER_START_QUESTION})`);
  const orderedIds = [
    "a_type",
    "a_wood",
    "a_woodtype",
    "a_design",
    "a_measure",
    "b_problem",
    "b_type",
    "b_parts",
    "b_where",
    "c_need",
    "c_building",
    "c_wood",
    "c_install",
    "d_work",
    "d_building",
    "d_sheet",
    "d_scaffold",
    "e_need",
    "e_space",
    "e_design",
    "e_material",
    "f_place",
    "f_items",
    "f_setup",
    "g_need",
    "g_duration",
    "g_mobile",
    "h_describe",
    "h_location",
    "h_wood",
    "i_explain",
    "i_location",
  ];
  for (const id of orderedIds) {
    const value = answers[`${id}_label`] || answers[id];
    if (!value) continue;
    const screen = CARPENTER_SCREENS[id];
    if (!screen) continue;
    lines.push(`${screen.question} ${value}`);
  }
  if (landmark.trim()) lines.push(`Location: ${landmark.trim()}`);
  if (extra.trim()) lines.push(`Extra: ${extra.trim()}`);
  return lines.join("\n");
}

export function carpenterBreadcrumb(stack: string[]): string {
  const step = stack[stack.length - 1];
  if (!step || step === "start") return "Carpenter";
  if (step === "final") return "Carpenter · Send";
  return `Carpenter · ${step.charAt(0).toUpperCase()}`;
}
