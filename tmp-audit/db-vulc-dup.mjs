import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config({ path: "/Users/mac/Desktop/Code/Ona/.env.local" });
import { VULCANIZER_CATEGORY_TREE } from "/Users/mac/Desktop/Code/Ona/src/lib/shop/vulcanizer-taxonomy.ts";
const sb = createClient(process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: cats } = await sb.from("shop_trade_categories").select("id, slug, depth").eq("trade_key","vulcanizer");
const bySlug = {};
for (const c of cats||[]) { (bySlug[c.slug] ??= []).push(c); }
const dups = Object.entries(bySlug).filter(([,v])=>v.length>1);
console.log("duplicate slugs:", dups.length);
for (const [slug, arr] of dups.slice(0,8)) console.log(`  ${slug}:`, arr.map(c=>`${c.id.slice(0,8)}@d${c.depth}`).join(", "));
// how many of the 13 misplaced roots have a duplicate? 
const roots13 = ["tires","tubes","rims","wheels","valves","tpms","patches","tire-repair","balancing","alignment","tire-changers","compressors","vulcanizing-equipment"];
for (const r of roots13) if ((bySlug[r]||[]).length>1) console.log(`DUPLICATE ROOT: ${r}`, bySlug[r].map(c=>`${c.id.slice(0,8)}@d${c.depth}`).join(", "));
