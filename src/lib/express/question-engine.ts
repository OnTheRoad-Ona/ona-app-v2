/**
 * Ona Express smart cascading diagnostic question engine.
 *
 * One single intelligent flow that starts broad and narrows fast, mapping the
 * customer's answers onto exactly one of the eight Express trades:
 *
 *   Mechanic · Vulcanizer · Tow · Battery · Vehicle A/C · Body ·
 *   Vehicle Electric · Scan
 *
 * Principles:
 *  - Every question must significantly reduce uncertainty.
 *  - Deep cascades (2-3 levels per branch) with real diagnostic discriminators
 *    (dash-light behaviour, smoke colour, fluid type, battery condition…) so
 *    the detected trade is right ~95% of the time.
 *  - Score-based detection: each answer adds weights; strongest trade wins;
 *    fixed priority breaks exact ties; unresolved input resolves to Scan.
 */

import type { ExpressTrade } from "@/lib/express/pricing";

export type ExpressOption = {
  id: string;
  label: string;
  /** Next screen id; omit when this option settles the detection. */
  next?: string;
  /** Trade scores contributed when this option is chosen. */
  detect?: Partial<Record<ExpressTrade, number>>;
};

export interface ExpressScreen {
  id: string;
  question: string;
  kind: "choice" | "text";
  placeholder?: string;
  options?: ExpressOption[];
}

/** Screen shown first deliberately broad. */
export const EXPRESS_MAIN_QUESTION =
  "What is the main problem with your vehicle?";

export const EXPRESS_SCREENS: Record<string, ExpressScreen> = {
  main: {
    id: "main",
    question: EXPRESS_MAIN_QUESTION,
    kind: "choice",
    options: [
      {
        id: "wont-start",
        label: "It won't start or struggles to start",
        next: "start_kind",
      },
      {
        id: "warning-light",
        label: "A warning light is on the dashboard",
        next: "light_kind",
      },
      {
        id: "tyre",
        label: "Tyre problem flat, punctured or worn",
        next: "tyre_kind",
      },
      {
        id: "tow",
        label: "The vehicle cannot move I need it towed",
        detect: { towing: 4 },
      },
      {
        id: "ac",
        label: "Air-conditioning not cooling or smells",
        next: "ac_kind",
      },
      {
        id: "body-damage",
        label: "Accident, dent, scratch or body damage",
        next: "body_kind",
      },
      {
        id: "electrical",
        label: "Electrical fault windows, lights, horn, locks",
        next: "elec_kind",
      },
      {
        id: "performance",
        label: "Power loss, strange noise, smoke or shaking",
        next: "perf_kind",
      },
      {
        id: "overheat-leak",
        label: "Overheating or fluid leaking underneath",
        next: "leak_kind",
      },
      {
        id: "bss",
        label: "Brakes, steering or suspension feels wrong",
        next: "bss_kind",
      },
      {
        id: "service",
        label: "Routine service / scheduled maintenance",
        detect: { mechanic: 4 },
      },
      {
        id: "not-sure",
        label: "Something else / I'm not sure",
        next: "not_sure_describe",
      },
    ],
  },

  // ── WON'T START ─────────────────────────────────────────────────────────
  start_kind: {
    id: "start_kind",
    question: "What happens when you try to start it?",
    kind: "choice",
    options: [
      {
        id: "dead-click",
        label: "Nothing at all, or just clicking sounds",
        next: "start_dash",
      },
      {
        id: "cranks",
        label: "Cranks and cranks but never fires up",
        next: "start_crank",
      },
      {
        id: "starts-dies",
        label: "Starts, then dies almost immediately",
        next: "start_dies",
      },
      {
        id: "hard-start",
        label: "Eventually starts but it takes many tries",
        next: "start_hard",
      },
    ],
  },
  start_dash: {
    id: "start_dash",
    question: "When you turn the key, do the dashboard lights come on?",
    kind: "choice",
    options: [
      {
        id: "no-lights",
        label: "No, completely dark nothing works",
        detect: { battery: 5 },
      },
      {
        id: "lights-ok",
        label: "Yes, dashboard is normal but it won't crank",
        next: "start_battery_tested",
      },
      {
        id: "lights-dim",
        label: "They come on but very dim, and fade when I try",
        detect: { battery: 4 },
      },
    ],
  },
  start_battery_tested: {
    id: "start_battery_tested",
    question: "Has the battery been tested or replaced recently?",
    kind: "choice",
    options: [
      {
        id: "tested-fine",
        label: "Yes, battery is good so it's something else",
        detect: { mechanic: 4 },
      },
      {
        id: "not-tested",
        label: "No, never checked could be the battery",
        detect: { battery: 4 },
      },
      {
        id: "old-battery",
        label: "The battery is over 3 years old",
        detect: { battery: 4, mechanic: 1 },
      },
    ],
  },
  start_crank: {
    id: "start_crank",
    question: "How does it crank?",
    kind: "choice",
    options: [
      {
        id: "strong-crank",
        label: "Strong, fast cranking but never catches",
        next: "start_fuel",
      },
      {
        id: "weak-crank",
        label: "Slow, weak, tired cranking sound",
        detect: { battery: 4 },
      },
    ],
  },
  start_fuel: {
    id: "start_fuel",
    question: "Any of these apply?",
    kind: "choice",
    options: [
      {
        id: "fuel-smell",
        label: "I smell petrol or it flooded",
        detect: { mechanic: 4 },
      },
      {
        id: "low-fuel",
        label: "Fuel gauge is low / I just topped up",
        detect: { mechanic: 3 },
      },
      {
        id: "none",
        label: "None of these",
        detect: { diagnostics: 3, mechanic: 2 },
      },
    ],
  },
  start_dies: {
    id: "start_dies",
    question: "When does it die?",
    kind: "choice",
    options: [
      {
        id: "immediately",
        label: "Within seconds, every time",
        detect: { mechanic: 3, diagnostics: 2 },
      },
      {
        id: "security-flash",
        label: "A security/key light flashes on the dash",
        detect: { diagnostics: 3, electrical: 2 },
      },
      {
        id: "after-minutes",
        label: "Runs a few minutes first, then dies",
        detect: { mechanic: 3, diagnostics: 2 },
      },
    ],
  },
  start_hard: {
    id: "start_hard",
    question: "Is the check engine light on?",
    kind: "choice",
    options: [
      {
        id: "cel-on",
        label: "Yes, check engine light is showing",
        detect: { diagnostics: 3, mechanic: 2 },
      },
      {
        id: "cel-off",
        label: "No warning lights at all",
        detect: { mechanic: 3, battery: 2 },
      },
    ],
  },

  // ── WARNING LIGHTS ──────────────────────────────────────────────────────
  light_kind: {
    id: "light_kind",
    question: "Which warning light is showing?",
    kind: "choice",
    options: [
      {
        id: "check-engine",
        label: "Check engine / service light",
        next: "light_cel",
      },
      {
        id: "battery-light",
        label: "Battery / charging warning light",
        next: "light_charging",
      },
      {
        id: "oil-temp",
        label: "Oil pressure or temperature light",
        next: "light_oiltemp",
      },
      {
        id: "abs-brake",
        label: "ABS or brake warning light",
        detect: { mechanic: 4 },
      },
      {
        id: "many-lights",
        label: "Several random lights at once / flickering dash",
        next: "light_many",
      },
    ],
  },
  light_cel: {
    id: "light_cel",
    question: "Is the check engine light steady or flashing?",
    kind: "choice",
    options: [
      {
        id: "steady",
        label: "Steady car feels okay",
        detect: { diagnostics: 5 },
      },
      {
        id: "steady-symptom",
        label: "Steady, but the car drives poorly",
        detect: { diagnostics: 4, mechanic: 2 },
      },
      {
        id: "flashing",
        label: "Flashing I was told not to drive like that",
        detect: { mechanic: 5 },
      },
    ],
  },
  light_charging: {
    id: "light_charging",
    question: "When does the battery light show?",
    kind: "choice",
    options: [
      {
        id: "while-driving",
        label: "Stays on while the engine is running",
        detect: { electrical: 5 },
      },
      {
        id: "dims-accessories",
        label: "Lights dim / accessories cut out with it",
        detect: { electrical: 4, battery: 2 },
      },
      {
        id: "after-restart",
        label: "Only shows briefly at startup then goes off",
        detect: { battery: 3, electrical: 2 },
      },
    ],
  },
  light_oiltemp: {
    id: "light_oiltemp",
    question: "Which one exactly, and how does the engine feel?",
    kind: "choice",
    options: [
      {
        id: "oil-light",
        label: "Oil light engine sounds normal",
        detect: { mechanic: 5 },
      },
      {
        id: "temp-hot",
        label: "Temperature light engine running hot",
        detect: { mechanic: 5 },
      },
      {
        id: "both",
        label: "Both oil and temperature warnings together",
        detect: { mechanic: 5 },
      },
    ],
  },
  light_many: {
    id: "light_many",
    question: "When does this happen?",
    kind: "choice",
    options: [
      {
        id: "wet-rain",
        label: "Mostly after rain or washing the car",
        detect: { electrical: 5 },
      },
      {
        id: "jump-started",
        label: "Started right after a jump start",
        detect: { electrical: 4, battery: 3 },
      },
      {
        id: "always",
        label: "All the time, randomly",
        detect: { electrical: 5 },
      },
    ],
  },

  // ── TYRES ────────────────────────────────────────────────────────────────
  tyre_kind: {
    id: "tyre_kind",
    question: "What exactly is wrong with the tyre?",
    kind: "choice",
    options: [
      {
        id: "flat",
        label: "Flat or punctured right now",
        detect: { vulcanizer: 5 },
      },
      {
        id: "slow-loss",
        label: "Keeps slowly losing pressure",
        next: "tyre_slow",
      },
      {
        id: "worn",
        label: "Worn out / bulging needs new tyre(s)",
        detect: { vulcanizer: 5 },
      },
      {
        id: "wobble",
        label: "Steering shakes or wobbles at speed",
        next: "tyre_wobble",
      },
    ],
  },
  tyre_slow: {
    id: "tyre_slow",
    question: "Can you see why it loses air?",
    kind: "choice",
    options: [
      {
        id: "nail",
        label: "There is a nail or object in it",
        detect: { vulcanizer: 5 },
      },
      {
        id: "valve-rim",
        label: "Looks like the valve or the rim edge",
        detect: { vulcanizer: 5 },
      },
      {
        id: "unknown",
        label: "No idea it just goes down weekly",
        detect: { vulcanizer: 5 },
      },
    ],
  },
  tyre_wobble: {
    id: "tyre_wobble",
    question: "Where do you feel the shake?",
    kind: "choice",
    options: [
      {
        id: "steering-highway",
        label: "In the steering wheel at highway speed",
        detect: { vulcanizer: 4, mechanic: 1 },
      },
      {
        id: "bumps",
        label: "Over bumps and potholes",
        detect: { mechanic: 4, vulcanizer: 2 },
      },
      {
        id: "pulling",
        label: "The car pulls to one side instead",
        detect: { vulcanizer: 4 },
      },
    ],
  },

  // ── A/C ──────────────────────────────────────────────────────────────────
  ac_kind: {
    id: "ac_kind",
    question: "What is the A/C doing?",
    kind: "choice",
    options: [
      {
        id: "warm",
        label: "Blows but not cold anymore",
        detect: { ac: 5 },
      },
      {
        id: "not-blowing",
        label: "Fan barely blows or nothing comes out",
        detect: { ac: 5 },
      },
      {
        id: "smell-noise",
        label: "Bad smell or noise from the vents",
        detect: { ac: 5 },
      },
      {
        id: "drip",
        label: "Water dripping inside the cabin",
        detect: { ac: 5 },
      },
    ],
  },

  // ── BODY ─────────────────────────────────────────────────────────────────
  body_kind: {
    id: "body_kind",
    question: "What kind of damage is it?",
    kind: "choice",
    options: [
      {
        id: "dent-scratch",
        label: "Dent, scratch or paint damage",
        detect: { body: 5 },
      },
      {
        id: "crash-parts",
        label: "Crashed bumper, lights or panels broken",
        detect: { body: 5 },
      },
      {
        id: "roof-glass",
        label: "Windshield / glass or roof damage",
        detect: { body: 5 },
      },
      {
        id: "doors-misaligned",
        label: "Door or panel no longer closes properly",
        detect: { body: 5 },
      },
    ],
  },

  // ── ELECTRICAL ───────────────────────────────────────────────────────────
  elec_kind: {
    id: "elec_kind",
    question: "Which part is misbehaving?",
    kind: "choice",
    options: [
      {
        id: "windows-locks",
        label: "Power windows, mirrors or central locking",
        detect: { electrical: 5 },
      },
      {
        id: "lights-horn",
        label: "Headlights, interior lights or horn",
        detect: { electrical: 5 },
      },
      {
        id: "drains",
        label: "Battery drains flat overnight",
        next: "elec_drain",
      },
      {
        id: "starter-clicks",
        label: "Starter sometimes just clicks, works later",
        detect: { electrical: 4, battery: 2 },
      },
      {
        id: "gauge-cluster",
        label: "Dashboard / gauges acting erratically",
        detect: { electrical: 4, diagnostics: 2 },
      },
    ],
  },
  elec_drain: {
    id: "elec_drain",
    question: "Is the battery itself fairly new or recently tested?",
    kind: "choice",
    options: [
      {
        id: "new-battery",
        label: "Yes, battery is fine something drains it",
        detect: { electrical: 5 },
      },
      {
        id: "old-battery",
        label: "No it may just be the battery",
        detect: { battery: 5, electrical: 1 },
      },
    ],
  },

  // ── PERFORMANCE ──────────────────────────────────────────────────────────
  perf_kind: {
    id: "perf_kind",
    question: "How does it behave?",
    kind: "choice",
    options: [
      {
        id: "smoke",
        label: "Smoke from the exhaust or engine bay",
        next: "perf_smoke",
      },
      {
        id: "noise",
        label: "Knocking, grinding or whining",
        next: "perf_noise",
      },
      {
        id: "no-power",
        label: "Sluggish, jerky or loses power",
        next: "perf_power",
      },
      {
        id: "gear",
        label: "Gear / transmission slipping or harsh shifts",
        detect: { mechanic: 5 },
      },
    ],
  },
  perf_smoke: {
    id: "perf_smoke",
    question: "What colour is the smoke?",
    kind: "choice",
    options: [
      {
        id: "black",
        label: "Black smoke",
        detect: { mechanic: 4, diagnostics: 2 },
      },
      {
        id: "blue",
        label: "Blue / greyish smoke",
        detect: { mechanic: 5 },
      },
      {
        id: "white-sweet",
        label: "Thick white smoke with sweet smell",
        detect: { mechanic: 5 },
      },
      {
        id: "engine-bay",
        label: "Smoke from the engine bay itself",
        detect: { mechanic: 5 },
      },
    ],
  },
  perf_noise: {
    id: "perf_noise",
    question: "When do you hear the noise?",
    kind: "choice",
    options: [
      {
        id: "braking",
        label: "When pressing the brakes",
        detect: { mechanic: 5 },
      },
      {
        id: "accelerating",
        label: "While accelerating",
        detect: { mechanic: 5 },
      },
      {
        id: "idle",
        label: "At idle, even when standing still",
        detect: { mechanic: 5 },
      },
      {
        id: "turning",
        label: "When turning the steering fully",
        detect: { mechanic: 5 },
      },
    ],
  },
  perf_power: {
    id: "perf_power",
    question: "Is the check engine light on?",
    kind: "choice",
    options: [
      {
        id: "cel-on",
        label: "Yes, it is on",
        detect: { diagnostics: 5 },
      },
      {
        id: "cel-off",
        label: "No, no warning light",
        detect: { mechanic: 4, diagnostics: 1 },
      },
      {
        id: "limp",
        label: "Sometimes it enters limp mode",
        detect: { diagnostics: 5, mechanic: 1 },
      },
    ],
  },

  // ── OVERHEAT / LEAKS ────────────────────────────────────────────────────
  leak_kind: {
    id: "leak_kind",
    question: "What are you seeing?",
    kind: "choice",
    options: [
      {
        id: "overheating",
        label: "Temperature climbing / steam from bonnet",
        next: "leak_overheat",
      },
      {
        id: "puddle",
        label: "Puddle under the car",
        next: "leak_fluid",
      },
      {
        id: "burning",
        label: "Burning smell after driving",
        detect: { mechanic: 5 },
      },
    ],
  },
  leak_overheat: {
    id: "leak_overheat",
    question: "Have you checked the coolant level?",
    kind: "choice",
    options: [
      {
        id: "coolant-low",
        label: "Yes it is low or empty",
        detect: { mechanic: 5 },
      },
      {
        id: "coolant-ok",
        label: "Yes full, yet it still overheats",
        detect: { mechanic: 5 },
      },
      {
        id: "not-checked",
        label: "No, I haven't checked",
        detect: { mechanic: 5 },
      },
    ],
  },
  leak_fluid: {
    id: "leak_fluid",
    question: "What does the fluid look like?",
    kind: "choice",
    options: [
      {
        id: "black-oil",
        label: "Dark black / brown, thick engine oil",
        detect: { mechanic: 5 },
      },
      {
        id: "red-trans",
        label: "Reddish, oily transmission fluid",
        detect: { mechanic: 5 },
      },
      {
        id: "sweet-colour",
        label: "Green / pink and slimy coolant",
        detect: { mechanic: 5 },
      },
      {
        id: "clear-water",
        label: "Clear plain water",
        detect: { ac: 4, mechanic: 2 },
      },
    ],
  },

  // ── BRAKES / STEERING / SUSPENSION ──────────────────────────────────────
  bss_kind: {
    id: "bss_kind",
    question: "What exactly feels wrong?",
    kind: "choice",
    options: [
      {
        id: "brake-noise",
        label: "Squealing or grinding when braking",
        detect: { mechanic: 5 },
      },
      {
        id: "brake-soft",
        label: "Brakes feel soft or take long to stop",
        next: "bss_brake",
      },
      {
        id: "steering-heavy",
        label: "Steering heavy, stiff or noisy when turning",
        detect: { mechanic: 5 },
      },
      {
        id: "suspension",
        label: "Bumpy ride, knocks or pulls to one side",
        next: "bss_susp",
      },
    ],
  },
  bss_brake: {
    id: "bss_brake",
    question: "How bad is it?",
    kind: "choice",
    options: [
      {
        id: "pedal-floor",
        label: "Pedal almost sinks to the floor",
        detect: { mechanic: 6 },
      },
      {
        id: "spongy",
        label: "Just spongy, but it still stops",
        detect: { mechanic: 5 },
      },
    ],
  },
  bss_susp: {
    id: "bss_susp",
    question: "Which describes it best?",
    kind: "choice",
    options: [
      {
        id: "knocks-bumps",
        label: "Knocking over potholes / very bumpy",
        detect: { mechanic: 5 },
      },
      {
        id: "pulls-side",
        label: "Pulls to one side while driving straight",
        detect: { vulcanizer: 4, mechanic: 2 },
      },
      {
        id: "uneven-wear",
        label: "Tyres are wearing unevenly",
        detect: { vulcanizer: 4, mechanic: 2 },
      },
    ],
  },

  // ── UNCERTAIN ────────────────────────────────────────────────────────────
  not_sure_describe: {
    id: "not_sure_describe",
    question: "Briefly describe what the vehicle is doing.",
    kind: "text",
    placeholder: "e.g. It behaves strangely whenever it rains",
  },
};

const DETECT_PRIORITY: ExpressTrade[] = [
  "towing",
  "vulcanizer",
  "body",
  "battery",
  "ac",
  "electrical",
  "diagnostics",
  "mechanic",
];

export function getExpressScreen(id: string): ExpressScreen | undefined {
  return EXPRESS_SCREENS[id];
}

/**
 * Advance helper. Returns the next screen id, or "detect" when the chosen
 * option carries a final trade signal and the flow should resolve now.
 */
export function nextExpressStep(
  screenId: string,
  _optionId: string,
  _answers: Record<string, string>
): string {
  const screen = EXPRESS_SCREENS[screenId];
  const option = screen?.options?.find((o) => o.id === _optionId);
  if (option?.next) return option.next;
  return "detect";
}

/**
 * Resolve the best-matching trade from all answered screens. Score-based:
 * each chosen option adds its weights; the strongest trade wins, with a
 * fixed priority breaking exact ties. Unmatched input resolves to Scan
 * an uncertain vehicle always deserves a proper diagnostic first.
 */
export function detectExpressTrade(
  answers: Record<string, string>
): ExpressTrade {
  const scores = new Map<ExpressTrade, number>();
  for (const screen of Object.values(EXPRESS_SCREENS)) {
    const chosenId = answers[screen.id];
    if (!chosenId) continue;
    const option = screen.options?.find((o) => o.id === chosenId);
    if (!option?.detect) continue;
    for (const [trade, weight] of Object.entries(option.detect)) {
      scores.set(
        trade as ExpressTrade,
        (scores.get(trade as ExpressTrade) ?? 0) + (weight ?? 0),
      );
    }
  }

  let best: ExpressTrade | null = null;
  let bestScore = 0;
  for (const trade of DETECT_PRIORITY) {
    const score = scores.get(trade) ?? 0;
    if (score > bestScore) {
      best = trade;
      bestScore = score;
    }
  }
  return best ?? "diagnostics";
}

/** Human-readable Q&A transcript attached to the job description. */
export function composeExpressProblem(answers: Record<string, string>): string {
  const lines: string[] = [];
  for (const screen of Object.values(EXPRESS_SCREENS)) {
    const value = answers[`${screen.id}_label`] || answers[screen.id];
    if (!value) continue;
    lines.push(`${screen.question} ${value}`);
  }
  return lines.join("\n");
}
