/**
 * Trigger Local BackUp (disk snapshots under Local BackUp/snapshots/).
 * Works when Next runs on this Mac (dev/admin). Safe no-op / soft-fail on Vercel.
 */

import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

type BackupResult = {
  ok: boolean;
  id?: string;
  path?: string;
  tables?: Record<string, number>;
  error?: string;
  reason?: string;
  payments?: number;
};

let inflight: Promise<BackupResult> | null = null;
let lastPaymentBackupAt = 0;
const PAYMENT_DEBOUNCE_MS = 15_000;

function corePath() {
  return resolve(process.cwd(), "Local BackUp/scripts/backup-core.mjs");
}

export async function runLocalBackup(reason = "manual"): Promise<BackupResult> {
  // Serialize concurrent backups
  if (inflight) {
    try {
      await inflight;
    } catch {
      /* continue */
    }
  }

  inflight = (async () => {
    try {
      const href = pathToFileURL(corePath()).href;
      const mod = (await import(/* webpackIgnore: true */ href)) as {
        runBackup: (opts?: {
          reason?: string;
          quiet?: boolean;
        }) => Promise<BackupResult>;
      };
      return await mod.runBackup({
        reason,
        quiet: reason !== "admin_manual" && reason !== "cli",
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Typical on Vercel serverless (no writable project dir / no pg env)
      console.warn("[local-backup]", reason, msg);
      return { ok: false, error: msg, reason };
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

/**
 * Fire-and-forget after payment status changes (held / released / refunded / failed).
 * Debounced so rapid updates don't thrash disk.
 */
export function triggerBackupAfterPaymentChange(
  reason = "payment_status_change",
): void {
  const now = Date.now();
  if (now - lastPaymentBackupAt < PAYMENT_DEBOUNCE_MS) return;
  lastPaymentBackupAt = now;
  void runLocalBackup(reason).then((r) => {
    if (r.ok) {
      console.log("[local-backup] payment →", r.id, r.path);
    }
  });
}

/** Statuses that justify an immediate money snapshot */
export function isMoneyEscrowStatus(
  status?: string | null,
  escrowStatus?: string | null,
): boolean {
  const s = `${status || ""} ${escrowStatus || ""}`.toLowerCase();
  return /held|released|refund|fail|paid|pending/.test(s);
}
