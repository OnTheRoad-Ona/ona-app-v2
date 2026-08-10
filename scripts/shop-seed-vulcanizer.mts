#!/usr/bin/env node
/**
 * Seed ONA Vulcanizer Shop catalogue (real, ETRTO-grounded).
 * Runs the standard import pipeline with the VulcanizerCatalogConnector so all
 * data-source/job/staging/validation/change-log tables are populated, then
 * writes inventory rows (qty / reorder level) from the catalogue's seed stock.
 *
 * Idempotent: SKU-based dedup keys merge on re-run.
 *
 * Usage: npx tsx scripts/shop-seed-vulcanizer.mts
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { runImport } from "../src/lib/server/shop/import-engine";
import {
  VulcanizerCatalogConnector,
  vulcanizerConnectorCount,
} from "../src/lib/server/shop/connectors/vulcanizer";
import { VULCANIZER_PRODUCTS } from "../src/lib/shop/vulcanizer-catalog";

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
    .eq("code", "ona_vulcanizer")
    .maybeSingle();
  let sourceId = src?.id ?? null;
  if (!sourceId) {
    const { data, error } = await sb
      .from("shop_data_sources")
      .insert({
        code: "ona_vulcanizer",
        name: "Ona Vulcanizer Shop Catalogue",
        kind: "manual",
        license:
          "Ona-curated catalogue grounded in ETRTO standards (public dimensional/load/speed data)",
        license_url: "https://www.etrto.org/",
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
    .eq("code", "ona_vulcanizer")
    .maybeSingle();
  let connectorId = conn?.id ?? null;
  if (!connectorId) {
    const { data, error } = await sb
      .from("shop_source_connectors")
      .insert({
        data_source_id: sourceId,
        code: "ona_vulcanizer",
        name: "Ona Vulcanizer Shop Catalogue",
        connector_type: "manual",
        config: { pageSize: 25, real: true, eTRTOGrounded: true },
        status: "ok",
      })
      .select("id")
      .single();
    if (error) throw error;
    connectorId = data.id;
  }
  return { sourceId: String(sourceId), connectorId: String(connectorId) };
}

/** Write inventory + verification flags for each catalogue product. */
async function writeInventory() {
  const locationId = await locateHub();
  let ok = 0;
  for (const p of VULCANIZER_PRODUCTS) {
    const { data: variant } = await sb
      .from("shop_product_variants")
      .select("id, product_id")
      .eq("sku", p.sku)
      .maybeSingle();
    if (!variant) continue;
    if (locationId) {
      await sb.from("shop_inventory").upsert(
        {
          variant_id: variant.id,
          location_id: locationId,
          qty_on_hand: p.qty,
          qty_reserved: 0,
          reorder_level: p.qty > 0 ? 10 : 0,
        },
        { onConflict: "variant_id,location_id" }
      );
    }
    if (p.verificationStatus === "pending") {
      await sb
        .from("shop_products")
        .update({ needs_admin_review: true, verification_notes: "Spec fields pending admin verification" })
        .eq("id", variant.product_id);
    }
    ok++;
  }
  return ok;
}

async function locateHub() {
  const { data } = await sb
    .from("shop_inventory_locations")
    .select("id")
    .eq("code", "LOS-HUB-1")
    .maybeSingle();
  return data?.id ?? null;
}

async function main() {
  const { sourceId, connectorId } = await ensureSource();
  console.log(
    `[seed] vulcanizer source=${sourceId} connector=${connectorId} records=${vulcanizerConnectorCount()}`
  );

  const result = await runImport({
    sb,
    connector: new VulcanizerCatalogConnector(),
    sourceId,
    connectorId,
    jobType: "full",
  });

  console.log("[seed] import done");
  console.log(JSON.stringify(result.report, null, 2));

  const inventoryWritten = await writeInventory();
  console.log(`[seed] inventory rows written: ${inventoryWritten}`);

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