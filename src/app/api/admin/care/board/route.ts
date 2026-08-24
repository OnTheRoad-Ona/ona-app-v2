import { AdminAuthError, requirePermission } from "@/lib/server/admin-auth";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { careLiveBoard } from "@/lib/server/modules/care-service";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!isSupabaseAdminConfigured()) {
    return apiFail(
      "Supabase is not configured",
      503,
      "supabase_not_configured",
    );
  }
  try {
    await requirePermission("view_board");
    const board = await careLiveBoard();
    return apiOk(board);
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return apiFail(e.message, e.status, e.code || "auth");
    }
    return apiFail("Board failed", 500);
  }
}
