/**
 * Seed sample ONA Shop products (multi-trade).
 * Requires service role + applied migration 20260809_050_ona_shop_core.sql
 *
 * Usage: node --env-file=.env.local scripts/shop-seed-sample.mjs
 */

import { createClient } from "@supabase/supabase-js";

const url =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  "";

if (!url || !key) {
  console.error("Missing SUPABASE URL or SERVICE_ROLE_KEY");
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

async function cat(slug) {
  const { data, error } = await sb
    .from("shop_trade_categories")
    .select("id, trade_key")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`Category missing: ${slug}`);
  return data;
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
  if (!data) throw new Error("LOS-HUB-1 missing");
  return data.id;
}

async function upsertProduct({
  categorySlug,
  brandSlug,
  tradeKey,
  slug,
  name,
  subtitle,
  condition,
  sku,
  priceMinor,
  qty,
  oem,
}) {
  const c = await cat(categorySlug);
  const brandId = brandSlug ? await brand(brandSlug) : null;
  const locationId = await loc();

  const { data: product, error: pe } = await sb
    .from("shop_products")
    .upsert(
      {
        category_id: c.id,
        brand_id: brandId,
        trade_key: tradeKey || c.trade_key,
        slug,
        name,
        subtitle,
        condition_type: condition,
        status: "active",
        search_document: `${name} ${subtitle || ""} ${sku} ${oem || ""}`.toLowerCase(),
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
        sku,
        oem_number: oem || null,
        title: name,
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
    amount_minor: priceMinor,
    is_active: true,
  });

  await sb.from("shop_inventory").upsert(
    {
      variant_id: variant.id,
      location_id: locationId,
      qty_on_hand: qty,
      qty_reserved: 0,
    },
    { onConflict: "variant_id,location_id" }
  );

  console.log("OK", sku, name);
}

const samples = [
  {
    categorySlug: "brake-system",
    brandSlug: "bosch",
    tradeKey: "mechanic",
    slug: "bosch-front-brake-pads-camry",
    name: "Bosch Front Brake Pads",
    subtitle: "Toyota Camry compatible · Front",
    condition: "aftermarket",
    sku: "ONA-BRK-BP-CAM-F-001",
    priceMinor: 28500_00,
    qty: 40,
    oem: "04465-33470",
  },
  {
    categorySlug: "engine-oil",
    brandSlug: "generic-pro",
    tradeKey: "mechanic",
    slug: "ona-5w30-engine-oil-4l",
    name: "Ona Pro 5W-30 Engine Oil 4L",
    subtitle: "Synthetic blend",
    condition: "original",
    sku: "ONA-OIL-5W30-4L",
    priceMinor: 18500_00,
    qty: 100,
  },
  {
    categorySlug: "inverters",
    brandSlug: "luminous",
    tradeKey: "solar",
    slug: "luminous-5kva-48v-inverter",
    name: "Luminous 5kVA 48V Inverter",
    subtitle: "Hybrid-ready · 48V",
    condition: "original",
    sku: "ONA-SOL-INV-5KVA-48",
    priceMinor: 485000_00,
    qty: 8,
  },
  {
    categorySlug: "pipes-fittings",
    brandSlug: "generic-pro",
    tradeKey: "plumber",
    slug: "pvc-pipe-20mm-3m",
    name: "PVC Pipe 20mm × 3m",
    subtitle: "Pressure-rated plumbing pipe",
    condition: "original",
    sku: "ONA-PLB-PVC-20-3M",
    priceMinor: 2200_00,
    qty: 200,
  },
  {
    categorySlug: "portable",
    brandSlug: "felicity",
    tradeKey: "generator",
    slug: "felicity-3-5kva-petrol-generator",
    name: "Felicity 3.5kVA Petrol Generator",
    subtitle: "Portable · Recoil start",
    condition: "original",
    sku: "ONA-GEN-3P5-PET",
    priceMinor: 320000_00,
    qty: 12,
  },
  {
    categorySlug: "battery",
    brandSlug: "generic-pro",
    tradeKey: "battery",
    slug: "ona-car-battery-12v-75ah",
    name: "Ona 12V 75Ah Car Battery",
    subtitle: "Maintenance-free",
    condition: "original",
    sku: "ONA-BAT-12V-75",
    priceMinor: 95000_00,
    qty: 25,
  },
];

for (const s of samples) {
  try {
    await upsertProduct(s);
  } catch (e) {
    console.error("FAIL", s.sku, e.message || e);
  }
}

console.log("Seed complete");
