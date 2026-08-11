import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve("/Users/mac/Desktop/Code/Ona", ".env.local") });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

const motoristId = "0bfa5930-58b8-4c44-bdc9-5c147019a8f7";
const proA = "ad5430e2-355d-4889-a6cc-e7f1fe45d8ec"; // Oluwatosin/Temi
const proB = "bc9ae01c-cd38-4aae-8c76-c0b1ce2b375e"; // Ismael

console.log("Live watch: King Lucky (motorist). Polling every 5s for new requests...");
console.log("now:", new Date().toISOString());

const seen = new Set();
while (true) {
  const { data } = await sb
    .from("service_requests")
    .select("id, motorist_id, status, flow_status, pairing_stage, pairing_deadline, pairing_radius_km, radius_km, queue_position, remaining_candidates, repair_pro_id, repair_pro_name, reservation_status, assignment_status, status_history, created_at, updated_at")
    .eq("motorist_id", motoristId)
    .order("created_at", { ascending: false })
    .limit(5);
  for (const r of data ?? []) {
    if (!seen.has(r.id)) {
      seen.add(r.id);
      console.log(`\n>>> NEW JOB ${r.id}  stage=${r.pairing_stage} flow=${r.flow_status} radius_km=${r.radius_km} pairing_radius=${r.pairing_radius_km} qpos=${r.queue_position} pro=${r.repair_pro_name}(${r.repair_pro_id?.slice(0,8)})`);
    } else {
      const fresh = data?.[0];
      if (fresh && fresh.id === r.id) {
        const h = (fresh.status_history ?? []);
        const last = h[h.length - 1];
        console.log(`[${new Date().toISOString().slice(11,19)}] ${fresh.id.slice(0,8)} stage=${fresh.pairing_stage} flow=${fresh.flow_status} radius=${fresh.pairing_radius_km}km/${fresh.radius_km}km qpos=${fresh.queue_position} pro=${fresh.repair_pro_name}(${fresh.repair_pro_id?.slice(0,8)}) deadline=${fresh.pairing_deadline ? fresh.pairing_deadline.slice(11,19) : "-"} last=${last?.status}/${last?.by}`);
      }
    }
  }
  await new Promise((r) => setTimeout(r, 5000));
}
