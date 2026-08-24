import { AdminAuthError, requireAdmin } from "@/lib/server/admin-auth";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { runLocalBackup } from "@/lib/server/local-backup-trigger";
import { writeAuditLog } from "@/lib/server/modules/audit";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/admin/backup Care desk "Backup now"
 * Writes Local BackUp/snapshots on the machine running Next (local admin).
 */
export async function POST() {
  if (!isSupabaseAdminConfigured()) {
    return apiFail(
      "Supabase is not configured",
      503,
      "supabase_not_configured",
    );
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
        "backup_failed",
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
    return apiFail(e instanceof Error ? e.message : "Backup failed", 500);
  }
}

/**
 * GET latest snapshot + searchable directory listing (Admin / Care only).
 * Query: ?q=payment filters snapshot folders and files by name.
 */
export async function GET(req: Request) {
  try {
    const { adminRole } = await requireAdmin();
    // L3+ only for backup browser (ops/finance and above)
    if (adminRole === "customer_care" || adminRole === "senior_support") {
      return apiFail(
        "Only Operations (L3)+ can view backend backup files.",
        403,
        "backup_forbidden",
      );
    }
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return apiFail(e.message, e.status, e.code || "auth");
    }
    return apiFail("Unauthorized", 401);
  }

  try {
    const { readFileSync, existsSync, readdirSync, statSync } =
      await import("node:fs");
    const { resolve, join } = await import("node:path");
    const url = new URL(req.url);
    const q = (url.searchParams.get("q") || "").trim().toLowerCase();
    const snapshotsRoot = resolve(process.cwd(), "Local BackUp/snapshots");
    const latestPath = join(snapshotsRoot, "LATEST.txt");

    let latest: string | null = null;
    if (existsSync(latestPath)) {
      latest = readFileSync(latestPath, "utf8").trim() || null;
    }

    type FileEntry = {
      name: string;
      path: string;
      size: number;
      kind: "dir" | "file";
    };
    type SnapshotEntry = {
      id: string;
      path: string;
      files: FileEntry[];
      fileCount: number;
    };

    const snapshots: SnapshotEntry[] = [];
    if (existsSync(snapshotsRoot)) {
      const dirs = readdirSync(snapshotsRoot)
        .filter((n) => {
          try {
            return (
              n !== "LATEST.txt" &&
              statSync(join(snapshotsRoot, n)).isDirectory()
            );
          } catch {
            return false;
          }
        })
        .sort()
        .reverse()
        .slice(0, 40);

      for (const id of dirs) {
        if (q && !id.toLowerCase().includes(q)) {
          // Still include if any file matches q
        }
        const dirPath = join(snapshotsRoot, id);
        let names: string[] = [];
        try {
          names = readdirSync(dirPath);
        } catch {
          names = [];
        }
        const files: FileEntry[] = [];
        for (const name of names) {
          if (
            q &&
            !id.toLowerCase().includes(q) &&
            !name.toLowerCase().includes(q)
          ) {
            continue;
          }
          try {
            const p = join(dirPath, name);
            const st = statSync(p);
            files.push({
              name,
              path: p,
              size: st.size,
              kind: st.isDirectory() ? "dir" : "file",
            });
          } catch {
            /* skip */
          }
        }
        if (q && files.length === 0 && !id.toLowerCase().includes(q)) {
          continue;
        }
        snapshots.push({
          id,
          path: dirPath,
          files: files.slice(0, 80),
          fileCount: files.length,
        });
      }
    }

    return apiOk({
      latest,
      path: latest
        ? resolve(process.cwd(), "Local BackUp/snapshots", latest)
        : null,
      snapshots,
      search: q || null,
      message: latest ? `Latest: ${latest}` : "No snapshots yet",
    });
  } catch {
    return apiOk({
      latest: null,
      snapshots: [],
      message: "Could not read backup directory",
    });
  }
}
