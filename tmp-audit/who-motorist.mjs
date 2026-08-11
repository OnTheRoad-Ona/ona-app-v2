import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve("/Users/mac/Desktop/Code/Ona", ".env.local") });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const { data, error } = await sb.from("service_requests")
  .select("id, motorist_name, repair_pro_name, status, escrow_status, flow_status, created_at, updated_at, status_history")
  .order("created_at", { ascending: false }).limit(12);
if (error) { console.log("ERR", error.message); process.exit(1); }
for (const j of (data ?? [])) {
  const hist = (j.status_history ?? []).slice(-8).map(hh => `${hh.status}|${hh.by}`).join(" ");
  console.log(`[${j.id.slice(0,8)}] ${j.motorist_name} → ${j.repair_pro_name ?? "?"} status=${j.status} escrow=${j.escrow_status} flow=${j.flow_status} upd=${(j.updated_at||"").slice(0,19)} hist=${hist}`);
}
