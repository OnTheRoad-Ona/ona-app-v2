#!/usr/bin/env node
import pg from "pg";
import { readdirSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REF = "qqdokblnpakbxhthgjqv";
const PW = process.env.NEW_SUPABASE_DB_PASSWORD || "***REMOVED***";
const url = `postgresql://postgres.${REF}:${encodeURIComponent(PW)}@aws-1-eu-west-1.pooler.supabase.com:6543/postgres`;

const client = new pg.Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
});
await client.connect();
await client.query("SET statement_timeout = '300s'");
console.log("[migrate] connected", url.split("@")[1]);

const dir = resolve(root, "supabase/migrations");
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

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
