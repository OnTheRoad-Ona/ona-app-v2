import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve("/Users/mac/Desktop/Code/Ona", ".env.local") });
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const { data } = await sb.from("notifications")
  .select("*")
  .eq("user_id", "9812bfbc-90a7-46c0-a467-dab9d9bc6a49")
  .is("read_at", null)
  .order("created_at", { ascending: false });
for (const n of data ?? []) {
  console.log(JSON.stringify({
    id: n.id, cat: n.category, job_id: n.job_id, href: n.href,
    title: n.title, body: n.body?.slice(0,60),
    group_key: n.group_key, action_type: n.action_type,
    created: n.created_at, read_at: n.read_at, link: n.link
  }));
}
