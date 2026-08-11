import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve("/Users/mac/Desktop/Code/Ona", ".env.local") });
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
(async () => {
  const r = await sb.from("repair_pro_profiles").select("user_id", { count: "exact", head: true });
  console.log("REST-API count:", r.count, "error:", r.error?.message ?? "none");
  const r2 = await sb.from("profiles").select("id", { count: "exact", head: true });
  console.log("profiles count:", r2.count, "error:", r2.error?.message ?? "none");
  const r3 = await sb.storage.listBuckets();
  console.log("buckets:", JSON.stringify((r3.data ?? []).map(b => ({name:b.name, size: b.size ?? null, file_count: b.file_count ?? null}))));
})();
