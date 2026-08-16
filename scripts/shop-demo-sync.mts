#!/usr/bin/env node
/**
 * ONA Shop demo sync - idempotent, two jobs:
 *
 * 1) MERGE mechanic "brakes" (empty) into "Brake System" so there is exactly
 *    one braking folder, resolved on the real parent_id tree.
 *
 * 2) SEED 60 demo products PER TRADE (picture + realistic NGN price + stock
 *    spanning All/Available/Low Stock/Out of Stock/Pre-order/Coming soon).
 *    Products land on leaf categories so every folder/subfolder number tallies
 *    EXACTLY to the real product count (counts come from the parent tree,
 *    never from a saved number).
 *
 * Usage: npx tsx scripts/shop-demo-sync.mts
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });
const url =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
if (!url || !key) {
  console.error(
    "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local"
  );
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });

const DEMO_PER_TRADE = 60;

/** Short adjective banks - combined with real category names for names. */
const ADJECTIVES: Record<string, string[]> = {
  mechanic: ["Ceramic", "Semi-Metallic", "Heavy-Duty", "Performance", "OEM", "Pro"],
  vulcanizer: ["All-Season", "Tubeless", "Radial", "Heavy-Duty", "Sport", "Ultra"],
  towing: ["Industrial", "Steel", "Heavy-Duty", "Single", "Twin", "Pro"],
  battery: ["Maintenance-Free", "High-Capacity", "Deep-Cycle", "Lite", "Pro", "Ultra"],
  ac: ["R134a", "R32", "Dual-Zone", "Compact", "Pro", "Ultra"],
  body: ["Primed", "OEM-Formed", "Universal", "Durable", "Pro", "Flex"],
  electrical: ["12V", "24V", "High-Output", "Waterproof", "Pro", "Smart"],
  diagnostics: ["Quick-Read", "Full-System", "Bluetooth", "Pro", "Compact", "Ultra"],
  fashion: ["Bespoke", "Ankara", "Silk", "Linen", "Premium", "Studio"],
  plumber: ["Brass", "PEX", "PVC", "Chrome", "Heavy-Duty", "Quick-Fit"],
  carpenter: ["Birch", "Ironwood", "Hardened", "Precision", "Heavy-Duty", "Pro"],
  painter: ["Quick-Dry", "Low-VOC", "Anti-Fade", "Premium", "Pro", "Industrial"],
  solar: ["Mono", "Eco", "High-Efficiency", "Tier-1", "Pro", "Bifacial"],
  generator: ["Quiet", "Inverter", "Industrial", "High-Output", "Pro", "Compact"],
};

/** Price bands (NGN) per trade - realistic. */
const PRICE_BANDS: Record<string, [number, number]> = {
  mechanic: [3500, 220000],
  vulcanizer: [2500, 120000],
  towing: [5000, 160000],
  battery: [25000, 260000],
  ac: [8000, 210000],
  body: [4000, 190000],
  electrical: [3000, 95000],
  diagnostics: [15000, 620000],
  fashion: [3000, 95000],
  plumber: [1500, 65000],
  carpenter: [2500, 95000],
  painter: [3000, 85000],
  solar: [15000, 560000],
  generator: [12000, 360000],
};

const TRADE_LABEL: Record<string, string> = {
  mechanic: "Mechanic",
  vulcanizer: "Vulcanizer",
  towing: "Towing",
  battery: "Battery",
  ac: "Air Conditioning",
  body: "Auto Body",
  electrical: "Electrical",
  diagnostics: "Diagnostics",
  fashion: "Fashion",
  plumber: "Plumbing",
  carpenter: "Carpentry",
  painter: "Painting",
  solar: "Solar",
  generator: "Generator",
};

const SUFFIXES = ["", " Pro", " Kit", " Set", " Deluxe"];

/** Deterministic pseudo-random so prices/quantities are stable across runs. */
function seededRng(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function roundTo(n: number, step: number) {
  return Math.max(step, Math.round(n / step) * step);
}

type Cat = { id: string; slug: string; name: string; parent_id: string | null };

async function loadTree(trade: string) {
  const { data, error } = await sb
    .from("shop_trade_categories")
    .select("id, slug, name, parent_id")
    .eq("trade_key", trade)
    .eq("is_active", true);
  if (error) throw error;
  const cats = (data ?? []) as Cat[];
  const root = cats.find((c) => c.slug === trade);
  const childrenOf = new Map<string, string[]>();
  for (const c of cats) {
    if (!c.parent_id) continue;
    const pid = String(c.parent_id);
    childrenOf.set(pid, [...(childrenOf.get(pid) ?? []), c.id]);
  }
  // Only categories that hang off the trade container root are reachable in
  // the shop. Mechanic additionally carries legacy depth-0 branches that are
  // NOT part of the shop tree - products must only ever land inside this set.
  const reachable = new Set<string>();
  if (root) {
    const stack = [root.id];
    while (stack.length) {
      const id = stack.pop() as string;
      if (reachable.has(id)) continue;
      reachable.add(id);
      for (const kid of childrenOf.get(id) ?? []) stack.push(kid);
    }
  }
  const catById = new Map(cats.map((c) => [c.id, c]));
  const leafIds: Array<{ id: string; name: string }> = [];
  for (const id of reachable) {
    if (id === root?.id) continue;
    if ((childrenOf.get(id) ?? []).length) continue;
    const c = catById.get(id);
    if (c) leafIds.push({ id: c.id, name: c.name });
  }
  if (leafIds.length === 0) {
    for (const id of reachable) {
      const c = catById.get(id);
      if (c && c.id !== root?.id) leafIds.push({ id: c.id, name: c.name });
    }
  }
  // Deterministic order so generated slugs/names are stable across runs.
  leafIds.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return { root: root ?? null, reachable, leafIds };
}

/** Reset all demo products for a trade (variants/prices/stock cascade). */
async function wipeDemo(trade: string) {
  const { data, error } = await sb
    .from("shop_products")
    .select("id")
    .eq("trade_key", trade)
    .like("slug", `${trade}-demo-%`);
  if (error) throw error;
  const ids = (data ?? []).map((r) => r.id) as string[];
  for (let off = 0; off < ids.length; off += 100) {
    const { error: e } = await sb
      .from("shop_products")
      .delete()
      .in("id", ids.slice(off, off + 100));
    if (e) throw e;
  }
  if (ids.length) console.log(`[wipe] ${trade}: cleared ${ids.length} demo products`);
}

async function mergeBrakes() {
  const { data, error } = await sb
    .from("shop_trade_categories")
    .select("id, slug")
    .eq("trade_key", "mechanic")
    .in("slug", ["brakes", "brake-system"]);
  if (error) throw error;
  let merged = 0;
  for (const r of data ?? []) {
    if (r.slug === "brakes") {
      const { error: e2 } = await sb
        .from("shop_trade_categories")
        .update({ is_active: false })
        .eq("id", r.id);
      if (e2) throw e2;
      merged++;
    }
  }
  if (merged)
    console.log('[merge] "brakes" deactivated - single braking folder: Brake System');
  else console.log("[merge] mechanic brakes already merged");
}

async function ensureBrand(trade: string, label: string) {
  const slug = `ona-demo-${trade}`;
  const { data } = await sb
    .from("shop_brands")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (data) return String(data.id);
  const { data: ins, error } = await sb
    .from("shop_brands")
    .insert({ slug, name: `Ona ${label} Demo`, is_active: true })
    .select("id")
    .single();
  if (error) throw error;
  return String(ins.id);
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

type Plan = { status: string; qty: number; reorder: number };

/** Deterministic status spread so the 6 stock chips all light up. */
function statusPlan(i: number): Plan {
  const m = i % DEMO_PER_TRADE;
  if (m < 3) return { status: "future_product", qty: 0, reorder: 0 };
  if (m < 6) return { status: "source_pending", qty: 0, reorder: 0 };
  if (m < 12) return { status: "active", qty: 1 + (i % 3), reorder: 10 };
  if (m < 18) return { status: "active", qty: 0, reorder: 10 };
  return { status: "active", qty: 15 + ((i * 37) % 180), reorder: 5 };
}

function uniqueName(used: Set<string>, trade: string, i: number, catName: string): string {
  const adj = ADJECTIVES[trade] ?? ["Pro"];
  const a = adj[Math.floor(i / (DEMO_PER_TRADE / adj.length)) % adj.length] ?? "Pro";
  const base = `${a} ${catName}`;
  for (const s of SUFFIXES) {
    const n = `${base}${s}`.trim();
    if (!used.has(n)) {
      used.add(n);
      return n;
    }
  }
  const n = `${base} #${i + 1}`;
  used.add(n);
  return n;
}

async function locateHub(): Promise<string | null> {
  const { data } = await sb
    .from("shop_inventory_locations")
    .select("id")
    .limit(1)
    .maybeSingle();
  if (data) return String(data.id);
  const { data: ins, error } = await sb
    .from("shop_inventory_locations")
    .insert({ code: "LOS-HUB-1", name: "Lagos Main Hub" })
    .select("id")
    .single();
  return error ? null : String(ins.id);
}

async function seedTrade(trade: string) {
  const { leafIds: leaves } = await loadTree(trade);
  if (leaves.length === 0) {
    console.log(`[seed] ${trade}: no leaf categories, skipped`);
    return;
  }
  await wipeDemo(trade);
  const { data: existing, error: e0 } = await sb
    .from("shop_products")
    .select("slug")
    .eq("trade_key", trade);
  if (e0) throw e0;
  const haveSlug = new Set((existing ?? []).map((r) => String(r.slug)));
  const brandId = await ensureBrand(trade, TRADE_LABEL[trade] ?? trade);
  const [lo, hi] = PRICE_BANDS[trade] ?? [5000, 100000];
  const rng = seededRng(trade.length * 7919 + DEMO_PER_TRADE);
  const used = new Set<string>();
  const products: Array<Record<string, unknown>> = [];
  for (let i = 0; i < DEMO_PER_TRADE; i++) {
    const leaf = leaves[i % leaves.length];
    const name = uniqueName(used, trade, i, leaf.name);
    const slug = `${trade}-demo-${slugify(name)}-${i}`;
    if (haveSlug.has(slug)) continue;
    const st = statusPlan(i);
    products.push({
      slug,
      name,
      subtitle: `${TRADE_LABEL[trade] ?? trade} - ${leaf.name}`,
      description: `Ona demo product for the ${TRADE_LABEL[trade] ?? trade} catalogue.`,
      trade_key: trade,
      category_id: leaf.id,
      brand_id: brandId,
      condition_type: "aftermarket",
      primary_image_url: `https://picsum.photos/seed/ona-${trade}-${i}/600/600`,
      status: st.status,
      is_professional_only: false,
      is_demo: true,
      attributes: {},
      keywords: [leaf.name, TRADE_LABEL[trade] ?? trade],
    });
  }
  if (products.length === 0) {
    console.log(`[seed] ${trade}: already seeded (0 new)`);
    return;
  }
  const insertedRows: Array<Record<string, unknown>> = [];
  for (let off = 0; off < products.length; off += 50) {
    const { data, error } = await sb
      .from("shop_products")
      .insert(products.slice(off, off + 50))
      .select("id, slug");
    if (error) throw error;
    insertedRows.push(...((data ?? []) as Array<Record<string, unknown>>));
  }
  const bySlug = new Map(insertedRows.map((r) => [String(r.slug), String(r.id)]));
  const variants: Array<Record<string, unknown>> = [];
  for (let i = 0; i < products.length; i++) {
    const pid = bySlug.get(String(products[i].slug));
    if (!pid) continue;
    const sku = `ONA-${trade.toUpperCase()}-DEMO-${String(i + 1).padStart(3, "0")}`;
    variants.push({
      product_id: pid,
      sku,
      title: String(products[i].name),
      option_label: "Standard",
      unit: "each",
      status: "active",
    });
  }
  const variantRows: Array<Record<string, unknown>> = [];
  for (let off = 0; off < variants.length; off += 100) {
    const { data, error } = await sb
      .from("shop_product_variants")
      .insert(variants.slice(off, off + 100))
      .select("id, sku");
    if (error) throw error;
    variantRows.push(...((data ?? []) as Array<Record<string, unknown>>));
  }
  // Ensure stock/prices for every demo variant, including ones created on
  // earlier runs, so the run is idempotent.
  const { data: priorVariants, error: ePrior } = await sb
    .from("shop_product_variants")
    .select("id, sku")
    .like("sku", `ONA-${trade.toUpperCase()}-DEMO-%`);
  if (ePrior) throw ePrior;
  const vidBySku = new Map(variantRows.map((v) => [String(v.sku), String(v.id)]));
  for (const v of priorVariants ?? []) {
    if (!vidBySku.has(String(v.sku))) vidBySku.set(String(v.sku), String(v.id));
  }
  const locationId = await locateHub();
  const prices: Array<Record<string, unknown>> = [];
  const inventory: Array<Record<string, unknown>> = [];
  const alreadyPriced = new Set<string>();
  for (const vid of vidBySku.values()) {
    const { data: has } = await sb
      .from("shop_prices")
      .select("variant_id")
      .eq("variant_id", vid)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    if (has) alreadyPriced.add(vid);
  }
  for (const [sku, vid] of vidBySku) {
    const m = /(\d+)$/.exec(sku);
    const i = m ? parseInt(m[1], 10) - 1 : 0;
    if (!alreadyPriced.has(vid)) {
      prices.push({
        variant_id: vid,
        currency: "NGN",
        amount_minor: roundTo(lo + rng() * (hi - lo), 500) * 100,
        compare_at_minor: null,
        is_active: true,
      });
    }
    if (locationId) {
      const st = statusPlan(i);
      inventory.push({
        variant_id: vid,
        location_id: locationId,
        qty_on_hand: st.qty,
        qty_reserved: 0,
        reorder_level: st.reorder,
      });
    }
  }
  if (prices.length) {
    const { error: ep } = await sb.from("shop_prices").insert(prices);
    if (ep) throw ep;
  }
  if (inventory.length) {
    const { error: ei } = await sb
      .from("shop_inventory")
      .upsert(inventory, { onConflict: "variant_id,location_id" });
    if (ei) throw ei;
  }
  console.log(
    `[seed] ${trade}: +${products.length} products, +${variants.length} variants, ` +
      `+${prices.length} prices, +${inventory.length} stock rows`
  );
}

/** Walk the real parent_id tree: root subtree must equal total active products. */
async function verifyTallies() {
  const trades = Object.keys(TRADE_LABEL);
  let allOk = true;
  for (const trade of trades) {
    const { data: cats, error: e1 } = await sb
      .from("shop_trade_categories")
      .select("id, slug, parent_id")
      .eq("trade_key", trade)
      .eq("is_active", true);
    if (e1) throw e1;
    const { data: prods, error: e2 } = await sb
      .from("shop_products")
      .select("category_id")
      .eq("trade_key", trade)
      .eq("status", "active");
    if (e2) throw e2;
    const root = (cats ?? []).find((c) => c.slug === trade);
    if (!root) {
      console.log(`[verify] ${trade}: no container root found`);
      allOk = false;
      continue;
    }
    const childrenOf = new Map<string, string[]>();
    for (const c of cats ?? []) {
      if (!c.parent_id) continue;
      const pid = String(c.parent_id);
      childrenOf.set(pid, [...(childrenOf.get(pid) ?? []), String(c.id)]);
    }
    const direct = new Map<string, number>();
    for (const p of prods ?? []) {
      const cid = p.category_id ? String(p.category_id) : "";
      if (cid) direct.set(cid, (direct.get(cid) ?? 0) + 1);
    }
    const memo = new Map<string, number>();
    const sub = (id: string): number => {
      const m = memo.get(id);
      if (m !== undefined) return m;
      let t = direct.get(id) ?? 0;
      for (const kid of childrenOf.get(id) ?? []) t += sub(kid);
      memo.set(id, t);
      return t;
    };
    const total = (prods ?? []).length;
    const rootSum = sub(String(root.id));
    const ok = rootSum === total;
    if (!ok) allOk = false;
    console.log(
      `[verify] ${trade}: root-count=${rootSum} total-active=${total} ${ok ? "OK" : "MISMATCH"}`
    );
  }
  return allOk;
}

async function main() {
  await mergeBrakes();
  for (const trade of Object.keys(TRADE_LABEL)) {
    try {
      await seedTrade(trade);
    } catch (e) {
      console.error(`[seed] ${trade} FAILED:`, e instanceof Error ? e.message : e);
    }
  }
  const ok = await verifyTallies();
  console.log(ok ? "[verify] ALL TRADES TALLY EXACTLY" : "[verify] TALLY MISMATCH FOUND");
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});