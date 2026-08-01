import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = resolve(root, ".env.local");
const content = readFileSync(envPath, "utf8");

const lines = content.split("\n");
const envs = {};
for (const line of lines) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx === -1) continue;
  const key = trimmed.slice(0, eqIdx).trim();
  let val = trimmed.slice(eqIdx + 1).trim();
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1);
  }
  if (key && val) {
    envs[key] = val;
  }
}

const projects = ["ona-mi", "ona-backend"];

for (const proj of projects) {
  console.log(`\n=== Pushing environment variables to Vercel project: ${proj} ===`);
  for (const [key, val] of Object.entries(envs)) {
    // Remove existing if any, ignore error
    try {
      execSync(`npx vercel env rm ${key} production --yes --project ${proj}`, { stdio: "ignore" });
      execSync(`npx vercel env rm ${key} preview --yes --project ${proj}`, { stdio: "ignore" });
    } catch {}

    try {
      console.log(`Adding ${key} to ${proj} (production, preview)...`);
      execSync(`printf "%s" "${val}" | npx vercel env add ${key} production,preview --yes --project ${proj}`, {
        stdio: "inherit",
      });
    } catch (e) {
      console.error(`Failed to add ${key}:`, e.message);
    }
  }
}

console.log("\nAll environment variables pushed successfully to Vercel!");
