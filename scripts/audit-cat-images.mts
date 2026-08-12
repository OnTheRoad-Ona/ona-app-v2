import { createClient } from "@supabase/supabase-js";
process.loadEnvFile(".env.local");

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const trades = ["mechanic","vulcanizer","towing","battery","ac","body","electrical","diagnostics","wash","plumber","carpenter","painter","solar","generator"];

for (const t of trades) {
  const { data: prods } = await sb
    .from("shop_products")
    .select("id, name, category_id, primary_image_url")
    .eq("trade_key", t)
    .like("slug", `${t}-demo-%`);
  if (!prods?.length) continue;
  const catIds = [...new Set(prods.map((p) => String(p.category_id)))];
  const { data: cats } = await sb
    .from("shop_trade_categories")
    .select("id, name, slug")
    .in("id", catIds);
  const nameById = new Map((cats ?? []).map((c) => [String(c.id), c]));
  const counts = new Map<string, { name: string; n: number }>();
  for (const p of prods) {
    const c = nameById.get(String(p.category_id));
    const key = c?.slug ?? "?";
    const cur = counts.get(key) ?? { name: c?.name ?? "?", n: 0 };
    cur.n++;
    counts.set(key, cur);
  }
  console.log(`=== ${t} (${prods.length} demo products) ===`);
  for (const [slug, v] of [...counts.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name))) {
    console.log(`  ${v.n}x ${v.name}  [${slug}]`);
  }
}
