import { apiFail, apiOk } from "@/lib/server/api-json";
import { requireUser } from "@/lib/server/auth-utils";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { createServiceSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Only the columns the incoming popup needs to decide keep/close + countdown. */
const STATUS_COLUMNS = [
  "id",
  "flow_status",
  "status",
  "pairing_stage",
  "pairing_deadline",
  "repair_pro_id",
  "negotiate_ends_at",
  "updated_at",
].join(", ");

const MAX_IDS = 8;

/**
 * Ultra-light status snapshot for the Repair Pro incoming popup's visible
 * cards. One tiny query (no media / offers / status_history payload) so a
 * customer cancellation is detected within ~1s on the pro's phone even when
 * the realtime push is missed. Scope is always "this pro's own requests".
 */
export async function GET(req: Request) {
  try {
    const auth = await requireUser(req);
    if (!auth.ok) return auth.response;

    const q = new URL(req.url).searchParams;
    const ids = (q.get("ids") || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, MAX_IDS);

    if (ids.length === 0 || !isSupabaseAdminConfigured()) {
      return apiOk({ jobs: [], serverNow: new Date().toISOString() });
    }

    const sb = createServiceSupabase();
    const { data, error } = await sb
      .from("service_requests")
      .select(STATUS_COLUMNS)
      .eq("repair_pro_id", auth.userId)
      .in("id", ids);
    if (error) return apiFail(error.message, 500);

    const rows = (data as unknown as Record<string, unknown>[] | null) ?? [];
    const jobs = rows.map((r) => ({
      id: String(r.id),
      status: String(r.flow_status || r.status || ""),
      pairingStage: r.pairing_stage ? String(r.pairing_stage) : null,
      pairingDeadline: r.pairing_deadline
        ? String(r.pairing_deadline)
        : null,
      repairProId: r.repair_pro_id ? String(r.repair_pro_id) : "",
      negotiateEndsAt: r.negotiate_ends_at ? String(r.negotiate_ends_at) : "",
      updatedAt: r.updated_at ? String(r.updated_at) : "",
    }));
    return apiOk({ jobs, serverNow: new Date().toISOString() });
  } catch (e) {
    return apiFail(
      e instanceof Error ? e.message : "Status check failed",
      500
    );
  }
}
