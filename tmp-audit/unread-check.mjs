import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve("/Users/mac/Desktop/Code/Ona", ".env.local") });
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const { data } = await sb.from("notifications")
  .select("id, user_id, category, title, job_id, read_at, created_at")
  .is("read_at", null)
  .order("created_at", { ascending: false });
console.log("=== UNREAD notifications total:", data?.length ?? 0, "===");
for (const n of data ?? []) {
  console.log(`${n.user_id?.slice(0,8)}  ${n.category}  read=${n.read_at ?? "NULL"}  job=${(n.job_id ?? "").slice(0,8)}  "${(n.title ?? "").slice(0,30)}"`);
}
