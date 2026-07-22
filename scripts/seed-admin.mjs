#!/usr/bin/env node
/**
 * Seed the single Super Admin for Ona.
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env (.env.local).
 *
 * Usage: node scripts/seed-admin.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: resolve(root, ".env.local") });
config({ path: resolve(root, ".env") });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
const email =
  process.env.ADMIN_SEED_EMAIL || "Oluwatosinabdullahime@gmail.com";
const password = process.env.ADMIN_SEED_PASSWORD || "Alliswell123$";
const fullName = process.env.ADMIN_SEED_NAME || "Oluwatosin Abdullah";

if (!url || !serviceKey) {
  console.error(
    "[seed-admin] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
  );
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log(`[seed-admin] Ensuring admin ${email} …`);

  const { data: listed, error: listErr } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  if (listErr) throw listErr;

  let user = listed.users.find(
    (u) => u.email?.toLowerCase() === email.toLowerCase()
  );

  if (!user) {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, role: "motorist" },
    });
    if (error) throw error;
    user = data.user;
    console.log("[seed-admin] Created auth user", user.id);
  } else {
    const { error } = await supabase.auth.admin.updateUserById(user.id, {
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (error) throw error;
    console.log("[seed-admin] Updated existing auth user", user.id);
  }

  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .upsert(
      {
        id: user.id,
        role: "admin",
        admin_role: "super_admin",
        full_name: fullName,
        email: email.toLowerCase(),
        is_active: true,
      },
      { onConflict: "id" }
    )
    .select("id, role, email, is_active")
    .maybeSingle();
  if (profileErr) {
    if (
      profileErr.code === "PGRST205" ||
      /Could not find the table/i.test(profileErr.message || "")
    ) {
      throw new Error(
        "Table public.profiles is missing. In Supabase SQL editor, paste & Run supabase/migrations/20260714_002_bootstrap_idempotent.sql (already on clipboard when set up), then re-run npm run db:seed-admin."
      );
    }
    throw profileErr;
  }
  console.log("[seed-admin] Profile:", profile);

  // Remove accidental role-side tables if trigger created them
  await supabase.from("motorist_profiles").delete().eq("user_id", user.id);
  await supabase.from("repair_pro_profiles").delete().eq("user_id", user.id);

  console.log("[seed-admin] Admin ready:");
  console.log("  email:", email);
  console.log("  role: admin");
  console.log("  login: http://localhost:4500/admin/login");
}

main().catch((err) => {
  console.error("[seed-admin] Failed:", err.message || err);
  process.exit(1);
});
