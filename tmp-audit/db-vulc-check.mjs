import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config({ path: "/Users/mac/Desktop/Code/Ona/.env.local" });
const sb = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const count = async (table, filter) => {
  const b = sb.from(table).select("id", { count: "exact", head: true });
  const q = filter ? b.match(filter) : b;
  const { count, error } = await q;
  return { count, error: error?.message };
};
console.log("products vulcanizer:", JSON.stringify(await count("shop_products", { trade_key: "vulcanizer" })));
console.log("products mechanic:", JSON.stringify(await count("shop_products", { trade_key: "mechanic" })));
console.log("products total:", JSON.stringify(await count("shop_products")));
const { data: catRows } = await sb.from("shop_trade_categories").select("trade_key, depth");
const byCat = {};
for (const r of catRows||[]) byCat[`${r.trade_key}:d${r.depth}`] = (byCat[`${r.trade_key}:d${r.depth}`]||0)+1;
console.log("categories per trade:", JSON.stringify(byCat));
const { data: vp } = await sb.from("shop_products").select("status").eq("trade_key","vulcanizer");
if (vp) { const s={}; for (const r of vp) s[r.status]=(s[r.status]||0)+1; console.log("vulcanizer status:", JSON.stringify(s)); }
console.log("listings total:", JSON.stringify(await count("shop_seller_listings")));
const { data: vv } = await sb.from("shop_product_variants").select("trade_key");
if (vv) { const s={}; for (const r of vv) s[r.trade_key]=(s[r.trade_key]||0)+1; console.log("variants per trade:", JSON.stringify(s)); }
const { data: inv } = await sb.from("shop_inventory").select("variant_id");
console.log("inventory rows:", inv?.length ?? 0);
const { data: src } = await sb.from("shop_product_trades").select("trade_key");
if (src) { const s={}; for (const r of src) s[r.trade_key]=(s[r.trade_key]||0)+1; console.log("product_trades:", JSON.stringify(s)); }
