#!/usr/bin/env node
/**
 * Create Ona platform Flutterwave subaccount for Split Payments (5% fee).
 *
 * Usage (from project root):
 *   FLW_BANK_CODE=058 FLW_ACCOUNT_NUMBER=0123456789 FLW_ACCOUNT_NAME="Ona Limited" \
 *     node scripts/create-flutterwave-platform-subaccount.mjs
 *
 * Then:
 *   npx vercel env add FLUTTERWAVE_PLATFORM_SUBACCOUNT production
 *   # paste RS_… id
 *   npx vercel --prod --yes
 *
 * Requires FLUTTERWAVE_SECRET_KEY in .env.local
 */
import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: resolve(root, ".env.local") });

const secret = (process.env.FLUTTERWAVE_SECRET_KEY || "").trim();
const bank = (process.env.FLW_BANK_CODE || "").trim();
const account = (process.env.FLW_ACCOUNT_NUMBER || "").trim();
const name = (process.env.FLW_ACCOUNT_NAME || "Ona Platform").trim();
const email =
  (process.env.FLW_BUSINESS_EMAIL || process.env.ADMIN_SEED_EMAIL || "").trim() ||
  "witcowavers@gmail.com";

if (!secret) {
  console.error("Missing FLUTTERWAVE_SECRET_KEY in .env.local");
  process.exit(1);
}
if (!bank || !account) {
  console.error(
    "Set FLW_BANK_CODE (e.g. 058 for GTBank) and FLW_ACCOUNT_NUMBER for Ona's settlement account."
  );
  process.exit(1);
}

const res = await fetch("https://api.flutterwave.com/v3/subaccounts", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${secret}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    account_bank: bank,
    account_number: account,
    business_name: name,
    business_email: email,
    business_mobile: process.env.FLW_BUSINESS_PHONE || "08000000000",
    country: "NG",
    split_type: "percentage",
    split_value: 0.05, // platform default share hint; actual split set per charge
  }),
});

const json = await res.json();
if (json.status !== "success") {
  console.error("Flutterwave error:", json.message || json);
  process.exit(1);
}

const id = json.data?.subaccount_id || json.data?.id;
console.log("Created subaccount:", id);
console.log("Full data keys:", Object.keys(json.data || {}));
console.log("\nNext:");
console.log("  1) Add to .env.local: FLUTTERWAVE_PLATFORM_SUBACCOUNT=" + id);
console.log("  2) npx vercel env add FLUTTERWAVE_PLATFORM_SUBACCOUNT production");
console.log("  3) npx vercel --prod --yes");
