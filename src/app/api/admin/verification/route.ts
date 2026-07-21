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
 * Unified verification hub data.
 *
 * Customers: T1 phone (automatic) · T2 government ID (manual)
 * Repair Pros: T1 phone auto · T2 ID/BVN manual · T3 liveness auto · T4 skill docs manual
 *              + visibility ladder (T2/T3/T4 promote)
 */
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
          "user_id, business_name, status, verified, nin_verified, bvn_verified, nin_last4, bvn_last4, primary_service, docs_status, docs_rating_boost_applied, certification_file_name, certification_file_url, docs_submitted_at, docs_reviewed_at, rating_avg, rating_count, visibility_tier, is_new_artisan, created_at"
        )
        .order("created_at", { ascending: false })
        .limit(400),
      supabase
        .from("motorist_profiles")
        .select(
          "user_id, vehicle_make, vehicle_model, nin_verified, bvn_verified, nin_last4, bvn_last4, identity_verified_at, created_at"
        )
        .order("created_at", { ascending: false })
        .limit(400),
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
      { full_name: string; email: string | null; phone: string | null }
    > = {};
    if (userIds.length) {
      const { data: rows } = await supabase
        .from("profiles")
        .select("id, full_name, email, phone")
        .in("id", userIds);
      for (const r of rows ?? []) {
        profiles[r.id] = {
          full_name: r.full_name,
          email: r.email,
          phone: r.phone ?? null,
        };
      }
    }

    const customers = mots.map((m) => {
      const p = profiles[m.user_id];
      const t2Approved = Boolean(
        m.identity_verified_at || (m.nin_verified && m.bvn_verified)
      );
      const hasIdSubmission = Boolean(
        m.nin_last4 || m.bvn_last4 || m.identity_verified_at
      );
      // Pending = has ID on file but not fully approved
      const t2Pending = hasIdSubmission && !t2Approved;
      return {
        kind: "customer" as const,
        user_id: m.user_id,
        full_name: p?.full_name ?? "—",
        email: p?.email ?? null,
        phone: p?.phone ?? null,
        label:
          [m.vehicle_make, m.vehicle_model].filter(Boolean).join(" ") ||
          "Customer",
        /** T1 phone — automatic (client OTP); shown for context */
        t1_phone: "auto" as const,
        t1_label: "Phone (automatic)",
        /** T2 ID — manual */
        t2_status: t2Approved
          ? ("approved" as const)
          : t2Pending
            ? ("pending" as const)
            : ("none" as const),
        t2_label: t2Approved
          ? "ID approved"
          : t2Pending
            ? "ID pending review"
            : "No ID submitted",
        nin_last4: m.nin_last4,
        bvn_last4: m.bvn_last4,
        nin_verified: Boolean(m.nin_verified),
        bvn_verified: Boolean(m.bvn_verified),
        identity_verified_at: m.identity_verified_at,
        needs_action: t2Pending,
      };
    });

    const repairPros = pros.map((pr) => {
      const p = profiles[pr.user_id];
      const t2Ok = Boolean(pr.nin_verified && pr.bvn_verified);
      const hasIdBits = Boolean(pr.nin_last4 || pr.bvn_last4 || pr.verified);
      const t2Pending = hasIdBits && !t2Ok;
      const docs = pr.docs_status || "none";
      const t4Pending = docs === "under_review";
      const t4Ok = docs === "approved";
      const vis = Number(pr.visibility_tier) || 1;

      return {
        kind: "repair_pro" as const,
        user_id: pr.user_id,
        full_name: p?.full_name ?? "—",
        email: p?.email ?? null,
        phone: p?.phone ?? null,
        label: pr.business_name || pr.primary_service || "Repair Pro",
        status: pr.status,
        /** T1 phone OTP — automatic */
        t1_status: "auto" as const,
        t1_label: "Phone (automatic)",
        /** T2 Gov ID + BVN — manual */
        t2_status: t2Ok
          ? ("approved" as const)
          : t2Pending
            ? ("pending" as const)
            : ("none" as const),
        t2_label: t2Ok
          ? "ID + BVN approved"
          : t2Pending
            ? "ID / BVN pending"
            : "No ID submitted",
        nin_last4: pr.nin_last4,
        bvn_last4: pr.bvn_last4,
        nin_verified: Boolean(pr.nin_verified),
        bvn_verified: Boolean(pr.bvn_verified),
        /** T3 liveness — automatic */
        t3_status: "auto" as const,
        t3_label: "Liveness (automatic)",
        /** T4 skill proof — manual */
        t4_status: t4Ok
          ? ("approved" as const)
          : t4Pending
            ? ("pending" as const)
            : docs === "rejected"
              ? ("rejected" as const)
              : ("none" as const),
        t4_label:
          docs === "under_review"
            ? "Skill docs under review"
            : docs === "approved"
              ? "Skill docs approved"
              : docs === "rejected"
                ? "Skill docs rejected"
                : "No skill docs",
        docs_status: docs,
        certification_file_name: pr.certification_file_name ?? null,
        certification_file_url: pr.certification_file_url ?? null,
        docs_rating_boost_applied: Boolean(pr.docs_rating_boost_applied),
        rating_avg: Number(pr.rating_avg) || 0,
        rating_count: pr.rating_count ?? 0,
        visibility_tier: vis as 1 | 2 | 3 | 4,
        is_new_artisan: Boolean(pr.is_new_artisan),
        needs_action: t2Pending || t4Pending,
      };
    });

    const totals = {
      customers: customers.length,
      customerT2Pending: customers.filter((c) => c.t2_status === "pending")
        .length,
      customerT2Approved: customers.filter((c) => c.t2_status === "approved")
        .length,
      pros: repairPros.length,
      proT2Pending: repairPros.filter((p) => p.t2_status === "pending").length,
      proT4Pending: repairPros.filter((p) => p.t4_status === "pending").length,
      proNeedsAction: repairPros.filter((p) => p.needs_action).length,
    };

    return apiOk({ customers, repairPros, totals });
  } catch (e) {
    if (e instanceof AdminAuthError)
      return apiFail(e.message, e.status, "auth");
    return apiFail("Failed to load verification", 500);
  }
}

const patchSchema = z.object({
  userId: z.string().uuid(),
  /** Who is being reviewed */
  subject: z.enum(["customer", "repair_pro"]),
  /**
   * customer_t2 — approve/reject government ID (unlimited requests)
   * pro_t2 — approve/reject ID + BVN (enables visibility ladder start)
   * pro_t4 — approve/reject skill/cert docs (+1 star once)
   * pro_visibility — set visibility tier 2|3|4
   */
  action: z.enum([
    "customer_t2_approve",
    "customer_t2_reject",
    "pro_t2_approve",
    "pro_t2_reject",
    "pro_t4_approve",
    "pro_t4_reject",
    "pro_visibility",
  ]),
  visibilityTier: z.union([z.literal(2), z.literal(3), z.literal(4)]).optional(),
});

export async function PATCH(req: Request) {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Supabase is not configured", 503);
  }
  try {
    const { session } = await requireAdmin();
    const body = await req.json().catch(() => null);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return apiFail("Invalid verification action body", 400);
    }

    const { userId, subject, action, visibilityTier } = parsed.data;
    const supabase = createServiceSupabase();
    const now = new Date().toISOString();

    // ── Customer T2 ─────────────────────────────────────────────
    if (subject === "customer") {
      if (action === "customer_t2_approve") {
        const { error } = await supabase
          .from("motorist_profiles")
          .update({
            nin_verified: true,
            bvn_verified: true,
            identity_verified_at: now,
          })
          .eq("user_id", userId);
        if (error) return apiFail(error.message, 500);
        await logAdminAction(session.userId, "customer_t2_approve", userId, {});
        return apiOk({
          subject,
          action,
          message: "Customer Tier 2 approved — unlimited requests unlocked.",
        });
      }
      if (action === "customer_t2_reject") {
        const { error } = await supabase
          .from("motorist_profiles")
          .update({
            nin_verified: false,
            bvn_verified: false,
            identity_verified_at: null,
          })
          .eq("user_id", userId);
        if (error) return apiFail(error.message, 500);
        await logAdminAction(session.userId, "customer_t2_reject", userId, {});
        return apiOk({
          subject,
          action,
          message: "Customer Tier 2 rejected — ask them to re-upload ID.",
        });
      }
      return apiFail("Invalid customer action", 400);
    }

    // ── Repair Pro ──────────────────────────────────────────────
    if (action === "pro_t2_approve") {
      const { error } = await supabase
        .from("repair_pro_profiles")
        .update({
          nin_verified: true,
          bvn_verified: true,
          verified: true,
          // Start visibility ladder at Tier 2 if still at 1
          visibility_tier: 2,
          is_new_artisan: true,
        })
        .eq("user_id", userId);
      if (error) return apiFail(error.message, 500);
      await logAdminAction(session.userId, "pro_t2_approve", userId, {});
      return apiOk({
        subject,
        action,
        message: "Pro Tier 2 (ID + BVN) approved · visibility Tier 2.",
      });
    }

    if (action === "pro_t2_reject") {
      const { error } = await supabase
        .from("repair_pro_profiles")
        .update({
          nin_verified: false,
          bvn_verified: false,
          verified: false,
        })
        .eq("user_id", userId);
      if (error) return apiFail(error.message, 500);
      await logAdminAction(session.userId, "pro_t2_reject", userId, {});
      return apiOk({
        subject,
        action,
        message: "Pro Tier 2 rejected.",
      });
    }

    if (action === "pro_t4_approve" || action === "pro_t4_reject") {
      const approve = action === "pro_t4_approve";
      const { data: pro, error: fetchErr } = await supabase
        .from("repair_pro_profiles")
        .select(
          "user_id, docs_status, docs_rating_boost_applied, rating_avg, rating_count, visibility_tier"
        )
        .eq("user_id", userId)
        .maybeSingle();
      if (fetchErr) return apiFail(fetchErr.message, 500);
      if (!pro) return apiFail("Repair Pro not found", 404);

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
        return apiOk({
          subject,
          action,
          message: "Skill docs rejected.",
        });
      }

      const alreadyBoosted = Boolean(pro.docs_rating_boost_applied);
      const currentAvg = Number(pro.rating_avg) || 0;
      const nextAvg = alreadyBoosted
        ? currentAvg
        : Math.min(5, Math.round((currentAvg + 1) * 100) / 100);
      const vis = Number(pro.visibility_tier) || 1;

      const { error } = await supabase
        .from("repair_pro_profiles")
        .update({
          docs_status: "approved",
          docs_rating_boost_applied: true,
          rating_avg: nextAvg,
          docs_reviewed_at: now,
          docs_reviewed_by: session.userId,
          // Approving T4 skill also lifts visibility to 4 when already ≥2
          visibility_tier: vis >= 2 ? 4 : vis,
          is_new_artisan: vis >= 3 ? false : vis <= 2,
        })
        .eq("user_id", userId);
      if (error) return apiFail(error.message, 500);
      await logAdminAction(session.userId, "pro_t4_approve", userId, {
        ratingBoost: !alreadyBoosted,
      });
      return apiOk({
        subject,
        action,
        message: alreadyBoosted
          ? "Skill docs approved."
          : `Skill docs approved (+1 star → ${nextAvg.toFixed(1)}).`,
        ratingBoostApplied: !alreadyBoosted,
        newRating: nextAvg,
      });
    }

    if (action === "pro_visibility") {
      if (!visibilityTier) {
        return apiFail("visibilityTier 2|3|4 required", 400);
      }
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
      return apiOk({
        subject,
        action,
        message: `Visibility set to Tier ${visibilityTier}.`,
      });
    }

    return apiFail("Unknown action", 400);
  } catch (e) {
    if (e instanceof AdminAuthError)
      return apiFail(e.message, e.status, "auth");
    return apiFail("Verification action failed", 500);
  }
}
