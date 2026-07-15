import {
  AdminAuthError,
  logAdminAction,
  requireAdmin,
} from "@/lib/server/admin-auth";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { createServiceSupabase } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Full person detail: profile + role tables + jobs/bookings history */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Supabase is not configured", 503, "supabase_not_configured");
  }
  try {
    await requireAdmin();
    const { id } = await ctx.params;
    const supabase = createServiceSupabase();

    const { data: profile, error } = await supabase
      .from("profiles")
      .select(
        "id, role, full_name, phone, email, city, area, is_active, avatar_url, created_at, updated_at, motorist_profiles(*), repair_pro_profiles(*)"
      )
      .eq("id", id)
      .maybeSingle();

    if (error) return apiFail(error.message, 500);
    if (!profile) return apiFail("User not found", 404);

    const [jobs, bookings, payments, reviews] = await Promise.all([
      supabase
        .from("service_requests")
        .select(
          "id, service_type, status, description, pickup_address, created_at, completed_at, motorist_id, repair_pro_id"
        )
        .or(`motorist_id.eq.${id},repair_pro_id.eq.${id}`)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("bookings")
        .select("*")
        .or(`motorist_id.eq.${id},repair_pro_id.eq.${id}`)
        .order("created_at", { ascending: false })
        .limit(30),
      supabase
        .from("payments")
        .select(
          "id, amount_kobo, status, currency, provider, created_at, paid_at, motorist_id, repair_pro_id"
        )
        .or(`motorist_id.eq.${id},repair_pro_id.eq.${id}`)
        .order("created_at", { ascending: false })
        .limit(30),
      supabase
        .from("reviews")
        .select("*")
        .or(`motorist_id.eq.${id},repair_pro_id.eq.${id}`)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    return apiOk({
      user: profile,
      jobs: jobs.data ?? [],
      bookings: bookings.data ?? [],
      payments: payments.data ?? [],
      reviews: reviews.data ?? [],
    });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return apiFail(e.message, e.status, "auth");
    }
    return apiFail("Failed to load user", 500);
  }
}

/** Hard-delete person from Auth + cascaded public tables */
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Supabase is not configured", 503, "supabase_not_configured");
  }
  try {
    const { session } = await requireAdmin();
    const { id } = await ctx.params;

    if (id === session.userId) {
      return apiFail("You cannot delete your own admin account", 400);
    }

    const supabase = createServiceSupabase();

    const { data: existing } = await supabase
      .from("profiles")
      .select("id, role, full_name, email")
      .eq("id", id)
      .maybeSingle();

    if (!existing) return apiFail("User not found", 404);

    // Clear / remove RESTRICT FKs so auth.users delete can cascade profiles
    await supabase.from("reviews").delete().eq("motorist_id", id);
    await supabase.from("reviews").delete().eq("repair_pro_id", id);
    await supabase.from("payments").delete().eq("motorist_id", id);
    await supabase
      .from("payments")
      .update({ repair_pro_id: null })
      .eq("repair_pro_id", id);
    await supabase.from("bookings").delete().eq("motorist_id", id);
    await supabase.from("bookings").delete().eq("repair_pro_id", id);
    await supabase.from("conversations").delete().eq("motorist_id", id);
    await supabase.from("conversations").delete().eq("repair_pro_id", id);
    await supabase.from("service_requests").delete().eq("motorist_id", id);
    await supabase
      .from("service_requests")
      .update({ repair_pro_id: null })
      .eq("repair_pro_id", id);
    await supabase
      .from("admin_actions")
      .update({ target_user_id: null })
      .eq("target_user_id", id);

    // Delete auth user — profiles + role tables cascade via FK
    const { error: authErr } = await supabase.auth.admin.deleteUser(id);
    if (authErr) {
      // Fallback: deactivate if hard delete still blocked
      await supabase
        .from("profiles")
        .update({ is_active: false })
        .eq("id", id);
      await logAdminAction(session.userId, "deactivate_user_delete_failed", id, {
        reason: authErr.message,
        email: existing.email,
        role: existing.role,
      });
      return apiFail(
        `Could not hard-delete (${authErr.message}). Account was deactivated instead.`,
        409,
        "delete_blocked"
      );
    }

    await logAdminAction(session.userId, "delete_user", id, {
      email: existing.email,
      role: existing.role,
      full_name: existing.full_name,
    });

    return apiOk({ deleted: true, id });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return apiFail(e.message, e.status, "auth");
    }
    console.error(e);
    return apiFail("Failed to delete user", 500);
  }
}
