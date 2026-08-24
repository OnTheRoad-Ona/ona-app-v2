/**
 * Ona Admin access levels (scalable staff RBAC).
 *
 * profiles.role stays "admin" (or legacy staff flag) for panel entry.
 * profiles.admin_role stores the level key below.
 *
 * Level 1, Customer Care
 * Level 2, Senior Support / Dispute Team
 * Level 3, Operations / Finance
 * Level 4, Manager / Admin
 * Level 5, Super Admin (Owner)
 */

export type AdminRole =
  | "customer_care" // L1
  | "senior_support" // L2
  | "operations" // L3
  | "manager" // L4
  | "super_admin"; // L5

/** Numeric level for easy “L3+” checks */
export const ADMIN_LEVEL: Record<AdminRole, 1 | 2 | 3 | 4 | 5> = {
  customer_care: 1,
  senior_support: 2,
  operations: 3,
  manager: 4,
  super_admin: 5,
};

export type CarePermission =
  | "view_jobs"
  | "view_users"
  | "search"
  | "view_audit"
  | "view_board"
  | "view_disputes"
  | "view_payment_status" // status + amounts only
  | "view_payment_full" // reports, refs (no bank)
  | "view_bank_full" // full pro bank account details
  | "view_earnings" // earnings / escrow reports
  | "reply_users"
  | "verification_approve" // Tier 1-4 docs
  | "resolve_simple" // mark simple issues resolved
  | "dispute_resolve"
  | "escrow_release"
  | "escrow_refund" // cancel payment still in escrow
  | "user_freeze"
  | "view_pii" // phone/email full (not bank)
  | "content_edit" // app text, icons, menus, arrangement
  | "system_settings"
  | "manage_staff_l1_l3" // create/edit L1-L3
  | "role_change" // all staff levels (L5)
  | "health"
  /** ONA Shop catalog: products, prices, stock, images */
  | "shop_catalog";

const ALL: CarePermission[] = [
  "view_jobs",
  "view_users",
  "search",
  "view_audit",
  "view_board",
  "view_disputes",
  "view_payment_status",
  "view_payment_full",
  "view_bank_full",
  "view_earnings",
  "reply_users",
  "verification_approve",
  "resolve_simple",
  "dispute_resolve",
  "escrow_release",
  "escrow_refund",
  "user_freeze",
  "view_pii",
  "content_edit",
  "system_settings",
  "manage_staff_l1_l3",
  "role_change",
  "health",
  "shop_catalog",
];

/** L1, Customer Care */
const L1: CarePermission[] = [
  "view_jobs",
  "view_users",
  "search",
  "view_board",
  "view_disputes",
  "reply_users",
  "verification_approve",
  "resolve_simple",
  "view_pii", // contact only; bank still masked
  "health",
];

/** L2, Senior Support / Dispute Team */
const L2: CarePermission[] = [
  ...L1,
  "view_audit",
  "view_payment_status",
  "dispute_resolve",
  "user_freeze",
];

/** L3, Operations / Finance */
const L3: CarePermission[] = [
  ...L2,
  "view_payment_full",
  "view_bank_full",
  "view_earnings",
  "escrow_release",
  "escrow_refund",
];

/** L4, Manager / Admin */
const L4: CarePermission[] = [
  ...L3,
  "content_edit",
  "manage_staff_l1_l3",
  "shop_catalog",
];

const ROLE_PERMS: Record<AdminRole, CarePermission[]> = {
  customer_care: L1,
  senior_support: L2,
  operations: L3,
  manager: L4,
  super_admin: ALL,
};

/**
 * Actions that require temporary staff unlock code (except Super Admin).
 * Cancel escrow always requires unlock for L3-L4 (see requireSensitiveAction).
 */
export const PASSWORD_GATED: CarePermission[] = [
  "escrow_release",
  "escrow_refund",
  "user_freeze",
  "dispute_resolve",
  "view_bank_full",
  "view_pii",
  "system_settings",
  "content_edit",
  "manage_staff_l1_l3",
  "role_change",
];

/** Legacy / alternate strings → canonical AdminRole */
const ROLE_ALIASES: Record<string, AdminRole> = {
  customer_care: "customer_care",
  care: "customer_care",
  l1: "customer_care",
  level_1: "customer_care",
  support: "senior_support", // legacy Support → L2
  senior_support: "senior_support",
  dispute: "senior_support",
  disputes: "senior_support",
  l2: "senior_support",
  level_2: "senior_support",
  operations: "operations",
  finance: "operations",
  ops: "operations",
  l3: "operations",
  level_3: "operations",
  manager: "manager",
  admin: "manager", // panel manager, not super owner
  l4: "manager",
  level_4: "manager",
  super_admin: "super_admin",
  owner: "super_admin",
  l5: "super_admin",
  level_5: "super_admin",
};

export function normalizeAdminRole(raw: string | null | undefined): AdminRole {
  if (!raw) return "super_admin"; // legacy admins without admin_role
  const key = String(raw).trim().toLowerCase().replace(/\s+/g, "_");
  return ROLE_ALIASES[key] || "super_admin";
}

export function roleLevel(role: AdminRole): number {
  return ADMIN_LEVEL[role] ?? 5;
}

export function roleAtLeast(
  role: AdminRole,
  minLevel: 1 | 2 | 3 | 4 | 5,
): boolean {
  return roleLevel(role) >= minLevel;
}

export function roleHasPermission(
  role: AdminRole,
  perm: CarePermission,
): boolean {
  return ROLE_PERMS[role]?.includes(perm) ?? false;
}

export function permissionsForRole(role: AdminRole): CarePermission[] {
  return [...(ROLE_PERMS[role] || [])];
}

/** Roles a manager (L4) may assign; super may assign any */
export function assignableRolesBy(actor: AdminRole): AdminRole[] {
  if (actor === "super_admin") {
    return [
      "customer_care",
      "senior_support",
      "operations",
      "manager",
      "super_admin",
    ];
  }
  if (actor === "manager") {
    return ["customer_care", "senior_support", "operations"];
  }
  return [];
}

export function roleLabel(role: AdminRole): string {
  switch (role) {
    case "customer_care":
      return "Customer Care (L1)";
    case "senior_support":
      return "Senior Support (L2)";
    case "operations":
      return "Operations / Finance (L3)";
    case "manager":
      return "Manager (L4)";
    case "super_admin":
      return "Super Admin (L5)";
    default:
      return role;
  }
}

/**
 * Visual identity for admin panel (CSS data-role + badge colors).
 * Keep design; only expand role colours.
 */
export function roleTheme(role: AdminRole): {
  key: AdminRole;
  label: string;
  brandTitle: string;
  brandSub: string;
  color: string;
  soft: string;
} {
  switch (role) {
    case "customer_care":
      return {
        key: role,
        label: "Customer Care",
        brandTitle: "Ona Care",
        brandSub: "Level 1 · Customer Care",
        color: "#0f766e",
        soft: "#ccfbf1",
      };
    case "senior_support":
      return {
        key: role,
        label: "Senior Support",
        brandTitle: "Ona Support",
        brandSub: "Level 2 · Disputes",
        color: "#1d4ed8",
        soft: "#dbeafe",
      };
    case "operations":
      return {
        key: role,
        label: "Operations",
        brandTitle: "Ona Ops",
        brandSub: "Level 3 · Finance",
        color: "#b45309",
        soft: "#fef3c7",
      };
    case "manager":
      return {
        key: role,
        label: "Manager",
        brandTitle: "Ona Manager",
        brandSub: "Level 4 · Admin",
        color: "#6d28d9",
        soft: "#ede9fe",
      };
    case "super_admin":
    default:
      return {
        key: "super_admin",
        label: "Super Admin",
        brandTitle: "Ona Admin",
        brandSub: "Level 5 · Owner",
        color: "#1a1b1e",
        soft: "#e5e7eb",
      };
  }
}

/** Which top-level nav groups a role may see */
export function navGroupsForRole(role: AdminRole): string[] {
  switch (role) {
    case "customer_care":
      return ["Operations", "People", "Engagement", "Care tools"];
    case "senior_support":
      return ["Operations", "People", "Engagement", "Care tools"];
    case "operations":
      return ["Operations", "People", "Engagement", "Care tools"];
    case "manager":
      return ["Operations", "People", "Engagement", "Care tools", "System"];
    case "super_admin":
    default:
      return ["Operations", "People", "Engagement", "Care tools", "System"];
  }
}

/**
 * Path access by level (server + client).
 * Super Admin: all. Others: denylist of higher-level pages.
 */
export function canAccessAdminPath(role: AdminRole, href: string): boolean {
  const path = href.split("?")[0] || href;
  if (role === "super_admin") return true;

  // L5-only system security / full staff
  const superOnly = ["/admin/settings", "/admin/features", "/admin/matching"];
  if (superOnly.some((p) => path === p || path.startsWith(`${p}/`))) {
    return false;
  }

  // L4+ content & services menus + staff management
  const managerPlus = [
    "/admin/content",
    "/admin/services",
    "/admin/users",
    "/admin/staff",
  ];
  if (
    !roleAtLeast(role, 4) &&
    managerPlus.some((p) => path === p || path.startsWith(`${p}/`))
  ) {
    return false;
  }

  // L3+ payments (cancel + bank); L2 gets payments with limited view via same page
  // L1: no payments page
  if (
    !roleAtLeast(role, 2) &&
    (path === "/admin/payments" || path.startsWith("/admin/payments/"))
  ) {
    return false;
  }

  // L2+ disputes resolve UI; L1 can view board but dispute actions gated in API
  // L1 can open disputes page for view (view_disputes)
  // Audit L2+
  if (
    !roleAtLeast(role, 2) &&
    (path === "/admin/audit" || path.startsWith("/admin/audit/"))
  ) {
    return false;
  }

  return true;
}

/** Mask account number for staff without view_bank_full */
export function maskBankAccount(account: string | null | undefined): string {
  const s = String(account || "").replace(/\s/g, "");
  if (!s) return "Not set";
  if (s.length <= 4) return "••••";
  return `••••${s.slice(-4)}`;
}

export function maskBankPayload<T extends Record<string, unknown>>(
  row: T,
  canViewFull: boolean,
): T {
  if (canViewFull) return row;
  const out = { ...row } as Record<string, unknown>;
  for (const key of [
    "account_number",
    "accountNumber",
    "bank_account",
    "bankAccount",
    "account_no",
    "nuban",
  ]) {
    if (key in out && out[key] != null) {
      out[key] = maskBankAccount(String(out[key]));
    }
  }
  // Drop encrypted full bank blobs for lower levels
  for (const key of [
    "account_number_encrypted",
    "bank_encrypted",
    "accountEncrypted",
  ]) {
    if (key in out) out[key] = null;
  }
  return out as T;
}
