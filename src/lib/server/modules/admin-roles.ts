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
