/** +₦500 to the Repair Pro call-out for each full 500 m the customer moves. */

export const CUSTOMER_MOVE_STEP_M = 500;
export const CUSTOMER_MOVE_FEE_NAIRA = 500;

export function customerMoveSurchargeNaira(movedMeters: number): {
  steps: number;
  extraNaira: number;
} {
  const m = Number(movedMeters);
  if (!Number.isFinite(m) || m < CUSTOMER_MOVE_STEP_M) {
    return { steps: 0, extraNaira: 0 };
  }
  const steps = Math.floor(m / CUSTOMER_MOVE_STEP_M);
  return { steps, extraNaira: steps * CUSTOMER_MOVE_FEE_NAIRA };
}
