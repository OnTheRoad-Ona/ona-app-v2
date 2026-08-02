/**
 * POST — one-shot dual-role T2 mirror backfill (Admin / Care).
 * For users already approved on only Customer or only Pro side.
 */
import { AdminAuthError, requireAdmin } from "@/lib/server/admin-auth";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { backfillDualRoleT2Mirrors } from "@/lib/server/identity/dual-t2-mirror";
import { createServiceSupabase } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Server not configured", 503);
  }
  try {
    await requireAdmin();
    const supabase = createServiceSupabase();
    const result = await backfillDualRoleT2Mirrors(supabase, { limit: 800 });
    return apiOk({
      ...result,
      message: `Dual T2 backfill: scanned ${result.scanned}, updated ${result.updated}.`,
    });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return apiFail(e.message, e.status, e.code || "auth");
    }
    return apiFail(
      e instanceof Error ? e.message : "Backfill failed",
      500
    );
  }
}
