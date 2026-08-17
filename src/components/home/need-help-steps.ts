import { isProService } from "@/lib/pro-service-id";
import type { ProService } from "@/lib/types";

export function canOpenEmergencyCard(problem: string): boolean {
  return problem.trim().length >= 3;
}

/** Talk box stays blank until they tap a real trade. */
export function talkBoxAfterTradePick(
  category: string
): category is ProService {
  return isProService(category);
}

export function canFindPro(
  step: 1 | 2,
  emergency: boolean | null
): boolean {
  return step === 2 && emergency !== null;
}
