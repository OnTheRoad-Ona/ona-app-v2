#!/usr/bin/env node
/**
 * Wipe demo Shop products and load the live Automedics catalog.
 * Idempotent: re-runs upsert by slug/sku.
 *
 * Usage: npx tsx scripts/shop-seed-automedics.mts
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import {
  AUTOMEDICS_CATEGORIES,
  AUTOMEDICS_PRODUCTS,
  automedicsImageUrl,
  parseVehicleFitment,
} from "../src/lib/shop/automedics-catalog";

config({ path: ".env.local" });

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
if (!url || !key) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

async function ensureColumn() {
  const { error } = await sb.from("shop_products").select("id, deleted_at").limit(1);
  if (error && /deleted_at/i.test(error.message)) {
    console.warn(
      "[seed] shop_products.deleted_at missing — apply 20260820_075_automedics_shop.sql"
    );
  }
}

async function archiveDemo() {
  const now = new Date().toISOString();
  const { count } = await sb
    .from("shop_products")
    .select("id", { count: "exact", head: true })
    .not("slug", "like", "atm-%");
  const patch: Record<string, unknown> = {
    status: "archived",
    updated_at: now,
    deleted_at: now,
  };
  const { error: upErr, count: updated } = await sb
    .from("shop_products")
    .update(patch)
    .not("slug", "like", "atm-%")
    .select("id");
  if (upErr) {
    delete patch.deleted_at;
    const { error: upErr2, data } = await sb
      .from("shop_products")
      .update(patch)
      .not("slug", "like", "atm-%")
      .select("id");
    if (upErr2) {
      console.error("[seed] archive failed", upErr2);
      throw upErr2;
    }
    return (data ?? []).length;
  }
  return (updated ?? count ?? 0) as number;
}

async function deactivateOldMechanicCats(keep: Set<string>) {
  const { data } = await sb
    .from("shop_trade_categories")
    .select("id, slug")
    .eq("trade_key", "mechanic");
  const stale = (data ?? []).filter((c) => !keep.has(String(c.slug)));
  if (!stale.length) return 0;
  await sb
    .from("shop_trade_categories")
    .update({ is_active: false })
    .in(
      "id",
      stale.map((c) => c.id)
    );
  return stale.length;
}

async function upsertCategories(): Promise<Map<string, string>> {
  const idBySlug = new Map<string, string>();
  const { data: existing } = await sb
    .from("shop_trade_categories")
    .select("id, slug")
    .eq("trade_key", "mechanic");
  for (const row of existing ?? []) {
    idBySlug.set(String(row.slug), String(row.id));
  }

  for (let i = 0; i < AUTOMEDICS_CATEGORIES.length; i++) {
    const cat = AUTOMEDICS_CATEGORIES[i];
    const payload = {
      trade_key: "mechanic",
      slug: cat.slug,
      name: cat.name,
      parent_id: null,
      depth: 0,
      path: `/${cat.slug}`,
      sort_order: i + 1,
      is_active: true,
    };
    const existingId = idBySlug.get(cat.slug);
    if (existingId) {
      await sb
        .from("shop_trade_categories")
        .update(payload)
        .eq("id", existingId);
    } else {
      const { data, error } = await sb
        .from("shop_trade_categories")
        .insert(payload)
        .select("id, slug")
        .single();
      if (error) {
        const { data: row } = await sb
          .from("shop_trade_categories")
          .select("id, slug")
          .eq("trade_key", "mechanic")
          .eq("slug", cat.slug)
          .maybeSingle();
        if (row) idBySlug.set(String(row.slug), String(row.id));
        else throw error;
      } else if (data) {
        idBySlug.set(String(data.slug), String(data.id));
      }
    }
  }
  return idBySlug;
}

async function upsertBrand(name: string): Promise<string | null> {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  if (!slug) return null;
  const { data: existing } = await sb
    .from("shop_brands")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (existing) return String(existing.id);
  const { data, error } = await sb
    .from("shop_brands")
    .insert({ slug, name })
    .select("id")
    .single();
  if (error) {
    const { data: again } = await sb
      .from("shop_brands")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    return again ? String(again.id) : null;
  }
  return data ? String(data.id) : null;
}

async function ensureLocation(): Promise<string | null> {
  const { data } = await sb
    .from("shop_inventory_locations")
    .select("id")
    .eq("code", "LOS-HUB-1")
    .maybeSingle();
  if (data) return String(data.id);
  const { data: created, error } = await sb
    .from("shop_inventory_locations")
    .insert({
      code: "LOS-HUB-1",
      name: "Lagos Hub",
      is_active: true,
    })
    .select("id")
    .single();
  if (error) return null;
  return created ? String(created.id) : null;
}

async function upsertProducts(catIds: Map<string, string>) {
  const locId = await ensureLocation();
  let ok = 0;
  let fail = 0;
  for (const item of AUTOMEDICS_PRODUCTS) {
    const categoryId = catIds.get(item.categorySlug);
    if (!categoryId) {
      console.error("missing category", item.categorySlug);
      fail++;
      continue;
    }
    const brandId = await upsertBrand(item.brand);
    const fit = parseVehicleFitment(item.vehicle);
    const slug = item.sku.toLowerCase();
    const imageUrl = automedicsImageUrl(item.imageKey);
    const subtitle = fit.vehicleGeneral
      ? "Fits most vehicles"
      : `Fits ${item.vehicle}`;
    const description = [
      item.name,
      `Category: ${AUTOMEDICS_CATEGORIES.find((c) => c.slug === item.categorySlug)?.name}`,
      item.priceMajor == null
        ? "Price: Contact for price"
        : `Price: ₦${item.priceMajor.toLocaleString("en-NG")}`,
      `Vehicle: ${item.vehicle}`,
      "Sold by Automedics on Ona Shop.",
    ].join(". ");
    const attributes = {
      vehicleLabel: item.vehicle,
      vehicleMake: fit.vehicleMake,
      vehicleModel: fit.vehicleModel,
      vehicleYear: fit.vehicleYear,
      vehicleGeneral: fit.vehicleGeneral,
      vehicleTags: fit.vehicleTags,
      priceOnRequest: item.priceMajor == null,
      listingStatus: "available",
    };

    const productRow: Record<string, unknown> = {
      category_id: categoryId,
      brand_id: brandId,
      trade_key: "mechanic",
      slug,
      name: item.name,
      subtitle,
      description,
      condition_type: "aftermarket",
      primary_image_url: imageUrl,
      status: "active",
      is_professional_only: false,
      attributes,
      keywords: item.keywords,
      deleted_at: null,
    };

    const { data: existing } = await sb
      .from("shop_products")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();

    let productId = existing ? String(existing.id) : "";
    if (existing) {
      const { error } = await sb
        .from("shop_products")
        .update(productRow)
        .eq("id", existing.id);
      if (error) {
        delete productRow.deleted_at;
        const { error: e2 } = await sb
          .from("shop_products")
          .update(productRow)
          .eq("id", existing.id);
        if (e2) {
          console.error("update", item.sku, e2.message);
          fail++;
          continue;
        }
      }
    } else {
      const { data, error } = await sb
        .from("shop_products")
        .insert(productRow)
        .select("id")
        .single();
      if (error || !data) {
        delete productRow.deleted_at;
        const { data: d2, error: e2 } = await sb
          .from("shop_products")
          .insert(productRow)
          .select("id")
          .single();
        if (e2 || !d2) {
          console.error("insert", item.sku, (e2 || error)?.message);
          fail++;
          continue;
        }
        productId = String(d2.id);
      } else {
        productId = String(data.id);
      }
    }

    await sb.from("shop_product_trades").upsert(
      { product_id: productId, trade_key: "mechanic", is_primary: true },
      { onConflict: "product_id,trade_key" }
    );

    const { data: variantExist } = await sb
      .from("shop_product_variants")
      .select("id")
      .eq("sku", item.sku)
      .maybeSingle();

    let variantId = variantExist ? String(variantExist.id) : "";
    const variantRow = {
      product_id: productId,
      sku: item.sku,
      title: item.name,
      option_label: "Standard",
      status: "active",
    };
    if (variantExist) {
      await sb
        .from("shop_product_variants")
        .update(variantRow)
        .eq("id", variantExist.id);
    } else {
      const { data: v, error: ve } = await sb
        .from("shop_product_variants")
        .insert(variantRow)
        .select("id")
        .single();
      if (ve || !v) {
        console.error("variant", item.sku, ve?.message);
        fail++;
        continue;
      }
      variantId = String(v.id);
    }

    await sb
      .from("shop_prices")
      .update({ is_active: false, effective_to: new Date().toISOString() })
      .eq("variant_id", variantId)
      .eq("is_active", true);

    await sb.from("shop_prices").insert({
      variant_id: variantId,
      currency: "NGN",
      amount_minor:
        item.priceMajor == null ? 0 : Math.round(item.priceMajor * 100),
      is_active: true,
    });

    if (locId) {
      await sb.from("shop_inventory").upsert(
        {
          variant_id: variantId,
          location_id: locId,
          qty_on_hand: 50,
          qty_reserved: 0,
        },
        { onConflict: "variant_id,location_id" }
      );
    }

    await sb.from("shop_product_images").delete().eq("product_id", productId);
    await sb.from("shop_product_images").insert({
      product_id: productId,
      url: imageUrl,
      sort_order: 0,
      is_primary: true,
      alt_text: item.name,
    });

    const { data: seller } = await sb
      .from("shop_sellers")
      .select("id")
      .eq("slug", "ona-platform")
      .maybeSingle();
    if (seller) {
      const { data: listing } = await sb
        .from("shop_seller_listings")
        .select("id")
        .eq("seller_id", seller.id)
        .eq("product_id", productId)
        .maybeSingle();
      if (listing) {
        await sb
          .from("shop_seller_listings")
          .update({
            listing_status: "available",
            qty_available: 50,
            price_minor:
              item.priceMajor == null ? 0 : Math.round(item.priceMajor * 100),
            is_active: true,
            variant_id: variantId,
          })
          .eq("id", listing.id);
      } else {
        await sb.from("shop_seller_listings").insert({
          seller_id: seller.id,
          product_id: productId,
          variant_id: variantId,
          listing_status: "available",
          qty_available: 50,
          currency: "NGN",
          price_minor:
            item.priceMajor == null ? 0 : Math.round(item.priceMajor * 100),
          is_active: true,
        });
      }
    }

    ok++;
  }
  return { ok, fail };
}

async function main() {
  await ensureColumn();
  const archived = await archiveDemo();
  console.log(`[seed] archived non-Automedics products: ${archived}`);
  const keep = new Set(AUTOMEDICS_CATEGORIES.map((c) => c.slug as string));
  const stale = await deactivateOldMechanicCats(keep);
  console.log(`[seed] deactivated old mechanic categories: ${stale}`);
  const catIds = await upsertCategories();
  console.log(`[seed] categories ready: ${catIds.size}`);
  const result = await upsertProducts(catIds);
  console.log(
    `[seed] products ok=${result.ok} fail=${result.fail} expected=${AUTOMEDICS_PRODUCTS.length}`
  );
  if (result.fail) process.exit(1);
}

main().catch((e) => {
  console.error("[seed] fatal", e?.message || e, e);
  process.exit(1);
});
