import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve("/Users/mac/Desktop/Code/Ona", ".env.local") });
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const { data, count } = await sb.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", "9812bfbc-90a7-46c0-a467-dab9d9bc6a49").is("read_at", null);
console.log("9812bfbc unread now:", count);
