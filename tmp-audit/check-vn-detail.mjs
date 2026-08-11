process.loadEnvFile(".env.local");
import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data } = await sb
  .from("service_requests")
  .select("id, voice_note, photos")
  .eq("id", "fe1d3798-70f6-4234-80ff-93d4d7ea03b6")
  .maybeSingle();
if (!data) { console.log("not found"); process.exit(0); }
const vn = data.voice_note;
console.log("voice_note type:", typeof vn);
console.log("voice_note keys:", vn && typeof vn === "object" ? Object.keys(vn) : "n/a");
console.log("url length:", typeof vn?.url === "string" ? vn.url.length : "n/a");
console.log("url prefix:", typeof vn?.url === "string" ? vn.url.slice(0, 60) : "n/a");
console.log("photos:", Array.isArray(data.photos) ? data.photos.length : typeof data.photos);
