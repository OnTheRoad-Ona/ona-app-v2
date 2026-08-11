import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config({ path: "/Users/mac/Desktop/Code/Ona/.env.local" });
const sb = createClient(process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: roots } = await sb.from("shop_trade_categories").select("slug, name, depth").eq("trade_key","vulcanizer").eq("depth",0);
console.log("DB roots present:", roots?.length);
console.log(roots?.map(r=>`${r.slug} "${r.name}"`).join("\n"));
