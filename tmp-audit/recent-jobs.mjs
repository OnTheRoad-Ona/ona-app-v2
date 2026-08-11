import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve("/Users/mac/Desktop/Code/Ona", ".env.local") });
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const { data } = await sb.from("service_requests")
  .select("id,status,flow_status,pairing_stage,pairing_deadline,queue_position,remaining_candidates,repair_pro_id,chosen_pro_id,reservation_status,assignment_status,negotiate_ends_at,created_at,updated_at,status_history")
  .order("created_at", { ascending: false })
  .limit(8);
for (const j of data ?? []) {
  console.log(JSON.stringify({
    id: j.id?.slice(0,8), status: j.status, flow: j.flow_status, stage: j.pairing_stage,
    deadline: j.pairing_deadline, qpos: j.queue_position, remain: j.remaining_candidates,
    pro: j.repair_pro_id?.slice(0,8), chosen: j.chosen_pro_id?.slice(0,8),
    resv: j.reservation_status, assign: j.assignment_status, negEnds: j.negotiate_ends_at,
    created: j.created_at, updated: j.updated_at,
    hist: (j.status_history||[]).slice(-3).map(h=>`${h.status}@${(h.at||"").slice(11,19)}:${h.by}${h.note?"("+h.note+")":""}`).join(" | ")
  }));
}
