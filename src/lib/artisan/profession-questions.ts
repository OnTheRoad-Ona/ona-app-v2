/**
 * Category-specific profession questions for artisan onboarding.
 * Never mix auto questions into non-auto trades (e.g. Painter ≠ cars).
 */

import type { ProService } from "@/lib/types";

export type ProfessionQuestion = {
  id: string;
  label: string;
  hint?: string;
  type: "text" | "select" | "multiselect";
  required?: boolean;
  options?: string[];
  placeholder?: string;
  maxSelect?: number;
};

const YES_NO = ["Yes", "No"];

/** Core focus / strongholds — per trade only */
export const PROFESSION_FOCUS: Record<ProService, string[]> = {
  mechanic: [
    "Engine",
    "Brakes",
    "Suspension",
    "Transmission",
    "Electrical (auto)",
    "General service",
    "Roadside repair",
  ],
  vulcanizer: [
    "Puncture repair",
    "Tyre change",
    "Wheel balancing",
    "Alignment",
    "Tubeless",
    "Spare fitment",
  ],
  towing: [
    "Light vehicle tow",
    "Heavy recovery",
    "Accident recovery",
    "Winch",
    "Flatbed",
    "Highway assist",
  ],
  battery: [
    "Jump start",
    "Battery replace",
    "Charging system",
    "Terminal service",
    "AGM / deep cycle",
  ],
  ac: [
    "Vehicle AC gas",
    "Vehicle compressor",
    "Split unit install",
    "Commercial HVAC",
    "Leak diagnosis",
    "Maintenance",
  ],
  body: [
    "Dent repair",
    "Panel beating",
    "Spray paint",
    "Bumper work",
    "Rust treatment",
    "Polish",
  ],
  electrical: [
    "House wiring",
    "Auto electrical",
    "Phones / gadgets",
    "Inverter wiring",
    "Lighting",
    "Fault finding",
  ],
  diagnostics: [
    "OBD scan",
    "Check-engine diagnosis",
    "ABS / airbag codes",
    "Live data",
    "Pre-purchase scan",
  ],
  wash: [
    "Exterior wash",
    "Interior detail",
    "Full detail",
    "Polish / wax",
    "Mobile wash",
  ],
  plumber: [
    "Pipe leaks",
    "Drainage",
    "Commercial fittings",
    "Industrial lines",
    "Water heaters",
    "Pump systems",
  ],
  carpenter: [
    "Doors & frames",
    "Furniture",
    "Cabinets",
    "Roof / timber",
    "Commercial fit-out",
    "Industrial woodwork",
  ],
  painter: [
    "Interior walls",
    "Exterior walls",
    "Industrial coatings",
    "Commercial sites",
    "Ceiling",
    "Surface prep",
  ],
  solar: [
    "Panel install",
    "Inverter setup",
    "Battery bank",
    "Hybrid systems",
    "Maintenance",
    "Commercial plant",
  ],
  generator: [
    "Petrol gensets",
    "Diesel gensets",
    "Service / oil",
    "Repair",
    "Installation",
    "ATS / transfer",
  ],
};

function bank(
  service: ProService,
  extras: ProfessionQuestion[]
): ProfessionQuestion[] {
  const focus = PROFESSION_FOCUS[service];
  return [
    {
      id: "core_focus",
      label: "Your main strengths in this trade",
      hint: "Pick what you do best. By proceeding you accept to being able to do all work in this profession.",
      type: "multiselect",
      required: true,
      options: focus,
      maxSelect: service === "mechanic" ? 6 : 4,
    },
    ...extras,
    {
      id: "night_weekend",
      label: "Can you work nights or weekends?",
      type: "select",
      required: true,
      options: YES_NO,
    },
    {
      id: "own_transport",
      label: "Do you have your own transport to jobs?",
      type: "select",
      required: true,
      options: YES_NO,
    },
  ];
}

/**
 * Full question set per profession — no cross-category leakage.
 */
export const PROFESSION_QUESTIONS: Record<ProService, ProfessionQuestion[]> = {
  mechanic: bank("mechanic", [
    {
      id: "mobile_tools",
      label: "Do you bring a full toolbox to the customer?",
      type: "select",
      required: true,
      options: YES_NO,
    },
    {
      id: "vehicle_scope",
      label: "What do you usually work on?",
      type: "multiselect",
      required: true,
      options: [
        "Saloon / SUV",
        "Buses",
        "Trucks",
        "Motorcycles",
        "Any light vehicle",
      ],
      maxSelect: 4,
    },
  ]),
  vulcanizer: bank("vulcanizer", [
    {
      id: "has_compressor",
      label: "Do you have a compressor (air machine)?",
      type: "select",
      required: true,
      options: YES_NO,
    },
    {
      id: "service_mode",
      label: "How do you usually serve customers?",
      type: "select",
      required: true,
      options: ["Roadside mobile", "Fixed workshop", "Both"],
    },
  ]),
  towing: bank("towing", [
    {
      id: "tow_equipment",
      label: "What recovery equipment do you use?",
      type: "multiselect",
      required: true,
      options: ["Wheel-lift", "Flatbed", "Winch", "Crane assist"],
      maxSelect: 4,
    },
  ]),
  battery: bank("battery", [
    {
      id: "stock_batteries",
      label: "Do you carry replacement batteries?",
      type: "select",
      required: true,
      options: YES_NO,
    },
  ]),
  ac: bank("ac", [
    {
      id: "ac_scope",
      label: "Which AC work do you cover?",
      type: "multiselect",
      required: true,
      options: ["Vehicle", "Commercial", "Industrial"],
      maxSelect: 3,
    },
    {
      id: "has_gauge_set",
      label: "Do you have gauges / vacuum pump for gas work?",
      type: "select",
      required: true,
      options: YES_NO,
    },
  ]),
  body: bank("body", [
    {
      id: "body_scope",
      label: "What body work do you offer?",
      type: "multiselect",
      required: true,
      options: [
        "Dent / panel",
        "Spray painting",
        "Bumper repair",
        "Full respray",
      ],
      maxSelect: 4,
    },
  ]),
  electrical: bank("electrical", [
    {
      id: "electric_scope",
      label: "Which electrical work do you do?",
      type: "multiselect",
      required: true,
      options: ["Vehicle", "Electronics", "Mobile"],
      maxSelect: 3,
    },
  ]),
  diagnostics: bank("diagnostics", [
    {
      id: "scan_tools",
      label: "What scan tools do you use?",
      type: "text",
      required: true,
      placeholder: "e.g. Launch, Autel, dealer-level tool",
    },
    {
      id: "scan_scope",
      label: "What do you diagnose?",
      type: "multiselect",
      required: true,
      options: [
        "Engine / ECU",
        "ABS / brakes",
        "Airbag",
        "Transmission",
        "Full vehicle health check",
      ],
      maxSelect: 5,
    },
  ]),
  wash: bank("wash", [
    {
      id: "wash_mode",
      label: "Where do you wash?",
      type: "select",
      required: true,
      options: ["At customer location", "Fixed bay", "Both"],
    },
  ]),
  plumber: bank("plumber", [
    {
      id: "plumb_scope",
      label: "What plumbing work do you handle?",
      type: "multiselect",
      required: true,
      options: [
        "Commercial plumbing",
        "Industrial plumbing",
        "Leak repair",
        "Drainage",
        "New install",
      ],
      maxSelect: 5,
    },
    {
      id: "plumb_tools",
      label: "Key plumbing tools you own",
      type: "text",
      required: true,
      placeholder: "e.g. pipe wrench, threader, pressure tester",
    },
  ]),
  carpenter: bank("carpenter", [
    {
      id: "carp_scope",
      label: "What carpentry work do you handle?",
      type: "multiselect",
      required: true,
      options: [
        "Industrial carpentry",
        "Commercial fit-out",
        "Doors & windows",
        "Furniture",
        "Roof timber",
      ],
      maxSelect: 5,
    },
    {
      id: "carp_tools",
      label: "Key woodworking tools you own",
      type: "text",
      required: true,
      placeholder: "e.g. circular saw, planer, drill set",
    },
  ]),
  painter: bank("painter", [
    {
      id: "paint_scope",
      label: "What painting work do you handle?",
      type: "multiselect",
      required: true,
      options: [
        "Industrial painting",
        "Commercial painting",
        "Interior residential",
        "Exterior walls",
        "Specialty coatings",
      ],
      maxSelect: 5,
    },
    {
      id: "paint_surfaces",
      label: "Surfaces you paint",
      type: "multiselect",
      required: true,
      options: ["Walls", "Ceilings", "Metal", "Wood", "Concrete"],
      maxSelect: 5,
    },
    {
      id: "paint_tools",
      label: "Key painting tools / equipment you own",
      type: "text",
      required: true,
      placeholder: "e.g. rollers, spray gun, scaffolding access",
    },
  ]),
  solar: bank("solar", [
    {
      id: "solar_scope",
      label: "What solar work do you handle?",
      type: "multiselect",
      required: true,
      options: [
        "Industrial solar",
        "Commercial solar",
        "Inverter install",
        "Battery systems",
        "Maintenance",
      ],
      maxSelect: 5,
    },
    {
      id: "solar_tools",
      label: "Key solar tools / meters you own",
      type: "text",
      required: true,
      placeholder: "e.g. clamp meter, crimp tools, multimeter",
    },
  ]),
  generator: bank("generator", [
    {
      id: "gen_scope",
      label: "What generator work do you handle?",
      type: "multiselect",
      required: true,
      options: [
        "Commercial generators",
        "Industrial generators",
        "Service & oil change",
        "Major repair",
        "Installation / ATS",
      ],
      maxSelect: 5,
    },
    {
      id: "gen_tools",
      label: "Key tools for generator work",
      type: "text",
      required: true,
      placeholder: "e.g. diagnostic kit, torque tools, load tester",
    },
  ]),
};

export function professionQuestionsFor(
  service: ProService
): ProfessionQuestion[] {
  return PROFESSION_QUESTIONS[service] ?? PROFESSION_QUESTIONS.mechanic;
}

export function professionAnswersValid(
  service: ProService,
  answers: Record<string, string | string[]>
): boolean {
  for (const q of professionQuestionsFor(service)) {
    if (!q.required) continue;
    const v = answers[q.id];
    if (q.type === "multiselect") {
      if (!Array.isArray(v) || v.length === 0) return false;
      continue;
    }
    if (typeof v !== "string" || !v.trim()) return false;
  }
  return true;
}
