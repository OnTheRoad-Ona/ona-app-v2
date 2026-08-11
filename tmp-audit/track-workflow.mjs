import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve("/Users/mac/Desktop/Code/Ona", ".env.local") });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

const KING = "0bfa5930-58b8-4c44-bdc9-5c147019a8f7";   // King Lucky — motorist
const OLUWA = "ad5430e2-355d-4889-a6cc-e7f1fe45d8ec";  // Oluwatosin — repair pro

const lastSeen = new Map(); // id -> last snapshot string

const S = {
  waiting_for_selected: "waiting_for_selected",
  selected_review: "selected_review",
  sequential_pairing: "sequential_pairing",
  waiting_for_pro: "waiting_for_pro",
  reserved: "reserved",
  negotiating: "negotiating",
  searching: "searching",
  agreed: "agreed",
  paid_booked: "paid_booked",
  en_route: "en_route",
  arrived: "arrived",
  in_progress: "in_progress",
  completed: "completed",
  satisfied: "satisfied",
  released: "released",
  rejected: "rejected",
  disputed: "disputed",
  under_appeal: "under_appeal",
  cancelled: "cancelled",
  expired: "expired",
  refunded: "refunded",
};

function ts() {
  return new Date().toISOString().slice(11, 19);
}
function short(id) {
  return id ? id.slice(0, 8) : "?";
}
async function step() {
  const since = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const { data, error } = await sb
    .from("service_requests")
    .select(
      "id,motorist_id,motorist_name,repair_pro_id,repair_pro_name,status,flow_status,pairing_stage,pairing_deadline,negotiate_ends_at,status_history,escrow_status,queue_position,remaining_candidates,created_at,updated_at,agreed_major"
    )
    .or(`motorist_id.eq.${KING},repair_pro_id.eq.${OLUWA}`)
    .gt("created_at", since)
    .order("created_at", { ascending: false });
  if (error) {
    console.error(ts(), "ERR", error.message);
    return;
  }
  for (const j of data ?? []) {
    const hist = j.status_history ?? [];
    const last = hist[hist.length - 1];
    const d = j.pairing_deadline ? j.pairing_deadline.slice(11, 19) : "-";
    const n = j.negotiate_ends_at ? j.negotiate_ends_at.slice(11, 19) : "-";
    const key = `${j.id}:${j.status}:${j.flow_status}:${j.pairing_stage}:${last?.status}:${last?.by}:${j.escrow_status}:${last?.at}`;
    const fresh = !lastSeen.has(j.id);
    if (fresh || lastSeen.get(j.id) !== key) {
      const who =
        j.motorist_id === KING && j.repair_pro_id === OLUWA
          ? "KING→OLUWA"
          : j.motorist_id === KING
            ? "KING"
            : "OLUWA";
      console.log(
        `${ts()} [${who}] ${short(j.id)} ` +
          `status=${j.status} flow=${j.flow_status} stage=${j.pairing_stage} ` +
          `qpos=${j.queue_position ?? "-"} pro=${j.repair_pro_name || "-"} ` +
          `last=${last?.status ?? "-"}/${last?.by ?? "-"} esc=${j.escrow_status ?? "-"}` +
          (d !== "-" ? ` dl=${d}` : "") +
          (n !== "-" ? ` neg=${n}` : "")
      );
      lastSeen.set(j.id, key);
    }
  }
}

console.log(
  `${ts()} TRACK on: King Lucky#${short(KING)} → Oluwatosin#${short(OLUWA)} (poll 2s). egress.*`
);
setInterval(step, 2000);
step();