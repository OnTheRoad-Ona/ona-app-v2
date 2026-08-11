import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config({ path: ".env.local" });
const sb = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || ""
);

for (const trade of ["vulcanizer", "mechanic"]) {
  const { data: cats } = await sb
    .from("shop_trade_categories")
    .select("id,slug,depth,path,parent_id")
    .eq("trade_key", trade)
    .eq("slug", "tires");
  console.log(`=== ${trade} 'tires' rows ===`);
  for (const c of cats ?? []) {
    console.log(" ", c.id, "depth", c.depth, "path", c.path, "parent", c.parent_id);
  }
  const { data: prods } = await sb
    .from("shop_products")
    .select("category_id")
    .eq("trade_key", trade)
    .eq("status", "active");
  console.log(`=== ${trade}: ${prods?.length} products ===`);
  for (const c of cats ?? []) {
    const n = prods?.filter((p) => p.category_id === c.id).length ?? 0;
    console.log("   ", c.path, "->", n, "direct products");
  }
}