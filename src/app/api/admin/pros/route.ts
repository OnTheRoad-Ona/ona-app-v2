import { AdminAuthError, requireAdmin } from "@/lib/server/admin-auth";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { createServiceSupabase } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { hasRecentLiveHeartbeat } from "@/lib/matching";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * List ALL Repair Pros from repair_pro_profiles (source of truth),
 * joined to profiles — not filtered by profiles.role alone.
 * Dual-account users who signed up customer-first still appear here.
 */
export async function GET(req: Request) {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Supabase is not configured", 503, "supabase_not_configured");
  }
  try {
    await requireAdmin();
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim().toLowerCase();
    const status = (searchParams.get("status") || "").trim();

    const supabase = createServiceSupabase();

    let proQ = supabase
      .from("repair_pro_profiles")
      .select(
        "user_id, business_name, primary_service, status, verified, is_online, location_updated_at, nin_verified, bvn_verified, visibility_tier, rating_avg, rating_count, created_at, updated_at"
      )
      .order("created_at", { ascending: false })
      .limit(500);

    if (
      status &&
      ["pending", "approved", "suspended", "rejected"].includes(status)
    ) {
      proQ = proQ.eq("status", status);
    }

    const { data: pros, error } = await proQ;
    if (error) return apiFail(error.message, 500);

    const rows = pros ?? [];
    const userIds = rows.map((r) => r.user_id);
    const profiles: Record<
      string,
      {
        id: string;
        full_name: string;
        email: string | null;
        phone: string | null;
        role: string;
        is_active: boolean;
        created_at: string;
        gender: string | null;
        date_of_birth: string | null;
      }
    > = {};

    if (userIds.length) {
      const { data: profs, error: pErr } = await supabase
        .from("profiles")
        .select(
          "id, full_name, email, phone, role, is_active, created_at, gender, date_of_birth"
        )
        .in("id", userIds);
      if (pErr) return apiFail(pErr.message, 500);
      for (const p of profs ?? []) {
        profiles[p.id] = {
          id: p.id,
          full_name: p.full_name,
          email: p.email,
          phone: p.phone ?? null,
          role: p.role,
          is_active: p.is_active !== false,
          created_at: p.created_at,
          gender: (p as { gender?: string | null }).gender ?? null,
          date_of_birth:
            (p as { date_of_birth?: string | null }).date_of_birth ?? null,
        };
      }
    }

    let users = rows.map((pr) => {
      const p = profiles[pr.user_id];
      // Effective online = Live flag + fresh heartbeat. A stale is_online (pro
      // closed the app without going Away) should not show as online.
      const isOnline = Boolean(pr.is_online) && hasRecentLiveHeartbeat(
        (pr as { location_updated_at?: string | null }).location_updated_at,
        Date.now()
      );
      return {
        id: pr.user_id,
        full_name: p?.full_name || pr.business_name || "—",
        email: p?.email ?? null,
        phone: p?.phone ?? null,
        role: p?.role || "repair_pro",
        is_active: p?.is_active !== false,
        created_at: p?.created_at || pr.created_at,
        gender: p?.gender ?? null,
        date_of_birth: p?.date_of_birth ?? null,
        repair_pro_profiles: {
          status: pr.status,
          primary_service: pr.primary_service,
          verified: Boolean(pr.verified),
          is_online: isOnline,
          nin_verified: Boolean(pr.nin_verified),
          bvn_verified: Boolean(pr.bvn_verified),
          business_name: pr.business_name,
          visibility_tier: pr.visibility_tier,
          rating_avg: pr.rating_avg,
          rating_count: pr.rating_count,
        },
      };
    });

    if (q) {
      users = users.filter((u) => {
        const hay = [
          u.full_name,
          u.email,
          u.phone,
          u.repair_pro_profiles.primary_service,
          u.repair_pro_profiles.business_name,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
    }

    const totals = {
      total: users.length,
      pending: users.filter((u) => u.repair_pro_profiles.status === "pending")
        .length,
      approved: users.filter((u) => u.repair_pro_profiles.status === "approved")
        .length,
      suspended: users.filter(
        (u) => u.repair_pro_profiles.status === "suspended"
      ).length,
      rejected: users.filter((u) => u.repair_pro_profiles.status === "rejected")
        .length,
      online: users.filter((u) => u.repair_pro_profiles.is_online).length,
    };

    return apiOk({ users, totals });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return apiFail(e.message, e.status, "auth");
    }
    return apiFail("Failed to list Repair Pros", 500);
  }
}
