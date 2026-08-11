import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config({ path: ".env.local" });
const sb = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || ""
);

for (const trade of ["mechanic", "solar", "vulcanizer"]) {
  const { data: roots } = await sb
    .from("shop_trade_categories")
    .select("id,slug,depth,path,parent_id")
    .eq("trade_key", trade)
    .eq("depth", 0)
    .order("sort_order", { ascending: true });
  const { data: prods } = await sb
    .from("shop_products")
    .select("category_id")
    .eq("trade_key", trade)
    .eq("status", "active");
  const countByCat = new Map();
  for (const p of prods ?? []) countByCat.set(p.category_id, (countByCat.get(p.category_id) || 0) + 1);
  console.log(`\n=== ${trade}: ${roots?.length} depth-0 roots, ${prods?.length} products ===`);
  for (const r of roots ?? []) {
    const { data: kids } = await sb
      .from("shop_trade_categories")
      .select("id,slug")
      .eq("parent_id", r.id)
      .limit(30);
    const direct = countByCat.get(r.id) || 0;
    const kidsWithProds = (kids ?? []).filter((k) => (countByCat.get(k.id) || 0) > 0).length;
    console.log(
      `  ${r.slug.padEnd(30)} direct=${direct} kids=${(kids ?? []).length} kidsWithProds=${kidsWithProds}`
    );
  }
}