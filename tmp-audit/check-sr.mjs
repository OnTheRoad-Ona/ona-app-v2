process.loadEnvFile(".env.local");
import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data, error } = await sb
  .from("service_requests")
  .select("id, motorist_name, motorist_photo, voice_note, photos, status, flow_status, created_at")
  .order("created_at", { ascending: false })
  .limit(8);
if (error) { console.error("query error", error.message); process.exit(1); }
for (const r of data || []) {
  const hasVoice = r.voice_note ? (typeof r.voice_note === "string" ? r.voice_note.slice(0, 30) : JSON.stringify(r.voice_note).slice(0, 60)) : null;
  const hasPhoto = r.motorist_photo ? r.motorist_photo.slice(0, 40) : null;
  console.log(`${r.created_at} | ${r.status}/${r.flow_status} | motorist=${r.motorist_name} | photo=${hasPhoto ? "YES" : "no"} | voice=${hasVoice ? "YES:" + hasVoice : "no"} | photos=${(r.photos || []).length}`);
}
