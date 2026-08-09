/**
 * Expand mechanic products + Ona-owned Camry fitment (not fabricated OEM claims).
 * Fitment rows are Ona-authored for seed SKUs only.
 *
 * Usage: node --env-file=.env.local scripts/shop-seed-fitment-mechanic.mjs
 */

import { createClient } from "@supabase/supabase-js";

const url =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  "";
const sb = createClient(url, key, { auth: { persistSession: false } });

async function ensureMakeModel() {
  const { data: make } = await sb
    .from("vehicle_makes")
    .upsert(
      {
        slug: "toyota",
        name: "Toyota",
        source: "ona_seed",
        source_id: "toyota",
        region: "NG",
      },
      { onConflict: "slug" }
    )
    .select("id")
    .single();
  const { data: model } = await sb
    .from("vehicle_models")
    .upsert(
      {
        make_id: make.id,
        slug: "camry",
        name: "Camry",
        source: "ona_seed",
        source_id: "camry",
        year_start: 2012,
        year_end: 2024,
      },
      { onConflict: "make_id,slug" }
    )
    .select("id")
    .single();
  return { makeId: make.id, modelId: model.id };
}

async function cat(slug) {
  const { data, error } = await sb
    .from("shop_trade_categories")
    .select("id, trade_key")
    .eq("slug", slug)
    .limit(1);
  if (error) throw error;
  if (!data?.[0]) throw new Error("Missing category " + slug);
  return data[0];
}

async function brand(slug) {
  const { data } = await sb
    .from("shop_brands")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  return data?.id ?? null;
}

async function loc() {
  const { data } = await sb
    .from("shop_inventory_locations")
    .select("id")
    .eq("code", "LOS-HUB-1")
    .maybeSingle();
  return data.id;
}

async function upsertProduct(s) {
  const c = await cat(s.categorySlug);
  const brandId = s.brandSlug ? await brand(s.brandSlug) : null;
  const locationId = await loc();
  const { data: product, error: pe } = await sb
    .from("shop_products")
    .upsert(
      {
        category_id: c.id,
        brand_id: brandId,
        trade_key: s.tradeKey || c.trade_key,
        slug: s.slug,
        name: s.name,
        subtitle: s.subtitle,
        condition_type: s.condition,
        status: "active",
        search_document: `${s.name} ${s.subtitle || ""} ${s.sku}`.toLowerCase(),
      },
      { onConflict: "slug" }
    )
    .select("id")
    .single();
  if (pe) throw pe;

  const { data: variant, error: ve } = await sb
    .from("shop_product_variants")
    .upsert(
      {
        product_id: product.id,
        sku: s.sku,
        oem_number: s.oem || null,
        title: s.name,
        option_label: "Standard",
        status: "active",
      },
      { onConflict: "sku" }
    )
    .select("id")
    .single();
  if (ve) throw ve;

  await sb.from("shop_prices").insert({
    variant_id: variant.id,
    currency: "NGN",
    amount_minor: s.priceMinor,
    is_active: true,
  });

  await sb.from("shop_inventory").upsert(
    {
      variant_id: variant.id,
      location_id: locationId,
      qty_on_hand: s.qty,
      qty_reserved: 0,
    },
    { onConflict: "variant_id,location_id" }
  );

  return { productId: product.id, variantId: variant.id };
}

async function fit(variantId, makeId, modelId, position, status) {
  const { data: existing } = await sb
    .from("shop_product_fitments")
    .select("id")
    .eq("variant_id", variantId)
    .eq("make_id", makeId)
    .eq("model_id", modelId)
    .eq("position", position || null)
    .maybeSingle();
  if (existing) return;
  await sb.from("shop_product_fitments").insert({
    variant_id: variantId,
    make_id: makeId,
    model_id: modelId,
    year_start: 2012,
    year_end: 2024,
    position: position || null,
    fitment_status: status || "direct_fit",
    verification_status: "ona_verified",
    notes: "Ona seed fitment — Camry XV50/XV70 range",
  });
}

const { makeId, modelId } = await ensureMakeModel();

const extras = [
  {
    categorySlug: "brake-system",
    brandSlug: "bosch",
    tradeKey: "mechanic",
    slug: "bosch-rear-brake-pads-camry",
    name: "Bosch Rear Brake Pads",
    subtitle: "Toyota Camry compatible · Rear",
    condition: "aftermarket",
    sku: "ONA-BRK-BP-CAM-R-001",
    priceMinor: 26500_00,
    qty: 35,
    position: "rear",
  },
  {
    categorySlug: "brake-system",
    brandSlug: "generic-pro",
    tradeKey: "mechanic",
    slug: "ona-front-brake-rotors-camry",
    name: "Ona Front Brake Rotors (pair)",
    subtitle: "Toyota Camry · Front ventilated",
    condition: "aftermarket",
    sku: "ONA-BRK-ROT-CAM-F-001",
    priceMinor: 42000_00,
    qty: 20,
    position: "front",
  },
  {
    categorySlug: "engine-oil",
    brandSlug: "generic-pro",
    tradeKey: "mechanic",
    slug: "ona-oil-filter-camry",
    name: "Ona Oil Filter",
    subtitle: "Toyota Camry 2.5L compatible",
    condition: "aftermarket",
    sku: "ONA-OIL-FLT-CAM-001",
    priceMinor: 3500_00,
    qty: 80,
    position: null,
  },
];

for (const s of extras) {
  try {
    const { variantId } = await upsertProduct(s);
    await fit(variantId, makeId, modelId, s.position, "direct_fit");
    console.log("OK", s.sku);
  } catch (e) {
    console.error("FAIL", s.sku, e.message || e);
  }
}

// Ensure original front pads have fitment
const { data: front } = await sb
  .from("shop_product_variants")
  .select("id")
  .eq("sku", "ONA-BRK-BP-CAM-F-001")
  .maybeSingle();
if (front) {
  await fit(front.id, makeId, modelId, "front", "direct_fit");
  console.log("OK fitment front pads");
}

console.log("Mechanic fitment seed done", { makeId, modelId });
