import type { ProService } from "@/lib/types";

const HOME_TRADES: readonly string[] = [
  "mechanic",
  "vulcanizer",
  "towing",
  "battery",
  "ac",
  "body",
  "electrical",
  "diagnostics",
  "fashion",
  "plumber",
  "carpenter",
  "painter",
  "solar",
  "generator",
];

export function canOpenEmergencyCard(problem: string): boolean {
  return problem.trim().length >= 3;
}

/** Talk box stays blank until they tap a real trade. */
export function talkBoxAfterTradePick(
  category: string
): category is ProService {
  return HOME_TRADES.includes(category);
}

export function canFindPro(
  step: 1 | 2,
  emergency: boolean | null
): boolean {
  return step === 2 && emergency !== null;
}
