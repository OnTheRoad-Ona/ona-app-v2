#!/usr/bin/env node
/**
 * Create synthetic marketplace users for local audit only.
 *
 * Tag: email domain @ona-local.test + full_name prefix "SYN "
 * Cleanup: node scripts/synthetic-cleanup.mjs
 *
 * Usage:
 *   node scripts/synthetic-seed.mjs
 *   node scripts/synthetic-seed.mjs --customers 500 --pros 56
 *   node scripts/synthetic-seed.mjs --customers 50 --pros 14   # quick smoke
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync, mkdirSync } from "node:fs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: resolve(root, ".env.local") });
config({ path: resolve(root, ".env") });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

if (!url || !serviceKey) {
  console.error("[synthetic-seed] Missing Supabase URL or service role key");
  process.exit(1);
}

const args = process.argv.slice(2);
function argNum(name, def) {
  const i = args.indexOf(name);
  if (i >= 0 && args[i + 1]) return Math.max(0, parseInt(args[i + 1], 10) || def);
  return def;
}

const CUSTOMER_COUNT = argNum("--customers", 500);
const PRO_COUNT = argNum("--pros", 56);
const BATCH_PAUSE_MS = 40;
const RUN_ID = new Date().toISOString().replace(/[:.]/g, "-");
const PASSWORD = "SyntheticPass336699!";

/** 14 Ona service categories (src/lib/services.ts) */
const SERVICES = [
  "mechanic",
  "vulcanizer",
  "towing",
  "battery",
  "ac",
  "body",
  "electrical",
  "diagnostics",
  "fashion",
  "plumber",
  "carpenter",
  "painter",
  "solar",
  "generator",
];

/** Lagos-area + nearby city pins for geo distribution */
const LOCATIONS = [
  { city: "Lagos", area: "Ikeja", lat: 6.6018, lng: 3.3515 },
  { city: "Lagos", area: "Lekki", lat: 6.4474, lng: 3.4723 },
  { city: "Lagos", area: "Yaba", lat: 6.5095, lng: 3.3711 },
  { city: "Lagos", area: "Surulere", lat: 6.4969, lng: 3.3566 },
  { city: "Lagos", area: "Ajah", lat: 6.4698, lng: 3.5852 },
  { city: "Lagos", area: "Ikorodu", lat: 6.6194, lng: 3.5105 },
  { city: "Abuja", area: "Wuse", lat: 9.0765, lng: 7.3986 },
  { city: "Ibadan", area: "Bodija", lat: 7.4326, lng: 3.9115 },
  { city: "Port Harcourt", area: "GRA", lat: 4.8156, lng: 7.0498 },
  { city: "Kano", area: "Nassarawa", lat: 12.0022, lng: 8.592 },
];

const sb = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Unique NG phone in synthetic range: +23481XXXXXXXX */
function phoneFor(index) {
  // 8100000000 + index → always 10 digits after 234
  const n = 8100000000 + index;
  return `+234${n}`;
}

function emailFor(kind, index) {
  return `synthetic.ona.audit+${kind}${String(index).padStart(4, "0")}.${RUN_ID}@ona-local.test`;
}

async function createAuthUser({ email, password, fullName, phone, role, meta }) {
  const { data, error } = await sb.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    phone_confirm: true,
    user_metadata: {
      full_name: fullName,
      phone,
      role,
      synthetic: true,
      synthetic_run_id: RUN_ID,
      ...meta,
    },
  });
  if (error) throw error;
  return data.user;
}

async function upsertProfile(row) {
  const { error } = await sb.from("profiles").upsert(row, { onConflict: "id" });
  if (error) throw error;
}

async function upsertMotorist(userId, loc, vehicleIndex) {
  const { error } = await sb.from("motorist_profiles").upsert(
    {
      user_id: userId,
      vehicle_make: "Toyota",
      vehicle_model: "Corolla",
      vehicle_year: "2019",
      plate_number: `SYN-${String(vehicleIndex).padStart(4, "0")}-LG`,
      city: loc.city,
      area: loc.area,
    },
    { onConflict: "user_id" }
  );
  // Columns may differ; try minimal if full fails
  if (error) {
    const { error: e2 } = await sb.from("motorist_profiles").upsert(
      { user_id: userId },
      { onConflict: "user_id" }
    );
    if (e2) console.warn("[motorist_profiles]", userId, e2.message);
  }
}

async function upsertPro(userId, service, loc, proIndex) {
  const rating = 3.5 + (proIndex % 15) / 10; // 3.5–4.9
  const row = {
    user_id: userId,
    primary_service: service,
    services: [service],
    business_name: `SYN ${service} Pro ${proIndex}`,
    bio: `Synthetic ${service} professional for marketplace audit.`,
    years_experience: String(2 + (proIndex % 12)),
    service_radius_km: 5 + (proIndex % 6),
    lat: loc.lat + (proIndex % 7) * 0.01,
    lng: loc.lng + (proIndex % 5) * 0.01,
    is_online: proIndex % 4 !== 0,
    is_available: proIndex % 5 !== 0,
    verified: proIndex % 3 !== 0,
    rating,
    location_updated_at: new Date().toISOString(),
    city: loc.city,
    area: loc.area,
  };
  const { error } = await sb.from("repair_pro_profiles").upsert(row, {
    onConflict: "user_id",
  });
  if (error) {
    // Retry with fewer columns for schema drift
    const slim = {
      user_id: userId,
      primary_service: service,
      services: [service],
      business_name: row.business_name,
      lat: row.lat,
      lng: row.lng,
    };
    const { error: e2 } = await sb
      .from("repair_pro_profiles")
      .upsert(slim, { onConflict: "user_id" });
    if (e2) console.warn("[repair_pro_profiles]", userId, e2.message);
  }
}

async function main() {
  console.log(`[synthetic-seed] run=${RUN_ID}`);
  console.log(
    `[synthetic-seed] customers=${CUSTOMER_COUNT} pros=${PRO_COUNT} services=${SERVICES.length}`
  );

  const manifest = {
    runId: RUN_ID,
    createdAt: new Date().toISOString(),
    password: PASSWORD,
    customers: [],
    pros: [],
    errors: [],
  };

  // Customers
  for (let i = 1; i <= CUSTOMER_COUNT; i++) {
    const loc = LOCATIONS[i % LOCATIONS.length];
    const email = emailFor("c", i);
    const phone = phoneFor(i);
    const fullName = `SYN Customer ${i}`;
    try {
      const user = await createAuthUser({
        email,
        password: PASSWORD,
        fullName,
        phone,
        role: "motorist",
        meta: { account_type: "motorist" },
      });
      await upsertProfile({
        id: user.id,
        role: "motorist",
        full_name: fullName,
        email,
        phone,
        city: loc.city,
        area: loc.area,
        gender: i % 2 === 0 ? "female" : "male",
        date_of_birth: "1990-01-15",
        is_active: true,
        updated_at: new Date().toISOString(),
      });
      await upsertMotorist(user.id, loc, i);
      manifest.customers.push({
        id: user.id,
        email,
        phone,
        city: loc.city,
        area: loc.area,
      });
      if (i % 50 === 0 || i === CUSTOMER_COUNT) {
        console.log(`[synthetic-seed] customers ${i}/${CUSTOMER_COUNT}`);
      }
    } catch (e) {
      const msg = e?.message || String(e);
      console.error(`[synthetic-seed] customer ${i} failed:`, msg);
      manifest.errors.push({ kind: "customer", index: i, error: msg });
    }
    await sleep(BATCH_PAUSE_MS);
  }

  // Pros: 4 per category when PRO_COUNT=56
  const perCategory = Math.max(1, Math.ceil(PRO_COUNT / SERVICES.length));
  let proIndex = 0;
  for (const service of SERVICES) {
    for (let k = 0; k < perCategory && proIndex < PRO_COUNT; k++) {
      proIndex += 1;
      const i = CUSTOMER_COUNT + proIndex; // unique phone space after customers
      const loc = LOCATIONS[proIndex % LOCATIONS.length];
      const email = emailFor("p", proIndex);
      const phone = phoneFor(i);
      const fullName = `SYN Pro ${service} ${k + 1}`;
      try {
        const user = await createAuthUser({
          email,
          password: PASSWORD,
          fullName,
          phone,
          role: "repair_pro",
          meta: {
            account_type: "professional",
            primary_service: service,
          },
        });
        await upsertProfile({
          id: user.id,
          role: "repair_pro",
          full_name: fullName,
          email,
          phone,
          city: loc.city,
          area: loc.area,
          gender: proIndex % 2 === 0 ? "female" : "male",
          date_of_birth: "1988-06-20",
          is_active: true,
          updated_at: new Date().toISOString(),
        });
        await upsertPro(user.id, service, loc, proIndex);
        manifest.pros.push({
          id: user.id,
          email,
          phone,
          service,
          city: loc.city,
          area: loc.area,
          lat: loc.lat,
          lng: loc.lng,
        });
        if (proIndex % 14 === 0 || proIndex === PRO_COUNT) {
          console.log(`[synthetic-seed] pros ${proIndex}/${PRO_COUNT}`);
        }
      } catch (e) {
        const msg = e?.message || String(e);
        console.error(`[synthetic-seed] pro ${proIndex} failed:`, msg);
        manifest.errors.push({
          kind: "pro",
          index: proIndex,
          service,
          error: msg,
        });
      }
      await sleep(BATCH_PAUSE_MS);
    }
  }

  const outDir = resolve(root, "tmp-audit");
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, `synthetic-manifest-${RUN_ID}.json`);
  const latestPath = resolve(outDir, "synthetic-manifest-latest.json");
  writeFileSync(outPath, JSON.stringify(manifest, null, 2));
  writeFileSync(latestPath, JSON.stringify(manifest, null, 2));

  console.log("[synthetic-seed] done");
  console.log(
    `  customers: ${manifest.customers.length}  pros: ${manifest.pros.length}  errors: ${manifest.errors.length}`
  );
  console.log(`  manifest: ${outPath}`);
  console.log(`  password: ${PASSWORD}`);
  console.log(`  cleanup: node scripts/synthetic-cleanup.mjs`);
}

main().catch((err) => {
  console.error("[synthetic-seed] fatal:", err?.message || err);
  process.exit(1);
});
