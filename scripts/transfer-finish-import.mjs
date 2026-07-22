#!/usr/bin/env node
/**
 * Finish / repair Ona transfer into NEW Supabase.
 * - Re-exports from OLD via service role (API) where possible
 * - SQL upsert with correct JSON + high timeout
 * - Temporarily relaxes FKs for job_events orphans
 */
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: resolve(root, ".env.local") });

const NEW_URL =
  process.env.NEW_SUPABASE_URL || "https://rvhvzcphzusemwmlffdb.supabase.co";
const NEW_SERVICE =
  process.env.NEW_SUPABASE_SERVICE_ROLE_KEY ||
  "***REMOVED***";
const NEW_DB_PASS =
  process.env.NEW_SUPABASE_DB_PASSWORD || "***REMOVED***";
const OLD_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const OLD_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OLD_DB_PASS = process.env.SUPABASE_DB_PASSWORD;

const REF = NEW_URL.replace("https://", "").replace(".supabase.co", "");
const OLD_REF = (OLD_URL || "").replace("https://", "").replace(".supabase.co", "");

async function connect(ref, password) {
  const enc = encodeURIComponent(password || "");
  const urls = [
    `postgresql://postgres.${ref}:${enc}@aws-0-eu-west-1.pooler.supabase.com:5432/postgres`,
    `postgresql://postgres.${ref}:${enc}@aws-0-eu-west-1.pooler.supabase.com:6543/postgres`,
    `postgresql://postgres:${enc}@db.${ref}.supabase.co:5432/postgres`,
  ];
  let last;
  for (const url of urls) {
    const c = new pg.Client({
      connectionString: url,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 12000,
    });
    try {
      await c.connect();
      await c.query("SET statement_timeout = '180s'");
      console.log("[pg] connected", url.split("@")[1]?.split("/")[0]);
      return c;
    } catch (e) {
      last = e;
      try {
        await c.end();
      } catch {
        /* */
      }
    }
  }
  throw last || new Error("pg connect failed " + ref);
}

/** Prepare value for parameterized insert */
function prep(v) {
  if (v === undefined) return null;
  if (v === null) return null;
  if (typeof v === "string" && v.startsWith("[OMITTED_LARGE_STRING")) return null;
  // Cap huge data-urls so insert does not timeout
  if (typeof v === "string" && v.length > 400_000) {
    if (v.startsWith("data:")) return null;
    return v.slice(0, 400_000);
  }
  if (typeof v === "object" && !(v instanceof Date) && !Buffer.isBuffer(v)) {
    return JSON.stringify(v);
  }
  return v;
}

async function upsertRows(client, table, rows, conflictCol) {
  if (!rows?.length) {
    console.log(`[import] ${table}: empty`);
    return { ok: 0, fail: 0 };
  }
  let ok = 0;
  let fail = 0;
  for (const row of rows) {
    const cleaned = {};
    for (const [k, v] of Object.entries(row)) {
      const p = prep(v);
      // skip undefined keys
      cleaned[k] = p;
    }
    // Drop columns that are pure null and optional huge media if still huge
    const cols = Object.keys(cleaned);
    if (!cols.length) continue;
    const vals = cols.map((c) => cleaned[c]);
    const ph = cols.map((_, i) => `$${i + 1}`).join(", ");
    const colList = cols.map((c) => `"${c}"`).join(", ");
    const updates = cols
      .filter((c) => c !== conflictCol)
      .map((c) => `"${c}" = EXCLUDED."${c}"`)
      .join(", ");
    try {
      if (conflictCol && cols.includes(conflictCol) && updates) {
        await client.query(
          `INSERT INTO public."${table}" (${colList}) VALUES (${ph})
           ON CONFLICT ("${conflictCol}") DO UPDATE SET ${updates}`,
          vals
        );
      } else if (conflictCol && cols.includes(conflictCol)) {
        await client.query(
          `INSERT INTO public."${table}" (${colList}) VALUES (${ph})
           ON CONFLICT ("${conflictCol}") DO NOTHING`,
          vals
        );
      } else {
        await client.query(
          `INSERT INTO public."${table}" (${colList}) VALUES (${ph}) ON CONFLICT DO NOTHING`,
          vals
        );
      }
      ok++;
    } catch (e) {
      fail++;
      if (fail <= 5) {
        console.warn(`[import] ${table} fail:`, e.message.slice(0, 160));
      }
    }
  }
  console.log(`[import] ${table}: ok=${ok} fail=${fail}`);
  return { ok, fail };
}

async function fetchAllOld(table) {
  // Prefer direct SQL from old DB for fidelity
  const oldPg = await connect(OLD_REF, OLD_DB_PASS);
  try {
    const r = await oldPg.query(`SELECT * FROM public."${table}"`);
    console.log(`[export] ${table} rows=${r.rows.length}`);
    return r.rows;
  } finally {
    await oldPg.end();
  }
}

async function main() {
  console.log("[finish] NEW", NEW_URL);
  const newPg = await connect(REF, NEW_DB_PASS);

  // Session: defer FK for bulk load of dependents
  await newPg.query("SET session_replication_role = 'replica'");

  const plan = [
    ["profiles", "id"],
    ["motorist_profiles", "user_id"],
    ["repair_pro_profiles", "user_id"],
    ["service_requests", "id"],
    ["conversations", "id"],
    ["messages", "id"],
    ["payments", "id"],
    ["notifications", "id"],
    ["job_events", "id"],
    ["job_status_events", "id"],
    ["reviews", "id"],
    ["call_signals", "id"],
    ["admin_actions", "id"],
    ["signup_events", "id"],
    ["app_settings", "key"],
  ];

  for (const [table, conflict] of plan) {
    try {
      const rows = await fetchAllOld(table);
      // Write fresh backup
      writeFileSync(
        resolve(root, `tmp-db-transfer/data_${table}.fresh.json`),
        JSON.stringify(rows)
      );
      await upsertRows(newPg, table, rows, conflict);
    } catch (e) {
      console.warn(`[finish] ${table} skipped:`, e.message.slice(0, 120));
    }
  }

  await newPg.query("SET session_replication_role = 'origin'");

  // Verify counts
  console.log("\n[verify] NEW counts:");
  for (const [table] of plan) {
    try {
      const r = await newPg.query(
        `SELECT count(*)::int AS c FROM public."${table}"`
      );
      console.log(table, r.rows[0].c);
    } catch (e) {
      console.log(table, "ERR", e.message.slice(0, 60));
    }
  }

  // Auth check
  const neu = createClient(NEW_URL, NEW_SERVICE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: users } = await neu.auth.admin.listUsers({ perPage: 100 });
  console.log("[verify] auth users", users?.users?.length);

  await newPg.end();
  console.log("[finish] DONE");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
