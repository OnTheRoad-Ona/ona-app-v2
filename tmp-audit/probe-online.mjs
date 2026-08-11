import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve("/Users/mac/Desktop/Code/Ona", ".env.local") });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
const sb = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const { data } = await sb.from("repair_pro_profiles")
  .select("user_id, business_name, is_online, location_updated_at, lat, lng, status")
  .eq("is_online", true);
console.log("=== is_online=true pros ===");
for (const r of data ?? []) {
  const ageMin = ((Date.now() - Date.parse(r.location_updated_at ?? r.updated_at ?? 0)) / 60000).toFixed(0);
  console.log(`${r.business_name ?? "?"}  online=${r.is_online}  loc_age_min=${ageMin}  status=${r.status}  loc=(${r.lat},${r.lng})`);
}
console.log("now:", new Date().toISOString());
