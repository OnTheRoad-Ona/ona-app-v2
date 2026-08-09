#!/usr/bin/env node
/**
 * Apply Ona schema + seed Super Admin directly on Postgres.
 *
 * Requires one of:
 *   DATABASE_URL=postgresql://postgres:...@db.<ref>.supabase.co:5432/postgres
 *   SUPABASE_DB_PASSWORD=...  (builds URL for project ref)
 *
 * Usage:
 *   SUPABASE_DB_PASSWORD='your-db-password' npm run db:apply
 *   DATABASE_URL='postgresql://...' npm run db:apply
 */
import pg from "pg";
import { config } from "dotenv";
import { readFileSync } from "node:fs";
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
  "akasyjovvyhtmzpkliay";

const email =
  process.env.ADMIN_SEED_EMAIL || "Oluwatosinabdullahime@gmail.com";
const fullName = process.env.ADMIN_SEED_NAME || "Oluwatosin Abdullah";
const adminAuthId =
  process.env.ADMIN_AUTH_USER_ID || "d2e5f02b-2d60-4c6c-944d-ea3898336660";

function buildDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const password =
    process.env.SUPABASE_DB_PASSWORD || process.env.POSTGRES_PASSWORD || "";
  if (!password) return "";
  const encoded = encodeURIComponent(password);
  // Prefer direct connection (port 5432); pooler as fallback handled by caller
  return `postgresql://postgres:${encoded}@db.${REF}.supabase.co:5432/postgres`;
}

async function main() {
  const sqlPath = resolve(
    root,
    "supabase/migrations/20260714_002_bootstrap_idempotent.sql"
  );
  let sql = readFileSync(sqlPath, "utf8");

  // Ensure admin id/email match env even if SQL file has defaults
  sql = sql.replace(
    /'d2e5f02b-2d60-4c6c-944d-ea3898336660'/g,
    `'${adminAuthId}'`
  );
  sql = sql.replace(
    /'oluwatosinabdullahime@gmail\.com'/g,
    `'${email.toLowerCase()}'`
  );
  sql = sql.replace(/'Oluwatosin Abdullah'/g, `'${fullName.replace(/'/g, "''")}'`);

  const password =
    process.env.SUPABASE_DB_PASSWORD || process.env.POSTGRES_PASSWORD || "";
  const candidates = [];
  if (process.env.DATABASE_URL) candidates.push(process.env.DATABASE_URL);
  if (password) {
    const enc = encodeURIComponent(password);
    candidates.push(
      `postgresql://postgres:${enc}@db.${REF}.supabase.co:5432/postgres`
    );
    candidates.push(
      `postgresql://postgres.${REF}:${enc}@aws-0-eu-west-1.pooler.supabase.com:6543/postgres`
    );
    candidates.push(
      `postgresql://postgres.${REF}:${enc}@aws-1-eu-west-1.pooler.supabase.com:6543/postgres`
    );
    candidates.push(
      `postgresql://postgres.${REF}:${enc}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`
    );
    candidates.push(
      `postgresql://postgres.${REF}:${enc}@aws-1-us-east-1.pooler.supabase.com:6543/postgres`
    );
    candidates.push(
      `postgresql://postgres.${REF}:${enc}@aws-0-eu-central-1.pooler.supabase.com:6543/postgres`
    );
    candidates.push(
      `postgresql://postgres.${REF}:${enc}@aws-1-eu-central-1.pooler.supabase.com:6543/postgres`
    );
    candidates.push(
      `postgresql://postgres:${enc}@db.${REF}.supabase.co:6543/postgres`
    );
  }

  if (candidates.length === 0) {
    console.error(`
[apply-schema] Missing database password.

I cannot create tables with only the API publishable/secret keys.
Paste your Supabase **database password** (Project Settings → Database), then:

  SUPABASE_DB_PASSWORD='your-password' npm run db:apply

Or set DATABASE_URL to the full Postgres connection string.
`);
    process.exit(1);
  }

  let client;
  let used = "";
  let lastErr;
  for (const url of candidates) {
    const c = new pg.Client({
      connectionString: url,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 12000,
    });
    try {
      await c.connect();
      client = c;
      used = url.replace(/:[^:@/]+@/, ":***@");
      console.log("[apply-schema] Connected via", used);
      break;
    } catch (e) {
      lastErr = e;
      try {
        await c.end();
      } catch {
        /* ignore */
      }
    }
  }

  if (!client) {
    console.error("[apply-schema] Could not connect to Postgres.");
    console.error(lastErr?.message || lastErr);
    console.error(
      "Check SUPABASE_DB_PASSWORD (the DB password from project creation / Settings → Database), not the API secret key."
    );
    process.exit(1);
  }

  try {
    console.log("[apply-schema] Applying schema + admin seed…");
    await client.query(sql);
    const { rows } = await client.query(
      `select id, role, email, is_active, full_name
       from public.profiles
       where email = $1 or id = $2::uuid`,
      [email.toLowerCase(), adminAuthId]
    );
    console.log("[apply-schema] Admin profile(s):", rows);
    const { rows: tables } = await client.query(
      `select tablename from pg_tables where schemaname = 'public' order by 1`
    );
    console.log(
      "[apply-schema] Public tables:",
      tables.map((t) => t.tablename).join(", ")
    );
    console.log("[apply-schema] Done.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("[apply-schema] Failed:", err.message || err);
  process.exit(1);
});
