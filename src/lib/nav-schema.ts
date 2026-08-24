/**
 * Nav whitelist-override model.
 *
 * The compiled sidebar (CLIENT_NAV / PRO_NAV in app-menu.tsx) is the single
 * source of truth for which rows CAN exist. This module describes that
 * universe (NAV_SCHEMA) and applies backend overrides (hidden / order /
 * label) WITHOUT ever being able to drop rows that are not explicitly known.
 *
 * Guarantees:
 * - Unknown override ids are ignored (warned), they can never create rows.
 * - Protected rows (Home/Dashboard, Settings) can never be hidden.
 * - Empty / malformed overrides → the compiled nav passes through untouched.
 * - Result can never be empty.
 */

import type { MenuItemOverride } from "@/lib/app-config";

export type NavRole = "client" | "pro";

export type NavSchemaRow = {
  id: string;
  href: string;
  role: NavRole;
  /** Default English label (admin display only; app uses i18n keys) */
  label: string;
};

/** The universe of sidebar rows. Must mirror CLIENT_NAV / PRO_NAV. */
export const NAV_SCHEMA: NavSchemaRow[] = [
  // Customers
  { id: "home", href: "/", role: "client", label: "Home" },
  { id: "history", href: "/history", role: "client", label: "History" },
  { id: "profile", href: "/profile", role: "client", label: "Profile" },
  { id: "wallet", href: "/wallet", role: "client", label: "Referral & Earn" },
  { id: "settings", href: "/settings", role: "client", label: "Settings" },
  { id: "shop", href: "/shop", role: "client", label: "My Shop" },
  { id: "express", href: "/express", role: "client", label: "Ona Express" },
  // Repair Pros
  { id: "dashboard", href: "/dashboard", role: "pro", label: "Dashboard" },
  { id: "jobs", href: "/jobs", role: "pro", label: "Jobs" },
  { id: "profile", href: "/profile", role: "pro", label: "Profile" },
  { id: "wallet", href: "/wallet", role: "pro", label: "Referral & Earn" },
  {
    id: "payments",
    href: "/settings/payments",
    role: "pro",
    label: "Payments",
  },
  { id: "settings", href: "/settings", role: "pro", label: "Settings" },
  { id: "shop", href: "/shop", role: "pro", label: "My Shop" },
];

/** Rows that must always be visible (navigation lifelines). */
export const PROTECTED_NAV_IDS = new Set(["home", "dashboard", "settings"]);

/** Resolve a rendered row href → schema id (My Shop may deep-link a trade). */
export function navIdForHref(
  href: string,
  role: NavRole,
  myShopHref?: string,
): string | null {
  for (const row of NAV_SCHEMA) {
    if (row.role !== role) continue;
    if (row.href === href) return row.id;
    if (row.id === "shop" && myShopHref && href === myShopHref) return "shop";
  }
  return null;
}

/**
 * Apply backend overrides to the compiled nav.
 * - `overrides`: map of schema id → { hidden, order, label }
 * - unknown ids are ignored (warned once per call)
 * - protected ids can never be hidden
 * - never returns an empty list (falls back to the input rows)
 */
export function applyNavOverrides<T extends { href: string }>(
  rows: T[],
  overrides: Record<string, MenuItemOverride> | undefined,
  opts?: { role?: NavRole; myShopHref?: string },
): T[] {
  const role = opts?.role ?? "client";
  const myShopHref = opts?.myShopHref;
  if (!overrides || typeof overrides !== "object") return rows;

  const warned: string[] = [];
  const decorated = rows.map((row, index) => {
    const id = navIdForHref(row.href, role, myShopHref);
    if (!id) return { row, index, id: null, ov: null as null };
    const ov = overrides[id];
    if (!ov || typeof ov !== "object") return { row, index, id, ov: null };
    return { row, index, id, ov };
  });

  for (const id of Object.keys(overrides)) {
    const known = decorated.some((d) => d.id === id);
    if (!known) warned.push(id);
  }
  if (warned.length) {
    console.warn(
      `[ona] Ignoring unknown menu override ids (not in ${role} nav): ${warned.join(", ")}`,
    );
  }

  const kept = decorated.filter(({ id, ov }) => {
    if (!ov) return true;
    if (ov.hidden && id && PROTECTED_NAV_IDS.has(id)) return true; // protected
    if (ov.hidden) return false;
    return true;
  });

  if (!kept.length) return rows; // never render an empty menu

  const withOrder = kept.map(({ row, index, id, ov }) => ({
    row,
    sort: ov?.order ?? index,
  }));
  withOrder.sort((a, b) => a.sort - b.sort);

  return withOrder.map(({ row }, i) => {
    const id = decorated.find((d) => d.row === row)?.id;
    const ov = id ? overrides[id] : undefined;
    if (ov?.label && !PROTECTED_NAV_IDS.has(id ?? "")) {
      return { ...row, labelOverride: ov.label };
    }
    return row;
  });
}
