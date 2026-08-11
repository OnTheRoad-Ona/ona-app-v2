process.loadEnvFile(".env.local");
import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data, error } = await sb
  .from("profiles")
  .select("id, full_name, avatar_url, created_at")
  .limit(15);
if (error) { console.error("query error", error.message); process.exit(1); }
console.log("total profiles with avatar:", (data || []).filter((p) => p.avatar_url).length, "of", (data || []).length);
for (const p of data || []) {
  console.log(`${p.id} | ${p.full_name || "?"} | avatar=${p.avatar_url ? "YES " + String(p.avatar_url).slice(0, 45) : "NO"}`);
}
