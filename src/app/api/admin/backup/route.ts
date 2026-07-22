import { AdminAuthError, requireAdmin } from "@/lib/server/admin-auth";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { runLocalBackup } from "@/lib/server/local-backup-trigger";
import { writeAuditLog } from "@/lib/server/modules/audit";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/admin/backup — Care desk "Backup now"
 * Writes Local BackUp/snapshots on the machine running Next (local admin).
 */
export async function POST() {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Supabase is not configured", 503, "supabase_not_configured");
  }
  try {
    const { session, adminRole } = await requireAdmin();
    const result = await runLocalBackup("admin_manual");

    await writeAuditLog({
      adminId: session.userId,
      action: "local_backup_manual",
      meta: {
        ok: result.ok,
        path: result.path,
        payments: result.payments,
        error: result.error,
        adminRole,
        snapshotId: result.id || "failed",
      },
    }).catch(() => undefined);

    if (!result.ok) {
      return apiFail(
        result.error ||
          "Backup failed. Run admin on this Mac (npm run dev:admin) with SUPABASE_DB_PASSWORD set, or use npm run backup:local.",
        500,
        "backup_failed"
      );
    }

    return apiOk({
      message: `Local backup saved: ${result.id}`,
      id: result.id,
      path: result.path,
      payments: result.payments ?? 0,
      tables: result.tables,
    });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return apiFail(e.message, e.status, e.code || "auth");
    }
    return apiFail(
      e instanceof Error ? e.message : "Backup failed",
      500
    );
  }
}

/** GET — last snapshot id from LATEST.txt if present */
export async function GET() {
  try {
    await requireAdmin();
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return apiFail(e.message, e.status, e.code || "auth");
    }
    return apiFail("Unauthorized", 401);
  }

  try {
    const { readFileSync, existsSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const latestPath = resolve(
      process.cwd(),
      "Local BackUp/snapshots/LATEST.txt"
    );
    if (!existsSync(latestPath)) {
      return apiOk({ latest: null, message: "No snapshots yet" });
    }
    const latest = readFileSync(latestPath, "utf8").trim();
    return apiOk({
      latest,
      path: resolve(process.cwd(), "Local BackUp/snapshots", latest),
    });
  } catch {
    return apiOk({ latest: null, message: "Could not read LATEST.txt" });
  }
}
