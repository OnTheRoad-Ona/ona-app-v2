import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config({ path: "/Users/mac/Desktop/Code/Ona/.env.local" });
import { VULCANIZER_CATEGORY_TREE } from "/Users/mac/Desktop/Code/Ona/src/lib/shop/vulcanizer-taxonomy.ts";

const sb = createClient(process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const treeSlugs = new Set(VULCANIZER_CATEGORY_TREE.map(r=>r.slug));
const { data: cats } = await sb.from("shop_trade_categories").select("id, slug, depth, path, parent_id").eq("trade_key","vulcanizer");
// roots that exist at depth1 but should be depth0
const mis = (cats||[]).filter(c=>treeSlugs.has(c.slug) && c.depth!==0);
console.log("tree slugs wrongly embedded:", mis.map(c=>`${c.slug}@d${c.depth}`).join(", "));
// count children pointing under them
for (const m of mis) {
  const kids = (cats||[]).filter(c=>c.parent_id===m.id);
  console.log(`${m.slug} (d${m.depth}) has ${kids.length} children:`, kids.slice(0,5).map(k=>k.slug).join(","));
}
// does tree also define those as roots with children? show tree overlap
const rootSlugs = VULCANIZER_CATEGORY_TREE.filter(r=>{
  const dbRow = (cats||[]).find(c=>c.slug===r.slug);
  return dbRow && dbRow.depth!==0;
}).map(r=>r.slug);
console.log("tree roots needing re-home:", rootSlugs.length);
