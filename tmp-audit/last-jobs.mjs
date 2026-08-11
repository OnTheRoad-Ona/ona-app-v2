import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve("/Users/mac/Desktop/Code/Ona", ".env.local") });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const { data, error } = await sb.from("service_requests")
  .select("id, motorist_id, motorist_name, status, escrow_status, flow_status, updated_at, status_history, paid_at, completed_at, released_at, satisfied_at, repair_pro_name, created_at")
  .eq("motorist_name", "King Lucky")
  .order("created_at", { ascending: false }).limit(8);
if (error) { console.log("ERR", error.message); process.exit(1); }
for (const j of (data ?? [])) {
  const hist = (j.status_history ?? []).map(hh => `${hh.status}@${hh.by}`).join(" → ");
  console.log(`\n[${j.id.slice(0,8)}] ${j.motorist_name} → ${j.repair_pro_name ?? "?"}\n  status=${j.status} escrow=${j.escrow_status} flow=${j.flow_status}\n  updated=${j.updated_at}\n  paid=${j.paid_at ?? "-"} completed=${j.completed_at ?? "-"} released=${j.released_at ?? "-"} satisfied=${j.satisfied_at ?? "-"}\n  hist: ${hist}`);
}
