import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config({ path: "/Users/mac/Desktop/Code/Ona/.env.local" });
const sb = createClient(process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const slugs = ["tires","tubes","rims","wheels","valves","tpms","patches","tire-repair","vulcanizing-equipment","tire-changers","compressors","balancing","alignment"];
const { data } = await sb.from("shop_trade_categories").select("slug, depth, path, parent_id").eq("trade_key","vulcanizer").in("slug", slugs);
console.log("found for missing list:", JSON.stringify(data?.map(r=>({slug:r.slug,depth:r.depth,path:r.path,parent:r.parent_id})), null, 1));
const { data: d0 } = await sb.from("shop_trade_categories").select("slug, depth").eq("trade_key","vulcanizer").eq("depth",0);
console.log("all d0 count:", d0?.length);
