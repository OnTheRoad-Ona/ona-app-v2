/**
 * Customer Care operations service — search, board, one-click actions.
 */

import { createServiceSupabase } from "@/lib/supabase/server";
import {
  getJob,
  listDisputedJobs,
  resolveAppeal,
  resolveDispute,
  transitionJob,
} from "@/lib/server/jobs/job-store";
import {
  getEscrowByRequest,
  updateEscrow,
} from "@/lib/server/payments/escrow-store";
import { PLATFORM_FEE_PERCENT } from "@/lib/jobs/constants";
import { maskIdentity } from "./crypto-fields";
import { writeAuditLog } from "./audit";

const LIVE_FLOW = [
  "negotiating",
  "agreed",
  "paid_booked",
  "en_route",
  "arrived",
  "in_progress",
  "completed",
  "satisfied",
  "disputed",
  "under_appeal",
] as const;

export type CareSearchHit = {
  kind: "user" | "job";
  id: string;
  title: string;
  subtitle: string;
  meta: Record<string, unknown>;
};

export async function careSearch(query: string): Promise<CareSearchHit[]> {
  const q = query.trim();
  if (!q || q.length < 2) return [];
  const supabase = createServiceSupabase();
  const hits: CareSearchHit[] = [];
  const like = `%${q}%`;

  // Jobs by id / address / names
  {
    let jobsQuery = supabase
      .from("service_requests")
      .select(
        "id, flow_status, status, motorist_name, repair_pro_name, pickup_address, agreed_major, service_type, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(15);

    const uuidish =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(q);
    if (uuidish) {
      jobsQuery = jobsQuery.eq("id", q);
    } else {
      jobsQuery = jobsQuery.or(
        `pickup_address.ilike.${like},motorist_name.ilike.${like},repair_pro_name.ilike.${like}`
      );
    }
    const { data: jobs } = await jobsQuery;
    for (const j of jobs ?? []) {
      hits.push({
        kind: "job",
        id: String(j.id),
        title: `Job ${String(j.id).slice(0, 8)}…`,
        subtitle: [
          j.flow_status || j.status,
          j.motorist_name,
          j.repair_pro_name,
          j.pickup_address,
        ]
          .filter(Boolean)
          .join(" · "),
        meta: j as Record<string, unknown>,
      });
    }
  }

  // Profiles by name / phone / email
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, phone, email, role, is_active")
    .or(`full_name.ilike.${like},phone.ilike.${like},email.ilike.${like}`)
    .limit(15);
  for (const p of profiles ?? []) {
    hits.push({
      kind: "user",
      id: String(p.id),
      title: p.full_name || p.email || "User",
      subtitle: [p.role, p.phone, p.email, p.is_active ? "active" : "FROZEN"]
        .filter(Boolean)
        .join(" · "),
      meta: p as Record<string, unknown>,
    });
  }

  // Plate number → motorist
  const { data: motors } = await supabase
    .from("motorist_profiles")
    .select("user_id, plate_number, vehicle_make, vehicle_model")
    .ilike("plate_number", like)
    .limit(10);
  for (const m of motors ?? []) {
    const { data: prof } = await supabase
      .from("profiles")
      .select("id, full_name, phone, is_active")
      .eq("id", m.user_id)
      .maybeSingle();
    hits.push({
      kind: "user",
      id: String(m.user_id),
      title: prof?.full_name || "Motorist",
      subtitle: `Plate ${m.plate_number} · ${m.vehicle_make || ""} ${m.vehicle_model || ""}`.trim(),
      meta: { ...m, phone: prof?.phone, is_active: prof?.is_active },
    });
  }

  // Dedupe by kind+id
  const seen = new Set<string>();
  return hits.filter((h) => {
    const k = `${h.kind}:${h.id}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export async function careLiveBoard() {
  const supabase = createServiceSupabase();
  const { data: rows } = await supabase
    .from("service_requests")
    .select(
      "id, flow_status, status, motorist_name, repair_pro_name, pickup_address, agreed_major, service_type, escrow_status, amount_minor, platform_fee_minor, pro_payout_minor, eta_text, created_at, updated_at, dispute"
    )
    .in("flow_status", [...LIVE_FLOW])
    .order("updated_at", { ascending: false })
    .limit(80);

  const jobs = rows ?? [];
  const byStatus: Record<string, number> = {};
  for (const j of jobs) {
    const s = String(j.flow_status || j.status || "unknown");
    byStatus[s] = (byStatus[s] || 0) + 1;
  }

  const disputed = await listDisputedJobs().catch(() => []);

  return {
    jobs,
    byStatus,
    disputedCount: disputed.filter((d) => d.status === "disputed").length,
    appealCount: disputed.filter((d) => d.status === "under_appeal").length,
    platformFeePercent: PLATFORM_FEE_PERCENT,
    updatedAt: new Date().toISOString(),
  };
}

export async function careJobDetail(jobId: string) {
  const job = await getJob(jobId);
  if (!job) return null;
  const escrow = await getEscrowByRequest(jobId).catch(() => null);
  return { job, escrow, platformFeePercent: PLATFORM_FEE_PERCENT };
}

export async function careUserDetail(
  userId: string,
  opts: { revealPii: boolean }
) {
  const supabase = createServiceSupabase();
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (!profile) return null;

  const [{ data: motorist }, { data: pro }] = await Promise.all([
    supabase.from("motorist_profiles").select("*").eq("user_id", userId).maybeSingle(),
    supabase.from("repair_pro_profiles").select("*").eq("user_id", userId).maybeSingle(),
  ]);

  const pii = {
    nin: opts.revealPii
      ? motorist?.nin_last4 || pro?.nin_last4 || null
      : maskIdentity(motorist?.nin_last4 || pro?.nin_last4),
    bvn: opts.revealPii
      ? motorist?.bvn_last4 || pro?.bvn_last4 || null
      : maskIdentity(motorist?.bvn_last4 || pro?.bvn_last4),
    ninVerified: !!(motorist?.nin_verified || pro?.nin_verified),
    bvnVerified: !!(motorist?.bvn_verified || pro?.bvn_verified),
    bank: opts.revealPii
      ? (pro as { bank_account_encrypted?: string } | null)?.bank_account_encrypted ||
        null
      : "•••• (unlock to view)",
  };

  return {
    profile,
    motorist: motorist
      ? {
          ...motorist,
          nin_last4: opts.revealPii ? motorist.nin_last4 : maskIdentity(motorist.nin_last4),
          bvn_last4: opts.revealPii ? motorist.bvn_last4 : maskIdentity(motorist.bvn_last4),
        }
      : null,
    pro: pro
      ? {
          ...pro,
          nin_last4: opts.revealPii ? pro.nin_last4 : maskIdentity(pro.nin_last4),
          bvn_last4: opts.revealPii ? pro.bvn_last4 : maskIdentity(pro.bvn_last4),
        }
      : null,
    pii,
  };
}

export type CareAction =
  | { type: "freeze_user"; userId: string; reason?: string }
  | { type: "unfreeze_user"; userId: string; reason?: string }
  | { type: "release_escrow"; jobId: string; note?: string }
  | { type: "refund_escrow"; jobId: string; note?: string }
  | {
      type: "resolve_dispute";
      jobId: string;
      outcome: "full_release_pro" | "full_refund_motorist" | "partial_split";
      proPercent?: number;
      note?: string;
      kind?: "dispute" | "appeal";
    };

export async function executeCareAction(
  action: CareAction,
  ctx: {
    adminId: string;
    ip?: string;
    userAgent?: string;
  }
): Promise<{ ok: true; message: string; data?: unknown } | { ok: false; error: string }> {
  const supabase = createServiceSupabase();

  switch (action.type) {
    case "freeze_user": {
      const { error } = await supabase
        .from("profiles")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("id", action.userId);
      if (error) return { ok: false, error: error.message };
      await writeAuditLog({
        adminId: ctx.adminId,
        action: "care_freeze_user",
        targetUserId: action.userId,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        sensitive: true,
        meta: { reason: action.reason || null },
      });
      return { ok: true, message: "User frozen — cannot log in or take jobs" };
    }
    case "unfreeze_user": {
      const { error } = await supabase
        .from("profiles")
        .update({ is_active: true, updated_at: new Date().toISOString() })
        .eq("id", action.userId);
      if (error) return { ok: false, error: error.message };
      await writeAuditLog({
        adminId: ctx.adminId,
        action: "care_unfreeze_user",
        targetUserId: action.userId,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        sensitive: true,
        meta: { reason: action.reason || null },
      });
      return { ok: true, message: "User unfrozen" };
    }
    case "release_escrow": {
      const job = await getJob(action.jobId);
      if (!job) return { ok: false, error: "Job not found" };
      // Prefer state machine when possible
      if (job.status === "completed") {
        await transitionJob({
          jobId: action.jobId,
          actor: "admin",
          event: { type: "SATISFIED" },
        });
      }
      if (job.status === "satisfied" || job.status === "completed") {
        await transitionJob({
          jobId: action.jobId,
          actor: "admin",
          event: { type: "RELEASE" },
        });
      }
      const esc = await getEscrowByRequest(action.jobId);
      if (esc) {
        await updateEscrow(esc.id, {
          status: "released",
          escrowStatus: "released",
          releasedAt: new Date().toISOString(),
        });
      }
      await supabase
        .from("service_requests")
        .update({
          flow_status: "released",
          escrow_status: "released",
          released_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", action.jobId);
      await writeAuditLog({
        adminId: ctx.adminId,
        action: "care_release_escrow",
        targetJobId: action.jobId,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        sensitive: true,
        meta: { note: action.note || null },
      });
      return { ok: true, message: "Escrow released to Repair Pro (95% / 5%)" };
    }
    case "refund_escrow": {
      const esc = await getEscrowByRequest(action.jobId);
      if (esc) {
        await updateEscrow(esc.id, {
          status: "refunded",
          escrowStatus: "refunded",
          refundedAt: new Date().toISOString(),
        });
      }
      await supabase
        .from("service_requests")
        .update({
          flow_status: "refunded",
          escrow_status: "refunded",
          updated_at: new Date().toISOString(),
        })
        .eq("id", action.jobId);
      await writeAuditLog({
        adminId: ctx.adminId,
        action: "care_refund_escrow",
        targetJobId: action.jobId,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        sensitive: true,
        meta: { note: action.note || null },
      });
      return { ok: true, message: "Escrow refunded to motorist" };
    }
    case "resolve_dispute": {
      const kind = action.kind || "dispute";
      const res =
        kind === "appeal"
          ? await resolveAppeal({
              jobId: action.jobId,
              outcome: action.outcome,
              proPercent: action.proPercent,
              note: action.note,
              adminId: ctx.adminId,
            })
          : await resolveDispute({
              jobId: action.jobId,
              outcome: action.outcome,
              proPercent: action.proPercent,
              note: action.note,
              adminId: ctx.adminId,
            });
      if ("error" in res) return { ok: false, error: res.error };
      await writeAuditLog({
        adminId: ctx.adminId,
        action: `care_resolve_${kind}`,
        targetJobId: action.jobId,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        sensitive: true,
        meta: {
          outcome: action.outcome,
          proPercent: action.proPercent ?? null,
          note: action.note || null,
        },
      });
      return { ok: true, message: `${kind} resolved: ${action.outcome}`, data: res };
    }
    default:
      return { ok: false, error: "Unknown action" };
  }
}
