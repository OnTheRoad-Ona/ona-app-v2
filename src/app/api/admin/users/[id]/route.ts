import {
  AdminAuthError,
  logAdminAction,
  requireAdmin,
} from "@/lib/server/admin-auth";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { createServiceSupabase } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { identityStatus } from "@/lib/server/identity/identity-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Full person detail: profile + role tables + identity sync + history. */
export async function GET(
  _req: Request,
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
    await requireAdmin();
    const { id } = await ctx.params;
    const supabase = createServiceSupabase();

    const { data: profile, error } = await supabase
      .from("profiles")
      .select(
        "id, role, full_name, phone, email, city, area, is_active, avatar_url, created_at, updated_at",
      )
      .eq("id", id)
      .maybeSingle();

    if (error) return apiFail(error.message, 500);
    if (!profile) return apiFail("User not found", 404);

    const [motRes, proRes, jobs, bookings, payments, reviews, identity] =
      await Promise.all([
        supabase
          .from("motorist_profiles")
          .select("*")
          .eq("user_id", id)
          .maybeSingle(),
        supabase
          .from("repair_pro_profiles")
          .select("*")
          .eq("user_id", id)
          .maybeSingle(),
        supabase
          .from("service_requests")
          .select(
            "id, service_type, status, description, pickup_address, created_at, completed_at, motorist_id, repair_pro_id",
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
            "id, amount_kobo, status, currency, provider, created_at, paid_at, motorist_id, repair_pro_id",
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
        identityStatus(supabase, id),
      ]);

    return apiOk({
      user: {
        ...profile,
        motorist_profiles: motRes.data ?? null,
        repair_pro_profiles: proRes.data ?? null,
      },
      identity,
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

// Keep PATCH if it existed - check original file for more methods
