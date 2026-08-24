import { z } from "zod";
import {
  AdminAuthError,
  logAdminAction,
  requireAdmin,
} from "@/lib/server/admin-auth";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { buildDualRoleMeta } from "@/lib/dual-role";
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
    // Default all registered pros so the queue is never empty when signups exist
    const filter = url.searchParams.get("filter") || "all";

    const supabase = createServiceSupabase();
    const { data: pros, error } = await supabase
      .from("repair_pro_profiles")
      .select(
        "user_id, business_name, status, verified, nin_verified, bvn_verified, nin_last4, bvn_last4, nin_encrypted, bvn_encrypted, primary_service, services, docs_status, docs_rating_boost_applied, certification_file_name, certification_file_url, docs_submitted_at, docs_reviewed_at, rating_avg, rating_count, visibility_tier, is_new_artisan, pipeline_status, pipeline_notes, submitted_at, approved_at, rejected_at, rejection_reason, guarantor, tools, portfolio, liveness_passed_at, skill_proof, gov_id_meta, gov_id_kind, gov_id_number, gov_id_front_url, gov_id_back_url, gov_id_review_status, gov_id_submitted_at, gov_id_reviewed_at, phone_verified, phone_verified_at, face_liveness_verified, face_liveness_at, face_liveness_selfie_url, bio, years_experience, service_radius_km, review_checklist, labour_prices, vehicle_focus, skills, cac_document_url, created_at, updated_at",
      )
      .order("created_at", { ascending: false })
      .limit(400);

    if (error) {
      // Fallback slim select
      const slim = await supabase
        .from("repair_pro_profiles")
        .select(
          "user_id, business_name, status, verified, nin_verified, bvn_verified, nin_last4, bvn_last4, primary_service, docs_status, certification_file_name, certification_file_url, docs_submitted_at, rating_avg, rating_count, visibility_tier, is_new_artisan, face_liveness_verified, face_liveness_at, created_at",
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
  legacy: boolean,
) {
  const userIds = pros.map((p) => String(p.user_id));
  const profiles: Record<
    string,
    {
      full_name: string;
      email: string | null;
      phone: string | null;
      city: string | null;
      area: string | null;
      avatar_url: string | null;
      created_at: string;
      role: string | null;
      primary_role: string | null;
      last_role_switch_at: string | null;
      role_switch_count: number;
    }
  > = {};
  const motoristIds = new Set<string>();
  if (userIds.length) {
    let rows: Record<string, unknown>[] = [];
    const full = await supabase
      .from("profiles")
      .select(
        "id, full_name, email, phone, city, area, avatar_url, created_at, role, primary_role, last_role_switch_at, role_switch_count",
      )
      .in("id", userIds);
    if (!full.error && full.data) {
      rows = full.data as Record<string, unknown>[];
    } else {
      const slim = await supabase
        .from("profiles")
        .select(
          "id, full_name, email, phone, city, area, avatar_url, created_at, role",
        )
        .in("id", userIds);
      rows = (slim.data ?? []) as Record<string, unknown>[];
    }
    const { data: mots } = await supabase
      .from("motorist_profiles")
      .select("user_id")
      .in("user_id", userIds);
    for (const p of rows) {
      const id = String(p.id);
      profiles[id] = {
        full_name: String(p.full_name || ""),
        email: (p.email as string) ?? null,
        phone: (p.phone as string) ?? null,
        city: (p.city as string) ?? null,
        area: (p.area as string) ?? null,
        avatar_url: (p.avatar_url as string) ?? null,
        created_at: String(p.created_at || ""),
        role: (p.role as string) || "repair_pro",
        primary_role: (p.primary_role as string) || null,
        last_role_switch_at: (p.last_role_switch_at as string) || null,
        role_switch_count: Number(p.role_switch_count || 0),
      };
    }
    for (const m of mots ?? []) motoristIds.add(String(m.user_id));
  }

  // Recent job media (evidence / live photos) not star reviews
  const jobMedia: Record<
    string,
    Array<{
      id: string;
      status: string;
      service_type: string | null;
      motorist_photo: string | null;
      repair_pro_photo: string | null;
      photos: unknown;
      evidence: unknown;
      created_at: string;
    }>
  > = {};
  if (userIds.length) {
    const { data: jobs } = await supabase
      .from("service_requests")
      .select(
        "id, repair_pro_id, status, service_type, motorist_photo, repair_pro_photo, photos, evidence, created_at",
      )
      .in("repair_pro_id", userIds)
      .order("created_at", { ascending: false })
      .limit(200);
    for (const j of jobs ?? []) {
      const pid = String(j.repair_pro_id);
      if (!jobMedia[pid]) jobMedia[pid] = [];
      if (jobMedia[pid].length >= 8) continue;
      jobMedia[pid].push({
        id: String(j.id),
        status: String(j.status),
        service_type: j.service_type ?? null,
        motorist_photo: j.motorist_photo ?? null,
        repair_pro_photo: j.repair_pro_photo ?? null,
        photos: j.photos ?? null,
        evidence: j.evidence ?? null,
        created_at: String(j.created_at),
      });
    }
  }

  const rows = pros.map((pr) => {
    const uid = String(pr.user_id);
    const p = profiles[uid];
    const meta =
      pr.gov_id_meta && typeof pr.gov_id_meta === "object"
        ? (pr.gov_id_meta as Record<string, unknown>)
        : {};
    const skills =
      pr.skills && typeof pr.skills === "object" && !Array.isArray(pr.skills)
        ? (pr.skills as Record<string, unknown>)
        : {};
    // Cert may live on dedicated columns or only as skillAnswers.certificationUpload
    const certFromSkills = skills.certificationUpload as
      | { name?: string; dataUrl?: string; url?: string; hasFile?: boolean }
      | undefined;
    const skillFileUrl =
      (pr.certification_file_url as string | null) ||
      (typeof certFromSkills?.dataUrl === "string" &&
      certFromSkills.dataUrl.length < 1_500_000
        ? certFromSkills.dataUrl
        : null) ||
      (typeof certFromSkills?.url === "string" ? certFromSkills.url : null) ||
      null;
    const skillFileName =
      (pr.certification_file_name as string | null) ||
      certFromSkills?.name ||
      null;
    const hasSkillFile = Boolean(
      skillFileUrl || skillFileName || certFromSkills?.hasFile,
    );

    const t2Ok =
      Boolean(pr.nin_verified && pr.bvn_verified) ||
      pr.gov_id_review_status === "approved" ||
      Boolean(pr.verified);
    const hasId = Boolean(
      pr.nin_last4 ||
      pr.bvn_last4 ||
      pr.gov_id_number ||
      pr.gov_id_front_url ||
      pr.nin_encrypted,
    );
    const hasIdMedia = Boolean(pr.gov_id_front_url || pr.gov_id_back_url);
    const t2Pending =
      !t2Ok && (pr.gov_id_review_status === "submitted" || hasId);
    // Submitted without photos → care must request re-upload
    const t2MissingMedia =
      t2Pending &&
      !hasIdMedia &&
      Boolean(pr.gov_id_review_status === "submitted" || hasId);
    const docs = String(pr.docs_status || "none");
    const t4Pending =
      docs === "under_review" ||
      (hasSkillFile && docs !== "approved" && docs !== "rejected");
    const t3Ok = Boolean(pr.face_liveness_verified || pr.liveness_passed_at);
    const vis = Number(pr.visibility_tier) || 1;
    const rejectReason = pr.rejection_reason ? String(pr.rejection_reason) : "";
    const needs_resubmit =
      /re-?\s*submit/i.test(rejectReason) ||
      String(pr.pipeline_status || "") === "needs_resubmit" ||
      /needs_resubmit|re-submit/i.test(String(pr.pipeline_notes || "")) ||
      t2MissingMedia;
    // B3: any open care item ID pending, docs pending, account pending, or re-submit flag
    const accountPending = String(pr.status || "") === "pending";
    const needs_action =
      t2Pending || t4Pending || needs_resubmit || accountPending;

    const dualMeta = buildDualRoleMeta({
      hasMotorist: motoristIds.has(uid),
      hasPro: true,
      currentDbRole: p?.role || "repair_pro",
      primaryDbRole: p?.primary_role || null,
      lastRoleSwitchAt: p?.last_role_switch_at || null,
      roleSwitchCount: p?.role_switch_count ?? 0,
      activeAccountType: p?.role === "motorist" ? "motorist" : "professional",
    });

    return {
      user_id: uid,
      full_name: p?.full_name ?? "",
      email: p?.email ?? null,
      phone: p?.phone ?? null,
      city: p?.city ?? null,
      area: p?.area ?? null,
      avatar_url: p?.avatar_url ?? null,
      registered_at: p?.created_at ?? null,
      dual_role: dualMeta.dualRole,
      has_switched: dualMeta.hasSwitched,
      first_role: dualMeta.firstRoleLabel,
      current_role: dualMeta.currentRoleLabel,
      last_role_switch_at: dualMeta.lastRoleSwitchAt,
      role_switch_count: dualMeta.roleSwitchCount,
      business_name: pr.business_name ?? null,
      primary_service: pr.primary_service ?? null,
      services: pr.services ?? [],
      status: pr.status ?? "pending",
      pipeline_status: pr.pipeline_status ?? null,
      needs_resubmit,
      bio: pr.bio ?? null,
      years_experience: pr.years_experience ?? null,
      service_radius_km: pr.service_radius_km ?? null,
      guarantor: pr.guarantor ?? null,
      tools: pr.tools ?? null,
      portfolio: pr.portfolio ?? null,
      labour_prices: pr.labour_prices ?? null,
      vehicle_focus: pr.vehicle_focus ?? null,
      skills: pr.skills ?? null,
      skill_proof: pr.skill_proof ?? null,
      cac_document_url: pr.cac_document_url ?? null,
      job_media: jobMedia[uid] ?? [],
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
          review_status:
            pr.gov_id_review_status ??
            (t2Ok ? "approved" : t2Pending ? "submitted" : "none"),
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
              : docs === "under_review" || (hasSkillFile && docs !== "rejected")
                ? "pending"
                : docs === "rejected"
                  ? "rejected"
                  : "none",
          docs_status: docs,
          file_name: skillFileName,
          file_url: skillFileUrl,
          skill_proof: pr.skill_proof ?? null,
          has_file: hasSkillFile,
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
      care_gaps: {
        missing_id_media: t2MissingMedia,
        missing_id_number: t2Pending && !hasId,
        missing_skill_doc: t4Pending && !hasSkillFile && !skillFileUrl,
        missing_liveness: !t3Ok,
      },
      specialty:
        typeof skills.specialty === "string"
          ? skills.specialty
          : typeof skills.specialties === "string"
            ? skills.specialties
            : Array.isArray(skills.specialties)
              ? (skills.specialties as string[]).join(", ")
              : null,
      created_at: pr.created_at,
      updated_at: pr.updated_at,
    };
  });

  // Entry sequence for unattended items (earliest open submission = #1)
  const openSorted = [...rows]
    .filter((r) => r.needs_action)
    .map((r) => {
      const t2 = r.levels.t2_id.submitted_at;
      const t4 = r.levels.t4_docs.submitted_at;
      const times = [t2, t4, r.created_at]
        .filter(Boolean)
        .map((x) => new Date(String(x)).getTime())
        .filter((n) => Number.isFinite(n));
      return {
        user_id: r.user_id,
        earliest: times.length ? Math.min(...times) : 0,
      };
    })
    .sort((a, b) => a.earliest - b.earliest);
  const sequence: Record<string, number> = {};
  openSorted.forEach((p, i) => {
    sequence[p.user_id] = i + 1;
  });

  const withSeq = rows.map((r) => ({
    ...r,
    queue_number: sequence[r.user_id] ?? null,
  }));

  const filtered =
    filter === "all"
      ? withSeq
      : filter === "needs_action"
        ? withSeq.filter((r) => r.needs_action)
        : filter === "resubmit"
          ? withSeq.filter((r) => r.needs_resubmit)
          : filter === "t2_pending"
            ? withSeq.filter((r) => r.levels.t2_id.status === "pending")
            : filter === "t4_pending"
              ? withSeq.filter((r) => r.levels.t4_docs.status === "pending")
              : withSeq;

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
    sequence,
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
    "pro_request_resubmit",
    /** Care opened the row mark read until a new re-submit */
    "mark_attended",
    /** Clear unapproved tier so pro can re-verify from the app */
    "pro_t2_reset",
    "pro_t3_reset",
    "pro_t4_reset",
    "pro_reset_unapproved",
  ]),
  visibilityTier: z
    .union([z.literal(2), z.literal(3), z.literal(4)])
    .optional(),
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

    if (action === "mark_attended") {
      const { data: row } = await supabase
        .from("repair_pro_profiles")
        .select("gov_id_meta, gov_id_submitted_at, docs_submitted_at")
        .eq("user_id", userId)
        .maybeSingle();
      if (!row) return apiFail("Pro not found", 404);
      const meta =
        row.gov_id_meta &&
        typeof row.gov_id_meta === "object" &&
        !Array.isArray(row.gov_id_meta)
          ? (row.gov_id_meta as Record<string, unknown>)
          : {};
      const submitKey = String(
        row.gov_id_submitted_at || row.docs_submitted_at || now,
      );
      const { error } = await supabase
        .from("repair_pro_profiles")
        .update({
          gov_id_meta: {
            ...meta,
            care_attended_at: now,
            care_attended_submit_at: submitKey,
            care_attended_by: session.userId,
          },
          updated_at: now,
        })
        .eq("user_id", userId);
      if (error && !error.message.includes("gov_id_meta")) {
        return apiFail(error.message, 500);
      }
      return apiOk({ message: "Marked attended / read." });
    }

    if (action === "pro_t2_approve") {
      // T2 package = Government ID + BVN (both required)
      const { data: before } = await supabase
        .from("repair_pro_profiles")
        .select(
          "face_liveness_verified, liveness_passed_at, docs_status, bvn_verified, gov_id_number, gov_id_front_url, nin_encrypted, nin_last4, bvn_encrypted, bvn_last4, gov_id_meta",
        )
        .eq("user_id", userId)
        .maybeSingle();
      if (!before) return apiFail("Pro not found", 404);
      const meta =
        before.gov_id_meta &&
        typeof before.gov_id_meta === "object" &&
        !Array.isArray(before.gov_id_meta)
          ? (before.gov_id_meta as Record<string, unknown>)
          : {};
      const hasId = Boolean(
        before.gov_id_number ||
        before.nin_encrypted ||
        before.nin_last4 ||
        meta.primaryId ||
        before.gov_id_front_url,
      );
      const hasBvn = Boolean(
        before.bvn_encrypted ||
        before.bvn_last4 ||
        meta.bankId ||
        meta.bvn ||
        // Pro app stores BVN in nin field when kind=nin
        (before.nin_encrypted && before.gov_id_number) ||
        before.nin_last4,
      );
      // nin_last4 alone can be ID last4 prefer explicit bvn fields, else require nin submit as BVN
      const hasBvnStrict = Boolean(
        before.bvn_encrypted || before.bvn_last4 || meta.bankId || meta.bvn,
      );
      // Accept nin number as BVN package when pro submitted BVN step (nin field)
      const hasBvnOrNinPackage =
        hasBvnStrict || Boolean(before.nin_encrypted || before.nin_last4);
      if (!hasId) {
        return apiFail(
          "Cannot approve T2 government ID number/photo is missing.",
          400,
        );
      }
      if (!hasBvnOrNinPackage) {
        return apiFail(
          "Cannot approve T2 BVN must be filled with government ID. Ask pro to submit BVN.",
          400,
        );
      }
      void hasBvn; // reserved for stricter future check
      const alreadyLive = Boolean(
        before?.face_liveness_verified || before?.liveness_passed_at,
      );
      // Care T2 package includes ID + BVN approved together
      const goLiveEnds = new Date(now);
      goLiveEnds.setUTCDate(goLiveEnds.getUTCDate() + 30);
      const t2Patch: Record<string, unknown> = {
        nin_verified: true,
        bvn_verified: true,
        verified: true,
        gov_id_review_status: "approved",
        gov_id_reviewed_at: now,
        status: "approved",
        approved_at: now,
        rejection_reason: null,
        rejected_at: null,
        visibility_tier: alreadyLive ? 3 : 2,
        is_new_artisan: !alreadyLive,
        tier2_approved_at: now,
        ...(alreadyLive
          ? {
              tier3_approved_at: now,
              go_live_window_ends_at: null,
            }
          : {
              go_live_window_ends_at: goLiveEnds.toISOString(),
            }),
        pipeline_status: "pending_document_review",
        updated_at: now,
      };
      // If skill docs already approved and T3 met → T4
      if (alreadyLive && before?.docs_status === "approved") {
        t2Patch.visibility_tier = 4;
        t2Patch.tier4_approved_at = now;
        t2Patch.is_new_artisan = false;
        t2Patch.pipeline_status = "live_ready";
      }
      const { error } = await supabase
        .from("repair_pro_profiles")
        .update(t2Patch)
        .eq("user_id", userId);
      if (error) {
        // Fallback still must flip gov_id_review_status so the app leaves "in review"
        const { error: e2 } = await supabase
          .from("repair_pro_profiles")
          .update({
            nin_verified: true,
            bvn_verified: true,
            verified: true,
            gov_id_review_status: "approved",
            gov_id_reviewed_at: now,
            status: "approved",
            visibility_tier: 2,
            is_new_artisan: true,
            tier2_approved_at: now,
            updated_at: now,
          })
          .eq("user_id", userId);
        if (e2) return apiFail(e2.message, 500);
      }
      const vis = Number(t2Patch.visibility_tier) || 2;
      // Dual-role: auto-approve Customer T2 + share ID media if empty
      const { mirrorDualRoleT2Approved } =
        await import("@/lib/server/identity/dual-t2-mirror");
      await mirrorDualRoleT2Approved(supabase, userId, {
        reviewedBy: session.userId,
        now,
      });
      await logAdminAction(session.userId, "pro_t2_approve", userId, {
        visibility_tier: vis,
        auto: true,
        dual_t2_mirrored: true,
      });
      return apiOk({
        message:
          vis >= 4
            ? "T2 ID approved (dual Customer T2 auto-approved if present). Visibility T4."
            : vis >= 3
              ? "T2 ID approved (dual Customer T2 auto-approved if present). Visibility T3."
              : "T2 ID approved (dual Customer T2 auto-approved if present). Visibility T2 when they Go Live.",
      });
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
          "docs_rating_boost_applied, rating_avg, visibility_tier, face_liveness_verified, liveness_passed_at, bvn_verified, gov_id_review_status, verified, nin_verified",
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
      const nextAvg = boosted
        ? avg
        : Math.min(5, Math.round((avg + 1) * 100) / 100);
      const { resolveAutoVisibilityTier } =
        await import("@/lib/artisan/visibility-tiers");
      const govIdApproved =
        pro.gov_id_review_status === "approved" ||
        Boolean(pro.verified) ||
        Boolean(pro.nin_verified);
      const faceOk = Boolean(
        pro.face_liveness_verified || pro.liveness_passed_at,
      );
      // Product: must pass T3 (liveness + BVN) before T4 full reach
      const nextVis = resolveAutoVisibilityTier({
        govIdApproved,
        bvnVerified: Boolean(pro.bvn_verified),
        faceLiveness: faceOk,
        skillDocsApproved: true,
      });
      const { error } = await supabase
        .from("repair_pro_profiles")
        .update({
          docs_status: "approved",
          docs_rating_boost_applied: true,
          rating_avg: nextAvg,
          docs_reviewed_at: now,
          docs_reviewed_by: session.userId,
          visibility_tier: nextVis,
          is_new_artisan: nextVis <= 2,
          ...(nextVis >= 3 ? { go_live_window_ends_at: null } : {}),
          ...(nextVis >= 4 ? { tier4_approved_at: now } : {}),
          pipeline_status:
            nextVis >= 4 ? "live_ready" : "pending_document_review",
          status: "approved",
          updated_at: now,
        })
        .eq("user_id", userId);
      if (error) return apiFail(error.message, 500);
      await logAdminAction(session.userId, "pro_t4_approve", userId, {
        visibility_tier: nextVis,
        auto: true,
      });
      return apiOk({
        message:
          nextVis >= 4
            ? "Skill docs approved. Visibility T4 (full · 5 km)."
            : nextVis >= 3
              ? "Skill docs approved. Visibility stays T3 until ladder recompute check liveness + BVN."
              : nextVis >= 2
                ? "Skill docs saved. Full T4 reach needs T3 first (face liveness + BVN). Currently limited T2."
                : "Skill docs approved. T2 ID approval still required for search.",
      });
    }

    // Manual visibility retired automatic ladder only
    if (action === "pro_visibility") {
      return apiFail(
        "Visibility is automatic: T2 ID → limited search · T3 (liveness + BVN) → wider · T4 skill docs → full (only after T3). No manual Vis buttons.",
        400,
        "visibility_automatic",
      );
    }

    if (action === "pro_request_resubmit") {
      const note =
        reason ||
        "Care: please re-submit ID and/or skill documents. Previous submission did not reach the server queue.";
      const { error } = await supabase
        .from("repair_pro_profiles")
        .update({
          status: "pending",
          pipeline_status: "needs_resubmit",
          pipeline_notes: note,
          rejection_reason: note,
          rejected_at: now,
          gov_id_review_status: "none",
          verified: false,
          nin_verified: false,
          bvn_verified: false,
          updated_at: now,
        })
        .eq("user_id", userId);
      if (error) return apiFail(error.message, 500);
      await logAdminAction(session.userId, "pro_request_resubmit", userId, {
        reason: note,
      });
      return apiOk({
        message: "Flagged for re-submit pro will appear in care queue.",
      });
    }

    // ── Care: reset unapproved tiers so pro can start verification again ──
    if (
      action === "pro_t2_reset" ||
      action === "pro_t3_reset" ||
      action === "pro_t4_reset" ||
      action === "pro_reset_unapproved"
    ) {
      const { data: pro, error: loadErr } = await supabase
        .from("repair_pro_profiles")
        .select(
          "gov_id_review_status, nin_verified, bvn_verified, verified, docs_status, face_liveness_verified, visibility_tier",
        )
        .eq("user_id", userId)
        .maybeSingle();
      if (loadErr) return apiFail(loadErr.message, 500);
      if (!pro) return apiFail("Pro not found", 404);

      const t2Approved =
        pro.gov_id_review_status === "approved" ||
        Boolean(pro.verified) ||
        (Boolean(pro.nin_verified) && Boolean(pro.bvn_verified));
      const t3Approved = Boolean(pro.face_liveness_verified);
      const t4Approved = pro.docs_status === "approved";

      const note =
        reason ||
        "Care reset. Please complete this verification step again in the app.";
      const patch: Record<string, unknown> = {
        status: "pending",
        pipeline_status: "needs_resubmit",
        pipeline_notes: note,
        updated_at: now,
      };
      const cleared: string[] = [];
      const kept: string[] = [];

      const doT2 =
        action === "pro_t2_reset" || action === "pro_reset_unapproved";
      const doT3 =
        action === "pro_t3_reset" || action === "pro_reset_unapproved";
      const doT4 =
        action === "pro_t4_reset" || action === "pro_reset_unapproved";

      if (doT2) {
        if (t2Approved) {
          kept.push("T2 ID (already approved)");
        } else {
          Object.assign(patch, {
            nin_verified: false,
            bvn_verified: false,
            verified: false,
            gov_id_review_status: "none",
            gov_id_submitted_at: null,
            gov_id_reviewed_at: null,
            gov_id_front_url: null,
            gov_id_back_url: null,
            gov_id_number: null,
            gov_id_kind: null,
            gov_id_meta: {},
            nin_encrypted: null,
            bvn_encrypted: null,
            nin_last4: null,
            bvn_last4: null,
            rejection_reason: note,
            rejected_at: now,
          });
          // Drop visibility back if it was only provisional
          if (Number(pro.visibility_tier) >= 2) {
            patch.visibility_tier = 1;
            patch.is_new_artisan = true;
          }
          cleared.push("T2 ID");
        }
      }

      if (doT3) {
        if (t3Approved) {
          kept.push("T3 liveness (already passed)");
        } else {
          Object.assign(patch, {
            face_liveness_verified: false,
            face_liveness_at: null,
            face_liveness_selfie_url: null,
            liveness_passed_at: null,
          });
          cleared.push("T3 liveness");
        }
      }

      if (doT4) {
        if (t4Approved) {
          kept.push("T4 skill docs (already approved)");
        } else {
          Object.assign(patch, {
            docs_status: "none",
            docs_submitted_at: null,
            docs_reviewed_at: null,
            docs_reviewed_by: null,
            certification_file_name: null,
            certification_file_url: null,
            skill_proof: null,
          });
          cleared.push("T4 skill docs");
        }
      }

      if (cleared.length === 0) {
        return apiOk({
          message:
            kept.length > 0
              ? `Nothing to reset ${kept.join("; ")}.`
              : "Nothing to reset.",
          cleared,
          kept,
        });
      }

      const { error } = await supabase
        .from("repair_pro_profiles")
        .update(patch)
        .eq("user_id", userId);
      if (error) return apiFail(error.message, 500);

      await logAdminAction(session.userId, action, userId, {
        reason: note,
        cleared,
        kept,
      });

      return apiOk({
        message: `Reset ${cleared.join(", ")}. Pro can re-submit from the app.${
          kept.length ? ` Kept: ${kept.join("; ")}.` : ""
        }`,
        cleared,
        kept,
      });
    }

    return apiFail("Unknown action", 400);
  } catch (e) {
    if (e instanceof AdminAuthError)
      return apiFail(e.message, e.status, "auth");
    return apiFail("Pro review failed", 500);
  }
}
