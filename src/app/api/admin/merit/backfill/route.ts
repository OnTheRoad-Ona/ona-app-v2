import { apiFail, apiOk } from "@/lib/server/api-json";
import { requireAdmin } from "@/lib/server/admin-auth";
import {
  backfillAllMeritScores,
  recalculateMerit,
} from "@/lib/server/merit/merit-engine";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/merit/backfill
 * Admin: (re)compute merit scores for all approved pros, or a single pro.
 * Body: { proId?: string }
 */
export async function POST(req: Request) {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Supabase is not configured", 503);
  }
  try {
    await requireAdmin();
    const body = (await req.json().catch(() => ({}))) as {
      proId?: string;
    };
    if (body.proId) {
      await recalculateMerit(body.proId);
      return apiOk({ proId: body.proId, recalculated: 1 });
    }
    const result = await backfillAllMeritScores();
    return apiOk(result);
  } catch (e) {
    const err = e as { message?: string; status?: number };
    return apiFail(err.message || "Backfill failed", err.status || 500);
  }
}
