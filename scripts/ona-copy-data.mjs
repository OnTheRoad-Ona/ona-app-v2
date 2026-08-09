#!/usr/bin/env node
import pg from "pg";
import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: resolve(root, ".env.local") });

const OLD_REF = process.env.NEXT_PUBLIC_SUPABASE_URL.replace("https://", "").replace(".supabase.co", "").split("/")[0];
const OLD_PW = process.env.SUPABASE_DB_PASSWORD;
const NEW_REF = "qqdokblnpakbxhthgjqv";
const NEW_PW = process.env.NEW_SUPABASE_DB_PASSWORD || "***REMOVED***";

const oldUrl = `postgresql://postgres.${OLD_REF}:${encodeURIComponent(OLD_PW)}@aws-0-eu-west-1.pooler.supabase.com:6543/postgres`;
const newUrl = `postgresql://postgres.${NEW_REF}:${encodeURIComponent(NEW_PW)}@aws-1-eu-west-1.pooler.supabase.com:6543/postgres`;

async function connect(url) {
  const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });
  await c.connect();
  return c;
}

function isJsonType(t) { return t === "json" || t === "jsonb"; }

async function getColumnTypes(client, schema, table) {
  const r = await client.query(
    `select column_name, data_type from information_schema.columns
     where table_schema=$1 and table_name=$2 order by ordinal_position`,
    [schema, table]
  );
  const m = {};
  for (const row of r.rows) m[row.column_name] = row.data_type;
  return m;
}

function prep(value, type) {
  if (value === undefined || value === null) return null;
  if (isJsonType(type) && typeof value === "object") return JSON.stringify(value);
  if (type === "ARRAY") {
    if (Array.isArray(value)) return `{${value.map(v => JSON.stringify(String(v))).join(",")}}`;
  }
  return value;
}

async function copyTable(oldC, newC, schema, table) {
  const types = await getColumnTypes(oldC, schema, table);
  let cols = Object.keys(types);
  // For auth schema, intersect with new table's columns to survive GoTrue version diffs
  if (schema === "auth") {
    const newCols = (await newC.query(
      `select column_name from information_schema.columns where table_schema=$1 and table_name=$2`,
      [schema, table]
    )).rows.map(r => r.column_name);
    cols = cols.filter(c => newCols.includes(c));
    console.log(`[copy] ${schema}.${table}: intersecting columns -> ${cols.join(",")}`);
  }
  const rows = (await oldC.query(`SELECT * FROM ${schema}."${table}"`)).rows;
  if (!rows.length) {
    console.log(`[copy] ${schema}.${table}: 0 rows (empty)`);
    return { ok: 0, fail: 0 };
  }
  let ok = 0, fail = 0;
  for (const row of rows) {
    const vals = cols.map(c => prep(row[c], types[c]));
    const colList = cols.map(c => `"${c}"`).join(", ");
    const ph = cols.map((_, i) => `$${i + 1}`).join(", ");
    try {
      await newC.query(`INSERT INTO ${schema}."${table}" (${colList}) VALUES (${ph}) ON CONFLICT DO NOTHING`, vals);
      ok++;
    } catch (e) {
      fail++;
      if (fail <= 5) console.warn(`[copy] ${table} row fail:`, e.message.slice(0, 140));
    }
  }
  console.log(`[copy] ${schema}.${table}: ok=${ok} fail=${fail} (${rows.length} rows)`);
  return { ok, fail };
}

async function main() {
  const oldC = await connect(oldUrl);
  const newC = await connect(newUrl);
  console.log("[migrate] connected old + new");

  // Session: disable FK + triggers during bulk load to avoid ordering issues
  await newC.query("SET session_replication_role = 'replica'");

  // 1. auth.users (preserve password hashes + IDs)
  await copyTable(oldC, newC, "auth", "users");
  // 2. auth.identities (required for login)
  await copyTable(oldC, newC, "auth", "identities");

  // 3. public tables in FK-safe order
  const order = [
    "profiles",
    "rbac_permissions", "rbac_roles", "app_settings", "feature_flags", "system_settings",
    "rbac_role_permissions", "staff_role_assignments", "user_roles",
    "motorist_profiles", "repair_pro_profiles", "repair_pro_guarantors",
    "service_requests",
    "job_events", "job_status_events", "bookings", "conversations", "messages",
    "payments", "reviews",
    "notifications",
    "credit_wallets", "referral_codes",
    "credit_transactions", "cashout_requests", "service_credit_payments",
    "referral_events", "fraud_flags",
    "admin_actions", "call_signals", "signup_events", "phone_otps",
    "user_addresses", "user_sessions", "wallet_accounts", "wallet_transactions",
    "payout_accounts", "payout_methods", "payouts", "payout_transfer_ledger",
    "support_tickets", "support_ticket_events", "platform_audit_logs", "app_health_logs",
    "identity_merges", "identity_sync_log", "merit_scores", "pro_reviews",
    "profile_audit_log", "name_change_requests", "contact_change_requests",
    "request_pairing_queue", "request_reservations",
  ];

  // Any extra public tables not listed
  const all = (await oldC.query("select tablename from pg_tables where schemaname='public' and tablename not in (select unnest($1::text[])) order by 1", [order])).rows.map(r => r.tablename);

  for (const t of [...order, ...all]) {
    try {
      await copyTable(oldC, newC, "public", t);
    } catch (e) {
      console.warn(`[copy] ${t} skipped:`, e.message.slice(0, 120));
    }
  }

  await newC.query("SET session_replication_role = 'origin'");
  await oldC.end();
  await newC.end();
  console.log("[migrate] DONE");
}

main().catch(e => { console.error(e); process.exit(1); });
