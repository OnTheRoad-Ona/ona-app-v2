/**
 * Dual-role labels + helpers (Customer Role / Professional Role / Dual Role).
 * Synced with profiles.primary_role + side tables + last_role_switch_at.
 */

import type { AccountType } from "@/lib/types";

/** User-facing + admin: original / active role label */
export function accountTypeRoleLabel(
  type: AccountType | "motorist" | "repair_pro" | "professional" | null | undefined
): string {
  if (type === "professional" || type === "repair_pro") {
    return "Professional Role";
  }
  if (type === "motorist") return "Customer Role";
  return "—";
}

export function dbRoleToAccountType(
  role: string | null | undefined
): AccountType | null {
  if (role === "repair_pro") return "professional";
  if (role === "motorist") return "motorist";
  return null;
}

export function accountTypeToDbRole(
  type: AccountType | null | undefined
): "motorist" | "repair_pro" | null {
  if (type === "professional") return "repair_pro";
  if (type === "motorist") return "motorist";
  return null;
}

export function isDualRoleAccount(
  hasMotorist: boolean,
  hasPro: boolean
): boolean {
  return Boolean(hasMotorist && hasPro);
}

/** Admin / UI: has user ever switched (or dual with switch count)? */
export function hasRoleSwitched(opts: {
  dual: boolean;
  roleSwitchCount?: number | null;
  lastRoleSwitchAt?: string | null;
}): boolean {
  if ((opts.roleSwitchCount ?? 0) > 0) return true;
  if (opts.lastRoleSwitchAt) return true;
  // Dual without tracked switch still means they hold both roles
  return opts.dual;
}

export type DualRoleMeta = {
  dualRole: boolean;
  /** Customer Role | Professional Role from original signup */
  firstRoleLabel: string;
  firstRole: AccountType | null;
  /** Active profiles.role */
  currentRoleLabel: string;
  currentRole: AccountType | null;
  lastRoleSwitchAt: string | null;
  roleSwitchCount: number;
  hasSwitched: boolean;
};

export function buildDualRoleMeta(opts: {
  hasMotorist: boolean;
  hasPro: boolean;
  /** profiles.role */
  currentDbRole?: string | null;
  /** profiles.primary_role */
  primaryDbRole?: string | null;
  primaryAccountType?: AccountType | null;
  lastRoleSwitchAt?: string | null;
  roleSwitchCount?: number | null;
  activeAccountType?: AccountType | null;
}): DualRoleMeta {
  const dual = isDualRoleAccount(opts.hasMotorist, opts.hasPro);
  const first =
    opts.primaryAccountType ||
    dbRoleToAccountType(opts.primaryDbRole) ||
    null;
  const current =
    opts.activeAccountType ||
    dbRoleToAccountType(opts.currentDbRole) ||
    null;
  const count = opts.roleSwitchCount ?? 0;
  const last = opts.lastRoleSwitchAt || null;
  return {
    dualRole: dual,
    firstRole: first,
    firstRoleLabel: accountTypeRoleLabel(first),
    currentRole: current,
    currentRoleLabel: accountTypeRoleLabel(current),
    lastRoleSwitchAt: last,
    roleSwitchCount: count,
    hasSwitched: hasRoleSwitched({
      dual,
      roleSwitchCount: count,
      lastRoleSwitchAt: last,
    }),
  };
}
