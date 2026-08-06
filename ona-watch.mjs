import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config({ path: "/Users/mac/Desktop/Code/Ona/.env.local" });
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const seen = new Set();
async function tick(){
  const now = new Date().toISOString();
  const { data: jobs } = await sb.from("service_requests")
    .select("id,repair_pro_id,flow_status,pairing_stage,pairing_deadline,motorist_name,problem")
    .gt("created_at", new Date(Date.now()-15*60*1000).toISOString())
    .order("created_at",{ascending:false}).limit(10);
  for (const j of (jobs||[])) {
    const tag = `${j.id.slice(0,8)}:${j.pairing_stage}:${j.flow_status}`;
    if (!seen.has(tag)) { seen.add(tag); console.log(new Date().toISOString().slice(11,19), "JOB", j.id.slice(0,8), "pro="+j.repair_pro_id.slice(0,8), "stage="+j.pairing_stage, "flow="+j.flow_status, `dl=${j.pairing_deadline?.slice(11,19)}`); }
  }
  const { data: res } = await sb.from("request_reservations")
    .select("id,request_id,pairing_pro_id,pairing_stage,reservation_status,negotiate_ends_at,confirmed_at")
    .order("created_at",{ascending:false}).limit(5);
  for (const r of (res||[])) {
    const tag = `${r.request_id.slice(0,8)}:${r.reservation_status}:${r.pairing_stage}`;
    if (!seen.has(tag)) { seen.add(tag); console.log(new Date().toISOString().slice(11,19), "RES", r.request_id.slice(0,8), "pro="+r.pairing_pro_id.slice(0,8), "status="+r.reservation_status, "stage="+r.pairing_stage, "ends="+r.negotiate_ends_at?.slice(11,19), r.confirmed_at ? "CONFIRMED" : ""); }
  }
}
setInterval(tick, 4000);
await tick();
