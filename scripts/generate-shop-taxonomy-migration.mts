#!/usr/bin/env node
/**
 * Generate the shop taxonomy seed migration from src/lib/shop/taxonomy.ts.
 * Source of truth is taxonomy.ts — run this to (re)emit:
 *   supabase/migrations/20260809_056_shop_trade_taxonomy.sql
 *
 * Usage:
 *   npx tsx scripts/generate-shop-taxonomy-migration.mts
 */

import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SHOP_TRADE_TAXONOMY } from "../src/lib/shop/taxonomy";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const lines: string[] = [];
lines.push("-- ============================================================");
lines.push("-- ONA SHOP trade taxonomy seed (Phase 1 trade separation)");
lines.push("-- Generated from src/lib/shop/taxonomy.ts — do NOT hand-edit.");
lines.push("-- One independent category tree per trade. Vehicle fitment is");
lines.push("-- ONLY applicable to vehicle-based trades (enforced in schema,");
lines.push("-- backend and UI).");
lines.push("-- ============================================================");
lines.push("");

for (const trade of SHOP_TRADE_TAXONOMY) {
  lines.push(`-- ------------------------------------------------------------`);
  lines.push(`-- ${trade.name} (${trade.key}) vehicleBased=${trade.vehicleBased}`);
  lines.push(`-- ------------------------------------------------------------`);
  lines.push(`do $$`);
  lines.push(`declare`);
  lines.push(`  parent_id uuid;`);
  lines.push(`  idx int := 0;`);
  lines.push(`begin`);
  lines.push(`  select id into parent_id from public.shop_trade_categories`);
  lines.push(`    where trade_key = '${trade.key}' and depth = 0 limit 1;`);
  lines.push(`  if parent_id is null then`);
  lines.push(`    insert into public.shop_trade_categories`);
  lines.push(`      (trade_key, slug, name, description, sort_order, depth, path)`);
  lines.push(`      values ('${trade.key}', '${trade.key}', '${trade.name}', null, 1, 0, '${trade.key}')`);
  lines.push(`      returning id into parent_id;`);
  lines.push(`  end if;`);
  for (const cat of trade.roots) {
    lines.push(`  idx := idx + 1;`);
    lines.push(`  insert into public.shop_trade_categories`);
    lines.push(`    (parent_id, trade_key, slug, name, description, sort_order, depth, path)`);
    lines.push(`    values (`);
    lines.push(`      parent_id,`);
    lines.push(`      '${trade.key}',`);
    lines.push(`      '${cat.slug}',`);
    lines.push(`      '${cat.name}',`);
    lines.push(`      null,`);
    lines.push(`      idx,`);
    lines.push(`      1,`);
    lines.push(`      '${trade.key}/${cat.slug}'`);
    lines.push(`    )`);
    lines.push(`    on conflict on constraint shop_trade_categories_parent_id_slug_key do nothing;`);
  }
  lines.push(`end $$;`);
  lines.push("");
}

// Allowlist of (trade_key, slug) depth-1 categories we want to keep.
const allow: Array<[string, string]> = [];
for (const trade of SHOP_TRADE_TAXONOMY) {
  for (const cat of trade.roots) allow.push([trade.key, cat.slug]);
}

lines.push("-- ------------------------------------------------------------");
lines.push("-- Remove any depth-1 category not in the taxonomy allowlist");
lines.push("-- (e.g. legacy sample: mechanic/brake-system, mechanic/engine-oil,");
lines.push("-- plumber/pipes-fittings, generator/portable) when unreferenced.");
lines.push("-- ------------------------------------------------------------");
lines.push(`do $$`);
lines.push(`declare`);
lines.push(`  allowed text[] := array[`);
{
  const parts = allow.map(([t, s]) => `'${t}/${s}'`);
  // chunk to keep lines readable
  const chunk = 6;
  for (let i = 0; i < parts.length; i += chunk) {
    const line = parts.slice(i, i + chunk).join(",");
    lines.push(`    ${line}${i + chunk < parts.length ? "," : ""}`);
  }
}
lines.push(`  ]::text[];`);
lines.push(`  r record;`);
lines.push(`begin`);
lines.push(`  for r in`);
lines.push(`    select c.id`);
lines.push(`    from public.shop_trade_categories c`);
lines.push(`    where c.depth = 1`);
lines.push(`      and not (array_position(allowed, c.trade_key || '/' || c.slug) is not null)`);
lines.push(`      and not exists (`);
lines.push(`        select 1 from public.shop_products p`);
lines.push(`        where p.category_id = c.id`);
lines.push(`      )`);
lines.push(`  loop`);
lines.push(`    delete from public.shop_trade_categories where id = r.id;`);
lines.push(`  end loop;`);
lines.push(`end $$;`);
lines.push("");

const outFile = resolve(
  root,
  "supabase/migrations/20260809_056_shop_trade_taxonomy.sql"
);
writeFileSync(outFile, lines.join("\n"));
console.log(`Wrote ${outFile}`);