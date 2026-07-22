/**
 * Wipe all Ona user/app data in Supabase so testers start clean.
 * KEEPS: app_settings, feature_flags, rbac_* role definitions.
 * DELETES: profiles, jobs, chats, payments, auth users, etc.
 *
 * Usage: node scripts/wipe-user-data.mjs
 * Requires: .env.local with SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

function loadEnv() {
  const p = resolve(process.cwd(), ".env.local");
  const env = {};
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    env[k] = v;
  }
  return env;
}

const env = loadEnv();
const url = (env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || "").replace(
  /\/$/,
  ""
);
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error("Missing Supabase URL or service role key in .env.local");
  process.exit(1);
}

const sb = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** Order matters for FKs — children first where possible */
const WIPE_TABLES = [
  "messages",
  "conversations",
  "job_status_events",
  "job_events",
  "reviews",
  "payments",
  "payouts",
  "payout_accounts",
  "bookings",
  "service_requests",
  "notifications",
  "call_signals",
  "user_sessions",
  "user_addresses",
  "phone_otps",
  "signup_events",
  "support_ticket_events",
  "support_tickets",
  "wallet_transactions",
  "wallet_accounts",
  "platform_audit_logs",
  "admin_actions",
  "app_health_logs",
  "staff_role_assignments",
  "marketplace_pros",
  "motorist_profiles",
  "repair_pro_profiles",
  "profiles",
];

/** Never wipe these (settings / platform config) */
const KEEP = new Set([
  "app_settings",
  "feature_flags",
  "rbac_permissions",
  "rbac_role_permissions",
  "rbac_roles",
]);

async function wipeTable(name) {
  if (KEEP.has(name)) {
    console.log(`  KEEP ${name}`);
    return { name, ok: true, kept: true };
  }
  // Delete all rows — PostgREST needs a filter; use not-null id or true via neq
  const { error, count } = await sb
    .from(name)
    .delete({ count: "exact" })
    .neq("id", "00000000-0000-0000-0000-000000000000");
  // Some tables use user_id as PK
  if (error) {
    const r2 = await sb
      .from(name)
      .delete({ count: "exact" })
      .neq("user_id", "00000000-0000-0000-0000-000000000000");
    if (r2.error) {
      // last resort: gte created_at epoch
      const r3 = await sb
        .from(name)
        .delete({ count: "exact" })
        .gte("created_at", "1970-01-01");
      if (r3.error) {
        console.log(`  FAIL ${name}: ${r3.error.message}`);
        return { name, ok: false, error: r3.error.message };
      }
      console.log(`  OK   ${name} (created_at filter)`);
      return { name, ok: true };
    }
    console.log(`  OK   ${name} (user_id)`);
    return { name, ok: true };
  }
  console.log(`  OK   ${name}${count != null ? ` · ${count} rows` : ""}`);
  return { name, ok: true, count };
}

async function wipeAuthUsers() {
  let page = 1;
  let total = 0;
  for (;;) {
    const { data, error } = await sb.auth.admin.listUsers({
      page,
      perPage: 100,
    });
    if (error) {
      console.log("  AUTH list error:", error.message);
      break;
    }
    const users = data?.users || [];
    if (!users.length) break;
    for (const u of users) {
      const { error: delErr } = await sb.auth.admin.deleteUser(u.id);
      if (delErr) {
        console.log(`  AUTH fail ${u.email}: ${delErr.message}`);
      } else {
        total++;
        console.log(`  AUTH deleted ${u.email || u.id}`);
      }
    }
    if (users.length < 100) break;
    page++;
  }
  console.log(`  AUTH total deleted: ${total}`);
  return total;
}

async function main() {
  console.log("=== Ona wipe user data (settings kept) ===");
  console.log("URL:", url.replace(/https:\/\//, "").slice(0, 40) + "…");
  console.log("\n— Tables —");
  for (const t of WIPE_TABLES) {
    await wipeTable(t);
  }
  console.log("\n— Auth users —");
  await wipeAuthUsers();
  console.log("\nDone. Sign up again as a new user. Demo OTP: 336699");
  console.log("Kept: app_settings, feature_flags, rbac_*");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
