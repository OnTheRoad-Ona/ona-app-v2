import { AdminAuthError, requireAdmin } from "@/lib/server/admin-auth";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { createServiceSupabase } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Identity verification overview — Motorists + Repair Pros */
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
          "user_id, business_name, status, verified, nin_verified, bvn_verified, nin_last4, bvn_last4, primary_service"
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
    }));

    const motRows = mots.map((m) => ({
      kind: "motorist" as const,
      user_id: m.user_id,
      full_name: profiles[m.user_id]?.full_name ?? "—",
      email: profiles[m.user_id]?.email ?? null,
      label: [m.vehicle_make, m.vehicle_model].filter(Boolean).join(" ") || "Motorist",
      status: "—",
      verified: Boolean(m.nin_verified && m.bvn_verified),
      nin_verified: m.nin_verified,
      bvn_verified: m.bvn_verified,
      nin_last4: m.nin_last4,
      bvn_last4: m.bvn_last4,
    }));

    const rows = [...proRows, ...motRows];

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
    };

    return apiOk({ rows, totals });
  } catch (e) {
    if (e instanceof AdminAuthError) return apiFail(e.message, e.status, "auth");
    return apiFail("Failed to load verification", 500);
  }
}
