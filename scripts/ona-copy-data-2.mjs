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
     where table_schema=$1 and table_name=$2 and is_generated = 'NEVER' order by ordinal_position`,
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

async function copyTable(oldC, newC, schema, table, batch = 50) {
  const types = await getColumnTypes(oldC, schema, table);
  const cols = Object.keys(types);
  const rows = (await oldC.query(`SELECT * FROM ${schema}."${table}"`)).rows;
  if (!rows.length) {
    console.log(`[copy] ${schema}.${table}: 0 rows`);
    return { ok: 0, fail: 0 };
  }
  let ok = 0, fail = 0;
  for (let i = 0; i < rows.length; i += batch) {
    const chunk = rows.slice(i, i + batch);
    for (const row of chunk) {
      const vals = cols.map(c => prep(row[c], types[c]));
      const colList = cols.map(c => `"${c}"`).join(", ");
      const ph = cols.map((_, j) => `$${j + 1}`).join(", ");
      try {
        await newC.query(`INSERT INTO ${schema}."${table}" (${colList}) VALUES (${ph}) ON CONFLICT DO NOTHING`, vals);
        ok++;
      } catch (e) {
        fail++;
        if (fail <= 5) console.warn(`[copy] ${table} row fail:`, e.message.slice(0, 140));
      }
    }
  }
  console.log(`[copy] ${schema}.${table}: ok=${ok} fail=${fail} (${rows.length} rows)`);
  return { ok, fail };
}

async function main() {
  const oldC = await connect(oldUrl);
  const newC = await connect(newUrl);
  console.log("[migrate2] connected");

  // auth.users + identities (exclude generated columns via is_generated='NEVER')
  // Insert with session_replication_role=replica to bypass the on_auth_user_created trigger
  await newC.query("SET session_replication_role = 'replica'");
  await copyTable(oldC, newC, "auth", "users");
  await copyTable(oldC, newC, "auth", "identities");

  // Remaining partial tables
  for (const t of ["identity_sync_log", "merit_scores", "request_pairing_queue", "request_reservations"]) {
    await copyTable(oldC, newC, "public", t);
  }

  await newC.query("SET session_replication_role = 'origin'");
  await oldC.end();
  await newC.end();
  console.log("[migrate2] DONE");
}

main().catch(e => { console.error(e); process.exit(1); });
