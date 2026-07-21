import { AdminAuthError, requireAdmin } from "@/lib/server/admin-auth";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { createServiceSupabase } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * List motorists with vehicle + identity fields.
 * Avoids ambiguous PostgREST embeds (multiple FKs between profiles ↔ motorist_profiles
 * after identity_reviewed_by was added). Loads tables separately and joins in app code.
 */
export async function GET(req: Request) {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Supabase is not configured", 503, "supabase_not_configured");
  }
  try {
    await requireAdmin();
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim().toLowerCase();
    const active = searchParams.get("active");
    const verified = searchParams.get("verified");

    const supabase = createServiceSupabase();

    // Source of truth for customers who have a motorist side-profile
    const { data: mots, error: mErr } = await supabase
      .from("motorist_profiles")
      .select(
        "user_id, vehicle_make, vehicle_model, vehicle_year, plate_number, address_text, default_lat, default_lng, nin_last4, bvn_last4, nin_verified, bvn_verified, identity_verified_at, identity_review_status, identity_submitted_at, phone_verified, gov_id_front_url, gov_id_back_url, gov_id_kind, gov_id_number, created_at, updated_at"
      )
      .order("created_at", { ascending: false })
      .limit(500);

    if (mErr) return apiFail(mErr.message, 500);

    const rows = mots ?? [];
    const userIds = rows.map((r) => r.user_id);
    const profiles: Record<
      string,
      {
        id: string;
        role: string;
        full_name: string;
        phone: string | null;
        email: string | null;
        city: string | null;
        area: string | null;
        is_active: boolean;
        created_at: string;
        updated_at: string;
      }
    > = {};

    if (userIds.length) {
      const { data: profs, error: pErr } = await supabase
        .from("profiles")
        .select(
          "id, role, full_name, phone, email, city, area, is_active, created_at, updated_at"
        )
        .in("id", userIds);
      if (pErr) return apiFail(pErr.message, 500);
      for (const p of profs ?? []) {
        profiles[p.id] = {
          id: p.id,
          role: p.role,
          full_name: p.full_name,
          phone: p.phone ?? null,
          email: p.email,
          city: p.city ?? null,
          area: p.area ?? null,
          is_active: p.is_active !== false,
          created_at: p.created_at,
          updated_at: p.updated_at,
        };
      }
    }

    // Also include profiles with role=motorist but missing side row
    const { data: roleOnly } = await supabase
      .from("profiles")
      .select(
        "id, role, full_name, phone, email, city, area, is_active, created_at, updated_at"
      )
      .eq("role", "motorist")
      .limit(500);

    for (const p of roleOnly ?? []) {
      if (!profiles[p.id]) {
        profiles[p.id] = {
          id: p.id,
          role: p.role,
          full_name: p.full_name,
          phone: p.phone ?? null,
          email: p.email,
          city: p.city ?? null,
          area: p.area ?? null,
          is_active: p.is_active !== false,
          created_at: p.created_at,
          updated_at: p.updated_at,
        };
      }
    }

    const motByUser = new Map(rows.map((r) => [r.user_id, r]));
    const allIds = new Set([
      ...userIds,
      ...(roleOnly ?? []).map((p) => p.id),
    ]);

    let motorists = [...allIds].map((id) => {
      const p = profiles[id];
      const mot = motByUser.get(id) ?? null;
      const ninOk = Boolean(mot?.nin_verified);
      const bvnOk = Boolean(mot?.bvn_verified);
      const review = String(mot?.identity_review_status || "");
      const verifyLevel =
        ninOk && bvnOk
          ? "full"
          : review === "approved" || mot?.identity_verified_at
            ? "full"
            : ninOk || bvnOk || review === "submitted" || mot?.nin_last4
              ? "partial"
              : "none";
      return {
        id,
        role: p?.role || "motorist",
        full_name: p?.full_name || "—",
        phone: p?.phone ?? null,
        email: p?.email ?? null,
        city: p?.city ?? null,
        area: p?.area ?? null,
        is_active: p?.is_active !== false,
        created_at: p?.created_at || mot?.created_at || null,
        updated_at: p?.updated_at || mot?.updated_at || null,
        motorist: mot
          ? {
              vehicle_make: mot.vehicle_make,
              vehicle_model: mot.vehicle_model,
              vehicle_year: mot.vehicle_year,
              plate_number: mot.plate_number,
              address_text: mot.address_text,
              default_lat: mot.default_lat,
              default_lng: mot.default_lng,
              nin_last4: mot.nin_last4,
              bvn_last4: mot.bvn_last4,
              nin_verified: Boolean(mot.nin_verified),
              bvn_verified: Boolean(mot.bvn_verified),
              identity_verified_at: mot.identity_verified_at,
              identity_review_status: mot.identity_review_status ?? null,
              identity_submitted_at: mot.identity_submitted_at ?? null,
              phone_verified: Boolean(mot.phone_verified),
              gov_id_front_url: mot.gov_id_front_url ?? null,
              gov_id_back_url: mot.gov_id_back_url ?? null,
              gov_id_kind: mot.gov_id_kind ?? null,
              gov_id_number: mot.gov_id_number ?? null,
            }
          : null,
        verifyLevel: verifyLevel as "full" | "partial" | "none",
      };
    });

    if (active === "true") {
      motorists = motorists.filter((m) => m.is_active);
    } else if (active === "false") {
      motorists = motorists.filter((m) => !m.is_active);
    }

    if (verified === "full" || verified === "partial" || verified === "none") {
      motorists = motorists.filter((m) => m.verifyLevel === verified);
    }

    if (q) {
      motorists = motorists.filter((m) => {
        const hay = [m.full_name, m.email, m.phone, m.city, m.area]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
    }

    // Newest first
    motorists.sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return tb - ta;
    });

    const totals = {
      total: motorists.length,
      active: motorists.filter((m) => m.is_active).length,
      inactive: motorists.filter((m) => !m.is_active).length,
      fullyVerified: motorists.filter((m) => m.verifyLevel === "full").length,
      partial: motorists.filter((m) => m.verifyLevel === "partial").length,
      unverified: motorists.filter((m) => m.verifyLevel === "none").length,
    };

    return apiOk({ motorists, totals });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return apiFail(e.message, e.status, "auth");
    }
    return apiFail("Failed to list motorists", 500);
  }
}
