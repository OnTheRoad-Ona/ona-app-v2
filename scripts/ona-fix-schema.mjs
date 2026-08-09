#!/usr/bin/env node
import pg from "pg";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REF = "qqdokblnpakbxhthgjqv";
const PW = "***REMOVED***";
const url = `postgresql://postgres.${REF}:${encodeURIComponent(PW)}@aws-1-eu-west-1.pooler.supabase.com:6543/postgres`;

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });
await client.connect();
console.log("[fix] connected");

// 1. Drop stale admin_actions (old 001 shape) so 036 recreates it correctly
await client.query('DROP TABLE IF EXISTS public.admin_actions CASCADE');
console.log("[fix] dropped stale admin_actions");

// 2. Run migration 036 (creates 9 tables + new admin_actions + profiles columns + system_settings)
const m36 = readFileSync(resolve(root, "supabase/migrations/20260728_036_security_wallet_referral.sql"), "utf8");
try {
  await client.query(m36);
  console.log("[fix] migration 036 OK");
} catch (e) {
  console.error("[fix] migration 036 FAILED:", e.message);
  process.exit(1);
}

// 3. Run migration 045 (credit_wallet_debit function)
const m45 = readFileSync(resolve(root, "supabase/migrations/20260801_045_credit_wallet_atomic_debit.sql"), "utf8");
try {
  await client.query(m45);
  console.log("[fix] migration 045 OK");
} catch (e) {
  console.error("[fix] migration 045 FAILED:", e.message);
  process.exit(1);
}

// 4. admin_actions RLS + policy (matches old DB)
await client.query('ALTER TABLE public.admin_actions ENABLE ROW LEVEL SECURITY');
await client.query('DROP POLICY IF EXISTS "admin_actions_admin" ON public.admin_actions');
await client.query('CREATE POLICY "admin_actions_admin" ON public.admin_actions FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin())');
console.log("[fix] admin_actions RLS + policy OK");

// 5. Grants: all 9 tables + admin_actions to authenticated/service_role (matches old DB)
const tbls = [
  "cashout_requests", "contact_change_requests", "credit_transactions", "credit_wallets",
  "fraud_flags", "referral_codes", "referral_events", "service_credit_payments",
  "system_settings", "admin_actions",
];
for (const t of tbls) {
  for (const role of ["authenticated", "service_role"]) {
    await client.query(`GRANT ALL PRIVILEGES ON TABLE public."${t}" TO ${role}`);
  }
}
console.log("[fix] grants OK");

await client.end();
console.log("[fix] DONE");
