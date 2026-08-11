process.loadEnvFile(".env.local");
import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data, error } = await sb
  .from("service_requests")
  .select("id, motorist_id, motorist_name, motorist_photo, voice_note, flow_status, status, created_at")
  .eq("motorist_id", "21c83009-dfa6-4a35-b1f6-565904479a1e")
  .order("created_at", { ascending: false })
  .limit(5);
if (error) { console.error("err", error.message); process.exit(1); }
console.log("Feyisayo (has avatar) requests:", (data || []).length);
for (const r of data || []) {
  console.log(`${r.id} | ${r.flow_status}/${r.status} | photo=${r.motorist_photo ? "YES" : "no"} | voice=${r.voice_note ? "YES" : "no"}`);
}
