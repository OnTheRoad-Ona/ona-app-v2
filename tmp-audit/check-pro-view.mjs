process.loadEnvFile(".env.local");
import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// find pros with recent requests
const { data: reqs, error } = await sb
  .from("service_requests")
  .select("id, repair_pro_id, motorist_id, motorist_photo, voice_note, flow_status, status, created_at")
  .order("created_at", { ascending: false })
  .limit(10);
if (error) { console.error("err", error.message); process.exit(1); }
for (const r of reqs || []) {
  console.log(`${r.id} | pro=${r.repair_pro_id} | motorist=${r.motorist_id} | ${r.flow_status} | photo=${r.motorist_photo ? "YES" : "no"} | voice=${r.voice_note ? "YES" : "no"}`);
}
