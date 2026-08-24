/**
 * Database-backed RBAC with code fallback.
 * Phase A: foundation load permissions from Postgres when available.
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

let cache: {
  at: number;
  byRole: Record<string, Set<string>>;
} | null = null;

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

/** Map CarePermission → platform permission id (optional DB seed) */
const CARE_TO_PLATFORM: Partial<Record<CarePermission, string>> = {
  view_jobs: "bookings.view",
  view_users: "users.view",
  search: "users.view",
  view_audit: "audit.view",
  view_board: "bookings.view",
  view_disputes: "disputes.view",
  view_payment_status: "payments.view_status",
  view_payment_full: "payments.view_full",
  view_bank_full: "payments.view_bank",
  view_earnings: "finance.earnings",
  reply_users: "messages.reply",
  verification_approve: "verification.approve",
  resolve_simple: "tickets.resolve",
  escrow_release: "payments.release",
  escrow_refund: "payments.refund",
  user_freeze: "users.suspend",
  dispute_resolve: "disputes.resolve",
  view_pii: "pii.view",
  content_edit: "content.edit",
  system_settings: "settings.edit",
  manage_staff_l1_l3: "staff.manage_l1_l3",
  role_change: "roles.change",
  health: "system.health",
};

const CODE_PERMS = new Set<string>([
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
  "escrow_release",
  "escrow_refund",
  "user_freeze",
  "dispute_resolve",
  "view_pii",
  "content_edit",
  "system_settings",
  "manage_staff_l1_l3",
  "role_change",
  "health",
]);

/**
 * Check staff permission: DB first, then code map for CarePermission.
 */
export async function hasPermission(
  adminRole: string | null | undefined,
  permission: CarePermission | PlatformPermission,
): Promise<boolean> {
  const role = normalizeAdminRole(adminRole);
  const map = await loadRoleMap();
  const set = map[role] || map[adminRole || ""] || null;

  if (set && set.size > 0) {
    if (set.has(permission)) return true;
    const mapped = CARE_TO_PLATFORM[permission as CarePermission];
    if (mapped && set.has(mapped)) return true;
    if (role === "super_admin") return true;
  }

  if (CODE_PERMS.has(permission)) {
    return codeRoleHasPermission(
      role as AdminRole,
      permission as CarePermission,
    );
  }

  return role === "super_admin";
}

export function clearRbacCache() {
  cache = null;
}
