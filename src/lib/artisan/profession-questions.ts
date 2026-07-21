/**
 * Real-world profession questions for artisan onboarding.
 * Trade-specific only — never mix auto questions into home trades.
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

/** Multiselect option for free-text when list has no match */
export const OTHER_OPTION = "Other";

export function otherAnswerKey(questionId: string): string {
  return `${questionId}__other`;
}

/** Core focus / strongholds — how pros actually describe their work */
export const PROFESSION_FOCUS: Record<ProService, string[]> = {
  mechanic: [
    "Engine overhaul & diagnostics",
    "Brakes & suspension",
    "Gearbox / clutch",
    "Auto electrical",
    "Routine service & oil",
    "Roadside / breakdown",
  ],
  vulcanizer: [
    "Puncture & patch",
    "Tyre change & fitment",
    "Balancing",
    "Alignment",
    "Tubeless repair",
    "Spare & emergency callout",
  ],
  towing: [
    "Light vehicle tow",
    "SUV / 4x4 recovery",
    "Accident recovery",
    "Winch pull-out",
    "Flatbed haul",
    "Highway assist",
  ],
  battery: [
    "Jump start",
    "Battery test & replace",
    "Alternator / charging",
    "Terminal clean & cable",
    "AGM / deep-cycle",
  ],
  ac: [
    "Car AC regas",
    "Compressor & leak find",
    "Split unit install",
    "Office / shop HVAC",
    "Routine service",
  ],
  body: [
    "Dent & panel beating",
    "Spray painting",
    "Bumper & plastic repair",
    "Rust treatment",
    "Polish & detailing finish",
  ],
  electrical: [
    "House wiring & rewire",
    "Fault finding & sockets",
    "Inverter / transfer",
    "Lighting install",
    "Auto electrical jobs",
  ],
  diagnostics: [
    "OBD / ECU scan",
    "Check-engine diagnosis",
    "ABS & airbag codes",
    "Live data & sensors",
    "Pre-purchase inspection",
  ],
  wash: [
    "Exterior wash",
    "Interior clean",
    "Full detail",
    "Polish & wax",
    "Mobile home / office wash",
  ],
  plumber: [
    "Burst pipes & leaks",
    "Blocked drains",
    "Toilet / bathroom fittings",
    "Water heater & pump",
    "New piping install",
  ],
  carpenter: [
    "Doors & frames",
    "Kitchen cabinets",
    "Furniture repair / build",
    "Roof timber",
    "Office / shop fit-out",
  ],
  painter: [
    "Room interiors",
    "Building exteriors",
    "Ceiling & POP finish",
    "Metal / gate paint",
    "Surface prep & filling",
  ],
  solar: [
    "Panel mount & wiring",
    "Inverter setup",
    "Battery bank",
    "Hybrid home systems",
    "Service & fault find",
  ],
  generator: [
    "Petrol genset service",
    "Diesel genset repair",
    "Oil & filter service",
    "Install & changeover",
    "ATS / transfer switch",
  ],
};

function withOther(options: string[]): string[] {
  if (options.includes(OTHER_OPTION)) return options;
  return [...options, OTHER_OPTION];
}

function bank(
  service: ProService,
  extras: ProfessionQuestion[]
): ProfessionQuestion[] {
  const focus = PROFESSION_FOCUS[service];
  // Every multiselect gets "Other" + free-text when selected
  const extrasWithOther = extras.map((q) =>
    q.type === "multiselect" && q.options
      ? { ...q, options: withOther(q.options) }
      : q
  );
  return [
    {
      id: "core_focus",
      label: "What do customers usually call you for?",
      hint: "Pick your real strengths. Customers will match you on these.",
      type: "multiselect",
      required: true,
      options: withOther(focus),
      maxSelect: service === "mechanic" ? 6 : 4,
    },
    ...extrasWithOther,
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

export const PROFESSION_QUESTIONS: Record<ProService, ProfessionQuestion[]> = {
  mechanic: bank("mechanic", [
    {
      id: "mobile_tools",
      label: "Do you arrive with tools ready for the job?",
      hint: "Customers expect you to start work without borrowing their tools.",
      type: "select",
      required: true,
      options: YES_NO,
    },
    {
      id: "vehicle_scope",
      label: "Which vehicles do you handle most days?",
      type: "multiselect",
      required: true,
      options: [
        "Saloon & hatchback",
        "SUV & 4x4",
        "Buses",
        "Light trucks",
        "Motorcycles",
      ],
      maxSelect: 4,
    },
  ]),
  vulcanizer: bank("vulcanizer", [
    {
      id: "has_compressor",
      label: "Do you work with your own air compressor?",
      type: "select",
      required: true,
      options: YES_NO,
    },
    {
      id: "service_mode",
      label: "How do customers usually reach you?",
      type: "select",
      required: true,
      options: ["I come to them (mobile)", "They come to my bay", "Both"],
    },
  ]),
  towing: bank("towing", [
    {
      id: "tow_equipment",
      label: "What do you use for recovery jobs?",
      type: "multiselect",
      required: true,
      options: ["Wheel-lift truck", "Flatbed", "Winch", "Crane assist"],
      maxSelect: 4,
    },
  ]),
  battery: bank("battery", [
    {
      id: "stock_batteries",
      label: "Do you carry replacement batteries on call-outs?",
      type: "select",
      required: true,
      options: YES_NO,
    },
  ]),
  ac: bank("ac", [
    {
      id: "ac_scope",
      label: "Where do you mostly fix AC?",
      type: "multiselect",
      required: true,
      options: ["Cars & buses", "Homes (split units)", "Shops & offices"],
      maxSelect: 3,
    },
    {
      id: "has_gauge_set",
      label: "Do you have gauges and a vacuum pump for gas work?",
      type: "select",
      required: true,
      options: YES_NO,
    },
  ]),
  body: bank("body", [
    {
      id: "body_scope",
      label: "What body jobs are you comfortable taking?",
      type: "multiselect",
      required: true,
      options: [
        "Dent & panel",
        "Spray paint",
        "Bumper repair",
        "Full respray",
      ],
      maxSelect: 4,
    },
  ]),
  electrical: bank("electrical", [
    {
      id: "electric_scope",
      label: "Where do you mostly work?",
      type: "multiselect",
      required: true,
      options: [
        "Homes & flats",
        "Shops & offices",
        "Vehicles",
        "Phones & gadgets",
      ],
      maxSelect: 3,
    },
  ]),
  diagnostics: bank("diagnostics", [
    {
      id: "scan_tools",
      label: "Which scan tool do you use on the job?",
      type: "text",
      required: true,
      placeholder: "e.g. Launch X431, Autel, dealer laptop",
    },
    {
      id: "scan_scope",
      label: "What systems do you diagnose?",
      type: "multiselect",
      required: true,
      options: [
        "Engine / ECU",
        "ABS & brakes",
        "Airbag",
        "Transmission",
        "Full health check",
      ],
      maxSelect: 5,
    },
  ]),
  wash: bank("wash", [
    {
      id: "wash_mode",
      label: "Where do you wash vehicles?",
      type: "select",
      required: true,
      options: ["At the customer’s place", "Fixed wash bay", "Both"],
    },
  ]),
  plumber: bank("plumber", [
    {
      id: "plumb_scope",
      label: "What plumbing calls do you take most?",
      type: "multiselect",
      required: true,
      options: [
        "Emergency leaks",
        "Blocked drains",
        "Bathroom & kitchen fittings",
        "Water pumps & heaters",
        "New install / re-pipe",
      ],
      maxSelect: 5,
    },
    {
      id: "plumb_tools",
      label: "Name the main tools you bring to a job",
      type: "text",
      required: true,
      placeholder: "e.g. pipe wrench, plunger set, threader",
    },
  ]),
  carpenter: bank("carpenter", [
    {
      id: "carp_scope",
      label: "What woodwork jobs do you take most?",
      type: "multiselect",
      required: true,
      options: [
        "Doors & frames",
        "Cabinets & wardrobes",
        "Furniture",
        "Roof timber",
        "Shop / office fit-out",
      ],
      maxSelect: 5,
    },
    {
      id: "carp_tools",
      label: "Name the main tools you bring to a job",
      type: "text",
      required: true,
      placeholder: "e.g. circular saw, planer, drill set",
    },
  ]),
  painter: bank("painter", [
    {
      id: "paint_scope",
      label: "What painting jobs do you take most?",
      type: "multiselect",
      required: true,
      options: [
        "Room interiors",
        "Building exteriors",
        "Ceilings",
        "Metal / gates",
        "Full site prep & paint",
      ],
      maxSelect: 5,
    },
    {
      id: "paint_surfaces",
      label: "Which surfaces do you paint regularly?",
      type: "multiselect",
      required: true,
      options: ["Walls", "Ceilings", "Metal", "Wood", "Concrete"],
      maxSelect: 5,
    },
    {
      id: "paint_tools",
      label: "Name the main equipment you use",
      type: "text",
      required: true,
      placeholder: "e.g. rollers, spray gun, ladders",
    },
  ]),
  solar: bank("solar", [
    {
      id: "solar_scope",
      label: "What solar work do you handle day to day?",
      type: "multiselect",
      required: true,
      options: [
        "Home panel install",
        "Inverter setup",
        "Battery systems",
        "Shop / office plant",
        "Maintenance & repair",
      ],
      maxSelect: 5,
    },
    {
      id: "solar_tools",
      label: "Name the main tools and meters you carry",
      type: "text",
      required: true,
      placeholder: "e.g. clamp meter, crimp tools, multimeter",
    },
  ]),
  generator: bank("generator", [
    {
      id: "gen_scope",
      label: "What generator jobs do you take most?",
      type: "multiselect",
      required: true,
      options: [
        "Home petrol gensets",
        "Shop diesel sets",
        "Service & oil change",
        "Major repair",
        "Install & ATS",
      ],
      maxSelect: 5,
    },
    {
      id: "gen_tools",
      label: "Name the main tools you use for genset work",
      type: "text",
      required: true,
      placeholder: "e.g. torque tools, multimeter, load tester",
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
      // Other selected → custom text required
      if (v.includes(OTHER_OPTION)) {
        const other = answers[otherAnswerKey(q.id)];
        if (typeof other !== "string" || !other.trim()) return false;
      }
      continue;
    }
    if (typeof v !== "string" || !v.trim()) return false;
  }
  return true;
}
