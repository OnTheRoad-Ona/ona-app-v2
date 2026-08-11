import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config({ path: "/Users/mac/Desktop/Code/Ona/.env.local" });
import { VULCANIZER_PRODUCTS } from "/Users/mac/Desktop/Code/Ona/src/lib/shop/vulcanizer-catalog.ts";
import { VULCANIZER_CATEGORY_TREE } from "/Users/mac/Desktop/Code/Ona/src/lib/shop/vulcanizer-taxonomy.ts";

const sb = createClient(process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const catalogSkus = new Set(VULCANIZER_PRODUCTS.map(p=>p.sku));
console.log("catalog SKUs:", catalogSkus.size);

const { data: products } = await sb.from("shop_products").select("id, trade_key, status").eq("trade_key","vulcanizer");
const { data: variants } = await sb.from("shop_product_variants").select("product_id, sku");
const { data: cats } = await sb.from("shop_trade_categories").select("slug, depth, path, parent_id").eq("trade_key","vulcanizer");

const dbSkus = new Set((variants||[]).map(v=>v.sku));
const missingInDb = [...catalogSkus].filter(s=>!dbSkus.has(s));
const extraInDb = [...dbSkus].filter(s=>!catalogSkus.has(s));
console.log("missing from DB:", missingInDb.length, missingInDb);
console.log("extra in DB:", extraInDb.length, extraInDb);

const roots = VULCANIZER_CATEGORY_TREE.map(r=>r.slug);
const dbRoots = new Set((cats||[]).filter(c=>c.depth===0).map(c=>c.slug));
const rootMissing = roots.filter(r=>!dbRoots.has(r));
console.log("missing root cats:", rootMissing.length, rootMissing);

const children = VULCANIZER_CATEGORY_TREE.flatMap(r=>r.children||[]).map(c=>c.slug);
const dbChild = new Set((cats||[]).filter(c=>c.depth===1).map(c=>c.slug));
const childMissing = children.filter(c=>!dbChild.has(c));
console.log("missing child cats:", childMissing.length, childMissing.slice(0,10));
console.log("total catalog child cats:", children.length, "DB child cats:", dbChild.size);

// listings / prices
const { data: listings } = await sb.from("shop_seller_listings").select("product_id, listing_status, price_minor");
const { count: listingCount } = await sb.from("shop_seller_listings").select("id",{count:"exact",head:true});
console.log("listings:", listingCount);
const { data: prices } = await sb.from("shop_product_variants").select("sku, price_minor").limit(5);
console.log("sample variant prices:", JSON.stringify(prices));
