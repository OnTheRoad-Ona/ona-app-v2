#!/usr/bin/env node
/**
 * Delete ONLY synthetic audit users created by synthetic-seed.mjs.
 *
 * Match rules (all must be synthetic — never touch real users):
 * - email ends with @ona-local.test AND contains synthetic.ona.audit
 * - OR full_name starts with "SYN "
 * - OR auth user_metadata.synthetic === true
 *
 * Usage:
 *   node scripts/synthetic-cleanup.mjs
 *   node scripts/synthetic-cleanup.mjs --dry-run
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: resolve(root, ".env.local") });
config({ path: resolve(root, ".env") });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
const dryRun = process.argv.includes("--dry-run");

if (!url || !serviceKey) {
  console.error("[synthetic-cleanup] Missing Supabase URL or service role key");
  process.exit(1);
}

const sb = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function isSyntheticEmail(email) {
  const e = String(email || "").toLowerCase();
  return e.includes("synthetic.ona.audit") && e.endsWith("@ona-local.test");
}

function isSyntheticName(name) {
  return String(name || "").startsWith("SYN ");
}

async function listAllAuthUsers() {
  const users = [];
  let page = 1;
  for (;;) {
    const { data, error } = await sb.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) throw error;
    const batch = data?.users || [];
    users.push(...batch);
    if (batch.length < 200) break;
    page += 1;
    if (page > 100) break; // safety
  }
  return users;
}

async function deleteRelatedRows(userId) {
  // Children first where FKs exist; ignore missing tables
  const ops = [
    () => sb.from("messages").delete().or(`sender_id.eq.${userId}`),
    () => sb.from("notifications").delete().eq("user_id", userId),
    () => sb.from("user_sessions").delete().eq("user_id", userId),
    () => sb.from("user_addresses").delete().eq("user_id", userId),
    () => sb.from("reviews").delete().or(`reviewer_id.eq.${userId},reviewee_id.eq.${userId}`),
    () => sb.from("payments").delete().or(`payer_id.eq.${userId},payee_id.eq.${userId}`),
    () =>
      sb
        .from("service_requests")
        .delete()
        .or(`motorist_id.eq.${userId},repair_pro_id.eq.${userId}`),
    () =>
      sb
        .from("bookings")
        .delete()
        .or(`motorist_id.eq.${userId},repair_pro_id.eq.${userId}`),
    () => sb.from("wallet_transactions").delete().eq("user_id", userId),
    () => sb.from("wallet_accounts").delete().eq("user_id", userId),
    () => sb.from("payout_accounts").delete().eq("user_id", userId),
    () => sb.from("payouts").delete().eq("user_id", userId),
    () => sb.from("signup_events").delete().eq("user_id", userId),
    () => sb.from("motorist_profiles").delete().eq("user_id", userId),
    () => sb.from("repair_pro_profiles").delete().eq("user_id", userId),
    () => sb.from("profiles").delete().eq("id", userId),
  ];
  for (const op of ops) {
    try {
      await op();
    } catch {
      /* schema drift OK */
    }
  }
}

async function main() {
  console.log(`[synthetic-cleanup] dryRun=${dryRun}`);

  const ids = new Set();
  const emails = [];

  // From latest manifest
  const manifestPath = resolve(root, "tmp-audit/synthetic-manifest-latest.json");
  if (existsSync(manifestPath)) {
    const m = JSON.parse(readFileSync(manifestPath, "utf8"));
    for (const c of m.customers || []) {
      if (c.id) ids.add(c.id);
      if (c.email) emails.push(c.email);
    }
    for (const p of m.pros || []) {
      if (p.id) ids.add(p.id);
      if (p.email) emails.push(p.email);
    }
    console.log(`[synthetic-cleanup] manifest users: ${ids.size}`);
  }

  // From profiles table
  const { data: profiles } = await sb
    .from("profiles")
    .select("id, email, full_name")
    .or("email.ilike.%synthetic.ona.audit%,full_name.ilike.SYN %")
    .limit(5000);
  for (const p of profiles || []) {
    if (isSyntheticEmail(p.email) || isSyntheticName(p.full_name)) {
      ids.add(p.id);
      if (p.email) emails.push(p.email);
    }
  }

  // From auth users
  const authUsers = await listAllAuthUsers();
  for (const u of authUsers) {
    const meta = u.user_metadata || {};
    if (
      meta.synthetic === true ||
      isSyntheticEmail(u.email) ||
      isSyntheticName(meta.full_name)
    ) {
      ids.add(u.id);
      if (u.email) emails.push(u.email);
    }
  }

  const idList = [...ids];
  console.log(`[synthetic-cleanup] total synthetic ids: ${idList.length}`);

  if (dryRun) {
    console.log("[synthetic-cleanup] dry-run sample:", idList.slice(0, 5));
    return;
  }

  let deleted = 0;
  let failed = 0;
  for (const id of idList) {
    try {
      await deleteRelatedRows(id);
      const { error } = await sb.auth.admin.deleteUser(id);
      if (error) throw error;
      deleted += 1;
      if (deleted % 50 === 0) {
        console.log(`[synthetic-cleanup] deleted ${deleted}/${idList.length}`);
      }
    } catch (e) {
      failed += 1;
      console.warn(`[synthetic-cleanup] fail ${id}:`, e?.message || e);
    }
  }

  const report = {
    cleanedAt: new Date().toISOString(),
    attempted: idList.length,
    deleted,
    failed,
  };
  const outDir = resolve(root, "tmp-audit");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    resolve(outDir, "synthetic-cleanup-latest.json"),
    JSON.stringify(report, null, 2)
  );
  console.log("[synthetic-cleanup] done", report);
}

main().catch((err) => {
  console.error("[synthetic-cleanup] fatal:", err?.message || err);
  process.exit(1);
});
