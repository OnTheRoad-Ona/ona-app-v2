import { z } from "zod";
import {
  AdminAuthError,
  logAdminAction,
  requireAdmin,
} from "@/lib/server/admin-auth";
import { apiFail, apiOk } from "@/lib/server/api-json";
import { createServiceSupabase } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import {
  adminExpireJob,
  adminReassignJob,
  clearJobCooldowns,
  forceRerouteJob,
  listActiveExclusions,
} from "@/lib/server/jobs/job-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFER_DURATION_MS = 5 * 60_000;
const EXCLUDE_DURATION_MS = 33 * 60_000;
const REROUTE_WINDOW_MS = 15 * 60_000;

const LIVE_STATUSES = ["searching", "negotiating", "agreed"] as const;

type HistoryEntry = { status?: string; at?: string; by?: string; note?: string };

function parseHistory(raw: unknown): HistoryEntry[] {
  if (Array.isArray(raw)) return raw as HistoryEntry[];
  if (typeof raw === "string" && raw.trim()) {
    try {
      return JSON.parse(raw) as HistoryEntry[];
    } catch {
      return [];
    }
  }
  return [];
}

function latestAtFor(history: HistoryEntry[], pred: (e: HistoryEntry) => boolean): number {
  let latest = 0;
  for (const h of history) {
    const t = Date.parse(h.at || "");
    if (Number.isFinite(t) && pred(h) && t > latest) latest = t;
  }
  return latest;
}

function cooldownsFor(history: HistoryEntry[], now: number, windowMs: number, prefix: string) {
  const active: { proId: string; until: string }[] = [];
  for (const h of history) {
    const by = h.by || "";
    if (!by.startsWith(`${prefix}:`)) continue;
    const proId = by.slice(`${prefix}:`.length);
    const at = Date.parse(h.at || "");
    if (!Number.isFinite(at)) continue;
    if (now - at < windowMs) {
      active.push({ proId, until: new Date(at + windowMs).toISOString() });
    }
  }
  return active;
}

type SerializedJob = {
  id: string;
  flowStatus: string;
  serviceType: string;
  problem: string;
  createdAt: string;
  updatedAt: string;
  motoristId: string;
  motoristName: string;
  proId: string;
  proName: string;
  searchingSince: string | null;
  searchEndsAt: string | null;
  negotiateEndsAt: string | null;
  activeDeferrals: { proId: string; proName: string; until: string }[];
  activeExclusions: { proId: string; proName: string; until: string; reason: string }[];
  history: HistoryEntry[];
  historySummary: string[];
};

function serializeJob(row: Record<string, unknown>, nameById: Map<string, string>): SerializedJob {
  const now = Date.now();
  const history = parseHistory(row.status_history);
  const searchingSince = latestAtFor(history, (h) => h.status === "searching");
  const negotiateEndsAt =
    typeof row.negotiate_ends_at === "string" && row.negotiate_ends_at
      ? row.negotiate_ends_at
      : null;

  const deferrals = cooldownsFor(history, now, DEFER_DURATION_MS, "deferred").map((d) => ({
    ...d,
    proName: nameById.get(d.proId) || "Unknown pro",
  }));
  const exclusions = cooldownsFor(history, now, EXCLUDE_DURATION_MS, "excluded").map((e) => ({
    ...e,
    proName: nameById.get(e.proId) || "Unknown pro",
    reason: "pro_declined",
  }));

  const summary: string[] = [];
  for (const h of history.slice(-8)) {
    summary.push(`${h.by || h.status || "?"} @ ${(h.at || "").slice(11, 19)}`);
  }

  return {
    id: String(row.id),
    flowStatus: String(row.flow_status || row.status || ""),
    serviceType: String(row.service_type || ""),
    problem: String(row.problem_text || row.description || "").slice(0, 90),
    createdAt: String(row.created_at || ""),
    updatedAt: String(row.updated_at || ""),
    motoristId: String(row.motorist_id || ""),
    motoristName: nameById.get(String(row.motorist_id || "")) || "Customer",
    proId: String(row.repair_pro_id || ""),
    proName: nameById.get(String(row.repair_pro_id || "")) || "Unassigned",
    searchingSince: searchingSince ? new Date(searchingSince).toISOString() : null,
    searchEndsAt: searchingSince ? new Date(searchingSince + REROUTE_WINDOW_MS).toISOString() : null,
    negotiateEndsAt,
    activeDeferrals: deferrals,
    activeExclusions: exclusions,
    history,
    historySummary: summary,
  };
}

export async function GET() {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Supabase is not configured", 503, "supabase_not_configured");
  }
  try {
    await requireAdmin();
    const supabase = createServiceSupabase();

    const [jobsRes, prosRes, exclusions] = await Promise.all([
      supabase
        .from("service_requests")
        .select("*")
        .in("flow_status", LIVE_STATUSES)
        .order("updated_at", { ascending: false })
        .limit(150),
      supabase
        .from("repair_pro_profiles")
        .select("user_id, business_name")
        .eq("is_online", true)
        .neq("status", "suspended")
        .neq("status", "rejected")
        .limit(500),
      listActiveExclusions(),
    ]);

    const nameById = new Map<string, string>();
    for (const p of prosRes.data || []) {
      nameById.set(String(p.user_id), String(p.business_name || "Pro"));
    }

    // Fill names for customers / off-duty pros too.
    const knownIds = new Set(nameById.keys());
    const jobs = jobsRes.data || [];
    for (const j of jobs) {
      if (j.motorist_id) knownIds.add(String(j.motorist_id));
      if (j.repair_pro_id) knownIds.add(String(j.repair_pro_id));
    }
    if (knownIds.size > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", [...knownIds]);
      for (const p of profiles || []) {
        if (!nameById.has(String(p.id))) {
          nameById.set(String(p.id), String(p.full_name || "User"));
        }
      }
    }

    const queue = jobs.map((row) =>
      serializeJob(row as Record<string, unknown>, nameById)
    );

    const summary = {
      searching: queue.filter((j) => j.flowStatus === "searching").length,
      negotiating: queue.filter((j) => j.flowStatus === "negotiating").length,
      agreed: queue.filter((j) => j.flowStatus === "agreed").length,
      activeDeferrals: queue.reduce((n, j) => n + j.activeDeferrals.length, 0),
      activeExclusions: queue.reduce((n, j) => n + j.activeExclusions.length, 0),
      crossJobExclusions: exclusions.length,
    };

    const availablePros = (prosRes.data || []).map((p) => ({
      id: String(p.user_id),
      name: String(p.business_name || "Pro"),
    }));

    return apiOk({ summary, queue, availablePros, exclusions });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return apiFail(e.message, e.status, "auth");
    }
    return apiFail("Failed to load dispatch board", 500);
  }
}

const actionSchema = z.object({
  action: z.enum(["reroute", "expire", "clear_cooldowns", "reassign"]),
  jobId: z.string().uuid(),
  proId: z.string().uuid().optional(),
  proName: z.string().optional(),
});

export async function POST(req: Request) {
  if (!isSupabaseAdminConfigured()) {
    return apiFail("Supabase is not configured", 503, "supabase_not_configured");
  }
  try {
    const { session } = await requireAdmin();
    const parsed = actionSchema.safeParse(await req.json());
    if (!parsed.success) return apiFail("Invalid body", 400);
    const { action, jobId, proId, proName } = parsed.data;

    let result:
      | { ok: true; job: unknown }
      | { error: string } = { error: "No-op" };
    switch (action) {
      case "reroute":
        result = await forceRerouteJob(jobId);
        break;
      case "expire":
        result = await adminExpireJob(jobId);
        break;
      case "clear_cooldowns":
        result = await clearJobCooldowns(jobId);
        break;
      case "reassign":
        if (!proId) return apiFail("Missing proId", 400);
        result = await adminReassignJob(jobId, proId, proName);
        break;
    }

    if ("error" in result) {
      return apiFail(result.error || "Action failed", 400);
    }

    await logAdminAction(session.userId, `dispatch_${action}`, null, {
      jobId,
      ...(proId ? { proId } : {}),
    });

    return apiOk({ job: result.job });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return apiFail(e.message, e.status, "auth");
    }
    return apiFail("Dispatch action failed", 500);
  }
}
