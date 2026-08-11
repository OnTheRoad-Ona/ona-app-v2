import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve("/Users/mac/Desktop/Code/Ona", ".env.local") });
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const { data } = await sb.from("notifications").select("id, user_id, category, job_id, href, created_at").is("read_at", null).order("created_at", { ascending: false }).limit(50);
for (const n of data ?? []) {
  console.log(`${n.user_id?.slice(0,8)} | ${n.category} | job=${n.job_id || "-"} | ${n.href || "-"} | ${n.created_at}`);
}
