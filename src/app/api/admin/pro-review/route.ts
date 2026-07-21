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

/**
 * Repair Pro multi-level review from DB:
 * T1 phone · T2 ID/BVN (+ images) · T3 liveness · T4 skill docs · visibility
 */
export async function GET(req: Request) {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Supabase is not configured", 503);
  }
  try {
    await requireAdmin();
    const url = new URL(req.url);
    const filter = url.searchParams.get("filter") || "needs_action";

    const supabase = createServiceSupabase();
    const { data: pros, error } = await supabase
      .from("repair_pro_profiles")
      .select(
        "user_id, business_name, status, verified, nin_verified, bvn_verified, nin_last4, bvn_last4, nin_encrypted, bvn_encrypted, primary_service, services, docs_status, docs_rating_boost_applied, certification_file_name, certification_file_url, docs_submitted_at, docs_reviewed_at, rating_avg, rating_count, visibility_tier, is_new_artisan, pipeline_status, pipeline_notes, submitted_at, approved_at, rejected_at, rejection_reason, guarantor, tools, portfolio, liveness_passed_at, skill_proof, gov_id_meta, gov_id_kind, gov_id_number, gov_id_front_url, gov_id_back_url, gov_id_review_status, gov_id_submitted_at, gov_id_reviewed_at, phone_verified, phone_verified_at, face_liveness_verified, face_liveness_at, face_liveness_selfie_url, bio, years_experience, service_radius_km, review_checklist, created_at, updated_at"
      )
      .order("created_at", { ascending: false })
      .limit(400);

    if (error) {
      // Fallback slim select
      const slim = await supabase
        .from("repair_pro_profiles")
        .select(
          "user_id, business_name, status, verified, nin_verified, bvn_verified, nin_last4, bvn_last4, primary_service, docs_status, certification_file_name, certification_file_url, docs_submitted_at, rating_avg, rating_count, visibility_tier, is_new_artisan, face_liveness_verified, face_liveness_at, created_at"
        )
        .order("created_at", { ascending: false })
        .limit(400);
      if (slim.error) return apiFail(slim.error.message, 500);
      return buildProList(supabase, slim.data ?? [], filter, true);
    }

    return buildProList(supabase, pros ?? [], filter, false);
  } catch (e) {
    if (e instanceof AdminAuthError)
      return apiFail(e.message, e.status, "auth");
    return apiFail("Failed to load pro review queue", 500);
  }
}

async function buildProList(
  supabase: ReturnType<typeof createServiceSupabase>,
  pros: Record<string, unknown>[],
  filter: string,
  legacy: boolean
) {
  const userIds = pros.map((p) => String(p.user_id));
  const profiles: Record<
    string,
    {
      full_name: string;
      email: string | null;
      phone: string | null;
      city: string | null;
      created_at: string;
    }
  > = {};
  if (userIds.length) {
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, email, phone, city, created_at")
      .in("id", userIds);
    for (const p of data ?? []) {
      profiles[p.id] = {
        full_name: p.full_name,
        email: p.email,
        phone: p.phone ?? null,
        city: p.city ?? null,
        created_at: p.created_at,
      };
    }
  }

  const rows = pros.map((pr) => {
    const uid = String(pr.user_id);
    const p = profiles[uid];
    const meta =
      pr.gov_id_meta && typeof pr.gov_id_meta === "object"
        ? (pr.gov_id_meta as Record<string, unknown>)
        : {};
    const t2Ok = Boolean(pr.nin_verified && pr.bvn_verified) ||
      pr.gov_id_review_status === "approved" ||
      Boolean(pr.verified);
    const hasId = Boolean(
      pr.nin_last4 ||
        pr.bvn_last4 ||
        pr.gov_id_number ||
        pr.gov_id_front_url ||
        pr.nin_encrypted
    );
    const t2Pending =
      !t2Ok &&
      (pr.gov_id_review_status === "submitted" || hasId);
    const docs = String(pr.docs_status || "none");
    const t4Pending = docs === "under_review";
    const t3Ok = Boolean(pr.face_liveness_verified || pr.liveness_passed_at);
    const vis = Number(pr.visibility_tier) || 1;
    const needs_action = t2Pending || t4Pending;

    return {
      user_id: uid,
      full_name: p?.full_name ?? "—",
      email: p?.email ?? null,
      phone: p?.phone ?? null,
      city: p?.city ?? null,
      registered_at: p?.created_at ?? null,
      business_name: pr.business_name ?? null,
      primary_service: pr.primary_service ?? null,
      services: pr.services ?? [],
      status: pr.status ?? "pending",
      pipeline_status: pr.pipeline_status ?? null,
      bio: pr.bio ?? null,
      years_experience: pr.years_experience ?? null,
      service_radius_km: pr.service_radius_km ?? null,
      guarantor: pr.guarantor ?? null,
      tools: pr.tools ?? null,
      portfolio: pr.portfolio ?? null,
      levels: {
        t1_phone: {
          label: "Tier 1 · Phone",
          status: pr.phone_verified ? "verified" : "auto",
          verified: Boolean(pr.phone_verified),
          verified_at: pr.phone_verified_at ?? null,
          phone: p?.phone ?? null,
        },
        t2_id: {
          label: "Tier 2 · Government ID / NIN / BVN",
          status: t2Ok ? "approved" : t2Pending ? "pending" : "none",
          gov_id_kind: pr.gov_id_kind ?? meta.govIdKind ?? null,
          gov_id_number:
            pr.gov_id_number || pr.nin_encrypted || meta.primaryId || null,
          gov_id_last4: pr.nin_last4 ?? null,
          bank_id_number: pr.bvn_encrypted || null,
          bank_id_last4: pr.bvn_last4 ?? null,
          front_url: pr.gov_id_front_url ?? null,
          back_url: pr.gov_id_back_url ?? null,
          nin_verified: Boolean(pr.nin_verified),
          bvn_verified: Boolean(pr.bvn_verified),
          review_status: pr.gov_id_review_status ?? (t2Ok ? "approved" : t2Pending ? "submitted" : "none"),
          submitted_at: pr.gov_id_submitted_at ?? pr.submitted_at ?? null,
        },
        t3_liveness: {
          label: "Tier 3 · Face liveness",
          status: t3Ok ? "passed" : "pending",
          verified: t3Ok,
          verified_at: pr.face_liveness_at || pr.liveness_passed_at || null,
          selfie_url: pr.face_liveness_selfie_url ?? null,
          auto: true,
        },
        t4_docs: {
          label: "Tier 4 · Skill documents",
          status:
            docs === "approved"
              ? "approved"
              : docs === "under_review"
                ? "pending"
                : docs === "rejected"
                  ? "rejected"
                  : "none",
          docs_status: docs,
          file_name: pr.certification_file_name ?? null,
          file_url: pr.certification_file_url ?? null,
          skill_proof: pr.skill_proof ?? null,
          submitted_at: pr.docs_submitted_at ?? null,
          reviewed_at: pr.docs_reviewed_at ?? null,
          rating_boost: Boolean(pr.docs_rating_boost_applied),
        },
        visibility: {
          label: "Visibility ladder",
          tier: vis as 1 | 2 | 3 | 4,
          is_new_artisan: Boolean(pr.is_new_artisan),
          rating_avg: Number(pr.rating_avg) || 0,
          rating_count: Number(pr.rating_count) || 0,
        },
      },
      rejection_reason: pr.rejection_reason ?? null,
      needs_action,
      created_at: pr.created_at,
      updated_at: pr.updated_at,
    };
  });

  const filtered =
    filter === "all"
      ? rows
      : filter === "needs_action"
        ? rows.filter((r) => r.needs_action)
        : filter === "t2_pending"
          ? rows.filter((r) => r.levels.t2_id.status === "pending")
          : filter === "t4_pending"
            ? rows.filter((r) => r.levels.t4_docs.status === "pending")
            : rows;

  return apiOk({
    pros: filtered,
    totals: {
      total: rows.length,
      needs_action: rows.filter((r) => r.needs_action).length,
      t2_pending: rows.filter((r) => r.levels.t2_id.status === "pending")
        .length,
      t4_pending: rows.filter((r) => r.levels.t4_docs.status === "pending")
        .length,
    },
    filter,
    legacy,
  });
}

const patchSchema = z.object({
  userId: z.string().uuid(),
  action: z.enum([
    "pro_t2_approve",
    "pro_t2_reject",
    "pro_t4_approve",
    "pro_t4_reject",
    "pro_visibility",
  ]),
  visibilityTier: z.union([z.literal(2), z.literal(3), z.literal(4)]).optional(),
  reason: z.string().max(500).optional(),
});

export async function PATCH(req: Request) {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Supabase is not configured", 503);
  }
  try {
    const { session } = await requireAdmin();
    const parsed = patchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return apiFail("Invalid body", 400);
    const { userId, action, visibilityTier, reason } = parsed.data;
    const supabase = createServiceSupabase();
    const now = new Date().toISOString();

    if (action === "pro_t2_approve") {
      const { error } = await supabase
        .from("repair_pro_profiles")
        .update({
          nin_verified: true,
          bvn_verified: true,
          verified: true,
          gov_id_review_status: "approved",
          gov_id_reviewed_at: now,
          visibility_tier: 2,
          is_new_artisan: true,
          pipeline_status: "pending_document_review",
        })
        .eq("user_id", userId);
      if (error) {
        const { error: e2 } = await supabase
          .from("repair_pro_profiles")
          .update({
            nin_verified: true,
            bvn_verified: true,
            verified: true,
            visibility_tier: 2,
            is_new_artisan: true,
          })
          .eq("user_id", userId);
        if (e2) return apiFail(e2.message, 500);
      }
      await logAdminAction(session.userId, "pro_t2_approve", userId, {});
      return apiOk({ message: "Pro Tier 2 ID approved · visibility T2." });
    }

    if (action === "pro_t2_reject") {
      const { error } = await supabase
        .from("repair_pro_profiles")
        .update({
          nin_verified: false,
          bvn_verified: false,
          verified: false,
          gov_id_review_status: "rejected",
          gov_id_reviewed_at: now,
          rejection_reason: reason || "ID rejected",
        })
        .eq("user_id", userId);
      if (error) return apiFail(error.message, 500);
      await logAdminAction(session.userId, "pro_t2_reject", userId, { reason });
      return apiOk({ message: "Pro Tier 2 rejected." });
    }

    if (action === "pro_t4_approve" || action === "pro_t4_reject") {
      const approve = action === "pro_t4_approve";
      const { data: pro } = await supabase
        .from("repair_pro_profiles")
        .select(
          "docs_rating_boost_applied, rating_avg, visibility_tier"
        )
        .eq("user_id", userId)
        .maybeSingle();
      if (!pro) return apiFail("Pro not found", 404);
      if (!approve) {
        const { error } = await supabase
          .from("repair_pro_profiles")
          .update({
            docs_status: "rejected",
            docs_reviewed_at: now,
            docs_reviewed_by: session.userId,
          })
          .eq("user_id", userId);
        if (error) return apiFail(error.message, 500);
        await logAdminAction(session.userId, "pro_t4_reject", userId, {});
        return apiOk({ message: "Skill docs rejected." });
      }
      const boosted = Boolean(pro.docs_rating_boost_applied);
      const avg = Number(pro.rating_avg) || 0;
      const nextAvg = boosted ? avg : Math.min(5, Math.round((avg + 1) * 100) / 100);
      const vis = Number(pro.visibility_tier) || 1;
      const { error } = await supabase
        .from("repair_pro_profiles")
        .update({
          docs_status: "approved",
          docs_rating_boost_applied: true,
          rating_avg: nextAvg,
          docs_reviewed_at: now,
          docs_reviewed_by: session.userId,
          visibility_tier: vis >= 2 ? 4 : vis,
        })
        .eq("user_id", userId);
      if (error) return apiFail(error.message, 500);
      await logAdminAction(session.userId, "pro_t4_approve", userId, {});
      return apiOk({ message: "Skill docs (T4) approved." });
    }

    if (action === "pro_visibility") {
      if (!visibilityTier)
        return apiFail("visibilityTier 2|3|4 required", 400);
      const { error } = await supabase
        .from("repair_pro_profiles")
        .update({
          visibility_tier: visibilityTier,
          is_new_artisan: visibilityTier <= 2,
          status: "approved",
        })
        .eq("user_id", userId);
      if (error) return apiFail(error.message, 500);
      await logAdminAction(session.userId, "pro_visibility", userId, {
        tier: visibilityTier,
      });
      return apiOk({ message: `Visibility set to Tier ${visibilityTier}.` });
    }

    return apiFail("Unknown action", 400);
  } catch (e) {
    if (e instanceof AdminAuthError)
      return apiFail(e.message, e.status, "auth");
    return apiFail("Pro review failed", 500);
  }
}
