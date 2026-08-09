#!/usr/bin/env node
/**
 * Import Ona backup (tmp-db-transfer) into a NEW Supabase project.
 * Does NOT change app architecture — only loads data into the new DB.
 *
 * Usage:
 *   NEW_SUPABASE_URL=https://xxxx.supabase.co \
 *   NEW_SUPABASE_SERVICE_ROLE_KEY=eyJ... \
 *   NEW_SUPABASE_DB_PASSWORD=your-db-password \
 *   node scripts/transfer-import-to-new-supabase.mjs
 *
 * Steps:
 *  1) Apply all migrations from supabase/migrations via db:sync against NEW DB
 *  2) Upsert table data from tmp-db-transfer/data_*.json
 *  3) Auth users must be recreated via Admin API (passwords cannot be exported)
 */
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: resolve(root, ".env.local") });

const NEW_URL = process.env.NEW_SUPABASE_URL || "";
const NEW_SERVICE = process.env.NEW_SUPABASE_SERVICE_ROLE_KEY || "";
const NEW_DB_PASS = process.env.NEW_SUPABASE_DB_PASSWORD || "";
const BACKUP = resolve(root, "tmp-db-transfer");

if (!NEW_URL || !NEW_SERVICE) {
  console.error(
    "Set NEW_SUPABASE_URL and NEW_SUPABASE_SERVICE_ROLE_KEY (and NEW_SUPABASE_DB_PASSWORD for SQL)."
  );
  process.exit(1);
}

const REF = NEW_URL.replace("https://", "").replace(".supabase.co", "");
const enc = encodeURIComponent(NEW_DB_PASS);

function dbCandidates() {
  const list = [];
  if (process.env.NEW_DATABASE_URL) list.push(process.env.NEW_DATABASE_URL);
  if (!NEW_DB_PASS) return list;
  for (const r of ["eu-west-1", "eu-central-1", "us-east-1", "us-west-1"]) {
    for (const p of ["aws-0", "aws-1"]) {
      list.push(
        `postgresql://postgres.${REF}:${enc}@${p}-${r}.pooler.supabase.com:6543/postgres`
      );
      list.push(
        `postgresql://postgres.${REF}:${enc}@${p}-${r}.pooler.supabase.com:5432/postgres`
      );
    }
  }
  list.push(`postgresql://postgres:${enc}@db.${REF}.supabase.co:5432/postgres`);
  return list;
}

async function connectPg() {
  let last;
  for (const url of dbCandidates()) {
    const c = new pg.Client({
      connectionString: url,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 10000,
    });
    try {
      await c.connect();
      console.log(
        "[import] connected",
        url.replace(/:[^:@/]+@/, ":***@").split("@")[1]
      );
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
  throw last || new Error("Could not connect to new Postgres");
}

async function applyMigrations(client) {
  const migDir = resolve(root, "supabase/migrations");
  const files = readdirSync(migDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const f of files) {
    const sql = readFileSync(resolve(migDir, f), "utf8");
    try {
      await client.query(sql);
      console.log("[import] migration OK", f);
    } catch (e) {
      console.warn("[import] migration WARN", f, e.message.slice(0, 120));
    }
  }
}

/** Insert order: parents first */
const ORDER = [
  "profiles",
  "rbac_permissions",
  "rbac_roles",
  "rbac_role_permissions",
  "staff_role_assignments",
  "app_settings",
  "feature_flags",
  "motorist_profiles",
  "repair_pro_profiles",
  "service_requests",
  "job_events",
  "job_status_events",
  "conversations",
  "messages",
  "payments",
  "reviews",
  "notifications",
  "bookings",
  "call_signals",
  "admin_actions",
  "signup_events",
  "phone_otps",
  "user_addresses",
  "user_sessions",
  "wallet_accounts",
  "wallet_transactions",
  "payout_accounts",
  "payouts",
  "support_tickets",
  "support_ticket_events",
  "platform_audit_logs",
  "app_health_logs",
];

function isOmitted(v) {
  return typeof v === "string" && v.startsWith("[OMITTED_LARGE_STRING");
}

async function importTable(client, table) {
  const file = resolve(BACKUP, `data_${table}.json`);
  if (!existsSync(file)) {
    console.log("[import] skip missing", table);
    return;
  }
  const rows = JSON.parse(readFileSync(file, "utf8"));
  if (!Array.isArray(rows) || rows.length === 0) {
    console.log("[import] empty", table);
    return;
  }

  // Ensure profiles exist as auth.users stubs first via Admin API for profiles
  let ok = 0;
  let fail = 0;
  for (const row of rows) {
    const cleaned = {};
    for (const [k, v] of Object.entries(row)) {
      if (isOmitted(v)) continue;
      cleaned[k] = v;
    }
    const cols = Object.keys(cleaned);
    if (!cols.length) continue;
    const vals = cols.map((c) => cleaned[c]);
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
    const colList = cols.map((c) => `"${c}"`).join(", ");
    // Upsert on primary-ish keys
    const conflict =
      table === "profiles"
        ? "id"
        : table.endsWith("_profiles") ||
            [
              "motorist_profiles",
              "repair_pro_profiles",
              "wallet_accounts",
              "payout_accounts",
            ].includes(table)
          ? table.includes("motorist") || table.includes("repair_pro")
            ? "user_id"
            : cols[0]
          : cols.includes("id")
            ? "id"
            : null;

    try {
      if (conflict && cols.includes(conflict)) {
        const updates = cols
          .filter((c) => c !== conflict)
          .map((c) => `"${c}" = EXCLUDED."${c}"`)
          .join(", ");
        await client.query(
          `INSERT INTO public."${table}" (${colList}) VALUES (${placeholders})
           ON CONFLICT ("${conflict}") DO UPDATE SET ${updates || conflict + " = EXCLUDED." + conflict}`,
          vals
        );
      } else {
        await client.query(
          `INSERT INTO public."${table}" (${colList}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
          vals
        );
      }
      ok++;
    } catch (e) {
      fail++;
      if (fail <= 3) {
        console.warn(
          `[import] ${table} row fail:`,
          e.message.slice(0, 140)
        );
      }
    }
  }
  console.log(`[import] ${table}: ok=${ok} fail=${fail}`);
}

async function recreateAuthUsers() {
  const authFile = resolve(BACKUP, "auth_users.json");
  if (!existsSync(authFile)) {
    console.warn("[import] no auth_users.json");
    return;
  }
  const users = JSON.parse(readFileSync(authFile, "utf8"));
  const admin = createClient(NEW_URL, NEW_SERVICE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  // Temporary password for imported users — they must reset
  const TEMP = process.env.IMPORT_TEMP_PASSWORD || "OnaImport2026!ChangeMe";
  let ok = 0;
  let fail = 0;
  for (const u of users) {
    if (!u.email) continue;
    try {
      const { data, error } = await admin.auth.admin.createUser({
        id: u.id,
        email: u.email,
        email_confirm: true,
        password: TEMP,
        user_metadata: u.raw_user_meta_data || {},
      });
      if (error) {
        // try without id if already exists
        const r2 = await admin.auth.admin.createUser({
          email: u.email,
          email_confirm: true,
          password: TEMP,
          user_metadata: u.raw_user_meta_data || {},
        });
        if (r2.error) {
          fail++;
          if (fail <= 5) console.warn("[auth]", u.email, r2.error.message);
          continue;
        }
      }
      ok++;
      console.log("[auth] created", u.email);
    } catch (e) {
      fail++;
      console.warn("[auth]", u.email, e.message);
    }
  }
  console.log(
    `[auth] done ok=${ok} fail=${fail}. Temp password for all: ${TEMP}`
  );
}

async function main() {
  if (!existsSync(BACKUP)) {
    console.error("Missing tmp-db-transfer backup folder");
    process.exit(1);
  }
  console.log("[import] target", NEW_URL);

  // Auth first so profile FKs resolve
  await recreateAuthUsers();

  if (!NEW_DB_PASS) {
    console.warn(
      "[import] No NEW_SUPABASE_DB_PASSWORD — skipping SQL table import (run with DB password)."
    );
    return;
  }

  const client = await connectPg();
  try {
    await applyMigrations(client);
    for (const t of ORDER) {
      await importTable(client, t);
    }
    // any remaining data_* files
    for (const f of readdirSync(BACKUP)) {
      if (!f.startsWith("data_") || !f.endsWith(".json")) continue;
      const t = f.slice(5, -5);
      if (ORDER.includes(t)) continue;
      await importTable(client, t);
    }
  } finally {
    await client.end();
  }
  console.log("[import] COMPLETE");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
