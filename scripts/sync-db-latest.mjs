#!/usr/bin/env node
/**
 * Sync Supabase Postgres schema to the latest Ona app migrations.
 *
 * Usage:
 *   npm run db:sync
 *   SUPABASE_DB_PASSWORD=... npm run db:sync
 */
import pg from "pg";
import { config } from "dotenv";
import { readdirSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: resolve(root, ".env.local") });
config({ path: resolve(root, ".env") });

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
  // Known working region first (eu-west-1 pooler)
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
      connectionTimeoutMillis: 8000,
    });
    try {
      await c.connect();
      const host = url.replace(/:[^:@/]+@/, ":***@").split("@")[1]?.split("/")[0];
      console.log("[db:sync] Connected via", host);
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

async function main() {
  if (!password && !process.env.DATABASE_URL) {
    console.error(
      "[db:sync] Set SUPABASE_DB_PASSWORD or DATABASE_URL in .env.local"
    );
    process.exit(1);
  }

  const client = await connect();
  try {
    const migDir = resolve(root, "supabase/migrations");
    const files = readdirSync(migDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    for (const f of files) {
      const sql = readFileSync(resolve(migDir, f), "utf8");
      try {
        await client.query(sql);
        console.log("[db:sync] OK", f);
      } catch (e) {
        console.warn(
          "[db:sync] WARN",
          f,
          (e.message || String(e)).slice(0, 180)
        );
      }
    }

    const required = [
      ["service_requests", "flow_status"],
      ["service_requests", "motorist_photo"],
      ["service_requests", "motorist_location_at"],
      ["service_requests", "rating_note"],
      ["service_requests", "offers"],
      ["service_requests", "eta_source"],
      ["service_requests", "pro_location_at"],
      ["payments", "escrow_status"],
      ["job_events", "payload"],
      ["repair_pro_profiles", "labour_prices"],
    ];

    let missing = 0;
    for (const [table, col] of required) {
      const { rows } = await client.query(
        `select 1 from information_schema.columns
         where table_schema = 'public' and table_name = $1 and column_name = $2`,
        [table, col]
      );
      if (rows.length) console.log("[db:sync] ✓", `${table}.${col}`);
      else {
        console.error("[db:sync] ✗ MISSING", `${table}.${col}`);
        missing += 1;
      }
    }

    if (missing) {
      console.error(`[db:sync] ${missing} required column(s) still missing`);
      process.exit(1);
    }
    console.log("[db:sync] Database matches latest Ona app schema.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("[db:sync] Failed:", err.message || err);
  process.exit(1);
});
