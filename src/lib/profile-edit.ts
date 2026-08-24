/** Profile edit helpers vehicles-served lock window */

export const VEHICLES_SERVED_LOCK_DAYS = 28;

export type VehiclesServedLock = {
  locked: boolean;
  /** ISO when vehicles were last saved (if any) */
  lastUpdatedAt: string | null;
  /** ISO when next edit is allowed */
  nextChangeAt: string | null;
  /** Whole days remaining until unlock (0 if unlocked) */
  daysLeft: number;
  /** Short human label for UI */
  message: string;
};

/**
 * Vehicles you serve can only be changed every 28 days.
 * First-time set (no timestamp) is always allowed.
 */
export function getVehiclesServedLock(
  vehiclesServedUpdatedAt?: string | null,
): VehiclesServedLock {
  if (!vehiclesServedUpdatedAt) {
    return {
      locked: false,
      lastUpdatedAt: null,
      nextChangeAt: null,
      daysLeft: 0,
      message: "You can update vehicles you serve now.",
    };
  }

  const last = new Date(vehiclesServedUpdatedAt);
  if (Number.isNaN(last.getTime())) {
    return {
      locked: false,
      lastUpdatedAt: null,
      nextChangeAt: null,
      daysLeft: 0,
      message: "You can update vehicles you serve now.",
    };
  }

  const next = new Date(last);
  next.setUTCDate(next.getUTCDate() + VEHICLES_SERVED_LOCK_DAYS);
  const msLeft = next.getTime() - Date.now();
  const locked = msLeft > 0;
  const daysLeft = locked
    ? Math.max(1, Math.ceil(msLeft / (24 * 60 * 60 * 1000)))
    : 0;

  return {
    locked,
    lastUpdatedAt: last.toISOString(),
    nextChangeAt: next.toISOString(),
    daysLeft,
    message: locked
      ? `Vehicles you serve can be changed again in ${daysLeft} day${daysLeft === 1 ? "" : "s"}.`
      : "You can update vehicles you serve now.",
  };
}

export function formatLockDate(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "";
  }
}
