import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config({ path: "/Users/mac/Desktop/Code/Ona/.env.local" });
import { VULCANIZER_PRODUCTS } from "/Users/mac/Desktop/Code/Ona/src/lib/shop/vulcanizer-catalog.ts";
const sb = createClient(process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: cats } = await sb.from("shop_trade_categories").select("id, slug, name, depth, path, parent_id").eq("trade_key","vulcanizer");
const catBySlug = new Map(cats.map(c=>[c.slug,c]));
const { data: prods } = await sb.from("shop_products").select("id, name, category_id, trade_key").eq("trade_key","vulcanizer");

// which category does each product's catalogue categorySlug resolve to?
let mismatched = 0, missing = 0;
for (const p of VULCANIZER_PRODUCTS) {
  const slug = p.categorySlug.split(">").pop().trim();
  const prod = prods.find(x=>x.name===p.name);
  if (!prod) continue;
  const cat = catBySlug.get(slug);
  const actualCat = cats.find(c=>c.id===prod.category_id);
  if (!cat) { missing++; console.log(`no cat in tree: ${p.sku} -> ${slug}`); continue; }
  if (actualCat?.id !== cat.id) {
    mismatched++;
    if (mismatched<=5) console.log(`mismatch: ${p.sku} -> tree[${slug}] but product points to ${actualCat?.slug||actualCat?.id}`);
  }
}
console.log(`category mismatches=${mismatched} no-tree-cat=${missing}`);
// samples of how import created cats
const { data: improts } = await sb.from("shop_trade_categories").select("slug,name,path,depth").eq("trade_key","vulcanizer").eq("depth",1).limit(8);
console.log("sample d1 cats in DB:", JSON.stringify(improts));
