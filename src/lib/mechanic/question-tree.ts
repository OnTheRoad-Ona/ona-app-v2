import type { ProService } from "@/lib/types";
import {
  answeredScreenPath,
  pickAnswersOnPath,
  qaLinesForPath,
} from "@/lib/help-flow-progress";

export const MECHANIC_START_QUESTION = "What's wrong with your vehicle?";

export const MECHANIC_FINAL_COPY = {
  urgency: "Urgency",
  normal: "Normal",
  emergency: "Emergency",
  remote: "Remote location",
  night: "Night service needed",
  photos: "Add clear photos (at most 4)",
  voice: "Record a short voice note describing the problem",
  location: "Current Location",
  extra: "Any other detail you want the repair pro to know?",
  diagnosis: "Likely problem",
} as const;

export const MECHANIC_MIN_PHOTOS = 0;
export const MECHANIC_MAX_PHOTOS = 4;

export type MechanicScreenKind = "choice" | "text";

export type MechanicOption = {
  id: string;
  label: string;
};

export type MechanicScreen = {
  id: string;
  question: string;
  kind: MechanicScreenKind;
  options?: MechanicOption[];
  placeholder?: string;
};

export type MechanicRoute = {
  trade: ProService;
  alternate?: ProService;
  needsConfirm: boolean;
  diagnosis?: string;
};

export const MECHANIC_START_OPTIONS: MechanicOption[] = [
  { id: "A", label: "The vehicle will not start at all" },
  {
    id: "B",
    label: "The vehicle starts but stops, loses power, or stalls while driving",
  },
  { id: "C", label: "Strange noise coming from the vehicle" },
  { id: "D", label: "Overheating or temperature warning" },
  { id: "E", label: "Smoke, burning smell, or unusual smell" },
  { id: "F", label: "Fluid leak (oil, water, fuel, etc.)" },
  { id: "G", label: "Transmission / gear / clutch problem" },
  { id: "H", label: "Electric vehicle (EV) problem" },
  { id: "I", label: "Something else / I am not sure" },
];

const YES_NO: MechanicOption[] = [
  { id: "yes", label: "Yes" },
  { id: "no", label: "No" },
];

export const MECHANIC_SCREENS: Record<string, MechanicScreen> = {
  start: {
    id: "start",
    question: MECHANIC_START_QUESTION,
    kind: "choice",
    options: MECHANIC_START_OPTIONS,
  },
  a_what: {
    id: "a_what",
    question: "When you turn the key or press the start button, what happens?",
    kind: "choice",
    options: [
      { id: "silent", label: "Completely silent / nothing happens" },
      { id: "lights_no_crank", label: "Lights come on but no cranking sound" },
      { id: "cranks_no_start", label: "Cranks normally but does not start" },
      { id: "weak_crank", label: "Cranks very slowly / weakly" },
    ],
  },
  a_lights: {
    id: "a_lights",
    question: "Are the dashboard lights and headlights working?",
    kind: "choice",
    options: [
      { id: "normal", label: "Yes, normal" },
      { id: "dim", label: "Yes, but very dim" },
      { id: "none", label: "No lights at all" },
    ],
  },
  a_when: {
    id: "a_when",
    question:
      "Did this happen suddenly or after the car was parked for a long time?",
    kind: "choice",
    options: [
      { id: "suddenly", label: "Suddenly" },
      {
        id: "parked_long",
        label: "After the car was parked for a long time",
      },
    ],
  },
  a_recent: {
    id: "a_recent",
    question: "Any recent battery, electrical, or jump-start work?",
    kind: "choice",
    options: YES_NO,
  },
  a_danger: {
    id: "a_danger",
    question: "Is the vehicle in a dangerous location?",
    kind: "choice",
    options: YES_NO,
  },
  b_how: {
    id: "b_how",
    question: "How did it stop?",
    kind: "choice",
    options: [
      { id: "suddenly", label: "Suddenly like someone switched it off" },
      { id: "shook", label: "Shook, jerked or sputtered first" },
      { id: "gradual", label: "Lost power gradually" },
    ],
  },
  b_warning: {
    id: "b_warning",
    question: "Any warning light on before or when it stopped?",
    kind: "choice",
    options: [
      { id: "battery", label: "Battery light" },
      { id: "check_engine", label: "Check engine light" },
      { id: "temperature", label: "Temperature light" },
      { id: "oil", label: "Oil light" },
      { id: "none", label: "None" },
    ],
  },
  b_restart: {
    id: "b_restart",
    question: "Does it restart after waiting a few minutes?",
    kind: "choice",
    options: YES_NO,
  },
  b_load: {
    id: "b_load",
    question:
      "Did this happen under load (climbing, accelerating) or at any time?",
    kind: "choice",
    options: [
      { id: "under_load", label: "Under load (climbing, accelerating)" },
      { id: "any_time", label: "At any time" },
    ],
  },
  b_move: {
    id: "b_move",
    question: "Can the vehicle move safely?",
    kind: "choice",
    options: YES_NO,
  },
  c_where: {
    id: "c_where",
    question: "Where is the noise coming from?",
    kind: "choice",
    options: [
      { id: "engine", label: "Engine area (front)" },
      { id: "under", label: "Under the car" },
      { id: "wheels", label: "Wheels / tyres" },
      { id: "exhaust", label: "Exhaust" },
      { id: "cabin", label: "Inside the cabin" },
    ],
  },
  c_when: {
    id: "c_when",
    question: "When does the noise happen?",
    kind: "choice",
    options: [
      { id: "idle", label: "Only when the engine is running (idle)" },
      { id: "moving", label: "Only when moving" },
      { id: "turning", label: "When turning" },
      { id: "braking", label: "When braking" },
      { id: "always", label: "Always" },
    ],
  },
  c_sound: {
    id: "c_sound",
    question: "What does the noise sound like?",
    kind: "choice",
    options: [
      { id: "knocking", label: "Knocking / metallic" },
      { id: "whining", label: "Whining / whistling" },
      { id: "grinding", label: "Grinding" },
      { id: "squealing", label: "Squealing" },
      { id: "rattling", label: "Rattling" },
    ],
  },
  c_safe: {
    id: "c_safe",
    question: "Is the vehicle safe to drive?",
    kind: "choice",
    options: YES_NO,
  },
  d_red: {
    id: "d_red",
    question:
      "Is the temperature needle in the red or is there a warning light?",
    kind: "choice",
    options: YES_NO,
  },
  d_steam: {
    id: "d_steam",
    question: "Is there steam or coolant leaking under the car?",
    kind: "choice",
    options: YES_NO,
  },
  d_fan: {
    id: "d_fan",
    question: "Does the engine fan come on?",
    kind: "choice",
    options: YES_NO,
  },
  d_when: {
    id: "d_when",
    question: "When did it start overheating?",
    kind: "choice",
    options: [
      { id: "long_drive", label: "After long drive" },
      { id: "traffic", label: "In traffic" },
      { id: "suddenly", label: "Suddenly" },
    ],
  },
  d_ac: {
    id: "d_ac",
    question: "Was the A/C recently worked on?",
    kind: "choice",
    options: YES_NO,
  },
  d_safe: {
    id: "d_safe",
    question: "Is it safe to drive?",
    kind: "choice",
    options: YES_NO,
  },
  e_color: {
    id: "e_color",
    question: "What colour is the smoke?",
    kind: "choice",
    options: [
      { id: "white", label: "White" },
      { id: "blue", label: "Blue / grey" },
      { id: "black", label: "Black" },
      { id: "smell_only", label: "No smoke, only burning smell" },
    ],
  },
  e_where: {
    id: "e_where",
    question: "Where is the smoke coming from?",
    kind: "choice",
    options: [
      { id: "bonnet", label: "Bonnet" },
      { id: "exhaust", label: "Exhaust" },
      { id: "under", label: "Under the car" },
    ],
  },
  f_color: {
    id: "f_color",
    question: "What colour is the fluid?",
    kind: "choice",
    options: [
      { id: "oil", label: "Black / brown (oil)" },
      { id: "coolant", label: "Green / red / blue (coolant)" },
      { id: "clear", label: "Clear / yellowish (fuel or brake fluid)" },
      { id: "unknown", label: "I don’t know" },
    ],
  },
  f_where: {
    id: "f_where",
    question: "Where is the leak coming from?",
    kind: "text",
    placeholder: "Where is the leak coming from?",
  },
  f_safe: {
    id: "f_safe",
    question: "Is the vehicle safe to drive?",
    kind: "choice",
    options: YES_NO,
  },
  g_type: {
    id: "g_type",
    question: "Manual or Automatic transmission?",
    kind: "choice",
    options: [
      { id: "manual", label: "Manual" },
      { id: "automatic", label: "Automatic" },
      { id: "hybrid", label: "Hybrid" },
      { id: "electric", label: "Electric" },
    ],
  },
  g_ev: {
    id: "g_ev",
    question: "Which EV drivetrain symptom?",
    kind: "choice",
    options: [
      { id: "no_drive", label: "No drive / won't move" },
      { id: "loss_power", label: "Loss of power while driving" },
      { id: "noise", label: "Whining or unusual noise" },
      { id: "warning", label: "Motor or powertrain warning light" },
    ],
  },
  g_what: {
    id: "g_what",
    question: "What exactly is happening?",
    kind: "choice",
    options: [
      { id: "hard", label: "Hard to change gear" },
      { id: "slipping", label: "Slipping" },
      { id: "no_drive", label: "No drive" },
      { id: "noise", label: "Noise when changing gear" },
    ],
  },
  h_light: {
    id: "h_light",
    question: "Which light(s) are on?",
    kind: "choice",
    options: [
      { id: "battery", label: "Battery / charging light" },
      { id: "check_engine", label: "Check engine light" },
      { id: "multiple", label: "Multiple lights" },
      { id: "other", label: "Other" },
      { id: "not_sure", label: "I'm not sure" },
    ],
  },
  h_parts: {
    id: "h_parts",
    question:
      "Are any electrical parts not working (windows, radio, lights, etc.)?",
    kind: "choice",
    options: YES_NO,
  },
  i_accident: {
    id: "i_accident",
    question: "Was there an accident or collision?",
    kind: "choice",
    options: YES_NO,
  },
  i_parts: {
    id: "i_parts",
    question: "Which parts are damaged?",
    kind: "text",
    placeholder: "Which parts are damaged?",
  },
  i_driveable: {
    id: "i_driveable",
    question: "Is the vehicle still driveable?",
    kind: "choice",
    options: YES_NO,
  },
  i_paint: {
    id: "i_paint",
    question: "Is painting also needed?",
    kind: "choice",
    options: YES_NO,
  },
  j_kind: {
    id: "j_kind",
    question: "Flat, burst, slow puncture, or damaged rim?",
    kind: "choice",
    options: [
      { id: "flat", label: "Flat" },
      { id: "burst", label: "Burst" },
      { id: "puncture", label: "Slow puncture" },
      { id: "rim", label: "Damaged rim" },
    ],
  },
  j_which: {
    id: "j_which",
    question: "Which tyre(s)?",
    kind: "text",
    placeholder: "Which tyre(s)?",
  },
  j_spare: {
    id: "j_spare",
    question: "Do you have a good spare?",
    kind: "choice",
    options: YES_NO,
  },
  j_multi: {
    id: "j_multi",
    question: "Multiple tyres or unsafe location?",
    kind: "choice",
    options: YES_NO,
  },
  k_vehicle: {
    id: "k_vehicle",
    question: "Is it vehicle A/C?",
    kind: "choice",
    options: YES_NO,
  },
  k_issue: {
    id: "k_issue",
    question: "No cold air / weak cooling / noise / bad smell?",
    kind: "choice",
    options: [
      { id: "no_cold", label: "No cold air" },
      { id: "weak", label: "Weak cooling" },
      { id: "noise", label: "Noise" },
      { id: "smell", label: "Bad smell" },
    ],
  },
  l_describe: {
    id: "l_describe",
    question: "Please describe in your own words what is happening.",
    kind: "text",
    placeholder: "Please describe in your own words what is happening.",
  },
  l_related: {
    id: "l_related",
    question: "Is it related to:",
    kind: "choice",
    options: [
      { id: "power", label: "Power generation at home/shop" },
      { id: "house", label: "House/office repair" },
      { id: "clothing", label: "Clothing / fabric work" },
      { id: "vehicle", label: "Still vehicle related" },
    ],
  },
  l_power: {
    id: "l_power",
    question: "Power generation at home/shop",
    kind: "choice",
    options: [
      { id: "generator", label: "Generator" },
      { id: "solar", label: "Solar" },
    ],
  },
  l_house: {
    id: "l_house",
    question: "House/office repair",
    kind: "choice",
    options: [
      { id: "carpenter", label: "Carpenter" },
      { id: "plumber", label: "Plumber" },
      { id: "painter", label: "Painter" },
    ],
  },
  ev_issue: {
    id: "ev_issue",
    question: "Which EV issue?",
    kind: "choice",
    options: [
      { id: "charging", label: "Charging problem / won't charge" },
      { id: "battery", label: "Battery / range problem" },
      { id: "motor_no_drive", label: "No drive / motor problem" },
      { id: "won_t_start", label: "Won't start (silent or weak)" },
      { id: "other", label: "Other EV issue" },
    ],
  },
  ev_other: {
    id: "ev_other",
    question: "Please describe the EV problem in your own words.",
    kind: "text",
    placeholder: "Please describe the EV problem in your own words.",
  },
  part_pick: {
    id: "part_pick",
    question: "Which of these is it?",
    kind: "choice",
    options: [],
  },
  eng_sym: {
    id: "eng_sym",
    question: "What is the engine doing?",
    kind: "choice",
    options: [
      { id: "no_start", label: "Will not start" },
      { id: "cut", label: "Cuts or dies while driving" },
      { id: "knock", label: "Knocking or hitting sound" },
      { id: "misfire", label: "Jerking / misfire (like it's coughing)" },
      { id: "weak", label: "No power / weak pull" },
      { id: "overheat", label: "Overheating" },
    ],
  },
  eng_when: {
    id: "eng_when",
    question: "When does it happen?",
    kind: "choice",
    options: [
      { id: "cold", label: "Cold start (morning / first start)" },
      { id: "driving", label: "While driving" },
      { id: "idle", label: "When parked / idling" },
      { id: "always", label: "Always" },
    ],
  },
  eng_light: {
    id: "eng_light",
    question: "Any engine or oil light on?",
    kind: "choice",
    options: [
      { id: "check", label: "Check engine light" },
      { id: "oil", label: "Oil light" },
      { id: "both", label: "Both" },
      { id: "none", label: "None" },
    ],
  },
  eng_plug: {
    id: "eng_plug",
    question: "Any recent work on plug, coil, or injector?",
    kind: "choice",
    options: YES_NO,
  },
  gear_when: {
    id: "gear_when",
    question: "When is the gear acting up?",
    kind: "choice",
    options: [
      { id: "changing", label: "When changing gear" },
      { id: "drive", label: "While driving in gear" },
      { id: "takeoff", label: "When taking off / first gear" },
      { id: "always", label: "Always" },
    ],
  },
  gear_fluid: {
    id: "gear_fluid",
    question: "Any red oil leak or burnt smell from the gearbox?",
    kind: "choice",
    options: [
      { id: "leak", label: "Red oil leaking" },
      { id: "burnt", label: "Burnt smell" },
      { id: "both", label: "Leak and burnt smell" },
      { id: "none", label: "None" },
    ],
  },
  gear_light: {
    id: "gear_light",
    question: "Gear or engine light on the dash?",
    kind: "choice",
    options: [
      { id: "gear", label: "Gear / transmission light" },
      { id: "engine", label: "Check engine light" },
      { id: "none", label: "None" },
    ],
  },
  str_feel: {
    id: "str_feel",
    question: "How is the power steering?",
    kind: "choice",
    options: [
      { id: "heavy", label: "Steering is heavy / hard to turn" },
      { id: "noise", label: "Whining or screaming when you turn" },
      { id: "leak", label: "Power steering oil leaking" },
      { id: "shake", label: "Steering shakes in your hand" },
    ],
  },
  str_when: {
    id: "str_when",
    question: "When is it worst?",
    kind: "choice",
    options: [
      { id: "idle_turn", label: "Turning while the car is slow / parked" },
      { id: "moving", label: "While driving" },
      { id: "always", label: "Always" },
    ],
  },
  str_fluid: {
    id: "str_fluid",
    question: "Is the power steering oil low?",
    kind: "choice",
    options: [
      { id: "low", label: "Yes, oil is low" },
      { id: "ok", label: "Oil looks okay" },
      { id: "unknown", label: "I have not checked" },
    ],
  },
  str_lock: {
    id: "str_lock",
    question: "Can you still turn the wheel?",
    kind: "choice",
    options: YES_NO,
  },
  brn_light: {
    id: "brn_light",
    question: "What is the brain box showing?",
    kind: "choice",
    options: [
      { id: "check", label: "Check engine light staying on" },
      { id: "many", label: "Many lights coming on together" },
      { id: "immobilizer", label: "Car locks / immobilizer, will not fire" },
      { id: "none", label: "No light, but it behaves like wiring/brain" },
    ],
  },
  brn_cut: {
    id: "brn_cut",
    question: "Does it cut suddenly like someone removed the key?",
    kind: "choice",
    options: YES_NO,
  },
  brn_work: {
    id: "brn_work",
    question: "Any recent work on the brain box, wiring, or alarm?",
    kind: "choice",
    options: YES_NO,
  },
  brn_scan: {
    id: "brn_scan",
    question: "Has anyone scanned it with a diagnostic machine?",
    kind: "choice",
    options: [
      { id: "yes", label: "Yes, already scanned" },
      { id: "no", label: "Not yet" },
    ],
  },
  brk_feel: {
    id: "brk_feel",
    question: "How is the brake?",
    kind: "choice",
    options: [
      { id: "grinding", label: "Grinding / metal-on-metal" },
      { id: "soft", label: "Pedal is soft / goes down" },
      { id: "hard", label: "Pedal is hard, poor stopping" },
      { id: "noise", label: "Squealing when you brake" },
    ],
  },
  brk_pull: {
    id: "brk_pull",
    question: "Does it pull to one side when you brake?",
    kind: "choice",
    options: YES_NO,
  },
  brk_light: {
    id: "brk_light",
    question: "ABS or brake light on?",
    kind: "choice",
    options: [
      { id: "abs", label: "ABS light" },
      { id: "brake", label: "Brake light" },
      { id: "both", label: "Both" },
      { id: "none", label: "None" },
    ],
  },
  sus_feel: {
    id: "sus_feel",
    question: "How is the suspension / shock?",
    kind: "choice",
    options: [
      { id: "bounce", label: "Car is bouncing" },
      { id: "knock", label: "Knocking on bump" },
      { id: "lean", label: "Leaning to one side" },
      { id: "harsh", label: "Too hard / hitting every hole" },
    ],
  },
  sus_where: {
    id: "sus_where",
    question: "Which side?",
    kind: "choice",
    options: [
      { id: "front", label: "Front" },
      { id: "rear", label: "Rear" },
      { id: "one", label: "One side only" },
      { id: "all", label: "All round" },
    ],
  },
  sus_leak: {
    id: "sus_leak",
    question: "Is the shock leaking oil?",
    kind: "choice",
    options: [
      { id: "yes", label: "Yes" },
      { id: "no", label: "No" },
      { id: "unknown", label: "I have not checked" },
    ],
  },
  rad_steam: {
    id: "rad_steam",
    question: "What is the radiator / cooling doing?",
    kind: "choice",
    options: [
      { id: "steam", label: "Steam / boiling" },
      { id: "needle", label: "Needle in red, no steam" },
      { id: "fan", label: "Fan not coming on" },
      { id: "leak", label: "Water leaking" },
    ],
  },
  rad_level: {
    id: "rad_level",
    question: "Is the radiator water low?",
    kind: "choice",
    options: [
      { id: "low", label: "Yes, water is low" },
      { id: "ok", label: "Water looks okay" },
      { id: "unknown", label: "I have not checked" },
    ],
  },
  rad_when: {
    id: "rad_when",
    question: "When does it heat?",
    kind: "choice",
    options: [
      { id: "traffic", label: "In traffic" },
      { id: "highway", label: "On a long drive" },
      { id: "always", label: "Anytime" },
    ],
  },
  fuel_sym: {
    id: "fuel_sym",
    question: "What is the fuel system doing?",
    kind: "choice",
    options: [
      { id: "no_fuel", label: "Not getting fuel" },
      { id: "starve", label: "Starving / dying when you accelerate" },
      { id: "smell", label: "Smelling fuel" },
      { id: "pump", label: "No pump sound when you switch on" },
    ],
  },
  fuel_tank: {
    id: "fuel_tank",
    question: "How is the tank?",
    kind: "choice",
    options: [
      { id: "empty", label: "Low / empty" },
      { id: "filled", label: "Just filled" },
      { id: "ok", label: "Has fuel" },
    ],
  },
  fuel_work: {
    id: "fuel_work",
    question: "Any recent pump, filter, or injector work?",
    kind: "choice",
    options: YES_NO,
  },
  exh_sym: {
    id: "exh_sym",
    question: "What is the exhaust / silencer doing?",
    kind: "choice",
    options: [
      { id: "loud", label: "Too loud / bursting" },
      { id: "smoke", label: "Smoke from the silencer" },
      { id: "hang", label: "Hanging / hitting the ground" },
      { id: "smell", label: "Strong exhaust smell in the cabin" },
    ],
  },
  exh_smoke: {
    id: "exh_smoke",
    question: "If there is smoke, what colour?",
    kind: "choice",
    options: [
      { id: "white", label: "White" },
      { id: "blue", label: "Blue / grey" },
      { id: "black", label: "Black" },
      { id: "none", label: "No smoke" },
    ],
  },
  exh_where: {
    id: "exh_where",
    question: "Where on the exhaust?",
    kind: "choice",
    options: [
      { id: "front", label: "Front pipe / manifold" },
      { id: "middle", label: "Middle / cat" },
      { id: "silencer", label: "Silencer at the back" },
      { id: "unknown", label: "I am not sure" },
    ],
  },
  bat_sym: {
    id: "bat_sym",
    question: "What is the battery / charging doing?",
    kind: "choice",
    options: [
      { id: "dead", label: "Completely dead" },
      { id: "slow", label: "Slow to crank" },
      { id: "light", label: "Charging / battery light on while driving" },
      { id: "drain", label: "Goes down after parking" },
    ],
  },
  bat_jump: {
    id: "bat_jump",
    question: "Did jump-start bring it back?",
    kind: "choice",
    options: [
      { id: "yes", label: "Yes, it started" },
      { id: "no", label: "No, still dead" },
      { id: "not_tried", label: "I have not tried" },
    ],
  },
  bat_age: {
    id: "bat_age",
    question: "Is the battery old or newly changed?",
    kind: "choice",
    options: [
      { id: "old", label: "Old (over 2 years)" },
      { id: "new", label: "Newly changed" },
      { id: "unknown", label: "I don’t know" },
    ],
  },
};

const START_NEXT: Record<string, string> = {
  A: "a_what",
  B: "b_how",
  C: "c_where",
  D: "d_red",
  E: "e_color",
  F: "f_color",
  G: "g_type",
  H: "ev_issue",
  I: "l_describe",
};

export const MECHANIC_PART_IDS = [
  "engine",
  "gear",
  "steering",
  "brain",
  "brakes",
  "suspension",
  "radiator",
  "fuel",
  "exhaust",
  "battery",
] as const;

export type MechanicPartId = (typeof MECHANIC_PART_IDS)[number];

export const MECHANIC_PART_LABELS: Record<MechanicPartId, string> = {
  engine: "Engine",
  gear: "Gear",
  steering: "Power steering",
  brain: "Brain box",
  brakes: "Brakes",
  suspension: "Suspension / shocks",
  radiator: "Radiator",
  fuel: "Fuel system",
  exhaust: "Exhaust / silencer",
  battery: "Battery / charging",
};

const PART_FIRST: Record<MechanicPartId, string> = {
  engine: "eng_sym",
  gear: "gear_when",
  steering: "str_feel",
  brain: "brn_light",
  brakes: "brk_feel",
  suspension: "sus_feel",
  radiator: "rad_steam",
  fuel: "fuel_sym",
  exhaust: "exh_sym",
  battery: "bat_sym",
};

const PART_CHAIN: Record<string, string | "end"> = {
  eng_sym: "eng_when",
  eng_when: "eng_light",
  eng_light: "eng_plug",
  eng_plug: "end",
  gear_when: "gear_fluid",
  gear_fluid: "gear_light",
  gear_light: "end",
  str_feel: "str_when",
  str_when: "str_fluid",
  str_lock: "end",
  str_fluid: "str_lock",
  brn_light: "brn_cut",
  brn_cut: "brn_work",
  brn_work: "brn_scan",
  brn_scan: "end",
  brk_feel: "brk_pull",
  brk_pull: "brk_light",
  brk_light: "end",
  sus_feel: "sus_where",
  sus_where: "sus_leak",
  sus_leak: "end",
  rad_steam: "rad_level",
  rad_level: "rad_when",
  rad_when: "end",
  fuel_sym: "fuel_tank",
  fuel_tank: "fuel_work",
  fuel_work: "end",
  exh_sym: "exh_smoke",
  exh_smoke: "exh_where",
  exh_where: "end",
  bat_sym: "bat_jump",
  bat_jump: "bat_age",
  bat_age: "end",
};

function bump(
  scores: Record<MechanicPartId, number>,
  id: MechanicPartId,
  n: number,
) {
  scores[id] += n;
}

/**
 * Rank major systems from the symptom answers so far.
 * Higher score = more likely. Used to auto-open one cascade, or to
 * ask “Which of these is it?” when two or more are close.
 */
export function scoreMechanicParts(
  answers: Record<string, string>,
): Record<MechanicPartId, number> {
  const s = Object.fromEntries(
    MECHANIC_PART_IDS.map((id) => [id, 0]),
  ) as Record<MechanicPartId, number>;
  const main = answers.start;

  if (main === "A") {
    const what = answers.a_what;
    const lights = answers.a_lights;
    if (what === "silent" && lights === "none") bump(s, "battery", 6);
    else if (what === "lights_no_crank") {
      bump(s, "battery", 5);
      bump(s, "brain", 2);
    } else if (what === "weak_crank") bump(s, "battery", 6);
    else if (what === "cranks_no_start") {
      bump(s, "engine", 4);
      bump(s, "fuel", 4);
      bump(s, "brain", 3);
    } else if (what === "silent") {
      bump(s, "battery", 3);
      bump(s, "brain", 2);
    }
    if (answers.a_recent === "yes") bump(s, "battery", 2);
  }

  if (main === "B") {
    if (answers.b_warning === "battery") bump(s, "battery", 5);
    if (answers.b_warning === "check_engine") {
      bump(s, "brain", 5);
      bump(s, "engine", 2);
    }
    if (answers.b_warning === "temperature") {
      bump(s, "radiator", 5);
      bump(s, "engine", 2);
    }
    if (answers.b_warning === "oil") bump(s, "engine", 5);
    if (answers.b_how === "suddenly") {
      bump(s, "fuel", 3);
      bump(s, "brain", 3);
      bump(s, "engine", 2);
    }
    if (answers.b_how === "shook") {
      bump(s, "engine", 3);
      bump(s, "fuel", 3);
    }
    if (answers.b_how === "gradual") {
      bump(s, "fuel", 3);
      bump(s, "engine", 2);
    }
  }

  if (main === "C") {
    if (answers.c_where === "engine") bump(s, "engine", 5);
    if (answers.c_where === "under") {
      bump(s, "exhaust", 4);
      bump(s, "gear", 2);
    }
    if (answers.c_where === "wheels") {
      bump(s, "brakes", 3);
      bump(s, "suspension", 3);
    }
    if (answers.c_where === "exhaust") bump(s, "exhaust", 6);
    if (answers.c_where === "cabin") {
      bump(s, "brain", 2);
      bump(s, "gear", 1);
    }
    if (answers.c_when === "turning") {
      bump(s, "steering", 6);
      bump(s, "suspension", 2);
    }
    if (answers.c_when === "braking") bump(s, "brakes", 6);
    if (answers.c_when === "idle") bump(s, "engine", 3);
    if (answers.c_sound === "knocking" && answers.c_where === "engine") {
      bump(s, "engine", 3);
    }
    if (answers.c_sound === "whining") {
      bump(s, "steering", 2);
      bump(s, "gear", 2);
    }
    if (answers.c_sound === "grinding") {
      bump(s, "brakes", 3);
      bump(s, "gear", 2);
    }
    if (answers.c_sound === "squealing") {
      bump(s, "brakes", 2);
      bump(s, "steering", 2);
    }
  }

  if (main === "D") {
    bump(s, "radiator", 6);
    bump(s, "engine", 2);
    if (answers.d_steam === "yes") bump(s, "radiator", 2);
  }

  if (main === "E") {
    if (answers.e_color === "white") {
      bump(s, "radiator", 4);
      bump(s, "engine", 2);
    }
    if (answers.e_color === "blue") bump(s, "engine", 6);
    if (answers.e_color === "black") {
      bump(s, "fuel", 4);
      bump(s, "engine", 2);
    }
    if (answers.e_where === "exhaust") bump(s, "exhaust", 3);
    if (answers.e_where === "bonnet") bump(s, "engine", 3);
  }

  if (main === "F") {
    if (answers.f_color === "oil") {
      bump(s, "engine", 4);
      bump(s, "gear", 2);
    }
    if (answers.f_color === "coolant") bump(s, "radiator", 6);
    if (answers.f_color === "clear") {
      bump(s, "fuel", 3);
      bump(s, "brakes", 2);
      bump(s, "steering", 2);
    }
    if (answers.f_color === "unknown") {
      bump(s, "engine", 1);
      bump(s, "radiator", 1);
      bump(s, "steering", 1);
    }
  }

  if (main === "G") bump(s, "gear", 8);

  if (main === "I" && answers.l_related === "vehicle") {
    for (const id of MECHANIC_PART_IDS) bump(s, id, 1);
  }

  return s;
}

/** Close scores → picker. One clear winner → go straight into that cascade. */
export function rankMechanicParts(
  answers: Record<string, string>,
): MechanicPartId[] {
  const scores = scoreMechanicParts(answers);
  const sorted = MECHANIC_PART_IDS.map((id) => [id, scores[id]] as const)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);
  if (sorted.length === 0) return [];
  const top = sorted[0][1];
  const second = sorted[1]?.[1] ?? 0;
  if (sorted.length === 1 || second < top * 0.4) return [sorted[0][0]];
  return sorted
    .filter(([, n]) => n >= top * 0.45)
    .slice(0, 8)
    .map(([id]) => id);
}

function shouldSkipPartCascade(answers: Record<string, string>): boolean {
  const main = answers.start;
  if (main === "H") return true;
  if (main === "I" && answers.l_related && answers.l_related !== "vehicle") {
    return true;
  }
  if (answers.g_type === "electric" || answers.g_ev) return true;
  if (resolveMechanicRoute(answers).trade === "towing") return true;
  return false;
}

function nextAfterSymptoms(answers: Record<string, string>): string {
  if (shouldSkipPartCascade(answers)) return resolveScreen(answers);
  const ranked = rankMechanicParts(answers);
  if (ranked.length === 0) return resolveScreen(answers);
  if (ranked.length === 1) return PART_FIRST[ranked[0]];
  return "part_pick";
}

function resolveScreen(answers: Record<string, string>): "confirm" | "final" {
  return resolveMechanicRoute(answers).needsConfirm ? "confirm" : "final";
}

export function mechanicScreen(
  id: string,
  answers: Record<string, string> = {},
): MechanicScreen | undefined {
  const screen = MECHANIC_SCREENS[id];
  if (!screen) return undefined;
  if (id !== "part_pick") return screen;
  const ranked = rankMechanicParts(answers);
  const ids = ranked.length >= 2 ? ranked : MECHANIC_PART_IDS.slice();
  return {
    ...screen,
    options: [
      ...ids.map((partId) => ({
        id: partId,
        label: MECHANIC_PART_LABELS[partId],
      })),
      // Customers often cannot name vehicle parts give them an honest out.
      { id: "not_sure", label: "I'm not sure" },
    ],
  };
}

export function nextMechanicScreen(
  current: string,
  answerId: string,
  answers: Record<string, string>,
): string {
  if (current === "start") {
    if (answers.powertrain === "Electric" && answerId === "G") {
      return "g_ev";
    }
    return START_NEXT[answerId] || "l_describe";
  }

  if (current === "a_what") return "a_lights";
  if (current === "a_lights") return "a_when";
  if (current === "a_when") return "a_recent";
  if (current === "a_recent") return "a_danger";
  if (current === "a_danger") return nextAfterSymptoms(answers);

  if (current === "b_how") return "b_warning";
  if (current === "b_warning") return "b_restart";
  if (current === "b_restart") return "b_load";
  if (current === "b_load") return "b_move";
  if (current === "b_move") return nextAfterSymptoms(answers);

  if (current === "c_where") return "c_when";
  if (current === "c_when") return "c_sound";
  if (current === "c_sound") return "c_safe";
  if (current === "c_safe") return nextAfterSymptoms(answers);

  if (current === "d_red") return "d_steam";
  if (current === "d_steam") return "d_fan";
  if (current === "d_fan") return "d_when";
  if (current === "d_when") return "d_ac";
  if (current === "d_ac") return "d_safe";
  if (current === "d_safe") return nextAfterSymptoms(answers);

  if (current === "e_color") return "e_where";
  if (current === "e_where") return nextAfterSymptoms(answers);

  if (current === "f_color") return "f_where";
  if (current === "f_where") return "f_safe";
  if (current === "f_safe") return nextAfterSymptoms(answers);

  if (current === "g_type") {
    if (answerId === "electric") return "g_ev";
    return "g_what";
  }
  if (current === "g_what") return nextAfterSymptoms(answers);
  if (current === "g_ev") return resolveScreen(answers);

  if (current === "part_pick") {
    // "I'm not sure" skips the part cascade the symptom answers already
    // ranked things, so the confirm/final screen still carries a diagnosis.
    if (answerId === "not_sure") return resolveScreen(answers);
    const part = answerId as MechanicPartId;
    return PART_FIRST[part] || resolveScreen(answers);
  }
  const partNext = PART_CHAIN[current];
  if (partNext === "end") return resolveScreen(answers);
  if (partNext) return partNext;

  if (current === "h_light") return "h_parts";
  if (current === "h_parts") return resolveScreen(answers);

  if (current === "i_accident") return "i_parts";
  if (current === "i_parts") return "i_driveable";
  if (current === "i_driveable") return "i_paint";
  if (current === "i_paint") return resolveScreen(answers);

  if (current === "j_kind") return "j_which";
  if (current === "j_which") return "j_spare";
  if (current === "j_spare") return "j_multi";
  if (current === "j_multi") return resolveScreen(answers);

  if (current === "k_vehicle") return "k_issue";
  if (current === "k_issue") return resolveScreen(answers);

  if (current === "l_describe") return "l_related";
  if (current === "l_related") {
    if (answerId === "power") return "l_power";
    if (answerId === "house") return "l_house";
    return nextAfterSymptoms(answers);
  }
  if (current === "l_power" || current === "l_house") {
    return resolveScreen(answers);
  }

  if (current === "ev_issue") {
    if (answerId === "other") return "ev_other";
    return resolveScreen(answers);
  }
  if (current === "ev_other") return resolveScreen(answers);

  return "final";
}

/**
 * Narrow the answers down to the most likely problem. This is a plain-language
 * "Likely problem" line that rides along in the job summary so the pro arrives
 * with the real issue already identified not a trade guess.
 */
export function mechanicDiagnosis(
  answers: Record<string, string>,
): string | undefined {
  const part = answers.part_pick as MechanicPartId | undefined;

  if (part === "engine" || answers.eng_sym) {
    if (answers.eng_sym === "knock") return "Likely engine knock (big end / knocking)";
    if (answers.eng_sym === "misfire")
      return "Likely plug, coil, or injector misfire";
    if (answers.eng_sym === "cut") return "Likely engine cutting (fuel, coil, or brain box)";
    if (answers.eng_sym === "overheat") return "Likely engine overheating";
    if (answers.eng_light === "oil") return "Likely low oil or oil-pump fault";
    if (answers.eng_light === "check")
      return "Likely an engine or sensor fault (check engine)";
    return "Likely an engine fault";
  }
  if (part === "gear" || answers.gear_when || answers.g_what) {
    if (answers.gear_fluid === "leak" || answers.gear_fluid === "both") {
      return "Likely gearbox oil leak";
    }
    if (answers.gear_fluid === "burnt") return "Likely burnt gearbox / clutch";
    if (answers.g_what === "slipping")
      return "Likely a slipping clutch or transmission";
    if (answers.g_what === "hard")
      return "Likely a gearbox or clutch engagement fault";
    if (answers.g_what === "no_drive") return "Vehicle has no drive";
    return "Likely a gear / gearbox fault";
  }
  if (part === "steering" || answers.str_feel) {
    if (answers.str_feel === "heavy") return "Likely power steering pump or low oil";
    if (answers.str_feel === "noise") return "Likely power steering pump noise";
    if (answers.str_feel === "leak") return "Likely power steering oil leak";
    return "Likely a power steering fault";
  }
  if (part === "brain" || answers.brn_light) {
    if (answers.brn_light === "immobilizer")
      return "Likely immobilizer / brain box not firing";
    if (answers.brn_cut === "yes")
      return "Likely brain box or crank sensor cutting the engine";
    return "Likely a brain box (ECU) or wiring fault";
  }
  if (part === "brakes" || answers.brk_feel) {
    if (answers.brk_feel === "grinding") return "Likely worn brake pad / disc";
    if (answers.brk_feel === "soft") return "Likely brake fluid leak or air in line";
    return "Likely a brake fault";
  }
  if (part === "suspension" || answers.sus_feel) {
    if (answers.sus_leak === "yes") return "Likely leaking shock";
    return "Likely a suspension / shock fault";
  }
  if (part === "radiator" || answers.rad_steam) {
    return "Likely a radiator / cooling-system fault";
  }
  if (part === "fuel" || answers.fuel_sym) {
    if (answers.fuel_sym === "pump") return "Likely fuel pump not running";
    if (answers.fuel_tank === "empty") return "Likely no fuel in the tank";
    return "Likely a fuel pump, filter, or injector fault";
  }
  if (part === "exhaust" || answers.exh_sym) {
    if (answers.exh_sym === "loud") return "Likely burst silencer / exhaust leak";
    return "Likely an exhaust / silencer fault";
  }
  if (part === "battery" || answers.bat_sym) {
    if (answers.bat_sym === "light")
      return "Likely alternator / charging fault";
    if (answers.bat_jump === "yes") return "Likely a weak or dead battery";
    return "Likely a battery or charging fault";
  }

  const main = answers.start;

  if (main === "A") {
    const what = answers.a_what;
    const lights = answers.a_lights;
    if (what === "silent" && lights === "none") {
      return "Likely a dead battery or a blown fuse";
    }
    if (what === "lights_no_crank") {
      return "Likely a battery or starting-circuit fault";
    }
    if (what === "weak_crank") {
      return "Likely a weak or failing battery";
    }
    if (what === "silent") {
      return "Likely a starter or electrical fault";
    }
    return "Likely a fuel, spark, or sensor fault preventing start";
  }

  if (main === "B") {
    if (answers.b_how === "suddenly" && answers.b_warning === "battery") {
      return "Likely a charging or electrical fault";
    }
    if (answers.b_how === "suddenly") {
      return "Likely a fuel or ignition fault that cut power";
    }
    if (answers.b_how === "shook") {
      return "Likely a fuel or ignition fault under load";
    }
    return "Likely a fuel or engine-management fault";
  }

  if (main === "C") {
    if (
      answers.c_where === "wheels" ||
      answers.c_when === "turning" ||
      answers.c_when === "braking"
    ) {
      return "Likely a wheel, brake, or suspension issue";
    }
    if (answers.c_where === "under") {
      return "Likely an exhaust, mount, or underbody issue";
    }
    return "Likely an engine or drivetrain noise";
  }

  if (main === "D") {
    if (answers.d_ac === "yes") return "Likely related to recent A/C work";
    if (answers.d_red === "yes") {
      return "Likely a cooling-system fault (thermostat, fan, or coolant)";
    }
    return "Likely a cooling-system fault";
  }

  if (main === "E") {
    if (answers.e_color === "white") return "Likely coolant burning";
    if (answers.e_color === "blue")
      return "Likely oil burning (engine or turbo)";
    if (answers.e_color === "black")
      return "Likely a fuel or air mixture issue";
    return "Likely an electrical short or burnt component";
  }

  if (main === "F") {
    if (answers.f_color === "coolant") return "Likely a coolant leak";
    if (answers.f_color === "oil") return "Likely an oil leak";
    return "Likely a fuel or brake-fluid leak";
  }

  if (main === "G") {
    if (answers.g_type === "electric" || answers.g_ev) {
      if (answers.g_ev === "no_drive")
        return "Vehicle has no drive (EV motor or inverter fault)";
      if (answers.g_ev === "loss_power")
        return "Likely an EV motor or inverter fault";
      if (answers.g_ev === "warning") return "EV powertrain warning light on";
      return "Likely an EV motor or drivetrain noise";
    }
    if (answers.g_what === "no_drive") return "Vehicle has no drive";
    if (answers.g_what === "slipping")
      return "Likely a slipping clutch or transmission";
    if (answers.g_what === "hard")
      return "Likely a gearbox or clutch engagement fault";
    return "Likely a transmission fault";
  }

  if (main === "H") {
    if (answers.ev_issue === "charging") {
      return "Likely an EV charging fault (charger, cable, or charge port)";
    }
    if (answers.ev_issue === "battery") {
      return "Likely an EV high-voltage (HV) battery or range fault";
    }
    if (answers.ev_issue === "motor_no_drive") {
      return "Likely an EV motor or inverter fault";
    }
    if (answers.ev_issue === "won_t_start") {
      return "Likely an EV 12V auxiliary battery or start-controller fault";
    }
    return "EV problem (customer described)";
  }

  return undefined;
}

/**
 * Pick the trade from the filled answers. Leaving Mechanic always
 * needs a confirm card. Two-trade forks pick the stronger one first.
 */
export function resolveMechanicRoute(
  answers: Record<string, string>,
): MechanicRoute {
  const diagnosis = mechanicDiagnosis(answers);
  const stay = (): MechanicRoute => ({
    trade: "mechanic",
    needsConfirm: false,
    diagnosis,
  });
  const leave = (trade: ProService, alternate?: ProService): MechanicRoute => ({
    trade,
    alternate,
    needsConfirm: trade !== "mechanic",
    diagnosis,
  });

  // Tow rule: the customer said the vehicle can still move (safe-to-drive
  // answer "yes") → never route to Tow from a driveability answer. A
  // dangerous-location / multi-tyre flag may still warrant Tow on its own.
  const unsafeToDrive =
    answers.b_move === "no" ||
    answers.c_safe === "no" ||
    answers.d_safe === "no" ||
    answers.f_safe === "no" ||
    answers.i_driveable === "no";
  const unsafeLocation =
    answers.a_danger === "yes" || answers.j_multi === "yes";

  if (unsafeToDrive || unsafeLocation) {
    return leave("towing");
  }

  const main = answers.start;

  if (main === "A") {
    const what = answers.a_what;
    const lights = answers.a_lights;
    if (what === "silent" && lights === "none") {
      return leave("battery", "electrical");
    }
    if (what === "lights_no_crank") {
      return leave("electrical", "battery");
    }
    if (what === "weak_crank") {
      return leave("battery");
    }
    if (what === "silent" && lights !== "none") {
      return leave("electrical", "battery");
    }
    return stay();
  }

  if (main === "B") {
    if (answers.b_how === "suddenly" && answers.b_warning === "battery") {
      return leave("electrical", "battery");
    }
    return stay();
  }

  if (main === "C") {
    const picked = answers.part_pick;
    if (
      picked === "brakes" ||
      picked === "steering" ||
      picked === "suspension" ||
      picked === "engine" ||
      picked === "gear" ||
      picked === "exhaust"
    ) {
      return stay();
    }
    if (answers.brk_feel || answers.str_feel || answers.sus_feel) {
      return stay();
    }
    if (
      answers.c_where === "wheels" ||
      answers.c_when === "turning" ||
      answers.c_when === "braking"
    ) {
      return leave("vulcanizer");
    }
    return stay();
  }

  if (main === "D") {
    if (answers.d_ac === "yes") return leave("ac");
    return stay();
  }

  if (main === "E") {
    if (answers.e_color === "smell_only") return leave("electrical");
    return stay();
  }

  if (main === "F") return stay();

  if (main === "G") {
    if (answers.g_what === "no_drive" || answers.g_ev === "no_drive") {
      return leave("towing");
    }
    if (answers.g_type === "electric" || answers.g_ev) {
      return leave("electrical", "mechanic");
    }
    return stay();
  }

  if (main === "H") {
    if (answers.ev_issue === "charging") return leave("electrical", "mechanic");
    if (answers.ev_issue === "battery") return leave("battery", "electrical");
    if (answers.ev_issue === "motor_no_drive") {
      return leave("towing");
    }
    if (answers.ev_issue === "won_t_start")
      return leave("battery", "electrical");
    return stay();
  }

  if (main === "I") {
    if (answers.l_related === "clothing") return leave("fashion");
    if (answers.l_related === "power") {
      if (answers.l_power === "solar") return leave("solar");
      return leave("generator");
    }
    if (answers.l_related === "house") {
      if (answers.l_house === "plumber") return leave("plumber");
      if (answers.l_house === "painter") return leave("painter");
      return leave("carpenter");
    }
    return stay();
  }

  return stay();
}

export function applyConfirmChoice(
  route: MechanicRoute,
  yes: boolean,
): ProService {
  if (yes) return route.trade;
  if (route.alternate) return route.alternate;
  return "mechanic";
}

export function confirmQuestion(trade: ProService): string {
  const labels: Record<ProService, string> = {
    mechanic: "Mechanic",
    vulcanizer: "Vulcanizer",
    towing: "Tow",
    battery: "Battery",
    ac: "A/C",
    body: "Body",
    electrical: "Electrical",
    diagnostics: "Diagnostics",
    fashion: "Fashion",
    plumber: "Plumber",
    carpenter: "Carpenter",
    painter: "Painter",
    solar: "Solar",
    generator: "Generator",
  };
  return `This sounds like ${labels[trade]}. Continue?`;
}

function questionKey(text: string): string {
  const qi = text.indexOf("?");
  const cut = qi >= 0 ? text.slice(0, qi + 1) : text;
  return cut.replace(/\s+/g, " ").trim().toLowerCase();
}

export function filterMechanicProblemRows<
  T extends { label: string; answer: string },
>(rows: T[]): T[] {
  const startRow = rows.find(
    (r) => questionKey(r.label) === questionKey(MECHANIC_START_QUESTION),
  );
  if (!startRow) return rows;
  const startOpt = MECHANIC_START_OPTIONS.find(
    (o) => o.label === startRow.answer,
  );
  if (!startOpt) return rows;

  const reconstructed: Record<string, string> = {
    start: startOpt.id,
    start_label: startRow.answer,
  };
  for (const [id, screen] of Object.entries(MECHANIC_SCREENS)) {
    const row = rows.find(
      (r) => questionKey(r.label) === questionKey(screen.question),
    );
    if (!row) continue;
    const opt = screen.options?.find((o) => o.label === row.answer);
    reconstructed[id] = opt?.id ?? row.answer;
    reconstructed[`${id}_label`] = row.answer;
  }
  reconstructed.start = startOpt.id;
  reconstructed.start_label = startRow.answer;

  const path = answeredScreenPath(reconstructed, nextMechanicScreen);
  const keep = new Set<string>([
    questionKey(MECHANIC_FINAL_COPY.location),
    questionKey(MECHANIC_FINAL_COPY.extra),
    questionKey(MECHANIC_FINAL_COPY.diagnosis),
  ]);
  for (const id of path) {
    const screen = mechanicScreen(id, reconstructed);
    if (screen) keep.add(questionKey(screen.question));
  }
  const trimmed = rows.filter((r) => keep.has(questionKey(r.label)));
  return trimmed.length ? trimmed : rows;
}

export function composeMechanicProblem(
  answers: Record<string, string>,
  extra: string,
  landmark: string,
): string {
  const path = answeredScreenPath(answers, nextMechanicScreen);
  const scoped = pickAnswersOnPath(answers, path);
  const lines = qaLinesForPath({
    answers: scoped,
    next: nextMechanicScreen,
    screenOf: mechanicScreen,
  });

  if (landmark.trim()) {
    lines.push(MECHANIC_FINAL_COPY.location);
    lines.push(landmark.trim());
  }
  if (extra.trim()) {
    lines.push(MECHANIC_FINAL_COPY.extra);
    lines.push(extra.trim());
  }
  const diagnosis = mechanicDiagnosis(scoped);
  if (diagnosis) {
    lines.push(MECHANIC_FINAL_COPY.diagnosis);
    lines.push(diagnosis);
  }
  return lines.filter(Boolean).join("\n");
}

export function canAdvanceText(value: string): boolean {
  return value.trim().length >= 2;
}

export function canFindMechanicPro(photoCount: number): boolean {
  return photoCount >= MECHANIC_MIN_PHOTOS;
}

export function mechanicBreadcrumb(stack: string[]): string {
  const bits: string[] = ["Mechanic"];
  if (stack.length > 1) {
    const firstBranch = stack[1];
    const letter = Object.entries(START_NEXT).find(
      ([, id]) => id === firstBranch,
    )?.[0];
    if (letter) bits.push(letter);
  }
  const last = stack[stack.length - 1];
  if (last === "confirm") bits.push("Confirm");
  else if (last === "final") bits.push("Send");
  return bits.join(" · ");
}
