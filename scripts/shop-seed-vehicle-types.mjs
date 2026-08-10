/**
 * Seed vehicle types + type-tagged makes/models/years into Supabase.
 * Reads the augmented offline catalog (src/lib/data/vehicles-catalog.json),
 * which now includes `types` + `typesByMake` + curated non-NHTSA brands.
 *
 * Usage: node --env-file=.env.local scripts/shop-seed-vehicle-types.mjs
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CATALOG_PATH = path.join(
  __dirname,
  "../src/lib/data/vehicles-catalog.json"
);

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
const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8"));

const ONT_TYPES = catalog.types || [
  "automobile", "motorcycle", "truck", "van", "bus",
  "trailer", "motorhome", "atv_utv", "construction_ag", "other",
];
const TYPE_NAMES = {
  automobile: "Automobile",
  motorcycle: "Motorcycle",
  truck: "Truck",
  van: "Van",
  bus: "Bus",
  trailer: "Trailer",
  motorhome: "Motorhome / RV",
  atv_utv: "ATV / UTV",
  construction_ag: "Construction & Ag",
  other: "Other",
};

function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

async function run() {
  // 1) vehicle_types taxonomy
  for (let i = 0; i < ONT_TYPES.length; i++) {
    const slug = ONT_TYPES[i];
    await sb.from("vehicle_types").upsert(
      { slug, name: TYPE_NAMES[slug] || slug, sort_order: i + 1 },
      { onConflict: "slug" }
    );
  }
  console.log("vehicle_types seeded:", ONT_TYPES.length);

  // 2) makes + type_slugs + models (upsert by slug, keep same UUIDs)
  const makesBySlug = new Map();
  const modelsBySlug = new Map();

  for (const name of catalog.makes || []) {
    const mslug = slugify(name);
    const types = (catalog.typesByMake || {})[name] || ["automobile"];
    const { data: makeRow, error: me } = await sb
      .from("vehicle_makes")
      .upsert(
        { slug: mslug, name, type_slugs: types, source: "ona_catalog" },
        { onConflict: "slug" }
      )
      .select("id")
      .single();
    if (me) throw me;
    makesBySlug.set(mslug, makeRow.id);

    for (const modelName of (catalog.modelsByMake || {})[name] || []) {
      const m2 = slugify(modelName);
      const { data: modelRow, error: xe } = await sb
        .from("vehicle_models")
        .upsert(
          { make_id: makeRow.id, slug: m2, name: modelName, source: "ona_catalog" },
          { onConflict: "make_id,slug" }
        )
        .select("id")
        .single();
      if (xe) throw xe;
      modelsBySlug.set(`${mslug}|${m2}`, modelRow.id);
    }
  }
  console.log("makes:", makesBySlug.size, "models:", modelsBySlug.size);

  // 3) year ranges + generations
  let ranges = 0;
  let gens = 0;
  const yearsByMakeModel = catalog.yearsByMakeModel || {};
  for (const [modelName, years] of Object.entries(yearsByMakeModel)) {
    const idx = modelName.indexOf("|");
    if (idx < 0) continue;
    const makePart = modelName.slice(0, idx);
    const modelPart = modelName.slice(idx + 1);
    const mslug = slugify(makePart);
    const m2 = slugify(modelPart);
    const modelId = modelsBySlug.get(`${mslug}|${m2}`);
    if (!modelId) continue;
    const minY = Math.min(...years);
    const maxY = Math.max(...years);
    if (minY != null && maxY != null) {
      await sb
        .from("vehicle_models")
        .update({ year_start: minY, year_end: maxY })
        .eq("id", modelId);
      ranges++;
    }
    const { data: existing } = await sb
      .from("vehicle_generations")
      .select("id")
      .eq("model_id", modelId)
      .limit(1);
    if (!existing?.length) {
      await sb.from("vehicle_generations").insert({
        model_id: modelId,
        name: `${minY}–${maxY}`,
        year_start: minY,
        year_end: maxY,
      });
      gens++;
    }
  }

  // 4) backfill any untyped makes as automobile
  const { data: allMakes } = await sb
    .from("vehicle_makes")
    .select("id, type_slugs");
  const untyped = (allMakes ?? []).filter(
    (m) => !Array.isArray(m.type_slugs) || m.type_slugs.length === 0
  );
  for (const u of untyped) {
    await sb.from("vehicle_makes").update({ type_slugs: ["automobile"] }).eq("id", u.id);
  }

  console.log(
    JSON.stringify(
      {
        types: ONT_TYPES.length,
        makes: makesBySlug.size,
        models: modelsBySlug.size,
        yearRanges: ranges,
        generationsCreated: gens,
        untypedBackfilled: (untyped ?? []).length,
      },
      null,
      2
    )
  );
}

run().catch((e) => {
  console.error("FAIL", e.message || e);
  process.exit(1);
});