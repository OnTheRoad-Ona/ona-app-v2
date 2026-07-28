#!/usr/bin/env node
/**
 * Run Local BackUp every 24 hours while this process stays open.
 *
 *   npm run backup:local:watch
 *   node "Local BackUp/scripts/schedule-24h.mjs"
 *
 * First backup runs immediately, then every 24h.
 * Stop with Ctrl+C.
 */

import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const backupScript = resolve(__dirname, "backup-db.mjs");
const DAY_MS = 24 * 60 * 60 * 1000;

function runOnce() {
  return new Promise((resolveP, reject) => {
    console.log("[backup:watch]", new Date().toISOString(), "starting…");
    const child = spawn(process.execPath, [backupScript], {
      stdio: "inherit",
      env: process.env,
    });
    child.on("exit", (code) => {
      if (code === 0) resolveP();
      else reject(new Error(`backup exited ${code}`));
    });
  });
}

async function loop() {
  for (;;) {
    try {
      await runOnce();
    } catch (e) {
      console.error("[backup:watch] error:", e.message || e);
    }
    const next = new Date(Date.now() + DAY_MS).toISOString();
    console.log("[backup:watch] next run at", next);
    await new Promise((r) => setTimeout(r, DAY_MS));
  }
}

loop();
