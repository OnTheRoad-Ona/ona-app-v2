import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config({ path: "/Users/mac/Desktop/Code/Ona/.env.local" });
import { VULCANIZER_PRODUCTS } from "/Users/mac/Desktop/Code/Ona/src/lib/shop/vulcanizer-catalog.ts";
const sb = createClient(process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: cats } = await sb.from("shop_trade_categories").select("id, slug, name, depth, path").eq("trade_key","vulcanizer");
const bySlug = new Map((cats||[]).map(c=>[c.slug, c]));
// categorySlugs used by catalog
const used = new Set(VULCANIZER_PRODUCTS.map(p=>p.categorySlug));
const usedRoots = new Set([...used].map(s=>s.split("/")[1]||s.split(">")[1]||s));
console.log("catalog product categorySlugs:", [...used].slice(0,20));
// check each product's category exists
let missingCat = [];
for (const p of VULCANIZER_PRODUCTS) {
  const slug = p.categorySlug.split(">").pop().trim();
  if (!bySlug.has(slug)) missingCat.push(`${p.sku} -> ${slug}`);
}
console.log("products whose category missing:", missingCat.length);
console.log(missingCat.slice(0,10));
