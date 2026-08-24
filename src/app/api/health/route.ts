import { apiFail, apiOk } from "@/lib/server/api-json";
import { runFullHealthCheck } from "@/lib/server/health-service";
import { AdminAuthError, requireAdmin } from "@/lib/server/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/health aggregated ops health snapshot (admin session required).
 * Public ping: use GET /api/health?public=1 for shallow liveness only.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get("public") === "1") {
    return apiOk({
      ok: true,
      service: "ona",
      ts: new Date().toISOString(),
    });
  }

  try {
    await requireAdmin();
    const snapshot = await runFullHealthCheck();
    return apiOk({ snapshot });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return apiFail(e.message, e.status, "auth");
    }
    console.error("[health]", e);
    return apiFail("Health check failed", 500);
  }
}
