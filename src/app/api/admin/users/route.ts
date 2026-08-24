import { AdminAuthError, requireAdmin } from "@/lib/server/admin-auth";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { createServiceSupabase } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * List users with side profiles.
 * Does NOT use nested embeds multiple FKs between profiles and motorist_profiles
 * (user_id + identity_reviewed_by) break PostgREST auto-embed.
 */
export async function GET(req: Request) {
  if (!isSupabaseAdminConfigured()) {
    return apiFail(
      "Supabase is not configured",
      503,
      "supabase_not_configured",
    );
  }
  try {
    await requireAdmin();
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();
    const role = searchParams.get("role");
    const supabase = createServiceSupabase();

    // Special: Repair Pros from side table (includes dual accounts)
    if (role === "repair_pro") {
      const { data: pros, error } = await supabase
        .from("repair_pro_profiles")
        .select(
          "user_id, status, primary_service, verified, is_online, nin_verified, bvn_verified, business_name, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(400);
      if (error) return apiFail(error.message, 500);
      const ids = (pros ?? []).map((p) => p.user_id);
      const { data: profs } = ids.length
        ? await supabase
            .from("profiles")
            .select(
              "id, role, full_name, phone, email, city, area, is_active, created_at, updated_at",
            )
            .in("id", ids)
        : { data: [] as Array<Record<string, unknown>> };
      const byId = new Map((profs ?? []).map((p) => [p.id as string, p]));
      let users = (pros ?? []).map((pr) => {
        const p = byId.get(pr.user_id) as
          | {
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
          | undefined;
        return {
          id: pr.user_id,
          role: p?.role || "repair_pro",
          full_name: p?.full_name || pr.business_name || "",
          phone: p?.phone ?? null,
          email: p?.email ?? null,
          city: p?.city ?? null,
          area: p?.area ?? null,
          is_active: p?.is_active !== false,
          created_at: p?.created_at || pr.created_at,
          updated_at: p?.updated_at || pr.created_at,
          repair_pro_profiles: {
            status: pr.status,
            primary_service: pr.primary_service,
            verified: Boolean(pr.verified),
            is_online: Boolean(pr.is_online),
            nin_verified: Boolean(pr.nin_verified),
            bvn_verified: Boolean(pr.bvn_verified),
          },
          motorist_profiles: null,
        };
      });
      if (q) {
        const ql = q.toLowerCase();
        users = users.filter((u) =>
          [u.full_name, u.email, u.phone]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(ql),
        );
      }
      return apiOk({ users });
    }

    let query = supabase
      .from("profiles")
      .select(
        "id, role, full_name, phone, email, city, area, is_active, created_at, updated_at",
      )
      .order("created_at", { ascending: false })
      .limit(300);

    if (role && ["admin", "motorist", "repair_pro"].includes(role)) {
      query = query.eq("role", role);
    }
    if (q) {
      query = query.or(
        `full_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`,
      );
    }

    const { data: profiles, error } = await query;
    if (error) return apiFail(error.message, 500);

    const ids = (profiles ?? []).map((p) => p.id);
    const motBy = new Map<string, Record<string, unknown>>();
    const proBy = new Map<string, Record<string, unknown>>();

    if (ids.length) {
      const [mots, pros] = await Promise.all([
        supabase
          .from("motorist_profiles")
          .select(
            "user_id, vehicle_make, vehicle_model, vehicle_year, plate_number, nin_verified, bvn_verified, nin_last4, bvn_last4, identity_review_status",
          )
          .in("user_id", ids),
        supabase
          .from("repair_pro_profiles")
          .select(
            "user_id, status, primary_service, verified, is_online, nin_verified, bvn_verified, business_name",
          )
          .in("user_id", ids),
      ]);
      for (const m of mots.data ?? []) motBy.set(m.user_id, m);
      for (const p of pros.data ?? []) proBy.set(p.user_id, p);
    }

    const users = (profiles ?? []).map((p) => {
      const mot = motBy.get(p.id);
      const pro = proBy.get(p.id);
      return {
        ...p,
        motorist_profiles: mot
          ? {
              vehicle_make: mot.vehicle_make,
              vehicle_model: mot.vehicle_model,
              vehicle_year: mot.vehicle_year,
              plate_number: mot.plate_number,
              nin_verified: mot.nin_verified,
              bvn_verified: mot.bvn_verified,
              nin_last4: mot.nin_last4,
              bvn_last4: mot.bvn_last4,
              identity_review_status: mot.identity_review_status,
            }
          : null,
        repair_pro_profiles: pro
          ? {
              status: pro.status,
              primary_service: pro.primary_service,
              verified: pro.verified,
              is_online: pro.is_online,
              nin_verified: pro.nin_verified,
              bvn_verified: pro.bvn_verified,
              business_name: pro.business_name,
            }
          : null,
      };
    });

    return apiOk({ users });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return apiFail(e.message, e.status, "auth");
    }
    return apiFail("Failed to list users", 500);
  }
}
