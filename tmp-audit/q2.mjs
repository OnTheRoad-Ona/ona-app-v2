import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve("/Users/mac/Desktop/Code/Ona", ".env.local") });
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession:false } });
const prefix = process.argv[2];
const { data: jobs, error } = await sb.from("service_requests").select("id,status,flow_status,pairing_stage,queue_position,status_history,repair_pro_id,repair_pro_name,created_at,updated_at").like("id", prefix+"%").order("created_at",{ascending:false}).limit(2);
if (error || !jobs?.length) { console.error("ERR", error?.message || "none"); process.exit(1); }
const j = jobs[0];
console.log("FULL ID:", j.id, "status", j.status, "flow", j.flow_status, "stage", j.pairing_stage, "qpos", j.queue_position);
for (const h of j.status_history) console.log("  ", h.status, "@", (h.at||"").slice(11,19), "by", h.by, h.note?`(${h.note})`:"");
const { data: q } = await sb.from("request_pairing_queue").select("*").eq("request_id", j.id).order("position",{ascending:true});
console.log("QUEUE:");
for (const r of q??[]) console.log("  pos", r.position, (r.pro_id||"").slice(0,8), r.status, "offered", (r.offered_at||"").slice(11,19), "resp", r.responded_at?(r.responded_at).slice(11,19):"-", "note", r.result_note||"");
const cols = ["pairing_pro_id","reservation_status","pairing_stage","negotiate_ends_at","confirmed_at","created_at"].join(",");
const { data: rv } = await sb.from("request_reservations").select(cols).eq("request_id", j.id).order("created_at",{ascending:true});
console.log("RESERVATIONS:");
for (const r of rv??[]) console.log("  pro", (r.pairing_pro_id||"").slice(0,8), r.pairing_stage, r.reservation_status, "negEnds", (r.negotiate_ends_at||"").slice(11,19), "conf", r.confirmed_at?(r.confirmed_at).slice(11,19):"-");
