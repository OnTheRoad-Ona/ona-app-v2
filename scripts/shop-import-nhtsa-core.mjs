/**
 * Free-first vehicle ingest: NHTSA vPIC → Ona vehicle_makes / vehicle_models.
 * Legal public API only. Nigeria-relevant subset for launch.
 *
 * Usage: node --env-file=.env.local scripts/shop-import-nhtsa-core.mjs
 */

import { createClient } from "@supabase/supabase-js";

const url =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  "";

if (!url || !key) {
  console.error("Missing Supabase URL / service role");
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });
const BASE = "https://vpic.nhtsa.dot.gov/api/vehicles";

/** Nigeria-common makes for launch (public NHTSA names). */
const MAKES = [
  "Toyota",
  "Honda",
  "Lexus",
  "Mercedes-Benz",
  "BMW",
  "Nissan",
  "Hyundai",
  "Kia",
  "Ford",
  "Volkswagen",
  "Peugeot",
  "Mazda",
  "Mitsubishi",
  "Suzuki",
  "Isuzu",
  "Land Rover",
  "Chevrolet",
  "Acura",
  "Infiniti",
  "Jeep",
];

function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

async function fetchJson(path) {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`NHTSA ${path} ${res.status}`);
  return res.json();
}

async function upsertMake(name, sourceId) {
  const slug = slugify(name);
  const { data, error } = await sb
    .from("vehicle_makes")
    .upsert(
      {
        slug,
        name,
        source: "nhtsa_vpic",
        source_id: sourceId ? String(sourceId) : slug,
        region: "NG",
      },
      { onConflict: "slug" }
    )
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function upsertModel(makeId, name, yearStart, yearEnd) {
  const slug = slugify(name);
  const { data, error } = await sb
    .from("vehicle_models")
    .upsert(
      {
        make_id: makeId,
        slug,
        name,
        source: "nhtsa_vpic",
        source_id: slug,
        year_start: yearStart || null,
        year_end: yearEnd || null,
      },
      { onConflict: "make_id,slug" }
    )
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

let makeCount = 0;
let modelCount = 0;

for (const makeName of MAKES) {
  try {
    // Get models for make (all years aggregated via GetModelsForMake)
    const json = await fetchJson(
      `/GetModelsForMake/${encodeURIComponent(makeName)}?format=json`
    );
    const results = json.Results || [];
    if (!results.length) {
      console.warn("No models for", makeName);
      continue;
    }
    const makeIdNhtsa = results[0].Make_ID;
    const makeId = await upsertMake(makeName, makeIdNhtsa);
    makeCount++;

    const seen = new Set();
    for (const row of results) {
      const modelName = row.Model_Name || row.ModelName;
      if (!modelName || seen.has(modelName)) continue;
      seen.add(modelName);
      // NHTSA list has no year range here — use 1995–current as soft range
      const ye = new Date().getFullYear() + 1;
      await upsertModel(makeId, modelName, 1995, ye);
      modelCount++;
    }
    console.log("OK", makeName, "models", seen.size);
    await new Promise((r) => setTimeout(r, 200));
  } catch (e) {
    console.error("FAIL", makeName, e.message || e);
  }
}

console.log(JSON.stringify({ makes: makeCount, models: modelCount }, null, 2));
