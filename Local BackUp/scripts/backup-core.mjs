#!/usr/bin/env node
/**
 * Shared Local BackUp runner — CLI + admin API + payment hooks.
 * Writes: Local BackUp/snapshots/<timestamp>/
 *
 * pg is resolved from the project root via createRequire so Vercel/serverless
 * (`/var/task/...`) and local `node Local BackUp/scripts/...` both find it.
 */

import { config } from "dotenv";
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  existsSync,
} from "node:fs";
import { createRequire } from "node:module";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "../..");
const backupRoot = resolve(root, "Local BackUp");
const snapshotsDir = resolve(backupRoot, "snapshots");

/** Load `pg` from project root (never from the script path alone). */
function loadPg() {
  const candidates = [
    resolve(root, "package.json"),
    resolve(process.cwd(), "package.json"),
    resolve(__dirname, "../../package.json"),
  ];
  let lastErr;
  for (const pkg of candidates) {
    try {
      if (!existsSync(pkg)) continue;
      const require = createRequire(pkg);
      const mod = require("pg");
      if (mod?.Client || mod?.default?.Client || mod) return mod.default || mod;
    } catch (e) {
      lastErr = e;
    }
  }
  // Last resort: dynamic import (works when package is in node_modules of cwd)
  try {
    const require = createRequire(resolve(process.cwd(), "package.json"));
    return require("pg");
  } catch (e) {
    const msg =
      (lastErr instanceof Error ? lastErr.message : String(lastErr || e)) ||
      "pg not found";
    throw new Error(
      `Cannot load package 'pg' for backup. Run npm install pg in project root. (${msg})`
    );
  }
}

const pg = loadPg();

config({ path: resolve(root, ".env.local") });
config({ path: resolve(root, ".env") });

const CRITICAL_TABLES = [
  "payments",
  "service_requests",
  "job_status_events",
  "job_events",
  "profiles",
  "motorist_profiles",
  "repair_pro_profiles",
  "conversations",
  "messages",
  "payout_accounts",
  "payouts",
  "support_tickets",
  "audit_logs",
  "app_settings",
];

const KEEP_SNAPSHOTS = Number(process.env.BACKUP_KEEP || 30);

const REF =
  process.env.SUPABASE_PROJECT_REF ||
  (process.env.NEXT_PUBLIC_SUPABASE_URL || "")
    .replace("https://", "")
    .replace(".supabase.co", "")
    .split("/")[0] ||
  "";

const password =
  process.env.SUPABASE_DB_PASSWORD || process.env.POSTGRES_PASSWORD || "";

function candidates() {
  const list = [];
  if (process.env.DATABASE_URL) list.push(process.env.DATABASE_URL);
  if (!password || !REF) return list;
  const enc = encodeURIComponent(password);
  const regions = [
    "eu-west-1",
    "eu-central-1",
    "us-east-1",
    "us-west-1",
    "ap-southeast-1",
  ];
  for (const r of regions) {
    list.push(
      `postgresql://postgres.${REF}:${enc}@aws-0-${r}.pooler.supabase.com:6543/postgres`
    );
    list.push(
      `postgresql://postgres.${REF}:${enc}@aws-0-${r}.pooler.supabase.com:5432/postgres`
    );
  }
  list.push(
    `postgresql://postgres:${enc}@db.${REF}.supabase.co:5432/postgres`
  );
  return list;
}

async function connect() {
  let lastErr;
  for (const url of candidates()) {
    const c = new pg.Client({
      connectionString: url,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 10000,
    });
    try {
      await c.connect();
      return c;
    } catch (e) {
      lastErr = e;
      try {
        await c.end();
      } catch {
        /* */
      }
    }
  }
  throw lastErr || new Error("Could not connect to Postgres");
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
}

function pruneOldSnapshots() {
  if (!existsSync(snapshotsDir)) return;
  const dirs = readdirSync(snapshotsDir)
    .filter((n) => {
      try {
        return statSync(join(snapshotsDir, n)).isDirectory();
      } catch {
        return false;
      }
    })
    .sort()
    .reverse();
  for (const old of dirs.slice(KEEP_SNAPSHOTS)) {
    rmSync(join(snapshotsDir, old), { recursive: true, force: true });
  }
}

function sqlLiteral(v) {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (v instanceof Date) return `'${v.toISOString()}'`;
  if (typeof v === "object") {
    return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  }
  return `'${String(v).replace(/'/g, "''")}'`;
}

function rowsToInsertSql(table, rows) {
  if (!rows.length) return `-- ${table}: 0 rows\n`;
  const cols = Object.keys(rows[0]);
  const lines = [`-- ${table}: ${rows.length} rows`, `BEGIN;`];
  for (const row of rows) {
    const vals = cols.map((c) => sqlLiteral(row[c])).join(", ");
    lines.push(
      `INSERT INTO public.${table} (${cols.join(", ")}) VALUES (${vals}) ON CONFLICT DO NOTHING;`
    );
  }
  lines.push("COMMIT;", "");
  return lines.join("\n");
}

async function tableExists(client, name) {
  const { rows } = await client.query(
    `select 1 from information_schema.tables
     where table_schema = 'public' and table_name = $1`,
    [name]
  );
  return rows.length > 0;
}

function readFileSafe(p) {
  try {
    return readFileSync(p, "utf8");
  } catch {
    return null;
  }
}

/**
 * @param {{ reason?: string; quiet?: boolean }} [opts]
 * @returns {Promise<{ ok: boolean; id?: string; path?: string; tables?: Record<string, number>; error?: string; reason?: string }>}
 */
export async function runBackup(opts = {}) {
  const reason = opts.reason || "manual";
  const quiet = Boolean(opts.quiet);
  const log = (...a) => {
    if (!quiet) console.log(...a);
  };

  if (!password && !process.env.DATABASE_URL) {
    return {
      ok: false,
      error: "Set SUPABASE_DB_PASSWORD or DATABASE_URL in .env.local",
      reason,
    };
  }

  try {
    mkdirSync(snapshotsDir, { recursive: true });
    const id = stamp();
    const outDir = join(snapshotsDir, id);
    mkdirSync(outDir, { recursive: true });

    const client = await connect();
    const manifest = {
      id,
      createdAt: new Date().toISOString(),
      projectRef: REF,
      reason,
      purpose:
        "Local fallout backup: payments, jobs, banks — dispute failed charges / restore evidence",
      tables: {},
    };

    try {
      for (const table of CRITICAL_TABLES) {
        if (!(await tableExists(client, table))) {
          log("[backup] skip (missing)", table);
          continue;
        }
        const { rows } = await client.query(
          `select * from public.${table} order by 1`
        );
        writeFileSync(
          join(outDir, `${table}.json`),
          JSON.stringify(rows, null, 2),
          "utf8"
        );
        writeFileSync(
          join(outDir, `${table}.sql`),
          rowsToInsertSql(table, rows),
          "utf8"
        );
        manifest.tables[table] = { rows: rows.length, json: `${table}.json` };
        log(`[backup] ✓ ${table}: ${rows.length} rows`);
      }

      if (manifest.tables.payments) {
        const payments = JSON.parse(
          readFileSafe(join(outDir, "payments.json")) || "[]"
        );
        const ledger = payments.map((p) => ({
          id: p.id,
          request_id: p.request_id,
          status: p.status,
          escrow_status: p.escrow_status,
          amount_kobo: p.amount_kobo ?? p.amount_minor,
          currency: p.currency,
          provider: p.provider,
          provider_ref: p.provider_ref,
          paid_at: p.paid_at,
          released_at: p.released_at,
          refunded_at: p.refunded_at,
          motorist_id: p.motorist_id,
          repair_pro_id: p.repair_pro_id,
          created_at: p.created_at,
          updated_at: p.updated_at,
        }));
        writeFileSync(
          join(outDir, "PAYMENT_LEDGER.json"),
          JSON.stringify(ledger, null, 2),
          "utf8"
        );
        const held = ledger.filter(
          (p) =>
            String(p.escrow_status || "").toLowerCase() === "held" ||
            String(p.status || "").toLowerCase() === "paid"
        );
        const failed = ledger.filter((p) =>
          /fail|error|declin/i.test(String(p.status || p.escrow_status || ""))
        );
        writeFileSync(
          join(outDir, "PAYMENT_ALERTS.json"),
          JSON.stringify(
            {
              note: "Review held vs failed for chargebacks / double deduct",
              heldCount: held.length,
              failedCount: failed.length,
              held,
              failed,
            },
            null,
            2
          ),
          "utf8"
        );
      }

      writeFileSync(
        join(outDir, "manifest.json"),
        JSON.stringify(manifest, null, 2),
        "utf8"
      );
      writeFileSync(
        join(outDir, "README.txt"),
        [
          "Ona Local BackUp snapshot",
          `id: ${id}`,
          `created: ${manifest.createdAt}`,
          `reason: ${reason}`,
          `project: ${REF}`,
          "",
          "Use PAYMENT_LEDGER.json for money disputes.",
          "",
        ].join("\n"),
        "utf8"
      );
      writeFileSync(join(snapshotsDir, "LATEST.txt"), `${id}\n`, "utf8");
      pruneOldSnapshots();
      log("[backup] Done →", outDir);

      const tableCounts = Object.fromEntries(
        Object.entries(manifest.tables).map(([k, v]) => [k, v.rows])
      );
      return {
        ok: true,
        id,
        path: outDir,
        tables: tableCounts,
        reason,
        payments: tableCounts.payments ?? 0,
      };
    } finally {
      await client.end();
    }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      reason,
    };
  }
}

// CLI entry
const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isMain) {
  runBackup({ reason: "cli" }).then((r) => {
    if (!r.ok) {
      console.error("[backup] Failed:", r.error);
      process.exit(1);
    }
  });
}
