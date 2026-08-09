import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const content = readFileSync(resolve(root, ".env.local"), "utf8");
const raw = {};
for (const line of content.split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i === -1) continue;
  const k = t.slice(0, i).trim();
  let v = t.slice(i + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  if (k && v) raw[k] = v;
}

// Only the Supabase-bound vars (project URL + auth keys) are stale on Vercel.
const keys = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_JWKS_URL",
  "SUPABASE_DB_PASSWORD",
];

for (const proj of ["ona-mi", "ona-backend"]) {
  console.log(`\n=== ${proj} ===`);
  for (const key of keys) {
    const val = raw[key];
    if (!val) { console.log(`skip ${key} (not in .env.local)`); continue; }
    try {
      execSync(`npx vercel env rm ${key} production --yes --project ${proj}`, { stdio: "ignore" });
      execSync(`npx vercel env rm ${key} preview --yes --project ${proj}`, { stdio: "ignore" });
      execSync(`npx vercel env rm ${key} development --yes --project ${proj}`, { stdio: "ignore" });
    } catch {}
    execSync(`printf "%s" "${val.replace(/"/g, '\\"')}" | npx vercel env add ${key} production,preview --yes --project ${proj}`, { stdio: "pipe" });
    console.log(`updated ${key}`);
  }
}
console.log("\nDone.");
