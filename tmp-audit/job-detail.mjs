import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve("/Users/mac/Desktop/Code/Ona", ".env.local") });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const id = process.argv[2] || "20c3cefc-93ce-4f64-a144-681412f41271";
const { data, error } = await sb.from("service_requests").select("*").eq("id", id).maybeSingle();
if (error) { console.log("ERR", error); process.exit(1); }
if (!data) { console.log("not found"); process.exit(0); }
const hist = data.status_history ?? [];
console.log("job", id.slice(0,8), "flow", data.flow_status, "stage", data.pairing_stage, "qpos", data.queue_position, "radius", data.pairing_radius_km, "/", data.radius_km);
console.log("=== status history ===");
for (const h of hist) console.log(" ", h.status, "@", (h.at || "").slice(11,19), "by", h.by, h.note ? `(${h.note})` : "");
console.log("=== queue ===");
const { data: q } = await sb.from("request_pairing_queue").select("pro_id, position, status, offered_at, responded_at, result_note").eq("request_id", id).order("position", { ascending: true });
for (const r of q ?? []) console.log("  pos", r.position, r.pro_id.slice(0,8), r.status, "offered", (r.offered_at || "").slice(11,19), "responded", r.responded_at ? (r.responded_at).slice(11,19) : "-", r.result_note || "");
