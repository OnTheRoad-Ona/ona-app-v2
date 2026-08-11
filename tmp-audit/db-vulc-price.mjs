import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config({ path: "/Users/mac/Desktop/Code/Ona/.env.local" });
const sb = createClient(process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: v } = await sb.from("shop_product_variants").select("id, product_id, sku, option_label, unit_price_minor, price_minor, cost_minor").in("sku",["ONA-TYR-205-55-16","ONA-VUL-SHL-001","ONA-PSG-80-001","ONA-RIM-225-17-001"]);
console.log("variant cols for 4 products:", JSON.stringify(v?.[0] ?? null));
const { data: cols } = await sb.from("shop_product_variants").select("*").limit(1);
console.log("first variant row keys:", cols?.[0] ? Object.keys(cols[0]).join(",") : "none");
const { data: p } = await sb.from("shop_products").select("id, name, slug, trade_key, status, base_price_minor, listing_price_minor").limit(3);
console.log("products keys:", p?.[0] ? Object.keys(p[0]).join(",") : "none");
