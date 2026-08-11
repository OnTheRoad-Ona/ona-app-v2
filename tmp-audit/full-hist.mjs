import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve("/Users/mac/Desktop/Code/Ona", ".env.local") });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const { data, error } = await sb.from("service_requests").select("id, status, escrow_status, status_history, paid_at, released_at, satisfied_at, flow_status").eq("id", process.argv[2]).maybeSingle();
if (error) { console.log("ERR", error.message); process.exit(1); }
if (!data) { console.log("not found"); process.exit(0); }
console.log("job", data.id, "status", data.status, "escrow", data.escrow_status);
for (const h of data.status_history ?? []) console.log(" ", String(h.status).padEnd(20), (h.at||"").slice(0,19), "by", h.by, h.note ? `(${h.note})` : "");
