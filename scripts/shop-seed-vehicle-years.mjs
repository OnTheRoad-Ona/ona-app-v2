/**
 * Populate accurate NHTSA year ranges for Ona vehicle_makes/models and build
 * vehicle_generations (model + year span) from the offline catalog JSON that
 * was produced by scripts/download-vehicle-catalog.mjs against NHTSA vPIC.
 *
 * Usage: node --env-file=.env.local scripts/shop-seed-vehicle-years.mjs
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
const yearsByMakeModel = catalog.yearsByMakeModel ?? {};

function norm(s) {
  return String(s).trim().toLowerCase();
}

async function run() {
  const { data: makes, error: me } = await sb.from("vehicle_makes").select("id, name");
  if (me) throw me;

  const modelYears = new Map();
  for (const [key, years] of Object.entries(yearsByMakeModel)) {
    const idx = key.indexOf("|");
    if (idx < 0) continue;
    const make = key.slice(0, idx);
    const model = key.slice(idx + 1);
    modelYears.set(`${norm(make)}|${norm(model)}`, years);
  }

  let updated = 0;
  let genCreated = 0;
  let modelsScanned = 0;
  const chunk = 200;

  for (const make of makes ?? []) {
    const makeKey = norm(make.name);
    let skip = 0;
    while (true) {
      const { data: models, error: xerr } = await sb
        .from("vehicle_models")
        .select("id, name, year_start, year_end")
        .eq("make_id", make.id)
        .range(skip, skip + chunk - 1);
      if (xerr) throw xerr;
      if (!models?.length) break;

      for (const model of models) {
        modelsScanned++;
        const years = modelYears.get(`${makeKey}|${norm(model.name)}`);
        if (!years?.length) continue;
        const minY = Math.min(...years);
        const maxY = Math.max(...years);
        const needsYearFix =
          Number(model.year_start) !== minY || Number(model.year_end) !== maxY;
        if (needsYearFix) {
          const { error: ue } = await sb
            .from("vehicle_models")
            .update({ year_start: minY, year_end: maxY })
            .eq("id", model.id);
          if (ue) throw ue;
          updated++;
        }
        const { data: existing } = await sb
          .from("vehicle_generations")
          .select("id")
          .eq("model_id", model.id)
          .limit(1);
        if (!existing?.length) {
          const { error: ge } = await sb.from("vehicle_generations").insert({
            model_id: model.id,
            name: `${minY}–${maxY}`,
            year_start: minY,
            year_end: maxY,
          });
          if (ge) throw ge;
          genCreated++;
        }
      }

      if (models.length < chunk) break;
      skip += chunk;
    }
  }

  console.log(
    JSON.stringify(
      {
        makesScanned: (makes ?? []).length,
        modelsScanned,
        yearRangesUpdated: updated,
        generationsCreated: genCreated,
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
