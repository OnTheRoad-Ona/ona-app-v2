import type { ProService } from "@/lib/types";

/**
 * Skill-specific “What do you need help with?” options for Request Help.
 * Always ends with a generic other option.
 */
const OTHER = "Other roadside help";

const BY_SKILL: Record<ProService, string[]> = {
  mechanic: [
    "Engine issue",
    "Brakes problem",
    "Overheating",
    "Strange noise / vibration",
    "Won't start",
    "Oil / fluid leak",
    "Transmission / gearbox",
    OTHER,
  ],
  vulcanizer: [
    "Flat tire / puncture",
    "Tire change",
    "Wheel balancing",
    "Alignment check",
    "Spare tire fit",
    "Valve / air leak",
    OTHER,
  ],
  towing: [
    "Car stuck / need tow",
    "Breakdown recovery",
    "Accident recovery",
    "Jump-start & tow",
    "Highway assist",
    "Short-distance tow",
    OTHER,
  ],
  battery: [
    "Battery dead",
    "Jump start",
    "Battery replacement",
    "Charging system check",
    "Corroded terminals",
    OTHER,
  ],
  ac: [
    "AC not cooling",
    "AC gas refill",
    "AC compressor issue",
    "Strange AC noise",
    "AC smell / leak",
    OTHER,
  ],
  body: [
    "Dent / body damage",
    "Bumper repair",
    "Paint touch-up",
    "Panel replacement",
    "Scratch repair",
    OTHER,
  ],
  electrical: [
    "Wiring problem",
    "Lights not working",
    "Alternator issue",
    "Fuse / short circuit",
    "Sensor / ECU fault",
    OTHER,
  ],
  diagnostics: [
    "Check engine light",
    "Full OBD scan",
    "Intermittent fault",
    "Pre-purchase inspection",
    "Error code diagnosis",
    OTHER,
  ],
  fashion: [
    "Custom dress making",
    "Alterations / fitting",
    "Native wear",
    "Repair / restitching",
    "Corporate / uniform",
    OTHER,
  ],
  plumber: [
    "Pipe leak",
    "Blocked drain",
    "Tap / toilet repair",
    "Water heater",
    "New pipe install",
    OTHER,
  ],
  carpenter: [
    "Door / window fix",
    "Furniture repair",
    "Cabinet work",
    "Shelving",
    "Wood fitting",
    OTHER,
  ],
  painter: [
    "Room painting",
    "Exterior paint",
    "Touch-up / patch",
    "Ceiling paint",
    "Wall prep",
    OTHER,
  ],
  solar: [
    "Solar panel install",
    "Inverter issue",
    "Battery bank",
    "Wiring / fault",
    "System check",
    OTHER,
  ],
  generator: [
    "Won't start",
    "Service / oil change",
    "No power output",
    "Strange noise",
    "Fuel system",
    OTHER,
  ],
};

export function problemsForService(service: ProService | string | undefined): string[] {
  if (service && service in BY_SKILL) {
    return BY_SKILL[service as ProService];
  }
  return [
    "Flat tire / puncture",
    "Engine issue",
    "Battery dead",
    "Brakes problem",
    "Car stuck / towing",
    OTHER,
  ];
}
