/**
 * Dispatch / rerouting functions extracted from job-store.ts.
 */

import type { JobFlowStatus, JobRecord } from "@/lib/jobs/types";
import type { createServiceSupabase } from "@/lib/supabase/server";
import { memory, REROUTE_AFTER_MS, REROUTE_WINDOW_MS, DEFER_DURATION_MS } from "./constants";
import { rowToJob, flowToLegacyStatus } from "./mappers";
import { persist } from "./cache";
import { getJob } from "./reads";

type SupabaseClient = ReturnType<typeof createServiceSupabase>;

// ---------------------------------------------------------------------------
// Dynamic imports for external dependencies
// ---------------------------------------------------------------------------

async function loadSupabaseAdmin() {
  const { isSupabaseAdminConfigured } = await import("@/lib/supabase/env");
  return isSupabaseAdminConfigured();
}

async function loadCreateServiceSupabase() {
  const { createServiceSupabase } = await import("@/lib/supabase/server");
  return createServiceSupabase;
}

async function loadOrderCandidatesByMerit() {
  const { orderCandidatesByMerit } = await import("@/lib/server/merit/merit-engine");
  return orderCandidatesByMerit;
}

async function loadIsSyntheticAccount() {
  const { isSyntheticAccount } = await import("@/lib/server/synthetic-accounts");
  return isSyntheticAccount;
}

async function loadHasRecentLiveHeartbeatAndMaxRadius() {
  const { hasRecentLiveHeartbeat, MAX_RADIUS_KM } = await import("@/lib/matching");
  return { hasRecentLiveHeartbeat, MAX_RADIUS_KM };
}

async function loadInsertNotification() {
  const { insertNotification } = await import("@/lib/server/notifications");
  return insertNotification;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Dispatch exclusions (D6).
 * Deferrals are per-job and derived from status_history (`deferred:<proId>`),
 * so they survive restarts. Decline exclusions are PER-REQUEST only: the
 * `excluded:<proId>` marker in this job's status_history excludes that pro
 * permanently from THIS request. There is no cross-request cooldown.
 */
export function listActiveExclusions(): {
  customerId: string;
  proId: string;
  reason: string;
  at: string;
  expiresAt: string;
}[] {
  return [];
}

/** Latest `deferred:<proId>` timestamp from the job's history, if any. */
function latestDeferredAtMs(job: JobRecord, proId: string): number | null {
  let latest: number | null = null;
  for (const h of job.statusHistory || []) {
    if (h.by === `deferred:${proId}`) {
      const t = Date.parse(h.at);
      if (Number.isFinite(t) && (latest === null || t > latest)) latest = t;
    }
  }
  return latest;
}

/** True while this pro's "Later" is still active for this job (5 min). */
function isDeferredByPro(job: JobRecord, proId: string): boolean {
  const at = latestDeferredAtMs(job, proId);
  if (at === null) return false;
  return Date.now() - at < DEFER_DURATION_MS;
}

/** True if this pro declined this request (permanent per-request, D6). */
function isExcludedForJob(job: JobRecord, proId: string): boolean {
  return (job.statusHistory || []).some((h) => h.by === `excluded:${proId}`);
}

/**
 * Pro taps "Later": hide the request from that pro and keep the customer's
 * search moving by rerouting to the next available pro immediately. The
 * deferred pro stays excluded for 5 minutes. If no other pro is available,
 * the request stays with the deferred pro and becomes deliverable again after
 * the 5-minute window.
 */
export async function deferJob(
  jobId: string,
  proId: string,
): Promise<JobRecord | null> {
  const job = await getJob(jobId);
  if (!job) return null;
  if (job.repairProId !== proId) return job;

  // SSPE job → hand off to the pairing engine (queue + reservation + next pro).
  if (job.pairingStage) {
    try {
      const { deferRequest } =
        await import("@/lib/server/pairing/pairing-engine");
      const res = await deferRequest(jobId, proId);
      if (!res.ok) return job;
      return (await getJob(jobId)) || job;
    } catch (e) {
      console.error("[deferJob] SSPE defer failed", jobId, e);
      return job;
    }
  }

  const ts = new Date().toISOString();
  job.statusHistory = [
    ...(job.statusHistory || []),
    { status: job.status, at: ts, by: `deferred:${proId}` },
  ];

  // Keep the customer's search alive: move into the searching phase so the
  // customer sees the live search screen while dispatch finds another pro.
  const hasAccepted = (job.statusHistory || []).some(
    (h) => h.by === "negotiation_timer_start",
  );
  const canReroute =
    !hasAccepted &&
    (await loadSupabaseAdmin()) &&
    (job.status === "negotiating" || job.status === "searching");

  if (canReroute) {
    job.status = "searching";
    job.statusHistory = [
      ...job.statusHistory,
      { status: "searching", at: ts, by: "searching_started" },
    ];
  }
  await persist(job);

  if (canReroute) {
    try {
      const createServiceSupabase = await loadCreateServiceSupabase();
      const sb = createServiceSupabase();
      // Do not expire the job when no other pro is available the deferred
      // pro's request becomes deliverable again after the 5 minutes.
      await assignNextPro(job, sb);
    } catch (e) {
      console.error("[deferJob] reroute failed", jobId, e);
    }
  }

  return (await getJob(jobId)) || job;
}

/**
 * Find the next available pro of the same trade, closest to the customer.
 * Excludes pros already tried. Returns null if none found.
 */
async function findNextPro(
  job: JobRecord,
  sb: SupabaseClient,
): Promise<{ id: string; name: string; photo?: string } | null> {
  const triedProIds = new Set<string>();
  for (const h of job.statusHistory || []) {
    const by = h.by || "";
    if (by.startsWith("reroute:")) {
      triedProIds.add(by.slice("reroute:".length));
    }
  }
  triedProIds.add(job.repairProId);

  // Skip pros who tapped Later (5 min) or declined THIS request (permanent
  // per-request exclusion, D6) so the request is not re-delivered to them.
  for (const h of job.statusHistory || []) {
    const by = h.by || "";
    if (by.startsWith("deferred:")) {
      const proId = by.slice("deferred:".length);
      if (isDeferredByPro(job, proId)) triedProIds.add(proId);
    } else if (by.startsWith("excluded:")) {
      const proId = by.slice("excluded:".length);
      if (isExcludedForJob(job, proId)) triedProIds.add(proId);
    }
  }

  // Same trade only never reassign a mechanic job to a plumber, etc.
  // Match primary_service OR services[] so multi-skill pros still get requests.
  const serviceType = String(job.serviceType || "").trim();
  const { data: pros } = await sb
    .from("repair_pro_profiles")
    .select(
      "user_id, business_name, lat, lng, primary_service, services, location_updated_at, visibility_tier",
    )
    .eq("is_online", true)
    .neq("status", "suspended")
    .neq("status", "rejected");

  if (!pros?.length) return null;

  const { hasRecentLiveHeartbeat, MAX_RADIUS_KM } =
    await loadHasRecentLiveHeartbeatAndMaxRadius();
  const REROUTE_RADIUS_KM = MAX_RADIUS_KM;
  const isSyntheticAccount = await loadIsSyntheticAccount();

  const offersTrade = (p: {
    primary_service?: string | null;
    services?: unknown;
  }) => {
    if (!serviceType) return true;
    if (String(p.primary_service || "").trim() === serviceType) return true;
    const list = p.services;
    if (Array.isArray(list)) {
      return list.some(
        (s) =>
          String(s || "")
            .trim()
            .toLowerCase() === serviceType.toLowerCase(),
      );
    }
    if (typeof list === "string" && list.trim()) {
      try {
        const parsed = JSON.parse(list) as unknown;
        if (Array.isArray(parsed)) {
          return parsed.some(
            (s) =>
              String(s || "")
                .trim()
                .toLowerCase() === serviceType.toLowerCase(),
          );
        }
      } catch {
        return list.toLowerCase().includes(serviceType.toLowerCase());
      }
    }
    return false;
  };

  const available = pros.filter((p) => {
    if (triedProIds.has(p.user_id) || p.lat == null || p.lng == null) {
      return false;
    }
    // Stale is_online (pro closed the app without going Away) must not receive
    // a reroute require a fresh heartbeat like the marketplace feed.
    if (
      !hasRecentLiveHeartbeat(
        (p as { location_updated_at?: string | null }).location_updated_at,
        Date.now(),
      )
    ) {
      return false;
    }
    if (!offersTrade(p)) return false;
    // Never reroute a real customer to a demo/audit pro.
    if (
      isSyntheticAccount({
        businessName: (p as { business_name?: string | null }).business_name,
      })
    ) {
      return false;
    }
    return true;
  });
  if (!available.length) return null;

  const { lat: cLat, lng: cLng } = job.motoristLocation;
  const withDistance = available
    .map((p) => {
      const dLat = ((p.lat as number) - cLat) * 111;
      const dLng =
        ((p.lng as number) - cLng) * 111 * Math.cos((cLat * Math.PI) / 180);
      const km = Math.hypot(dLat, dLng);
      return { p, km };
    })
    .filter((x) => x.km <= REROUTE_RADIUS_KM + 0.75);

  if (!withDistance.length) return null;

  // Merit-first ordering (D4): rank within 10-point merit bands, distance as
  // the tiebreak. Fall back to distance-only when merit scores are absent.
  const orderCandidatesByMerit = await loadOrderCandidatesByMerit();
  const kmOf = (p: { user_id: string }) =>
    withDistance.find((x) => x.p.user_id === p.user_id)?.km ??
    Number.POSITIVE_INFINITY;
  const ordered = await orderCandidatesByMerit(
    withDistance.map((x) => x.p),
    kmOf,
  );
  const best = ordered[0];

  // Fetch name + photo from profiles
  const { data: profile } = await sb
    .from("profiles")
    .select("full_name, avatar_url")
    .eq("id", best.user_id)
    .maybeSingle();

  return {
    id: best.user_id,
    name: profile?.full_name || best.business_name || "Repair Pro",
    photo: profile?.avatar_url || undefined,
  };
}

/**
 * Assign the next available pro to an unaccepted job. Returns false when no
 * eligible pro is left (caller decides whether to expire or keep waiting).
 */
async function assignNextPro(
  job: JobRecord,
  sb: SupabaseClient,
  skipNotifyPreviousPro = false,
): Promise<boolean> {
  const nextPro = await findNextPro(job, sb);
  if (!nextPro) return false;

  const ts = new Date().toISOString();

  // Clean slate for the new pro do not carry prior offers / armed timer / price.
  // Far-future negotiate_ends_at: timer unarmed until pro accepts (same as createJob).
  const unarmedEnds = new Date(
    Date.now() + 365 * 24 * 60 * 60 * 1000,
  ).toISOString();
  await sb
    .from("service_requests")
    .update({
      status: "requested",
      flow_status: "negotiating",
      repair_pro_id: nextPro.id,
      repair_pro_name: nextPro.name,
      ...(nextPro.photo ? { repair_pro_photo: nextPro.photo } : {}),
      offers: [],
      pro_base_major: null,
      agreed_major: null,
      negotiate_ends_at: unarmedEnds,
      updated_at: ts,
      status_history: [
        ...job.statusHistory,
        {
          status: "negotiating",
          at: ts,
          by: `reroute:${nextPro.id}`,
        },
      ],
    })
    .eq("id", job.id);

  // Keep the in-memory store in sync so listJobsForUser (which merges memory
  // first) reflects the reassignment for both the previous and next pro.
  memory.set(job.id, {
    ...job,
    status: "negotiating",
    repairProId: nextPro.id,
    repairProName: nextPro.name,
    ...(nextPro.photo ? { repairProPhoto: nextPro.photo } : {}),
    offers: [],
    proBaseMajor: null,
    agreedMajor: null,
    negotiateEndsAt: unarmedEnds,
    updatedAt: ts,
    statusHistory: [
      ...job.statusHistory,
      { status: "negotiating", at: ts, by: `reroute:${nextPro.id}` },
    ],
  });

  // Notify the new pro (DB row so app center + realtime stay in sync)
  try {
    const insertNotification = await loadInsertNotification();
    await insertNotification({
      userId: nextPro.id,
      category: "requests",
      priority: "high",
      title: "Service Request",
      body: `New request from ${job.motoristName} · ${job.problem.slice(0, 80)}`,
      href: `/jobs/${job.id}`,
      actionType: "open_job",
      actionPayload: { jobId: job.id },
      jobId: job.id,
      jobStatus: "negotiating",
      groupKey: `service-request-${job.id}`,
    });
  } catch {
    /* notifications optional */
  }

  // Quiet persistent entry for the previous pro: the request moved on to
  // another pro. Skipped for the pro who actively declined (they initiated the
  // reroute no need to tell them). groupKey dedupes per job.
  if (
    !skipNotifyPreviousPro &&
    job.repairProId &&
    job.repairProId !== nextPro.id
  ) {
    try {
      const insertNotification = await loadInsertNotification();
      await insertNotification({
        userId: job.repairProId,
        category: "requests",
        priority: "normal",
        title: "Request moved on",
        body: "This request was assigned to another pro.",
        href: `/jobs/${job.id}`,
        actionType: "open_job",
        actionPayload: { jobId: job.id },
        jobId: job.id,
        jobStatus: "negotiating",
        groupKey: `request-moved-on-${job.id}`,
      });
    } catch {
      /* notifications optional */
    }
  }

  return true;
}

/**
 * Reroute an unaccepted job to the next available pro.
 * When no pro is available right now, the job moves into the `searching`
 * phase (customer sees the live 60/40 search screen) and the sweep keeps
 * retrying until the 15-minute window expires with `reroute_exhausted`.
 */
async function rerouteUnacceptedJob(
  job: JobRecord,
  sb: SupabaseClient,
): Promise<boolean> {
  const ok = await assignNextPro(job, sb);
  if (ok) return true;

  // No eligible pro right now enter searching so the customer sees the
  // search screen and dispatch keeps looking within the window.
  const ts = new Date().toISOString();
  const searchingHistory = [
    ...job.statusHistory,
    { status: "searching" as JobFlowStatus, at: ts, by: "reroute_no_pro" },
  ];
  const { error } = await sb
    .from("service_requests")
    .update({
      status: flowToLegacyStatus("searching"),
      flow_status: "searching",
      updated_at: ts,
      status_history: searchingHistory,
    })
    .eq("id", job.id);
  if (error) {
    console.error(
      "rerouteUnacceptedJob: searching update failed",
      job.id,
      error.message,
    );
  }
  // Keep memory in sync so the previous pro's dashboard drops the job from
  // Incoming (listJobsForUser merges memory first).
  memory.set(job.id, {
    ...job,
    status: "searching",
    updatedAt: ts,
    statusHistory: searchingHistory,
  });
  return false;
}

/**
 * Sweep for negotiating jobs where the pro has not tapped "I can fix this"
 * within 1 minute. Reroutes to the next available pro of the same trade.
 * After 15 minutes without any acceptance, the job expires with a
 * `reroute_exhausted` marker so the customer sees the retry message.
 * Also handles `searching` jobs (pro actively cancelled) reroute immediately
 * without the 1-minute delay.
 */
export async function expireUnacceptedJobs(
  limit = 40,
): Promise<{ checked: number; rerouted: number; expired: number }> {
  let checked = 0;
  let rerouted = 0;
  let expired = 0;

  if (!(await loadSupabaseAdmin())) return { checked, rerouted, expired };

  try {
    const createServiceSupabase = await loadCreateServiceSupabase();
    const sb = createServiceSupabase();

    // Sweep negotiating jobs (pro has not responded yet). SSPE jobs carry a
    // pairing_stage and are timed by the pairing sweep instead.
    // DB stores legacy status=requested + flow_status=negotiating for new jobs.
    const { data: negotiatingData } = await sb
      .from("service_requests")
      .select("*")
      .eq("flow_status", "negotiating")
      .is("pairing_stage", null)
      .order("created_at", { ascending: true })
      .limit(limit);

    for (const row of negotiatingData || []) {
      const job = rowToJob(row as Record<string, unknown>);
      checked++;

      const hasAccepted = job.statusHistory.some(
        (h) => h.by === "negotiation_timer_start",
      );
      if (hasAccepted) continue;

      if (isDeferredByPro(job, job.repairProId)) continue;

      const ageMs = Date.now() - new Date(job.createdAt).getTime();

      if (ageMs < REROUTE_AFTER_MS) continue;

      if (ageMs >= REROUTE_WINDOW_MS) {
        await sb
          .from("service_requests")
          .update({
            status: "expired",
            flow_status: "expired",
            updated_at: new Date().toISOString(),
            status_history: [
              ...job.statusHistory,
              {
                status: "expired",
                at: new Date().toISOString(),
                by: "reroute_exhausted",
              },
            ],
          })
          .eq("id", job.id);
        expired++;
      } else {
        const ok = await rerouteUnacceptedJob(job, sb);
        if (ok) rerouted++;
        // else: still searching / waiting do not count as expired
      }
    }

    // Sweep searching jobs (pro cancelled reroute immediately)
    const { data: searchingData } = await sb
      .from("service_requests")
      .select("*")
      .eq("flow_status", "searching")
      .is("pairing_stage", null)
      .order("created_at", { ascending: true })
      .limit(limit);

    for (const row of searchingData || []) {
      const job = rowToJob(row as Record<string, unknown>);
      checked++;

      // Measure the 15-minute search window from when searching actually
      // started (e.g. the decline), not from job creation.
      let searchingAt = 0;
      for (const h of job.statusHistory || []) {
        if (h.status === "searching") {
          const t = Date.parse(h.at);
          if (Number.isFinite(t) && t > searchingAt) searchingAt = t;
        }
      }
      const ageMs =
        Date.now() - (searchingAt || new Date(job.createdAt).getTime());

      if (ageMs >= REROUTE_WINDOW_MS) {
        // 15+ minutes expire
        await sb
          .from("service_requests")
          .update({
            status: "expired",
            flow_status: "expired",
            updated_at: new Date().toISOString(),
            status_history: [
              ...job.statusHistory,
              {
                status: "expired",
                at: new Date().toISOString(),
                by: "reroute_exhausted",
              },
            ],
          })
          .eq("id", job.id);
        expired++;
      } else {
        // Reroute immediately (no 1-minute delay for actively cancelled jobs).
        // When no pro is available right now, keep the job searching a pro
        // may free up before the 15-minute window ends.
        const ok = await assignNextPro(job, sb);
        if (ok) rerouted++;
      }
    }
  } catch (e) {
    console.error("expireUnacceptedJobs", e);
  }

  return { checked, rerouted, expired };
}

/** Reroute a single unaccepted job to the next nearest pro when the current pro declines. */
export async function rerouteDeclinedJob(
  jobId: string,
  cancelReason?: string,
): Promise<{ ok: true; job: JobRecord } | { error: string }> {
  if (!(await loadSupabaseAdmin())) return { error: "Server not configured" };
  const createServiceSupabase = await loadCreateServiceSupabase();
  const sb = createServiceSupabase();
  const { data } = await sb
    .from("service_requests")
    .select("*")
    .eq("id", jobId)
    .single();
  if (!data) return { error: "Job not found" };
  const job = rowToJob(data as Record<string, unknown>);
  if (job.status !== "negotiating" && job.status !== "searching") {
    return { error: "Job is no longer available" };
  }

  // SSPE job → hand off to the pairing engine (per-request exclusion + next pro).
  if (job.pairingStage) {
    try {
      const { declineRequest } =
        await import("@/lib/server/pairing/pairing-engine");
      const res = await declineRequest(
        jobId,
        job.repairProId,
        cancelReason || "pro_declined",
      );
      if (!res.ok) return { error: res.error };
      const updated = await getJob(jobId);
      if (!updated) return { error: "Job not found" };
      return { ok: true, job: updated };
    } catch (e) {
      console.error("rerouteDeclinedJob: SSPE decline failed", jobId, e);
      return { error: "Could not reroute request" };
    }
  }

  // Record the cancellation in statusHistory, then move the job into the
  // "searching" phase so the customer's UI shows the live 60/40 search screen
  // while dispatch looks for the next pro.
  const cancelledProName = job.repairProName;
  const declineTs = new Date().toISOString();
  const cancelEntry = {
    status: "searching" as JobFlowStatus,
    at: declineTs,
    by: "repair_pro",
    note: cancelReason ? `pro_declined:${cancelReason}` : "pro_declined",
  };
  const history = [...(job.statusHistory || []), cancelEntry];

  // Per-request exclusion only (D6): this pro is excluded permanently from
  // THIS request, never across future requests from the same customer.
  history.push({
    status: "searching" as JobFlowStatus,
    at: declineTs,
    by: `excluded:${job.repairProId}`,
  });

  // 1) Persist the searching phase first (customer sees the search screen).
  const { error: searchErr } = await sb
    .from("service_requests")
    .update({
      status: flowToLegacyStatus("searching"),
      flow_status: "searching",
      updated_at: declineTs,
      status_history: history,
    })
    .eq("id", job.id);
  if (searchErr) {
    console.error(
      "rerouteDeclinedJob: searching update failed",
      job.id,
      searchErr.message,
    );
    return { error: "Could not enter searching phase" };
  }

  // Keep the in-memory store in sync so the declining pro's dashboard no
  // longer lists this job under Incoming (listJobsForUser merges memory first).
  memory.set(job.id, {
    ...job,
    status: "searching",
    updatedAt: declineTs,
    statusHistory: history,
  });

  // 2) Hand off ASAP to the next available pro. When none is available the
  // job stays in "searching" the expireUnacceptedJobs sweep keeps retrying
  // and only expires after the 15-minute window. Skip notifying the previous
  // pro the decliner initiated this reroute, so "moved on" would be noise.
  const jobWithHistory = { ...job, statusHistory: history };
  await assignNextPro(jobWithHistory, sb, true);

  // Notify customer that the pro declined and we're finding another
  try {
    const insertNotification = await loadInsertNotification();
    await insertNotification({
      userId: job.motoristId,
      category: "requests",
      priority: "high",
      title: "Repair Pro not available",
      body: `${cancelledProName} could not take this request. Finding another pro…`,
      href: `/jobs/${job.id}`,
      actionType: "open_job",
      actionPayload: { jobId: job.id },
      jobId: job.id,
      jobStatus: "searching",
      groupKey: `pro-declined-${job.id}`,
    });
  } catch {
    /* notification optional */
  }

  // Reload to get the post-reroute state (negotiating with new pro, or still
  // searching while we keep looking).
  const { data: updated } = await sb
    .from("service_requests")
    .select("*")
    .eq("id", jobId)
    .single();
  const finalJob = rowToJob((updated || data) as Record<string, unknown>);
  // Mirror the final state into memory (assignNextPro already does this on a
  // successful handoff, but reflect the searching fallback here too).
  memory.set(job.id, finalJob);
  return { ok: true, job: finalJob };
}

/**
 * Admin control: force-reroute an active job to the next eligible pro
 * (skipping deferred/excluded/tried pros). Returns the updated job, or an
 * error when the job isn't actively awaiting a pro or no pro is eligible.
 */
export async function forceRerouteJob(
  jobId: string,
): Promise<{ ok: true; job: JobRecord } | { error: string }> {
  if (!(await loadSupabaseAdmin())) return { error: "Server not configured" };
  const createServiceSupabase = await loadCreateServiceSupabase();
  const sb = createServiceSupabase();
  const { data } = await sb
    .from("service_requests")
    .select("*")
    .eq("id", jobId)
    .single();
  if (!data) return { error: "Job not found" };
  const job = rowToJob(data as Record<string, unknown>);
  if (job.status !== "negotiating" && job.status !== "searching") {
    return { error: "Job is not awaiting a pro" };
  }

  job.statusHistory = [
    ...(job.statusHistory || []),
    {
      status: job.status as JobFlowStatus,
      at: new Date().toISOString(),
      by: "admin_force_reroute",
    },
  ];

  const ok = await assignNextPro(job, sb);
  if (!ok) return { error: "No eligible pro available" };

  const { data: updated } = await sb
    .from("service_requests")
    .select("*")
    .eq("id", jobId)
    .single();
  if (!updated) return { error: "Job not found after reroute" };
  return { ok: true, job: rowToJob(updated as Record<string, unknown>) };
}

/**
 * Admin control: clear every active cooldown (deferrals + exclusions) for a
 * job so dispatch may consider those pros again immediately.
 */
export async function clearJobCooldowns(
  jobId: string,
): Promise<{ ok: true; job: JobRecord } | { error: string }> {
  if (!(await loadSupabaseAdmin())) return { error: "Server not configured" };
  const createServiceSupabase = await loadCreateServiceSupabase();
  const sb = createServiceSupabase();
  const { data } = await sb
    .from("service_requests")
    .select("*")
    .eq("id", jobId)
    .single();
  if (!data) return { error: "Job not found" };
  const job = rowToJob(data as Record<string, unknown>);

  // Strip deferral / exclusion markers from persisted history.
  const cleaned = (job.statusHistory || []).filter((h) => {
    const by = h.by || "";
    return !by.startsWith("deferred:") && !by.startsWith("excluded:");
  });
  await sb
    .from("service_requests")
    .update({
      status_history: cleaned,
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);

  // SSPE: un-terminate the request queue so declined/timed-out pros are
  // eligible again for this request (admin explicitly cleared the cooldowns).
  if (job.pairingStage) {
    await sb
      .from("request_pairing_queue")
      .update({ status: "offered", result_note: "admin_cleared" })
      .eq("request_id", jobId)
      .in("status", ["declined", "timed_out", "deferred", "skipped"]);
  }

  const { data: updated } = await sb
    .from("service_requests")
    .select("*")
    .eq("id", jobId)
    .single();
  if (!updated) return { error: "Job not found after clear" };
  return { ok: true, job: rowToJob(updated as Record<string, unknown>) };
}

/**
 * Admin control: force-expire an active job (ends the search/negotiation).
 */
export async function adminExpireJob(
  jobId: string,
): Promise<{ ok: true; job: JobRecord } | { error: string }> {
  if (!(await loadSupabaseAdmin())) return { error: "Server not configured" };
  const createServiceSupabase = await loadCreateServiceSupabase();
  const sb = createServiceSupabase();
  const { data } = await sb
    .from("service_requests")
    .select("*")
    .eq("id", jobId)
    .single();
  if (!data) return { error: "Job not found" };
  const job = rowToJob(data as Record<string, unknown>);

  const ts = new Date().toISOString();
  await sb
    .from("service_requests")
    .update({
      status: "expired",
      flow_status: "expired",
      updated_at: ts,
      status_history: [
        ...(job.statusHistory || []),
        { status: "expired", at: ts, by: "admin_expired" },
      ],
    })
    .eq("id", jobId);

  const { data: updated } = await sb
    .from("service_requests")
    .select("*")
    .eq("id", jobId)
    .single();
  if (!updated) return { error: "Job not found after expire" };
  return { ok: true, job: rowToJob(updated as Record<string, unknown>) };
}

/**
 * Admin control: reassign an active job to a specific pro, bypassing the
 * normal dispatch order. The targeted pro's active deferral/exclusion for
 * this job is cleared first so the override sticks.
 */
export async function adminReassignJob(
  jobId: string,
  proId: string,
  proName?: string,
): Promise<{ ok: true; job: JobRecord } | { error: string }> {
  if (!(await loadSupabaseAdmin())) return { error: "Server not configured" };
  if (!proId) return { error: "Missing proId" };
  const createServiceSupabase = await loadCreateServiceSupabase();
  const sb = createServiceSupabase();
  const { data } = await sb
    .from("service_requests")
    .select("*")
    .eq("id", jobId)
    .single();
  if (!data) return { error: "Job not found" };
  const job = rowToJob(data as Record<string, unknown>);

  const ts = new Date().toISOString();
  const history = (job.statusHistory || []).filter((h) => {
    const by = h.by || "";
    return (
      !(by.startsWith("deferred:") && by.slice("deferred:".length) === proId) &&
      !(by.startsWith("excluded:") && by.slice("excluded:".length) === proId)
    );
  });
  history.push({
    status: "negotiating",
    at: ts,
    by: `admin_reassign:${proId}`,
  });

  await sb
    .from("service_requests")
    .update({
      status: "negotiating",
      flow_status: "negotiating",
      repair_pro_id: proId,
      repair_pro_name: proName || job.repairProName,
      updated_at: ts,
      status_history: history,
    })
    .eq("id", jobId);

  try {
    const insertNotification = await loadInsertNotification();
    await insertNotification({
      userId: proId,
      category: "requests",
      priority: "high",
      title: "Service Request",
      body: `New request from ${job.motoristName} · ${job.problem.slice(0, 80)}`,
      href: `/jobs/${job.id}`,
      actionType: "open_job",
      actionPayload: { jobId: job.id },
      jobId: job.id,
      groupKey: `service-request-${job.id}`,
    });
  } catch {
    /* notifications optional */
  }

  const { data: updated } = await sb
    .from("service_requests")
    .select("*")
    .eq("id", jobId)
    .single();
  if (!updated) return { error: "Job not found after reassign" };
  return { ok: true, job: rowToJob(updated as Record<string, unknown>) };
}
