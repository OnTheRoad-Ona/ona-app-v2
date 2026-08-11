import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve("/Users/mac/Desktop/Code/Ona", ".env.local") });
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const now = new Date().toISOString();

// 1) Mark notifications pointing to jobs that no longer exist as read
const { data: notifs } = await sb.from("notifications").select("id, job_id").is("read_at", null).not("job_id", "is", null);
const jobIds = [...new Set((notifs ?? []).map(n => n.job_id))];
console.log("distinct job_ids referenced by unread notifs:", jobIds.length);
const deadJobIds = [];
for (let i = 0; i < jobIds.length; i += 50) {
  const chunk = jobIds.slice(i, i + 50);
  const { data } = await sb.from("jobs").select("id").in("id", chunk);
  const live = new Set((data ?? []).map(j => j.id));
  deadJobIds.push(...chunk.filter(id => !live.has(id)));
}
console.log("jobs that no longer exist:", deadJobIds.length);
let deadCleared = 0;
for (let i = 0; i < deadJobIds.length; i += 50) {
  const chunk = deadJobIds.slice(i, i + 50);
  const { error } = await sb.from("notifications").update({ read_at: now }).in("job_id", chunk).is("read_at", null);
  if (!error) deadCleared += (notifs ?? []).filter(n => chunk.includes(n.job_id)).length;
}
console.log("dead-job notifs marked read:", deadCleared);

// 2) Dedupe: for each (user_id, job_id, category) keep the newest unread, mark older dupes read
const { data: unread } = await sb.from("notifications").select("id, user_id, job_id, category, created_at").is("read_at", null).not("job_id", "is", null);
const groups = new Map();
for (const n of unread ?? []) {
  const key = `${n.user_id}|${n.job_id}|${n.category}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(n);
}
let dupCleared = 0;
for (const [key, rows] of groups) {
  if (rows.length <= 1) continue;
  rows.sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
  const dupIds = rows.slice(1).map(r => r.id);
  for (let i = 0; i < dupIds.length; i += 50) {
    const { error } = await sb.from("notifications").update({ read_at: now }).in("id", dupIds.slice(i, i + 50)).is("read_at", null);
    if (!error) dupCleared += dupIds.slice(i, i + 50).length;
  }
}
console.log("duplicate older notifs marked read:", dupCleared);

const { count } = await sb.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null);
console.log("remaining total unread:", count);
