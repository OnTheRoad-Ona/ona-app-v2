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

const MS_DAY = 24 * 60 * 60 * 1000;
const TRIAL_DAYS = 30;

type Meta = Record<string, unknown>;

function asMeta(v: unknown): Meta {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Meta)
    : {};
}

/**
 * Customer multi-level review queue — full package for care approval.
 * Levels: Account · T1 Phone · T2 Government ID (number + images) · Trial window
 */
export async function GET(req: Request) {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Supabase is not configured", 503);
  }
  try {
    await requireAdmin();
    const url = new URL(req.url);
    // Default "all" so registered customers always appear (not only T2 submitted)
    const filter = url.searchParams.get("status") || "all";
    const detailId = url.searchParams.get("userId");

    const supabase = createServiceSupabase();

    const selectCols =
      "user_id, vehicle_make, vehicle_model, vehicle_year, vehicle_photo, plate_number, vehicles, vehicle_common_issues, address_text, default_lat, default_lng, nin_last4, bvn_last4, nin_verified, bvn_verified, nin_encrypted, bvn_encrypted, identity_verified_at, identity_review_status, identity_submitted_at, identity_reviewed_at, identity_reviewed_by, identity_rejection_reason, gov_id_kind, gov_id_front_url, gov_id_back_url, gov_id_number, bank_id_number, identity_country_iso, gov_id_meta, review_checklist, phone_verified, phone_verified_at, first_service_at, created_at, updated_at";

    let q = supabase
      .from("motorist_profiles")
      .select(selectCols)
      .order("created_at", { ascending: false })
      .limit(400);

    if (detailId) {
      q = supabase
        .from("motorist_profiles")
        .select(selectCols)
        .eq("user_id", detailId)
        .limit(1);
    } else if (filter === "submitted" || filter === "pending") {
      q = q.eq("identity_review_status", "submitted");
    } else if (filter === "approved" || filter === "rejected" || filter === "none") {
      q = q.eq("identity_review_status", filter);
    }
    // filter === "all" → no status eq (every motorist signup)

    const { data: mots, error } = await q;
    if (error) {
      if (
        error.message.includes("does not exist") ||
        error.message.includes("gov_id_number") ||
        error.message.includes("identity_review_status")
      ) {
        return legacyCustomerList(supabase, filter, detailId);
      }
      return apiFail(error.message, 500);
    }

    const rows = mots ?? [];
    const userIds = rows.map((r) => r.user_id as string);
    const profiles: Record<
      string,
      {
        full_name: string;
        email: string | null;
        phone: string | null;
        city: string | null;
        area: string | null;
        is_active: boolean;
        created_at: string;
        avatar_url?: string | null;
      }
    > = {};
    if (userIds.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select(
          "id, full_name, email, phone, city, area, is_active, created_at, avatar_url"
        )
        .in("id", userIds);
      for (const p of profs ?? []) {
        profiles[p.id] = {
          full_name: p.full_name,
          email: p.email,
          phone: p.phone ?? null,
          city: p.city ?? null,
          area: p.area ?? null,
          is_active: p.is_active !== false,
          created_at: p.created_at,
          avatar_url: (p as { avatar_url?: string }).avatar_url ?? null,
        };
      }
    }

    // Job counts + job media (photos/evidence) — not star reviews
    const jobCount: Record<string, number> = {};
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
        pickup_address: string | null;
        created_at: string;
      }>
    > = {};
    if (userIds.length) {
      const { data: jobs } = await supabase
        .from("service_requests")
        .select(
          "id, motorist_id, status, service_type, motorist_photo, repair_pro_photo, photos, evidence, pickup_address, created_at"
        )
        .in("motorist_id", userIds)
        .order("created_at", { ascending: false })
        .limit(200);
      for (const j of jobs ?? []) {
        const id = String(j.motorist_id);
        jobCount[id] = (jobCount[id] || 0) + 1;
        if (!jobMedia[id]) jobMedia[id] = [];
        if (jobMedia[id].length >= 8) continue;
        jobMedia[id].push({
          id: String(j.id),
          status: String(j.status),
          service_type: j.service_type ?? null,
          motorist_photo: j.motorist_photo ?? null,
          repair_pro_photo: j.repair_pro_photo ?? null,
          photos: j.photos ?? null,
          evidence: j.evidence ?? null,
          pickup_address: j.pickup_address ?? null,
          created_at: String(j.created_at),
        });
      }
    }

    const customers = rows.map((m) => {
      const p = profiles[m.user_id as string];
      const meta = asMeta(m.gov_id_meta);
      const snap = asMeta(meta.accountSnapshot);
      const status = String(m.identity_review_status || "none");
      const firstService = m.first_service_at as string | null;
      let trialDaysLeft: number | null = null;
      let trialExpired = false;
      if (firstService) {
        const end = new Date(firstService).getTime() + TRIAL_DAYS * MS_DAY;
        trialDaysLeft = Math.ceil((end - Date.now()) / MS_DAY);
        trialExpired = trialDaysLeft <= 0;
      }
      const fullId =
        (m.gov_id_number as string) ||
        (m.nin_encrypted as string) ||
        (meta.primaryId as string) ||
        null;
      const fullBank =
        (m.bank_id_number as string) ||
        (m.bvn_encrypted as string) ||
        (meta.bankId as string) ||
        null;

      return {
        user_id: m.user_id,
        // Account
        full_name: p?.full_name || (snap.fullName as string) || "—",
        email: p?.email || (snap.email as string) || null,
        phone: p?.phone || (snap.phone as string) || null,
        city: p?.city || (snap.city as string) || null,
        area: p?.area || (snap.area as string) || null,
        avatar_url: p?.avatar_url ?? null,
        is_active: p?.is_active !== false,
        registered_at: p?.created_at || null,
        address_text: m.address_text ?? null,
        // Vehicle
        vehicle_make: m.vehicle_make ?? snap.vehicleMake ?? null,
        vehicle_model: m.vehicle_model ?? snap.vehicleModel ?? null,
        vehicle_year: m.vehicle_year ?? snap.vehicleYear ?? null,
        vehicle_photo: m.vehicle_photo ?? null,
        plate: m.plate_number ?? snap.plate ?? null,
        vehicles: m.vehicles ?? null,
        vehicle_common_issues: m.vehicle_common_issues ?? null,
        job_media: jobMedia[m.user_id as string] ?? [],
        // T1 Phone
        levels: {
          t1_phone: {
            status: m.phone_verified
              ? "verified"
              : p?.phone
                ? "unverified"
                : "missing",
            phone: p?.phone || null,
            verified: Boolean(m.phone_verified),
            verified_at: m.phone_verified_at ?? null,
            auto: true,
            label: "Tier 1 · Phone OTP",
          },
          t2_id: {
            status:
              status === "approved"
                ? "approved"
                : status === "submitted"
                  ? "pending"
                  : status === "rejected"
                    ? "rejected"
                    : fullId || m.gov_id_front_url
                      ? "draft"
                      : "none",
            label: "Tier 2 · Government ID",
            review_status: status,
            country_iso:
              (m.identity_country_iso as string) ||
              (meta.countryIso as string) ||
              "NG",
            gov_id_kind: m.gov_id_kind || (meta.govIdKind as string) || null,
            /** Full number for care */
            gov_id_number: fullId,
            gov_id_last4: m.nin_last4 || last4(fullId),
            bank_id_number: fullBank,
            bank_id_last4: m.bvn_last4 || last4(fullBank),
            front_url: m.gov_id_front_url || null,
            back_url: m.gov_id_back_url || null,
            has_front: Boolean(m.gov_id_front_url || meta.hasPhoto),
            has_back: Boolean(m.gov_id_back_url || meta.hasBackPhoto),
            submitted_at: m.identity_submitted_at,
            reviewed_at: m.identity_reviewed_at,
            reviewed_by: m.identity_reviewed_by,
            rejection_reason: m.identity_rejection_reason,
            nin_verified: Boolean(m.nin_verified),
            bvn_verified: Boolean(m.bvn_verified),
            identity_verified_at: m.identity_verified_at,
            checklist: asMeta(m.review_checklist),
            meta,
          },
          trial: {
            first_service_at: firstService,
            trial_days: TRIAL_DAYS,
            days_left: trialDaysLeft,
            expired: trialExpired,
            label: "Free period (30 days from first request)",
          },
        },
        // Flat compat for list UI
        identity_review_status: status,
        identity_submitted_at: m.identity_submitted_at,
        identity_reviewed_at: m.identity_reviewed_at,
        identity_rejection_reason: m.identity_rejection_reason,
        nin_last4: m.nin_last4,
        bvn_last4: m.bvn_last4,
        gov_id_kind: m.gov_id_kind,
        gov_id_front_url: m.gov_id_front_url,
        gov_id_back_url: m.gov_id_back_url,
        gov_id_number: fullId,
        bank_id_number: fullBank,
        has_photo: Boolean(m.gov_id_front_url || meta.hasPhoto),
        phone_verified: Boolean(m.phone_verified),
        identity_verified_at: m.identity_verified_at,
        jobs_count: jobCount[m.user_id as string] || 0,
        created_at: m.created_at,
        updated_at: m.updated_at,
      };
    });

    // When filtered, still compute global totals for the cards
    let globalCounts = {
      submitted: customers.filter((c) => c.identity_review_status === "submitted")
        .length,
      approved: customers.filter((c) => c.identity_review_status === "approved")
        .length,
      rejected: customers.filter((c) => c.identity_review_status === "rejected")
        .length,
      none: customers.filter((c) => c.identity_review_status === "none").length,
      total: customers.length,
    };
    if (filter !== "all" && !detailId) {
      const { count: allC } = await supabase
        .from("motorist_profiles")
        .select("user_id", { count: "exact", head: true });
      const { count: subC } = await supabase
        .from("motorist_profiles")
        .select("user_id", { count: "exact", head: true })
        .eq("identity_review_status", "submitted");
      const { count: appC } = await supabase
        .from("motorist_profiles")
        .select("user_id", { count: "exact", head: true })
        .eq("identity_review_status", "approved");
      const { count: rejC } = await supabase
        .from("motorist_profiles")
        .select("user_id", { count: "exact", head: true })
        .eq("identity_review_status", "rejected");
      const { count: noneC } = await supabase
        .from("motorist_profiles")
        .select("user_id", { count: "exact", head: true })
        .eq("identity_review_status", "none");
      globalCounts = {
        total: allC ?? customers.length,
        submitted: subC ?? 0,
        approved: appC ?? 0,
        rejected: rejC ?? 0,
        none: noneC ?? 0,
      };
    }

    return apiOk({
      customers,
      totals: globalCounts,
      filter,
      detail: Boolean(detailId),
    });
  } catch (e) {
    if (e instanceof AdminAuthError)
      return apiFail(e.message, e.status, "auth");
    return apiFail("Failed to load customer review queue", 500);
  }
}

function last4(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const d = raw.replace(/\D/g, "");
  if (d.length >= 4) return d.slice(-4);
  return raw.length >= 4 ? raw.slice(-4) : raw;
}

async function legacyCustomerList(
  supabase: ReturnType<typeof createServiceSupabase>,
  filter: string,
  detailId: string | null
) {
  let q = supabase
    .from("motorist_profiles")
    .select(
      "user_id, vehicle_make, vehicle_model, plate_number, nin_last4, bvn_last4, nin_verified, bvn_verified, nin_encrypted, bvn_encrypted, identity_verified_at, created_at, updated_at"
    )
    .order("updated_at", { ascending: false })
    .limit(400);
  if (detailId) q = q.eq("user_id", detailId);

  const { data: mots, error } = await q;
  if (error) return apiFail(error.message, 500);

  const rows = mots ?? [];
  const userIds = rows.map((r) => r.user_id);
  const profiles: Record<
    string,
    { full_name: string; email: string | null; phone: string | null }
  > = {};
  if (userIds.length) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, full_name, email, phone")
      .in("id", userIds);
    for (const p of profs ?? []) {
      profiles[p.id] = {
        full_name: p.full_name,
        email: p.email,
        phone: p.phone ?? null,
      };
    }
  }

  const customers = rows
    .map((m) => {
      const approved = Boolean(m.identity_verified_at || m.nin_verified);
      const hasId = Boolean(m.nin_last4 || m.bvn_last4 || m.nin_encrypted);
      const status = approved
        ? "approved"
        : hasId
          ? "submitted"
          : "none";
      const p = profiles[m.user_id];
      const fullId = m.nin_encrypted || null;
      return {
        user_id: m.user_id,
        full_name: p?.full_name ?? "—",
        email: p?.email ?? null,
        phone: p?.phone ?? null,
        city: null,
        area: null,
        avatar_url: null,
        is_active: true,
        registered_at: null,
        address_text: null,
        vehicle_make: m.vehicle_make,
        vehicle_model: m.vehicle_model,
        vehicle_year: null,
        plate: m.plate_number,
        vehicles: null,
        levels: {
          t1_phone: {
            status: p?.phone ? "unverified" : "missing",
            phone: p?.phone,
            verified: false,
            verified_at: null,
            auto: true,
            label: "Tier 1 · Phone OTP",
          },
          t2_id: {
            status: approved
              ? "approved"
              : hasId
                ? "pending"
                : "none",
            label: "Tier 2 · Government ID",
            review_status: status,
            country_iso: "NG",
            gov_id_kind: null,
            gov_id_number: fullId,
            gov_id_last4: m.nin_last4,
            bank_id_number: m.bvn_encrypted || null,
            bank_id_last4: m.bvn_last4,
            front_url: null,
            back_url: null,
            has_front: false,
            has_back: false,
            submitted_at: hasId ? m.updated_at : null,
            reviewed_at: m.identity_verified_at,
            reviewed_by: null,
            rejection_reason: null,
            nin_verified: Boolean(m.nin_verified),
            bvn_verified: Boolean(m.bvn_verified),
            identity_verified_at: m.identity_verified_at,
            checklist: {},
            meta: {},
          },
          trial: {
            first_service_at: null,
            trial_days: 30,
            days_left: null,
            expired: false,
            label: "Free period",
          },
        },
        identity_review_status: status,
        identity_submitted_at: hasId ? m.updated_at : null,
        identity_reviewed_at: m.identity_verified_at,
        identity_rejection_reason: null,
        nin_last4: m.nin_last4,
        bvn_last4: m.bvn_last4,
        gov_id_kind: null,
        gov_id_front_url: null,
        gov_id_back_url: null,
        gov_id_number: fullId,
        bank_id_number: m.bvn_encrypted || null,
        has_photo: false,
        phone_verified: false,
        identity_verified_at: m.identity_verified_at,
        jobs_count: 0,
        created_at: m.created_at,
        updated_at: m.updated_at,
      };
    })
    .filter((c) =>
      filter === "all" || detailId ? true : c.identity_review_status === filter
    );

  return apiOk({
    customers,
    totals: {
      submitted: customers.filter((c) => c.identity_review_status === "submitted")
        .length,
      approved: customers.filter((c) => c.identity_review_status === "approved")
        .length,
      rejected: customers.filter((c) => c.identity_review_status === "rejected")
        .length,
      none: 0,
      total: customers.length,
    },
    filter,
    legacy: true,
  });
}

const patchSchema = z.object({
  userId: z.string().uuid(),
  action: z.enum([
    "approve",
    "reject",
    "approve_t2",
    "reject_t2",
    "mark_phone_verified",
    "save_checklist",
  ]),
  reason: z.string().max(500).optional(),
  checklist: z.record(z.string(), z.boolean()).optional(),
});

export async function PATCH(req: Request) {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Supabase is not configured", 503);
  }
  try {
    const { session } = await requireAdmin();
    const parsed = patchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return apiFail("Invalid body", 400);

    const { userId, action, reason, checklist } = parsed.data;
    const supabase = createServiceSupabase();
    const now = new Date().toISOString();

    if (action === "save_checklist") {
      const { error } = await supabase
        .from("motorist_profiles")
        .update({
          review_checklist: checklist || {},
          updated_at: now,
        })
        .eq("user_id", userId);
      if (error && !error.message.includes("review_checklist")) {
        return apiFail(error.message, 500);
      }
      return apiOk({ message: "Checklist saved." });
    }

    if (action === "mark_phone_verified") {
      const { error } = await supabase
        .from("motorist_profiles")
        .update({
          phone_verified: true,
          phone_verified_at: now,
          updated_at: now,
        })
        .eq("user_id", userId);
      if (error) {
        if (error.message.includes("phone_verified")) {
          return apiOk({
            message: "Phone flag column missing — apply latest migration.",
          });
        }
        return apiFail(error.message, 500);
      }
      await logAdminAction(session.userId, "customer_t1_phone_verify", userId, {});
      return apiOk({ message: "Tier 1 phone marked verified." });
    }

    const approve =
      action === "approve" || action === "approve_t2";
    const reject =
      action === "reject" || action === "reject_t2";
    if (!approve && !reject) return apiFail("Unknown action", 400);

    const base: Record<string, unknown> = {
      nin_verified: approve,
      bvn_verified: approve,
      identity_verified_at: approve ? now : null,
      identity_review_status: approve ? "approved" : "rejected",
      identity_reviewed_at: now,
      identity_reviewed_by: session.userId,
      identity_rejection_reason: approve
        ? null
        : reason || "Rejected by admin / customer care",
      updated_at: now,
    };

    let { error } = await supabase
      .from("motorist_profiles")
      .update(base)
      .eq("user_id", userId);

    if (error?.message.includes("identity_review_status")) {
      ({ error } = await supabase
        .from("motorist_profiles")
        .update({
          nin_verified: approve,
          bvn_verified: approve,
          identity_verified_at: approve ? now : null,
        })
        .eq("user_id", userId));
    }
    if (error) return apiFail(error.message, 500);

    await logAdminAction(
      session.userId,
      approve ? "customer_t2_approve" : "customer_t2_reject",
      userId,
      { reason: reason || null, level: "t2_id" }
    );

    return apiOk({
      userId,
      action: approve ? "approve" : "reject",
      message: approve
        ? "Tier 2 approved — ID, number and documents accepted. Full booking unlocked."
        : "Tier 2 rejected — customer must re-submit ID.",
    });
  } catch (e) {
    if (e instanceof AdminAuthError)
      return apiFail(e.message, e.status, "auth");
    return apiFail("Customer review action failed", 500);
  }
}
