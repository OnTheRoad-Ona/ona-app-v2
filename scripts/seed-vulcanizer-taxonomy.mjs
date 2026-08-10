#!/usr/bin/env node
/**
 * Seed full Vulcanizer Shop category tree into shop_trade_categories.
 * Usage: node scripts/seed-vulcanizer-taxonomy.mjs
 *
 * Idempotent: uses (trade_key, slug) unique index, re-running skips existing.
 * Mirrors seed-mechanic-taxonomy.mjs but keeps the trade root "vulcanizer"
 * parented correctly (mechanic seeded roots at depth 0; we seed under the
 * trade root row so getTradeCategories({ rootsOnly }) stays correct).
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: resolve(root, ".env.local") });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error("Missing Supabase URL / service role key");
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

async function getRows() {
  const { spawnSync } = await import("node:child_process");
  const r = spawnSync(
    "npx",
    [
      "--yes",
      "tsx",
      "-e",
      `import { walkVulcanizerCategories } from './src/lib/shop/vulcanizer-taxonomy.ts'; console.log(JSON.stringify(walkVulcanizerCategories()))`,
    ],
    { cwd: root, encoding: "utf8", maxBuffer: 10e6 }
  );
  if (r.status === 0 && r.stdout?.trim()) {
    return JSON.parse(r.stdout.trim().split("\n").pop());
  }
  console.error("Could not load vulcanizer taxonomy", r.stderr?.slice(0, 400));
  process.exit(1);
}

// Ensure the trade root row exists (depth 0, slug = trade key).
async function ensureTradeRoot() {
  const { data: existing } = await sb
    .from("shop_trade_categories")
    .select("id")
    .eq("trade_key", "vulcanizer")
    .eq("slug", "vulcanizer")
    .eq("depth", 0)
    .maybeSingle();
  if (existing) return existing.id;
  const { data, error } = await sb
    .from("shop_trade_categories")
    .insert({
      trade_key: "vulcanizer",
      slug: "vulcanizer",
      name: "Vulcanizer",
      parent_id: null,
      depth: 0,
      path: "/vulcanizer",
      sort_order: 0,
      is_active: true,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

const rows = await getRows();
const roots = rows.filter((r) => r.depth === 0);
const children = rows.filter((r) => r.depth === 1);
console.log(`[seed-vulcanizer] categories to upsert: ${rows.length}`);

const tradeRootId = await ensureTradeRoot();
console.log(`[seed-vulcanizer] trade root id=${tradeRootId}`);

const idBySlug = new Map();
idBySlug.set("vulcanizer", tradeRootId);

const { data: existing } = await sb
  .from("shop_trade_categories")
  .select("id, slug")
  .eq("trade_key", "vulcanizer");
for (const e of existing || []) {
  idBySlug.set(e.slug, e.id);
}

let rootOk = 0;
for (const r of roots) {
  if (idBySlug.has(r.slug)) {
    rootOk++;
    continue;
  }
  const { data, error } = await sb
    .from("shop_trade_categories")
    .insert({
      trade_key: "vulcanizer",
      slug: r.slug,
      name: r.name,
      parent_id: tradeRootId,
      depth: 0,
      path: `/vulcanizer/${r.slug}`,
      sort_order: r.sortOrder,
      is_active: true,
    })
    .select("id, slug")
    .single();
  if (error) {
    const { data: row } = await sb
      .from("shop_trade_categories")
      .select("id, slug")
      .eq("trade_key", "vulcanizer")
      .eq("slug", r.slug)
      .maybeSingle();
    if (row) {
      idBySlug.set(row.slug, row.id);
      rootOk++;
    }
  } else if (data) {
    idBySlug.set(data.slug, data.id);
    rootOk++;
  }
}

let childOk = 0;
const rootToId = new Map(
  roots.map((r) => [r.slug, idBySlug.get(r.slug)])
);
for (const c of children) {
  const parentId = rootToId.get(c.parentSlug);
  if (!parentId) {
    console.warn("no parent", c.parentSlug, "for", c.slug);
    continue;
  }
  if (idBySlug.has(c.slug)) {
    childOk++;
    continue;
  }
  const { data, error } = await sb
    .from("shop_trade_categories")
    .insert({
      trade_key: "vulcanizer",
      slug: c.slug,
      name: c.name,
      parent_id: parentId,
      depth: 1,
      path: `/vulcanizer/${c.parentSlug}/${c.slug}`,
      sort_order: c.sortOrder,
      is_active: true,
    })
    .select("id, slug")
    .single();
  if (error) {
    const { data: row } = await sb
      .from("shop_trade_categories")
      .select("id, slug")
      .eq("trade_key", "vulcanizer")
      .eq("slug", c.slug)
      .maybeSingle();
    if (row) {
      idBySlug.set(row.slug, row.id);
      childOk++;
    }
  } else if (data) {
    idBySlug.set(data.slug, data.id);
    childOk++;
  }
}

console.log(
  `[seed-vulcanizer] done roots_ok=${rootOk}/${roots.length} children_ok=${childOk} total_map=${idBySlug.size}`
);