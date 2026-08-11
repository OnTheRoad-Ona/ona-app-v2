import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config({ path: "/Users/mac/Desktop/Code/Ona/.env.local" });
const sb = createClient(process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const slugs = ["tires","tubes","rims","wheels","valves","tpms","patches","tire-repair","balancing","alignment","tire-changers","compressors","vulcanizing-equipment"];
const { data: rows } = await sb.from("shop_trade_categories").select("id, slug").eq("trade_key","vulcanizer").in("slug", slugs);
let ok=0;
for (const r of rows||[]) {
  const { error } = await sb.from("shop_trade_categories")
    .update({ depth: 0, path: `/vulcanizer/${r.slug}` })
    .eq("id", r.id);
  if (error) console.warn(r.slug, error.message); else ok++;
}
console.log("promoted:", ok, "/", rows?.length);
