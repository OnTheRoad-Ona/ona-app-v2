process.loadEnvFile(".env.local");
import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, count } = await sb.from("shop_products").select("primary_image_url, trade_key", { count: "exact" }).like("slug", "%-demo-%");
const picsum = data.filter((p) => String(p.primary_image_url || "").includes("picsum")).length;
const wiki = data.filter((p) => String(p.primary_image_url || "").includes("wikipedia")).length;
const lorem = data.filter((p) => String(p.primary_image_url || "").includes("loremflickr")).length;
const broken = data.filter((p) => String(p.primary_image_url || "").includes("broken-image")).length;
const other = count - picsum - wiki - lorem - broken;
console.log(`total demo: ${count} | wikipedia: ${wiki} | picsum: ${picsum} | loremflickr: ${lorem} | broken-image: ${broken} | other: ${other}`);
const byTrade = {};
for (const p of data) byTrade[p.trade_key || "?"] = (byTrade[p.trade_key || "?"] || 0) + 1;
for (const [k, v] of Object.entries(byTrade)) {
  const w = data.filter((p) => p.trade_key === k && String(p.primary_image_url || "").includes("wikipedia")).length;
  console.log(`  ${k}: ${w}/${v} have wikipedia`);
}
