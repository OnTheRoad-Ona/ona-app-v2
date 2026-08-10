#!/usr/bin/env node
/**
 * Seed ONA Shop demo catalog (Phase 2) — 70+ demo products across 14 trades.
 * Runs the standard import pipeline with the DemoCatalogConnector so all
 * data-source/job/staging/validation/change-log tables are populated.
 *
 * Idempotent: uses deterministic dedup keys, so re-running merges instead of
 * duplicating.
 *
 * Usage: npx tsx scripts/shop-seed-demo-catalog.mts
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { runImport } from "../src/lib/server/shop/import-engine";
import { DemoCatalogConnector, demoConnectorCount } from "../src/lib/server/shop/connectors/demo";

config({ path: ".env.local" });

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!url || !key) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

async function ensureSource() {
  const { data: src } = await sb
    .from("shop_data_sources")
    .select("id")
    .eq("code", "ona_demo")
    .maybeSingle();
  let sourceId = src?.id ?? null;
  if (!sourceId) {
    const { data, error } = await sb
      .from("shop_data_sources")
      .insert({
        code: "ona_demo",
        name: "Ona Demo Catalog",
        kind: "demo",
        license: "Ona proprietary demo data (synthetic, non-infringing)",
        status: "ok",
      })
      .select("id")
      .single();
    if (error) throw error;
    sourceId = data.id;
  }
  const { data: conn } = await sb
    .from("shop_source_connectors")
    .select("id")
    .eq("code", "ona_demo")
    .maybeSingle();
  let connectorId = conn?.id ?? null;
  if (!connectorId) {
    const { data, error } = await sb
      .from("shop_source_connectors")
      .insert({
        data_source_id: sourceId,
        code: "ona_demo",
        name: "Ona Demo Catalog",
        connector_type: "demo",
        config: { pageSize: 25 },
        status: "ok",
      })
      .select("id")
      .single();
    if (error) throw error;
    connectorId = data.id;
  }
  return { sourceId: String(sourceId), connectorId: String(connectorId) };
}

async function main() {
  const { sourceId, connectorId } = await ensureSource();
  console.log(`[seed] demo source=${sourceId} connector=${connectorId} records=${demoConnectorCount()}`);

  const result = await runImport({
    sb,
    connector: new DemoCatalogConnector(),
    sourceId,
    connectorId,
    jobType: "demo",
  });

  console.log("[seed] done");
  console.log(JSON.stringify(result.report, null, 2));
  if (result.report.errors.length) {
    console.error("[seed] errors:");
    for (const e of result.report.errors) console.error(" -", e);
  }
  process.exit(result.report.errors.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
