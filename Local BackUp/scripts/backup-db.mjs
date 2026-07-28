#!/usr/bin/env node
/**
 * CLI: npm run backup:local
 */
import { runBackup } from "./backup-core.mjs";

runBackup({ reason: "cli" }).then((r) => {
  if (!r.ok) {
    console.error("[backup] Failed:", r.error);
    process.exit(1);
  }
  console.log("[backup] Snapshot", r.id, "→", r.path);
});
