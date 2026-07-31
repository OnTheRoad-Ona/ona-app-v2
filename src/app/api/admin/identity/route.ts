import { AdminAuthError, requireAdmin } from "@/lib/server/admin-auth";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { createServiceSupabase } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { detectMergeCandidates } from "@/lib/server/identity/identity-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Admin identity/account sync board. */
export async function GET() {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Supabase is not configured", 503, "supabase_not_configured");
  }
  try {
    const { session } = await requireAdmin();
    const supabase = createServiceSupabase();

    const [rolesRes, motsRes, prosRes, mergesRes, logRes] = await Promise.all([
      supabase.from("user_roles").select("user_id, role_type").limit(20_000),
      supabase.from("motorist_profiles").select("user_id").limit(20_000),
      supabase.from("repair_pro_profiles").select("user_id").limit(20_000),
      supabase
        .from("identity_merges")
        .select("*")
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("identity_sync_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(40),
    ]);

    const motSet = new Set<string>();
    const proSet = new Set<string>();
    for (const m of (motsRes.data ?? []) as { user_id?: string }[]) {
      motSet.add(String(m.user_id));
    }
    for (const p of (prosRes.data ?? []) as { user_id?: string }[]) {
      proSet.add(String(p.user_id));
    }

    const rolesByUser = new Map<string, Set<string>>();
    for (const r of (rolesRes.data ?? []) as { user_id?: string; role_type?: string }[]) {
      const id = String(r.user_id);
      if (!rolesByUser.has(id)) rolesByUser.set(id, new Set());
      rolesByUser.get(id)!.add(String(r.role_type));
    }

    const allIds = new Set<string>([...motSet, ...proSet, ...rolesByUser.keys()]);
    let motoristOnly = 0;
    let proOnly = 0;
    let dual = 0;
    let needsSync = 0;
    for (const id of allIds) {
      const hasM = motSet.has(id);
      const hasP = proSet.has(id);
      if (hasM && hasP) dual += 1;
      else if (hasM) motoristOnly += 1;
      else proOnly += 1;

      const reg = rolesByUser.get(id) || new Set<string>();
      if (reg.has("motorist") !== hasM || reg.has("repair_pro") !== hasP) {
        needsSync += 1;
      }
    }

    // Merge candidates with names.
    const merges = (mergesRes.data ?? []) as Record<string, unknown>[];
    const ids = new Set<string>();
    for (const m of merges) {
      ids.add(String(m.primary_user_id));
      ids.add(String(m.duplicate_user_id));
    }
    const { data: profs } =
      ids.size > 0
        ? await supabase
            .from("profiles")
            .select("id, full_name, email, phone, created_at")
            .in("id", [...ids])
        : { data: [] as Record<string, unknown>[] };
    const byId = new Map<string, Record<string, unknown>>();
    for (const p of profs ?? []) byId.set(String(p.id), p);
    const mergesWithNames = merges.map((m) => ({
      ...m,
      primary_name:
        (byId.get(String(m.primary_user_id))?.full_name as string) || "User",
      primary_email: byId.get(String(m.primary_user_id))?.email ?? null,
      duplicate_name:
        (byId.get(String(m.duplicate_user_id))?.full_name as string) || "User",
      duplicate_email: byId.get(String(m.duplicate_user_id))?.email ?? null,
    }));

    return apiOk({
      summary: {
        motoristOnly,
        proOnly,
        dual,
        total: allIds.size,
        needsSync,
        pendingMerges: merges.length,
      },
      merges: mergesWithNames,
      syncLog: (logRes.data ?? []) as unknown[],
      adminName: session.fullName || session.email,
    });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return apiFail(e.message, e.status, "auth");
    }
    return apiFail("Failed to load identity board", 500);
  }
}

export async function POST(req: Request) {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Supabase is not configured", 503, "supabase_not_configured");
  }
  try {
    const { session } = await requireAdmin();
    const supabase = createServiceSupabase();

    const body = (await req.json().catch(() => ({}))) as {
      action?: string;
    };
    if (body?.action !== "scan") {
      return apiFail("Invalid action", 400);
    }

    const result = await detectMergeCandidates(supabase, {
      actor: { userId: session.userId, source: "admin_scan" },
    });
    if (result.error) return apiFail(result.error, 500);

    return apiOk({
      added: result.added,
      message: `Scanned for duplicate identities — ${result.added} new candidate(s) queued for review.`,
    });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return apiFail(e.message, e.status, "auth");
    }
    return apiFail("Scan failed", 500);
  }
}
