/**
 * Client-safe role labels/colors (mirrors server admin-roles).
 * Keep in sync with src/lib/server/modules/admin-roles.ts
 */

export type AdminRoleUi =
  | "customer_care"
  | "senior_support"
  | "operations"
  | "manager"
  | "super_admin";

const ALIASES: Record<string, AdminRoleUi> = {
  customer_care: "customer_care",
  care: "customer_care",
  support: "senior_support",
  senior_support: "senior_support",
  operations: "operations",
  finance: "operations",
  manager: "manager",
  admin: "manager",
  super_admin: "super_admin",
  owner: "super_admin",
};

export function normalizeAdminRoleUi(
  raw: string | null | undefined
): AdminRoleUi {
  if (!raw) return "super_admin";
  const key = String(raw).trim().toLowerCase().replace(/\s+/g, "_");
  return ALIASES[key] || "super_admin";
}

export function adminRoleLabel(role: AdminRoleUi): string {
  switch (role) {
    case "customer_care":
      return "Customer Care (L1)";
    case "senior_support":
      return "Senior Support (L2)";
    case "operations":
      return "Operations (L3)";
    case "manager":
      return "Manager (L4)";
    default:
      return "Super Admin (L5)";
  }
}

export function adminRoleTheme(role: AdminRoleUi) {
  switch (role) {
    case "customer_care":
      return {
        key: role as AdminRoleUi,
        label: "Customer Care",
        brandTitle: "Ona Care",
        brandSub: "Level 1 · Customer Care",
        color: "#0f766e",
        soft: "#ccfbf1",
      };
    case "senior_support":
      return {
        key: role as AdminRoleUi,
        label: "Senior Support",
        brandTitle: "Ona Support",
        brandSub: "Level 2 · Disputes",
        color: "#1d4ed8",
        soft: "#dbeafe",
      };
    case "operations":
      return {
        key: role as AdminRoleUi,
        label: "Operations",
        brandTitle: "Ona Ops",
        brandSub: "Level 3 · Finance",
        color: "#b45309",
        soft: "#fef3c7",
      };
    case "manager":
      return {
        key: role as AdminRoleUi,
        label: "Manager",
        brandTitle: "Ona Manager",
        brandSub: "Level 4 · Admin",
        color: "#6d28d9",
        soft: "#ede9fe",
      };
    default:
      return {
        key: "super_admin" as AdminRoleUi,
        label: "Super Admin",
        brandTitle: "Ona Admin",
        brandSub: "Level 5 · Owner",
        color: "#1a1b1e",
        soft: "#e5e7eb",
      };
  }
}

export function navGroupsForRoleUi(role: AdminRoleUi): string[] {
  switch (role) {
    case "customer_care":
    case "senior_support":
    case "operations":
      return ["Operations", "People", "Engagement", "Care tools"];
    default:
      return ["Operations", "People", "Engagement", "Care tools", "System"];
  }
}

export function canAccessAdminPathUi(
  role: AdminRoleUi,
  href: string
): boolean {
  const path = href.split("?")[0] || href;
  if (role === "super_admin") return true;

  const superOnly = [
    "/admin/settings",
    "/admin/features",
    "/admin/matching",
  ];
  if (superOnly.some((p) => path === p || path.startsWith(`${p}/`))) {
    return false;
  }

  const managerPlus = [
    "/admin/content",
    "/admin/services",
    "/admin/users",
    "/admin/staff",
  ];
  // At this point role is never super_admin (early return above)
  if (
    role !== "manager" &&
    managerPlus.some((p) => path === p || path.startsWith(`${p}/`))
  ) {
    return false;
  }

  if (
    role === "customer_care" &&
    (path === "/admin/payments" ||
      path.startsWith("/admin/payments/") ||
      path === "/admin/audit" ||
      path.startsWith("/admin/audit/"))
  ) {
    return false;
  }

  return true;
}

/** Client helpers for feature flags by level */
export function roleLevelUi(role: AdminRoleUi): number {
  switch (role) {
    case "customer_care":
      return 1;
    case "senior_support":
      return 2;
    case "operations":
      return 3;
    case "manager":
      return 4;
    default:
      return 5;
  }
}

export function canCancelEscrowUi(role: AdminRoleUi): boolean {
  return roleLevelUi(role) >= 3;
}

/** Force pro payout / cancel processing cockpit — L4 Manager + L5 Super Admin */
export function canForcePayoutUi(role: AdminRoleUi): boolean {
  return roleLevelUi(role) >= 4;
}

/** Standalone manual bank payout (not job-tied) — L4 + L5 */
export function canManualStandalonePayoutUi(role: AdminRoleUi): boolean {
  return roleLevelUi(role) >= 4;
}

export function canViewPaymentStatusUi(role: AdminRoleUi): boolean {
  return roleLevelUi(role) >= 2;
}

export function canViewFullBankUi(role: AdminRoleUi): boolean {
  return roleLevelUi(role) >= 3;
}

export function canEditContentUi(role: AdminRoleUi): boolean {
  return roleLevelUi(role) >= 4;
}
