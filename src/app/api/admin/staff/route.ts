/**
 * Staff accounts — list and assign access levels (L1–L5).
 * L4 Manager: assign L1–L3 only.
 * L5 Super Admin: assign any level.
 */

import { z } from "zod";
import {
  AdminAuthError,
  logAdminAction,
  requirePermission,
  requireSensitiveAction,
} from "@/lib/server/admin-auth";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { createServiceSupabase } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import {
  assignableRolesBy,
  normalizeAdminRole,
  roleLabel,
  type AdminRole,
} from "@/lib/server/modules/admin-roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STAFF_ROLES = [
  "admin",
  "customer_care",
  "support",
  "senior_support",
  "operations",
  "manager",
  "super_admin",
] as const;

export async function GET() {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Supabase is not configured", 503);
  }
  try {
    const { adminRole } = await requirePermission("manage_staff_l1_l3");
    // Super Admin uses role_change which is a superset; managers have manage_staff_l1_l3
    // If only role_change (shouldn't happen without manage), allow via super path
    const supabase = createServiceSupabase();
    // Staff = panel operators only (profiles.role = admin / legacy staff keys).
    // Do NOT list motorist/repair_pro just because admin_role was mis-set.
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, email, phone, role, admin_role, is_active, created_at")
      .in("role", [...STAFF_ROLES])
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) return apiFail(error.message, 500);

    const staff = (data ?? []).map((p) => {
      // Prefer admin_role; if missing, map role (admin → manager, not super)
      const raw =
        (p as { admin_role?: string | null }).admin_role ||
        (p.role === "admin" ? "manager" : p.role);
      const ar = normalizeAdminRole(raw);
      return {
        id: p.id,
        fullName: p.full_name,
        email: p.email,
        phone: p.phone,
        role: p.role,
        adminRole: ar,
        roleLabel: roleLabel(ar),
        isActive: p.is_active !== false,
        createdAt: p.created_at,
      };
    });

    return apiOk({
      staff,
      assignable: assignableRolesBy(adminRole),
      actorRole: adminRole,
      levels: [
        { level: 1, key: "customer_care", label: roleLabel("customer_care") },
        { level: 2, key: "senior_support", label: roleLabel("senior_support") },
        { level: 3, key: "operations", label: roleLabel("operations") },
        { level: 4, key: "manager", label: roleLabel("manager") },
        { level: 5, key: "super_admin", label: roleLabel("super_admin") },
      ],
    });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      // Super Admin might only have role_change — try that
      try {
        const { adminRole } = await requirePermission("role_change");
        const supabase = createServiceSupabase();
        const { data, error } = await supabase
          .from("profiles")
          .select(
            "id, full_name, email, phone, role, admin_role, is_active, created_at"
          )
          .in("role", [...STAFF_ROLES])
          .order("created_at", { ascending: false })
          .limit(200);
        if (error) return apiFail(error.message, 500);
        const staff = (data ?? []).map((p) => {
          const raw =
            (p as { admin_role?: string | null }).admin_role ||
            (p.role === "admin" ? "manager" : p.role);
          const ar = normalizeAdminRole(raw);
          return {
            id: p.id,
            fullName: p.full_name,
            email: p.email,
            phone: p.phone,
            role: p.role,
            adminRole: ar,
            roleLabel: roleLabel(ar),
            isActive: p.is_active !== false,
            createdAt: p.created_at,
          };
        });
        return apiOk({
          staff,
          assignable: assignableRolesBy(adminRole),
          actorRole: adminRole,
          levels: [
            { level: 1, key: "customer_care", label: roleLabel("customer_care") },
            { level: 2, key: "senior_support", label: roleLabel("senior_support") },
            { level: 3, key: "operations", label: roleLabel("operations") },
            { level: 4, key: "manager", label: roleLabel("manager") },
            { level: 5, key: "super_admin", label: roleLabel("super_admin") },
          ],
        });
      } catch (e2) {
        if (e2 instanceof AdminAuthError)
          return apiFail(e2.message, e2.status, e2.code || "auth");
      }
      return apiFail(e.message, e.status, e.code || "auth");
    }
    return apiFail("Failed to list staff", 500);
  }
}

const patchSchema = z.object({
  userId: z.string().uuid(),
  adminRole: z.enum([
    "customer_care",
    "senior_support",
    "operations",
    "manager",
    "super_admin",
  ]),
  isActive: z.boolean().optional(),
});

export async function PATCH(req: Request) {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Supabase is not configured", 503);
  }
  try {
    const body = patchSchema.safeParse(await req.json());
    if (!body.success) return apiFail("Invalid body", 400);

    const targetRole = body.data.adminRole as AdminRole;
    // Super Admin path
    let session;
    let actorRole: AdminRole;
    try {
      const ctx = await requireSensitiveAction("role_change", req);
      session = ctx.session;
      actorRole = ctx.adminRole;
    } catch {
      const ctx = await requireSensitiveAction("manage_staff_l1_l3", req);
      session = ctx.session;
      actorRole = ctx.adminRole;
    }

    const allowed = assignableRolesBy(actorRole);
    if (!allowed.includes(targetRole)) {
      return apiFail(
        `Your level cannot assign ${roleLabel(targetRole)}.`,
        403,
        "permission_denied"
      );
    }

    const supabase = createServiceSupabase();
    const { data: existing, error: findErr } = await supabase
      .from("profiles")
      .select("id, role, admin_role, full_name")
      .eq("id", body.data.userId)
      .maybeSingle();
    if (findErr || !existing) return apiFail("User not found", 404);

    const prev = normalizeAdminRole(
      (existing as { admin_role?: string }).admin_role || existing.role
    );
    // Prevent managers from elevating existing super_admins
    if (
      actorRole === "manager" &&
      (prev === "super_admin" || prev === "manager")
    ) {
      return apiFail("Managers cannot change Manager or Super Admin accounts.", 403);
    }

    const update: Record<string, unknown> = {
      role: "admin",
      admin_role: targetRole,
    };
    if (body.data.isActive != null) update.is_active = body.data.isActive;

    const { data: updated, error } = await supabase
      .from("profiles")
      .update(update)
      .eq("id", body.data.userId)
      .select("id, full_name, email, role, admin_role, is_active")
      .single();
    if (error) return apiFail(error.message, 500);

    await logAdminAction(session.userId, "staff.assign_level", body.data.userId, {
      previousRole: prev,
      adminRole: targetRole,
      sensitive: true,
    });

    return apiOk({
      user: updated,
      adminRole: targetRole,
      roleLabel: roleLabel(targetRole),
    });
  } catch (e) {
    if (e instanceof AdminAuthError)
      return apiFail(e.message, e.status, e.code || "auth");
    return apiFail("Failed to update staff", 500);
  }
}
