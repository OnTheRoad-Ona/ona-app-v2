import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve("/Users/mac/Desktop/Code/Ona", ".env.local") });
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const now = new Date().toISOString();

// Paginate through ALL unread notifs with a job_id
const all = [];
let from = 0;
for (;;) {
  const { data } = await sb.from("notifications").select("id, job_id").is("read_at", null).not("job_id", "is", null).range(from, from + 999);
  if (!data?.length) break;
  all.push(...data);
  if (data.length < 1000) break;
  from += 1000;
}
console.log("total unread with job_id:", all.length);
const jobIds = [...new Set(all.map(n => n.job_id))];
const dead = new Set();
for (let i = 0; i < jobIds.length; i += 50) {
  const chunk = jobIds.slice(i, i + 50);
  const { data } = await sb.from("jobs").select("id").in("id", chunk);
  const live = new Set((data ?? []).map(j => j.id));
  chunk.forEach(id => { if (!live.has(id)) dead.add(id); });
}
console.log("dead jobs:", dead.size);
const deadNotifs = all.filter(n => dead.has(n.job_id));
let cleared = 0;
for (let i = 0; i < deadNotifs.length; i += 50) {
  const ids = deadNotifs.slice(i, i + 50).map(n => n.id);
  const { error } = await sb.from("notifications").update({ read_at: now }).in("id", ids).is("read_at", null);
  if (!error) cleared += ids.length; else console.log("err:", error.message);
}
console.log("cleared dead-job notifs:", cleared);
const { count } = await sb.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null);
console.log("remaining total unread:", count);
