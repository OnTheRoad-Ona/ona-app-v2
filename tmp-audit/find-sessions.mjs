import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve("/Users/mac/Desktop/Code/Ona", ".env.local") });
const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
const sb = createClient(url, key, { auth: { autoRefreshToken:false, persistSession:false } });
const { data: users, error } = await sb.auth.admin.listUsers({ page:1, perPage:1000 });
if (error) { console.error("ERR", error); process.exit(1); }
for (const u of users.users ?? []) {
  const e = (u.email || "").toLowerCase();
  if (/king|lucky|oluwa|temitope|olawale|niyi|ismael/i.test(e) || /king|lucky|oluwa/i.test(u.user_metadata?.full_name || "")) {
    console.log(`${u.id}  ${e}  ${u.user_metadata?.full_name || ""}  created=${(u.created_at||"").slice(0,19)}`);
  }
}
console.log("--- recent auth sessions with refresh tokens ---");
const { data: sessions, error: se } = await sb.from("auth.sessions").select("id,user_id,refresh_token,accessed_at").order("accessed_at",{ascending:false}).limit(12);
if (se) console.log("sess err", se.message);
else for (const s of sessions ?? []) console.log(s.user_id?.slice(0,8), (s.accessed_at||"").slice(0,19), s.refresh_token?.slice(0,12)+"...");
