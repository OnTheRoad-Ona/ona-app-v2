export function canOpenEmergencyCard(problem: string): boolean {
  return problem.trim().length >= 3;
}

export function canFindPro(
  step: 1 | 2,
  emergency: boolean | null
): boolean {
  return step === 2 && emergency !== null;
}
