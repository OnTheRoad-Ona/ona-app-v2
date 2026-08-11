#!/usr/bin/env node
/**
 * Backfill the commercial layer for a Shop catalogue trade:
 *   1. shop_product_trades  — every product mapped to its trade
 *   2. shop_seller_listings — one listing per product on the platform seller,
 *      carrying status + price + qty (migration 061 layer).
 * Idempotent (keyed by product_id + seller_id; update-or-insert).
 * Usage: npx tsx scripts/backfill-shop-listings.mts artisan  (any trade)
 *        npx tsx scripts/backfill-shop-listings.mts            (vulcanizer default)
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { deriveListingStatus } from "../src/lib/shop/listing-status";

config({ path: ".env.local" });
const sb = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || ""
);

const TRADE = process.argv[2] ?? "vulcanizer";

async function main() {
  const { data: seller, error: sellerErr } = await sb
    .from("shop_sellers")
    .select("id")
    .eq("slug", "ona-platform")
    .maybeSingle();
  if (sellerErr || !seller) throw new Error(`platform seller missing`);

  const { data: products } = await sb
    .from("shop_products")
    .select("id, trade_key")
    .eq("trade_key", TRADE);
  const productIds = (products ?? []).map((p) => String(p.id));

  const { data: variants } = await sb
    .from("shop_product_variants")
    .select("id, product_id, sku")
    .in("product_id", productIds)
    .eq("status", "active");
  const byProduct = new Map<string, Array<{ id: string }>>();
  for (const v of variants ?? []) {
    const pid = String(v.product_id);
    if (!byProduct.has(pid)) byProduct.set(pid, []);
    byProduct.get(pid)!.push(v);
  }
  const variantIds = (variants ?? []).map((v) => String(v.id));

  const { data: priceRows } = variantIds.length
    ? await sb
        .from("shop_prices")
        .select("variant_id, currency, amount_minor")
        .in("variant_id", variantIds)
        .eq("is_active", true)
    : { data: [] };
  const priceByVariant = new Map<string, { currency: string; amount_minor: number }>();
  for (const p of priceRows ?? []) priceByVariant.set(String(p.variant_id), p);

  const { data: invRows } = variantIds.length
    ? await sb
        .from("shop_inventory")
        .select("variant_id, qty_on_hand, qty_reserved")
        .in("variant_id", variantIds)
    : { data: [] };
  const qtyByVariant = new Map<string, number>();
  for (const i of invRows ?? []) {
    const vid = String(i.variant_id);
    const cur = qtyByVariant.get(vid) ?? 0;
    qtyByVariant.set(vid, cur + Math.max(0, Number(i.qty_on_hand) - Number(i.qty_reserved)));
  }

  let trades = 0;
  let listed = 0;
  let updated = 0;
  for (const prod of products ?? []) {
    const pid = String(prod.id);

    const { error: te } = await sb.from("shop_product_trades").upsert(
      { product_id: pid, trade_key: TRADE, is_primary: true },
      { onConflict: "product_id,trade_key" }
    );
    if (te) console.warn(`trade ${pid}: ${te.message}`);
    else trades++;

    const v = (byProduct.get(pid) ?? [])[0];
    if (!v) continue;
    const vid = String(v.id);
    const qty = Number(qtyByVariant.get(vid) ?? 0);
    const status = deriveListingStatus({ qty, reorderLevel: qty > 0 ? 10 : 0 });
    const price = priceByVariant.get(vid);
    const payload = {
      product_id: pid,
      variant_id: vid,
      seller_id: seller.id,
      listing_status: status,
      qty_available: qty,
      currency: price?.currency ?? "NGN",
      price_minor: price?.amount_minor ?? null,
      compare_at_minor: null,
      location_city: "Lagos",
      location_state: "Lagos",
      is_active: true,
      seller_claimed_condition: "new",
    };

    const { data: existing } = await sb
      .from("shop_seller_listings")
      .select("id")
      .eq("product_id", pid)
      .eq("seller_id", seller.id)
      .maybeSingle();

    if (existing) {
      const { error: ue } = await sb
        .from("shop_seller_listings")
        .update(payload)
        .eq("id", existing.id);
      if (ue) console.warn(`listing update ${pid}: ${ue.message}`);
      else updated++;
    } else {
      const { error: ie } = await sb.from("shop_seller_listings").insert(payload);
      if (ie) console.warn(`listing insert ${pid}: ${ie.message}`);
      else listed++;
    }
  }

  console.log(`[backfill:${TRADE}] trades=${trades} listings inserted=${listed} updated=${updated}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});