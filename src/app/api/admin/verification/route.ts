import { z } from "zod";
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

/** Identity + certification document verification overview */
export async function GET() {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Supabase is not configured", 503);
  }
  try {
    await requireAdmin();
    const supabase = createServiceSupabase();

    const [prosRes, motRes] = await Promise.all([
      supabase
        .from("repair_pro_profiles")
        .select(
          "user_id, business_name, status, verified, nin_verified, bvn_verified, nin_last4, bvn_last4, primary_service, docs_status, docs_rating_boost_applied, certification_file_name, certification_file_url, docs_submitted_at, docs_reviewed_at, rating_avg, rating_count"
        )
        .order("created_at", { ascending: false })
        .limit(300),
      supabase
        .from("motorist_profiles")
        .select(
          "user_id, vehicle_make, vehicle_model, nin_verified, bvn_verified, nin_last4, bvn_last4, identity_verified_at"
        )
        .order("created_at", { ascending: false })
        .limit(300),
    ]);

    if (prosRes.error) return apiFail(prosRes.error.message, 500);
    if (motRes.error) return apiFail(motRes.error.message, 500);

    const pros = prosRes.data ?? [];
    const mots = motRes.data ?? [];
    const userIds = [
      ...pros.map((p) => p.user_id),
      ...mots.map((m) => m.user_id),
    ];
    const profiles: Record<
      string,
      { full_name: string; email: string | null; role: string }
    > = {};
    if (userIds.length) {
      const { data: rows } = await supabase
        .from("profiles")
        .select("id, full_name, email, role")
        .in("id", userIds);
      for (const r of rows ?? []) {
        profiles[r.id] = {
          full_name: r.full_name,
          email: r.email,
          role: r.role,
        };
      }
    }

    const proRows = pros.map((p) => ({
      kind: "repair_pro" as const,
      user_id: p.user_id,
      full_name: profiles[p.user_id]?.full_name ?? "—",
      email: profiles[p.user_id]?.email ?? null,
      label: p.business_name || p.primary_service,
      status: p.status,
      verified: p.verified,
      nin_verified: p.nin_verified,
      bvn_verified: p.bvn_verified,
      nin_last4: p.nin_last4,
      bvn_last4: p.bvn_last4,
      docs_status: p.docs_status ?? "approved",
      docs_rating_boost_applied: Boolean(p.docs_rating_boost_applied),
      certification_file_name: p.certification_file_name ?? null,
      certification_file_url: p.certification_file_url ?? null,
      docs_submitted_at: p.docs_submitted_at ?? null,
      rating_avg: Number(p.rating_avg) || 0,
      rating_count: p.rating_count ?? 0,
    }));

    const motRows = mots.map((m) => ({
      kind: "motorist" as const,
      user_id: m.user_id,
      full_name: profiles[m.user_id]?.full_name ?? "—",
      email: profiles[m.user_id]?.email ?? null,
      label:
        [m.vehicle_make, m.vehicle_model].filter(Boolean).join(" ") ||
        "Customer",
      status: "—",
      verified: Boolean(m.nin_verified && m.bvn_verified),
      nin_verified: m.nin_verified,
      bvn_verified: m.bvn_verified,
      nin_last4: m.nin_last4,
      bvn_last4: m.bvn_last4,
      docs_status: null as string | null,
      docs_rating_boost_applied: false,
      certification_file_name: null as string | null,
      certification_file_url: null as string | null,
      docs_submitted_at: null as string | null,
      rating_avg: null as number | null,
      rating_count: null as number | null,
    }));

    const rows = [...proRows, ...motRows];

    const docsPending = proRows.filter(
      (r) => r.docs_status === "under_review"
    ).length;

    const totals = {
      total: rows.length,
      motorists: motRows.length,
      pros: proRows.length,
      fullyVerified: rows.filter((r) => r.nin_verified && r.bvn_verified)
        .length,
      partial: rows.filter(
        (r) =>
          (r.nin_verified || r.bvn_verified) &&
          !(r.nin_verified && r.bvn_verified)
      ).length,
      unverified: rows.filter((r) => !r.nin_verified && !r.bvn_verified)
        .length,
      docsPending,
    };

    return apiOk({ rows, totals });
  } catch (e) {
    if (e instanceof AdminAuthError)
      return apiFail(e.message, e.status, "auth");
    return apiFail("Failed to load verification", 500);
  }
}

const patchSchema = z.object({
  userId: z.string().uuid(),
  /** approve | reject certification documents */
  docsAction: z.enum(["approve", "reject"]),
});

/**
 * Approve or reject a Repair Pro's certification documents.
 * On approve: docs_status=approved, one-time +1 to rating_avg (capped at 5).
 */
export async function PATCH(req: Request) {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Supabase is not configured", 503);
  }
  try {
    const { session } = await requireAdmin();
    const body = await req.json().catch(() => null);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return apiFail("userId and docsAction (approve|reject) required", 400);
    }

    const { userId, docsAction } = parsed.data;
    const supabase = createServiceSupabase();

    const { data: pro, error: fetchErr } = await supabase
      .from("repair_pro_profiles")
      .select(
        "user_id, docs_status, docs_rating_boost_applied, rating_avg, rating_count"
      )
      .eq("user_id", userId)
      .maybeSingle();

    if (fetchErr) return apiFail(fetchErr.message, 500);
    if (!pro) return apiFail("Repair Pro not found", 404);

    if (docsAction === "reject") {
      const { data, error } = await supabase
        .from("repair_pro_profiles")
        .update({
          docs_status: "rejected",
          docs_reviewed_at: new Date().toISOString(),
          docs_reviewed_by: session.userId,
        })
        .eq("user_id", userId)
        .select(
          "user_id, docs_status, docs_rating_boost_applied, rating_avg"
        )
        .single();
      if (error) return apiFail(error.message, 500);
      await logAdminAction(session.userId, "docs_reject", userId, {
        previous: pro.docs_status,
      });
      return apiOk({ pro: data, ratingBoostApplied: false });
    }

    // Approve
    const alreadyBoosted = Boolean(pro.docs_rating_boost_applied);
    const currentAvg = Number(pro.rating_avg) || 0;
    // One-time +1 star on first document approval, never exceed 5.0
    const nextAvg = alreadyBoosted
      ? currentAvg
      : Math.min(5, Math.round((currentAvg + 1) * 100) / 100);

    const { data, error } = await supabase
      .from("repair_pro_profiles")
      .update({
        docs_status: "approved",
        docs_rating_boost_applied: true,
        rating_avg: nextAvg,
        docs_reviewed_at: new Date().toISOString(),
        docs_reviewed_by: session.userId,
      })
      .eq("user_id", userId)
      .select(
        "user_id, docs_status, docs_rating_boost_applied, rating_avg, rating_count"
      )
      .single();

    if (error) return apiFail(error.message, 500);

    await logAdminAction(session.userId, "docs_approve", userId, {
      previous: pro.docs_status,
      previousRating: currentAvg,
      newRating: nextAvg,
      boostApplied: !alreadyBoosted,
    });

    return apiOk({
      pro: data,
      ratingBoostApplied: !alreadyBoosted,
      previousRating: currentAvg,
      newRating: nextAvg,
    });
  } catch (e) {
    if (e instanceof AdminAuthError)
      return apiFail(e.message, e.status, "auth");
    return apiFail("Failed to update document status", 500);
  }
}
