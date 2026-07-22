/**
 * Admin / Customer Care roles.
 * profiles.role stays "admin" for panel access.
 * profiles.admin_role narrows permissions inside the panel.
 */

export type AdminRole = "super_admin" | "customer_care" | "support";

export type CarePermission =
  | "view_jobs"
  | "view_users"
  | "search"
  | "view_audit"
  | "view_board"
  | "escrow_release"
  | "escrow_refund"
  | "user_freeze"
  | "dispute_resolve"
  | "view_pii"
  | "system_settings"
  | "role_change"
  | "health";

const ALL: CarePermission[] = [
  "view_jobs",
  "view_users",
  "search",
  "view_audit",
  "view_board",
  "escrow_release",
  "escrow_refund",
  "user_freeze",
  "dispute_resolve",
  "view_pii",
  "system_settings",
  "role_change",
  "health",
];

const ROLE_PERMS: Record<AdminRole, CarePermission[]> = {
  super_admin: ALL,
  customer_care: [
    "view_jobs",
    "view_users",
    "search",
    "view_audit",
    "view_board",
    "escrow_release",
    "escrow_refund",
    "user_freeze",
    "dispute_resolve",
    "view_pii",
    "health",
  ],
  support: [
    "view_jobs",
    "view_users",
    "search",
    "view_audit",
    "view_board",
    "health",
  ],
};

/** Permissions that always need the temporary sensitive password */
export const PASSWORD_GATED: CarePermission[] = [
  "escrow_release",
  "escrow_refund",
  "user_freeze",
  "dispute_resolve",
  "view_pii",
  "system_settings",
  "role_change",
];

export function normalizeAdminRole(raw: string | null | undefined): AdminRole {
  if (raw === "customer_care" || raw === "support" || raw === "super_admin") {
    return raw;
  }
  // Legacy admins without admin_role → full access
  return "super_admin";
}

export function roleHasPermission(
  role: AdminRole,
  perm: CarePermission
): boolean {
  return ROLE_PERMS[role]?.includes(perm) ?? false;
}

export function roleLabel(role: AdminRole): string {
  switch (role) {
    case "super_admin":
      return "Super Admin";
    case "customer_care":
      return "Customer Care";
    case "support":
      return "Support";
    default:
      return role;
  }
}

/**
 * Visual identity for admin panel (CSS data-role + badge colors).
 * Super Admin = deep slate · Care = teal · Support = blue
 */
export function roleTheme(role: AdminRole): {
  key: AdminRole;
  label: string;
  brandTitle: string;
  brandSub: string;
  /** CSS color for badges / accents */
  color: string;
  soft: string;
} {
  switch (role) {
    case "customer_care":
      return {
        key: role,
        label: "Customer Care",
        brandTitle: "Ona Care",
        brandSub: "Customer Care desk",
        color: "#0f766e",
        soft: "#ccfbf1",
      };
    case "support":
      return {
        key: role,
        label: "Support",
        brandTitle: "Ona Support",
        brandSub: "Support desk",
        color: "#1d4ed8",
        soft: "#dbeafe",
      };
    case "super_admin":
    default:
      return {
        key: "super_admin",
        label: "Super Admin",
        brandTitle: "Ona Admin",
        brandSub: "Control centre",
        color: "#1a1b1e",
        soft: "#e5e7eb",
      };
  }
}

/** Which top-level nav groups a role may see */
export function navGroupsForRole(role: AdminRole): string[] {
  switch (role) {
    case "support":
      return ["Operations", "People", "Engagement"];
    case "customer_care":
      return ["Operations", "People", "Engagement", "Care tools"];
    case "super_admin":
    default:
      return ["Operations", "People", "Engagement", "Care tools", "System"];
  }
}

/** Href denylist for narrower roles */
export function canAccessAdminPath(role: AdminRole, href: string): boolean {
  const path = href.split("?")[0] || href;
  if (role === "super_admin") return true;
  // System / platform only super admin
  const superOnly = [
    "/admin/settings",
    "/admin/features",
    "/admin/services",
    "/admin/matching",
    "/admin/content",
    "/admin/users",
  ];
  if (superOnly.some((p) => path === p || path.startsWith(`${p}/`))) {
    return false;
  }
  if (role === "support") {
    // Support: read-focused — no payments/disputes actions pages
    const careOnly = ["/admin/payments", "/admin/disputes", "/admin/audit"];
    if (careOnly.some((p) => path === p || path.startsWith(`${p}/`))) {
      return false;
    }
  }
  return true;
}
