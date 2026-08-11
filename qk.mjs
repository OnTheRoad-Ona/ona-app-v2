import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config({ path: ".env.local" });
const sb = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || ""
);
const { data: vroot } = await sb
  .from("shop_trade_categories")
  .select("id,slug")
  .eq("trade_key", "vulcanizer")
  .eq("slug", "vulcanizer")
  .maybeSingle();
const { data: prods } = await sb
  .from("shop_products")
  .select("category_id")
  .eq("trade_key", "vulcanizer")
  .eq("status", "active");
const c = new Map();
for (const p of prods ?? []) c.set(p.category_id, (c.get(p.category_id) || 0) + 1);
const { data: kids } = await sb
  .from("shop_trade_categories")
  .select("slug")
  .eq("parent_id", vroot.id)
  .order("sort_order", { ascending: true });
console.log("vulcanizer container kids:", kids?.length);
for (const k of kids ?? []) console.log(" ", k.slug);