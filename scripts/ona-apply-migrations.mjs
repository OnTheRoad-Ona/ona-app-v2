#!/usr/bin/env node
/**
 * Apply Ona schema migrations from supabase/migrations/*.sql in filename order.
 *
 * Credentials come from env only (dotenv loads .env.local then .env):
 *   DATABASE_URL=postgresql://postgres:...@db.<ref>.supabase.co:5432/postgres
 *   SUPABASE_DB_PASSWORD=...   (builds direct + pooler URLs from the project ref)
 *   SUPABASE_PROJECT_REF=...   (optional; falls back to NEXT_PUBLIC_SUPABASE_URL)
 *
 * Never hardcode the DB password or project ref in this file — rotation must
 * not require editing the repo.
 */
import pg from "pg";
import { readdirSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: resolve(root, ".env.local") });
config({ path: resolve(root, ".env") });

const REF =
  process.env.SUPABASE_PROJECT_REF ||
  (process.env.NEXT_PUBLIC_SUPABASE_URL || "")
    .replace("https://", "")
    .replace(".supabase.co", "")
    .split("/")[0];

const password =
  process.env.SUPABASE_DB_PASSWORD || process.env.POSTGRES_PASSWORD || "";

function buildCandidates() {
  const list = [];
  if (process.env.DATABASE_URL) list.push(process.env.DATABASE_URL);
  if (password && REF) {
    const enc = encodeURIComponent(password);
    list.push(`postgresql://postgres:${enc}@db.${REF}.supabase.co:5432/postgres`);
    for (const region of [
      "aws-0-eu-west-1",
      "aws-1-eu-west-1",
      "aws-0-eu-west-2",
      "aws-1-eu-west-2",
      "aws-0-eu-central-1",
      "aws-1-eu-central-1",
      "aws-0-us-east-1",
      "aws-1-us-east-1",
    ]) {
      list.push(
        `postgresql://postgres.${REF}:${enc}@${region}.pooler.supabase.com:6543/postgres`
      );
    }
  }
  return list;
}

const candidates = buildCandidates();
if (candidates.length === 0) {
  console.error(
    "\n[migrate] Missing database credentials.\n" +
      "Set DATABASE_URL or SUPABASE_DB_PASSWORD (Project Settings -> Database) in .env.local.\n" +
      "Do NOT put the password in this script."
  );
  process.exit(1);
}

let client = null;
let used = "";
for (const url of candidates) {
  const c = new pg.Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });
  try {
    await c.connect();
    client = c;
    used = url.split("@")[1];
    console.log("[migrate] connected", used);
    break;
  } catch {
    try {
      await c.end();
    } catch {
      /* ignore */
    }
  }
}
if (!client) {
  console.error("[migrate] could not connect to Postgres.");
  process.exit(1);
}

await client.query("SET statement_timeout = '300s'");

const dir = resolve(root, "supabase/migrations");
const files = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

let ok = 0;
const warns = [];
for (const f of files) {
  const sql = readFileSync(resolve(dir, f), "utf8");
  try {
    await client.query(sql);
    ok++;
  } catch (e) {
    warns.push([f, e.message]);
  }
}
console.log(`[migrate] ok=${ok} fail=${files.length - ok}`);
for (const [f, m] of warns) console.log("FAIL", f, "=>", m.slice(0, 200));
await client.end();