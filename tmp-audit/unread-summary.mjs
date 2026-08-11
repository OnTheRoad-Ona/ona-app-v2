import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve("/Users/mac/Desktop/Code/Ona", ".env.local") });
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const { data } = await sb.from("notifications")
  .select("id, user_id, category, job_id, read_at, created_at")
  .is("read_at", null);
const byUser = {};
for (const n of data ?? []) {
  const k = `${n.user_id?.slice(0,8)}/${n.category}`;
  byUser[k] = (byUser[k] ?? 0) + 1;
}
console.log("unread per user/category:", JSON.stringify(byUser, null, 2));
const { data: readRecent } = await sb.from("notifications")
  .select("user_id, read_at")
  .not("read_at", "is", null)
  .order("read_at", { ascending: false })
  .limit(10);
console.log("recently-read:", readRecent?.map(r => `${r.user_id?.slice(0,8)} ${r.read_at}`));
