/**
 * Client-safe role labels/colors (mirrors server admin-roles theme).
 * Keep in sync with src/lib/server/modules/admin-roles.ts roleTheme().
 */

export type AdminRoleUi = "super_admin" | "customer_care" | "support";

export function normalizeAdminRoleUi(
  raw: string | null | undefined
): AdminRoleUi {
  if (raw === "customer_care" || raw === "support" || raw === "super_admin") {
    return raw;
  }
  return "super_admin";
}

export function adminRoleLabel(role: AdminRoleUi): string {
  switch (role) {
    case "customer_care":
      return "Customer Care";
    case "support":
      return "Support";
    default:
      return "Super Admin";
  }
}

export function adminRoleTheme(role: AdminRoleUi) {
  switch (role) {
    case "customer_care":
      return {
        key: role as AdminRoleUi,
        label: "Customer Care",
        brandTitle: "Ona Care",
        brandSub: "Customer Care desk",
        color: "#0f766e",
        soft: "#ccfbf1",
      };
    case "support":
      return {
        key: role as AdminRoleUi,
        label: "Support",
        brandTitle: "Ona Support",
        brandSub: "Support desk",
        color: "#1d4ed8",
        soft: "#dbeafe",
      };
    default:
      return {
        key: "super_admin" as AdminRoleUi,
        label: "Super Admin",
        brandTitle: "Ona Admin",
        brandSub: "Control centre",
        color: "#1a1b1e",
        soft: "#e5e7eb",
      };
  }
}

export function navGroupsForRoleUi(role: AdminRoleUi): string[] {
  switch (role) {
    case "support":
      return ["Operations", "People", "Engagement"];
    case "customer_care":
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
    "/admin/services",
    "/admin/matching",
    "/admin/content",
    "/admin/users",
  ];
  if (superOnly.some((p) => path === p || path.startsWith(`${p}/`))) {
    return false;
  }
  if (role === "support") {
    const careOnly = ["/admin/payments", "/admin/disputes", "/admin/audit"];
    if (careOnly.some((p) => path === p || path.startsWith(`${p}/`))) {
      return false;
    }
  }
  return true;
}
