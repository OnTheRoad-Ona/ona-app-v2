import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config({ path: "/Users/mac/Desktop/Code/Ona/.env.local" });
const sb = createClient(process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const cnt = async (t, f) => { const b=sb.from(t).select("id",{count:"exact",head:true}); const q=f?b.match(f):b; const {count,error}=await q; return {count,error:error?.message}; };
console.log("shop_prices:", JSON.stringify(await cnt("shop_prices")));
console.log("shop_prices active:", JSON.stringify(await cnt("shop_prices",{is_active:true})));
console.log("shop_inventory:", JSON.stringify(await cnt("shop_inventory")));
console.log("shop_product_trades:", JSON.stringify(await cnt("shop_product_trades")));
console.log("shop_seller_listings:", JSON.stringify(await cnt("shop_seller_listings")));
console.log("shop_availability_view rows:", JSON.stringify(await cnt("shop_availability_view")));
// breakdown of product_trades
const {data: pt} = await sb.from("shop_product_trades").select("trade_key");
if (pt) { const s={}; for (const r of pt) s[r.trade_key]=(s[r.trade_key]||0)+1; console.log("product_trades breakdown:", JSON.stringify(s)); }
// listings existence check
const { data: l0 } = await sb.from("shop_seller_listings").select("*").limit(2);
console.log("sample listings:", JSON.stringify(l0));
