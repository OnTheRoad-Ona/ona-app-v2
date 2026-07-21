/**
 * Database-backed RBAC with code fallback.
 * Phase A: foundation — load permissions from Postgres when available.
 */

import { createServiceSupabase } from "@/lib/supabase/server";
import {
  type AdminRole,
  type CarePermission,
  normalizeAdminRole,
  roleHasPermission as codeRoleHasPermission,
} from "@/lib/server/modules/admin-roles";

/** Extended permission ids from rbac_permissions seed */
export type PlatformPermission = string;

let cache:
  | {
      at: number;
      byRole: Record<string, Set<string>>;
    }
  | null = null;

const CACHE_MS = 60_000;

async function loadRoleMap(): Promise<Record<string, Set<string>>> {
  if (cache && Date.now() - cache.at < CACHE_MS) {
    return cache.byRole;
  }
  try {
    const supabase = createServiceSupabase();
    const { data, error } = await supabase
      .from("rbac_role_permissions")
      .select("role_id, permission_id");
    if (error || !data) {
      return {};
    }
    const byRole: Record<string, Set<string>> = {};
    for (const row of data as { role_id: string; permission_id: string }[]) {
      if (!byRole[row.role_id]) byRole[row.role_id] = new Set();
      byRole[row.role_id]!.add(row.permission_id);
    }
    cache = { at: Date.now(), byRole };
    return byRole;
  } catch {
    return {};
  }
}

/** Map legacy CarePermission → platform permission id */
const CARE_TO_PLATFORM: Partial<Record<CarePermission, string>> = {
  view_jobs: "bookings.view",
  view_users: "users.view",
  search: "users.view",
  view_audit: "audit.view",
  view_board: "bookings.view",
  escrow_release: "payments.release",
  escrow_refund: "payments.refund",
  user_freeze: "users.suspend",
  dispute_resolve: "bookings.edit",
  view_pii: "pii.view",
  system_settings: "settings.edit",
  role_change: "roles.change",
  health: "system.health",
};

/**
 * Check staff permission: DB first, then code map for CarePermission.
 */
export async function hasPermission(
  adminRole: string | null | undefined,
  permission: CarePermission | PlatformPermission
): Promise<boolean> {
  const role = normalizeAdminRole(adminRole);
  const map = await loadRoleMap();
  const set = map[role] || map[adminRole || ""] || null;

  if (set && set.size > 0) {
    if (set.has(permission)) return true;
    const mapped = CARE_TO_PLATFORM[permission as CarePermission];
    if (mapped && set.has(mapped)) return true;
    // super_admin always
    if (role === "super_admin") return true;
  }

  // Code fallback (legacy CarePermission only)
  if (
    permission === "view_jobs" ||
    permission === "view_users" ||
    permission === "search" ||
    permission === "view_audit" ||
    permission === "view_board" ||
    permission === "escrow_release" ||
    permission === "escrow_refund" ||
    permission === "user_freeze" ||
    permission === "dispute_resolve" ||
    permission === "view_pii" ||
    permission === "system_settings" ||
    permission === "role_change" ||
    permission === "health"
  ) {
    return codeRoleHasPermission(role as AdminRole, permission);
  }

  return role === "super_admin";
}

export function clearRbacCache() {
  cache = null;
}
