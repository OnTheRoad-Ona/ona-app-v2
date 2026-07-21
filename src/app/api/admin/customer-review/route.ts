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
 * Customer review queue — Tier 2 government ID submissions.
 * Mirror of Artisan review, for motorist_profiles.identity_review_status.
 */
export async function GET(req: Request) {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Supabase is not configured", 503);
  }
  try {
    await requireAdmin();
    const url = new URL(req.url);
    const filter = url.searchParams.get("status") || "submitted";

    const supabase = createServiceSupabase();
    let q = supabase
      .from("motorist_profiles")
      .select(
        "user_id, vehicle_make, vehicle_model, plate_number, nin_last4, bvn_last4, nin_verified, bvn_verified, identity_verified_at, identity_review_status, identity_submitted_at, identity_reviewed_at, identity_rejection_reason, gov_id_kind, gov_id_front_url, gov_id_meta, phone_verified, created_at, updated_at"
      )
      .order("identity_submitted_at", { ascending: false, nullsFirst: false })
      .limit(400);

    if (filter !== "all") {
      q = q.eq("identity_review_status", filter);
    }

    const { data: mots, error } = await q;
    if (error) {
      // Older DBs without new columns — fall back to legacy pending heuristic
      if (
        error.message.includes("identity_review_status") ||
        error.message.includes("does not exist")
      ) {
        return legacyCustomerList(supabase, filter);
      }
      return apiFail(error.message, 500);
    }

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

    const customers = rows.map((m) => {
      const p = profiles[m.user_id];
      const status = String(m.identity_review_status || "none");
      const meta = (m.gov_id_meta || {}) as Record<string, unknown>;
      return {
        user_id: m.user_id,
        full_name: p?.full_name ?? "—",
        email: p?.email ?? null,
        phone: p?.phone ?? null,
        vehicle: [m.vehicle_make, m.vehicle_model].filter(Boolean).join(" ") || "—",
        plate: m.plate_number || null,
        identity_review_status: status,
        identity_submitted_at: m.identity_submitted_at,
        identity_reviewed_at: m.identity_reviewed_at,
        identity_rejection_reason: m.identity_rejection_reason,
        nin_last4: m.nin_last4,
        bvn_last4: m.bvn_last4,
        gov_id_kind: m.gov_id_kind,
        gov_id_front_url: m.gov_id_front_url,
        has_photo: Boolean(m.gov_id_front_url || meta.hasPhoto),
        phone_verified: Boolean(m.phone_verified),
        nin_verified: Boolean(m.nin_verified),
        bvn_verified: Boolean(m.bvn_verified),
        identity_verified_at: m.identity_verified_at,
        created_at: m.created_at,
      };
    });

    const totals = {
      submitted: customers.filter((c) => c.identity_review_status === "submitted")
        .length,
      approved: customers.filter((c) => c.identity_review_status === "approved")
        .length,
      rejected: customers.filter((c) => c.identity_review_status === "rejected")
        .length,
      total: customers.length,
    };

    return apiOk({ customers, totals, filter });
  } catch (e) {
    if (e instanceof AdminAuthError)
      return apiFail(e.message, e.status, "auth");
    return apiFail("Failed to load customer review queue", 500);
  }
}

async function legacyCustomerList(
  supabase: ReturnType<typeof createServiceSupabase>,
  filter: string
) {
  const { data: mots, error } = await supabase
    .from("motorist_profiles")
    .select(
      "user_id, vehicle_make, vehicle_model, plate_number, nin_last4, bvn_last4, nin_verified, bvn_verified, identity_verified_at, created_at, updated_at"
    )
    .order("updated_at", { ascending: false })
    .limit(400);
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
      const hasId = Boolean(m.nin_last4 || m.bvn_last4);
      const status = approved
        ? "approved"
        : hasId
          ? "submitted"
          : "none";
      const p = profiles[m.user_id];
      return {
        user_id: m.user_id,
        full_name: p?.full_name ?? "—",
        email: p?.email ?? null,
        phone: p?.phone ?? null,
        vehicle:
          [m.vehicle_make, m.vehicle_model].filter(Boolean).join(" ") || "—",
        plate: m.plate_number || null,
        identity_review_status: status,
        identity_submitted_at: hasId ? m.updated_at : null,
        identity_reviewed_at: m.identity_verified_at,
        identity_rejection_reason: null as string | null,
        nin_last4: m.nin_last4,
        bvn_last4: m.bvn_last4,
        gov_id_kind: null as string | null,
        gov_id_front_url: null as string | null,
        has_photo: false,
        phone_verified: false,
        nin_verified: Boolean(m.nin_verified),
        bvn_verified: Boolean(m.bvn_verified),
        identity_verified_at: m.identity_verified_at,
        created_at: m.created_at,
      };
    })
    .filter((c) =>
      filter === "all" ? true : c.identity_review_status === filter
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
      total: customers.length,
    },
    filter,
    legacy: true,
  });
}

const patchSchema = z.object({
  userId: z.string().uuid(),
  action: z.enum(["approve", "reject"]),
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

    const { userId, action, reason } = parsed.data;
    const supabase = createServiceSupabase();
    const now = new Date().toISOString();
    const approve = action === "approve";

    const base = {
      nin_verified: approve,
      bvn_verified: approve,
      identity_verified_at: approve ? now : null,
      identity_review_status: approve ? "approved" : "rejected",
      identity_reviewed_at: now,
      identity_reviewed_by: session.userId,
      identity_rejection_reason: approve ? null : reason || "Rejected by admin",
    };

    const { error } = await supabase
      .from("motorist_profiles")
      .update(base)
      .eq("user_id", userId);

    if (error) {
      // Fallback without new columns
      if (error.message.includes("identity_review_status")) {
        const { error: e2 } = await supabase
          .from("motorist_profiles")
          .update({
            nin_verified: approve,
            bvn_verified: approve,
            identity_verified_at: approve ? now : null,
          })
          .eq("user_id", userId);
        if (e2) return apiFail(e2.message, 500);
      } else {
        return apiFail(error.message, 500);
      }
    }

    await logAdminAction(
      session.userId,
      approve ? "customer_t2_approve" : "customer_t2_reject",
      userId,
      { reason: reason || null }
    );

    return apiOk({
      userId,
      action,
      message: approve
        ? "Customer Tier 2 approved — full booking unlocked."
        : "Customer Tier 2 rejected — ask them to re-submit ID.",
    });
  } catch (e) {
    if (e instanceof AdminAuthError)
      return apiFail(e.message, e.status, "auth");
    return apiFail("Customer review action failed", 500);
  }
}
