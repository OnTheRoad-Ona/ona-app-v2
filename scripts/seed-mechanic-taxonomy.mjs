#!/usr/bin/env node
/**
 * Seed full Nigerian Mechanic category tree into shop_trade_categories.
 * Usage: node scripts/seed-mechanic-taxonomy.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: resolve(root, ".env.local") });

// Inline tree (keep in sync with src/lib/shop/mechanic-taxonomy.ts — seed is JS)
const { walkMechanicCategories } = await import(
  `file://${resolve(root, "src/lib/shop/mechanic-taxonomy.ts")}`
).catch(async () => {
  // Fallback: dynamic import may fail without ts; parse via vitest path not available.
  // Use compiled walk by re-reading is not possible — duplicate minimal walker from JSON export.
  return { walkMechanicCategories: null };
});

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error("Missing Supabase URL / service role key");
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

// Prefer TS module via node --experimental-strip-types if available; else embed walk from file
async function getRows() {
  if (typeof walkMechanicCategories === "function") {
    return walkMechanicCategories();
  }
  // Parse MECHANIC_CATEGORY_TREE from TS source (simple regex seed)
  const src = readFileSync(
    resolve(root, "src/lib/shop/mechanic-taxonomy.ts"),
    "utf8"
  );
  // Execute walk by spawning with tsx/node if present
  const { spawnSync } = await import("node:child_process");
  const r = spawnSync(
    "npx",
    [
      "--yes",
      "tsx",
      "-e",
      `import { walkMechanicCategories } from './src/lib/shop/mechanic-taxonomy.ts'; console.log(JSON.stringify(walkMechanicCategories()))`,
    ],
    { cwd: root, encoding: "utf8", maxBuffer: 10e6 }
  );
  if (r.status === 0 && r.stdout?.trim()) {
    return JSON.parse(r.stdout.trim().split("\n").pop());
  }
  console.error("Could not load mechanic taxonomy", r.stderr?.slice(0, 400));
  process.exit(1);
}

const rows = await getRows();
console.log(`[seed-mechanic] categories to upsert: ${rows.length}`);

// Map parentSlug → id after insert roots first
const idBySlug = new Map();

// Existing mechanic roots
const { data: existing } = await sb
  .from("shop_trade_categories")
  .select("id, slug, parent_id, depth")
  .eq("trade_key", "mechanic");
for (const e of existing || []) {
  idBySlug.set(e.slug, e.id);
}

const roots = rows.filter((r) => r.depth === 0);
const children = rows.filter((r) => r.depth === 1);

for (const r of roots) {
  if (idBySlug.has(r.slug)) continue;
  const { data, error } = await sb
    .from("shop_trade_categories")
    .insert({
      trade_key: "mechanic",
      slug: r.slug,
      name: r.name,
      parent_id: null,
      depth: 0,
      path: `/${r.slug}`,
      sort_order: r.sortOrder,
      is_active: true,
    })
    .select("id, slug")
    .single();
  if (error) {
    // unique conflict — fetch
    const { data: row } = await sb
      .from("shop_trade_categories")
      .select("id, slug")
      .eq("trade_key", "mechanic")
      .eq("slug", r.slug)
      .maybeSingle();
    if (row) idBySlug.set(row.slug, row.id);
    else console.warn("root fail", r.slug, error.message);
  } else if (data) {
    idBySlug.set(data.slug, data.id);
  }
}

// Refresh root map
const { data: rootsDb } = await sb
  .from("shop_trade_categories")
  .select("id, slug")
  .eq("trade_key", "mechanic")
  .is("parent_id", null);
for (const e of rootsDb || []) idBySlug.set(e.slug, e.id);

let childOk = 0;
for (const r of children) {
  const parentId = idBySlug.get(r.parentSlug);
  if (!parentId) {
    console.warn("no parent", r.parentSlug, "for", r.slug);
    continue;
  }
  if (idBySlug.has(r.slug)) {
    childOk++;
    continue;
  }
  const { data, error } = await sb
    .from("shop_trade_categories")
    .insert({
      trade_key: "mechanic",
      slug: r.slug,
      name: r.name,
      parent_id: parentId,
      depth: 1,
      path: `/${r.parentSlug}/${r.slug}`,
      sort_order: r.sortOrder,
      is_active: true,
    })
    .select("id, slug")
    .single();
  if (error) {
    const { data: row } = await sb
      .from("shop_trade_categories")
      .select("id, slug")
      .eq("trade_key", "mechanic")
      .eq("slug", r.slug)
      .maybeSingle();
    if (row) {
      idBySlug.set(row.slug, row.id);
      childOk++;
    } else console.warn("child fail", r.slug, error.message);
  } else if (data) {
    idBySlug.set(data.slug, data.id);
    childOk++;
  }
}

// Ensure platform seller
await sb.from("shop_sellers").upsert(
  {
    slug: "ona-platform",
    name: "Ona Catalog",
    seller_type: "platform",
    verification_status: "verified",
    is_active: true,
  },
  { onConflict: "slug" }
);

console.log(
  `[seed-mechanic] done roots=${roots.length} children_ok=${childOk} total_map=${idBySlug.size}`
);
