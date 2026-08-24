import { z } from "zod";
import {
  AdminAuthError,
  logAdminAction,
  requireAdmin,
} from "@/lib/server/admin-auth";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { createServiceSupabase } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import type { UserRole } from "@/lib/supabase/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  role: z.enum(["admin", "motorist", "repair_pro"]),
});

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!isSupabaseAdminConfigured()) {
    return apiFail(
      "Supabase is not configured",
      503,
      "supabase_not_configured",
    );
  }

  try {
    const { session } = await requireAdmin();
    const { id } = await ctx.params;
    const json = await req.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return apiFail("Invalid role", 400, "validation");
    }

    const role = parsed.data.role as UserRole;
    const supabase = createServiceSupabase();

    const { data: existing, error: findErr } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (findErr || !existing) {
      return apiFail("User not found", 404);
    }

    const previousRole = existing.role as UserRole;

    const { data: updated, error } = await supabase
      .from("profiles")
      .update({ role })
      .eq("id", id)
      .select("*")
      .single();

    if (error) return apiFail(error.message, 500);

    // One role at a time keep side tables in sync
    if (role === "motorist") {
      await supabase.from("repair_pro_profiles").delete().eq("user_id", id);
      await supabase
        .from("motorist_profiles")
        .upsert({ user_id: id }, { onConflict: "user_id" });
    } else if (role === "repair_pro") {
      await supabase.from("motorist_profiles").delete().eq("user_id", id);
      await supabase
        .from("repair_pro_profiles")
        .upsert({ user_id: id, status: "pending" }, { onConflict: "user_id" });
    } else if (role === "admin") {
      await supabase.from("motorist_profiles").delete().eq("user_id", id);
      await supabase.from("repair_pro_profiles").delete().eq("user_id", id);
    }

    await logAdminAction(session.userId, "assign_role", id, {
      previousRole,
      role,
    });

    return apiOk({ user: updated, previousRole, role });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return apiFail(e.message, e.status, "auth");
    }
    console.error(e);
    return apiFail("Failed to assign role", 500);
  }
}
