/**
 * Ona Smart Sequential Pairing Engine (SSPE).
 *
 * Server-owned dispatch that runs the customer-chosen pro first, then
 * advances one pro at a time with a 144s deadline. DB-persisted
 * `pairing_deadline` is the single source of truth (D3); clients only
 * render it. Every transition is idempotent and race-safe via
 * compare-and-set `UPDATE ... WHERE pairing_stage = <expected>`.
 *
 * See docs/SSPE_REFACTOR_PLAN.md §6.
 */

import { createServiceSupabase } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { NEGOTIATE_WINDOW_MS, SECOND_PRO_DELAY_MS } from "@/lib/jobs/constants";
import { windowLeftMs, windowStillOpen } from "@/lib/jobs/deadline";
import { hasRecentLiveHeartbeat, MAX_RADIUS_KM } from "@/lib/matching";
import { orderCandidatesByMerit } from "@/lib/server/merit/merit-engine";
import { isSyntheticAccount } from "@/lib/server/synthetic-accounts";

export const PAIRING_WINDOW_MS = 144_000; // 144s per pro (display + enforce)
export const DEFER_DURATION_MS = 5 * 60_000; // Later = 5 min exclusion from re-offer
/** At open we KEEP the running 144s pairing window as the review window unless
 * less than this much remains (then a fresh full window is issued), so the
 * customer's ring never visibly jumps back to 66 mid-count. */
export const OPEN_REARM_FLOOR_MS = 10_000;
/** Max time an offer sits un-surfaced before the sweep arms the pairing
 * deadline itself (fallback when the pro's device never renders the card). */
export const SURFACE_FALLBACK_GRACE_MS = 8000;
// Search starts tight (1 km) and expands toward the customer's chosen radius
// (0-5 km slider), capped at 5 km. The customer's radius caps each request
// via service_requests.radius_km (see nextRadiusKm's maxKm).
export const RADIUS_STEPS_KM = [1, 2, 3, MAX_RADIUS_KM];
export const MAX_PAIRING_RADIUS_KM =
  RADIUS_STEPS_KM[RADIUS_STEPS_KM.length - 1];
/**
 * Search-radius cap per customer round (round 0 = fresh search, round N = N-th
 * retry). Fresh searches stay tight (2 km); each Retry widens toward the 5 km
 * marketplace cap so a nearby pro is hit before expanding further out.
 */
export const PAIRING_ROUND_MAX_KM = [2, 3, 4, MAX_PAIRING_RADIUS_KM];
/**
 * Pros contacted per search round (one-by-one, 144s each).
 * Cap is a safety ceiling when many Live pros exist. Once every unique Live
 * pro in the customer radius has been tried (timeout / later / decline),
 * the round ends immediately → expired → customer Retry. We never re-offer
 * the same pro inside one wave (that created "ghost 3rd pro" links).
 */
export const MAX_PAIRING_ATTEMPTS = 6;
/**
 * Stages actively pairing (dispatchable / advanceable) the sweep re-runs the
 * search for these instead of a plain timeout.
 */
export const PAIRING_STAGES = [
  "waiting_for_selected",
  "selected_review",
  "sequential_pairing",
  "waiting_for_pro",
  "reserved",
] as const;
export type PairingStage = (typeof PAIRING_STAGES)[number];

const QUEUE_TERMINAL = new Set([
  "declined",
  "timed_out",
  "accepted",
  "skipped",
]);

export type PairingResult =
  | {
      ok: true;
      noop?: boolean;
      jobId: string;
      currentProId?: string | null;
      nextProId?: string | null;
      expired?: boolean;
    }
  | { ok: false; error: string; status?: number };

type PairingRow = {
  id: string;
  motorist_id: string;
  motorist_name: string | null;
  repair_pro_id: string | null;
  service_type: string;
  likely_trade_ids?: string[] | null;
  problem_text: string | null;
  description: string | null;
  pickup_lat: number | null;
  pickup_lng: number | null;
  pairing_stage: string | null;
  pairing_deadline: string | null;
  pairing_radius_km: number | null;
  radius_km: number | null;
  queue_position: number | null;
  remaining_candidates: number | null;
  reservation_status: string | null;
  assignment_status: string | null;
  idempotency_key: string | null;
  chosen_pro_id: string | null;
  status_history: unknown;
  flow_status: string | null;
  status: string | null;
  created_at: string | null;
};

type ProCandidate = {
  user_id: string;
  business_name: string | null;
  full_name?: string | null;
  avatar_url?: string | null;
};

const nowIso = () => new Date().toISOString();
const deadlineIso = () =>
  new Date(Date.now() + PAIRING_WINDOW_MS).toISOString();

async function loadPairingRow(
  sb: ReturnType<typeof createServiceSupabase>,
  jobId: string,
): Promise<PairingRow | null> {
  const { data } = await sb
    .from("service_requests")
    .select(
      [
        "id",
        "motorist_id",
        "motorist_name",
        "repair_pro_id",
        "service_type",
        "likely_trade_ids",
        "problem_text",
        "description",
        "pickup_lat",
        "pickup_lng",
        "pairing_stage",
        "pairing_deadline",
        "pairing_radius_km",
        "radius_km",
        "queue_position",
        "remaining_candidates",
        "reservation_status",
        "assignment_status",
        "idempotency_key",
        "chosen_pro_id",
        "status_history",
        "flow_status",
        "status",
        "created_at",
      ].join(","),
    )
    .eq("id", jobId)
    .maybeSingle();
  if (!data) return null;
  return data as unknown as PairingRow;
}

function history(row: PairingRow): object[] {
  const raw = row.status_history;
  return Array.isArray(raw) ? (raw as object[]) : [];
}

/** Customer round: 0 = fresh search, 1 = first Retry, 2 = second, 3 = third. */
function pairingRound(row: PairingRow): number {
  return history(row).filter(
    (h) => (h as { by?: string }).by === "retry_search",
  ).length;
}

/** Search-radius cap for the current round, never beyond the customer's choice. */
function roundMaxRadiusKm(row: PairingRow): number {
  const round = pairingRound(row);
  const roundCap =
    PAIRING_ROUND_MAX_KM[Math.min(round, PAIRING_ROUND_MAX_KM.length - 1)] ??
    MAX_PAIRING_RADIUS_KM;
  const customerCap =
    row.radius_km && row.radius_km > 0 ? row.radius_km : MAX_PAIRING_RADIUS_KM;
  return Math.min(customerCap, roundCap);
}

function problemText(row: PairingRow): string {
  return String(row.problem_text || row.description || "");
}

/** The pro currently holding this request (chosen or pairing). */
function currentPro(row: PairingRow): string | null {
  return row.repair_pro_id || null;
}

function offersTrade(
  serviceType: string,
  p: { primary_service?: string | null; services?: unknown },
): boolean {
  const want = String(serviceType || "")
    .trim()
    .toLowerCase();
  if (!want) return true;
  if (
    String(p.primary_service || "")
      .trim()
      .toLowerCase() === want
  )
    return true;
  const list = p.services;
  if (Array.isArray(list)) {
    return list.some(
      (s) =>
        String(s || "")
          .trim()
          .toLowerCase() === want,
    );
  }
  return false;
}

/**
 * Next eligible pro of the same trade within `radiusKm`, ordered by merit.
 * Any pro already in this request's queue (offered / timed_out / deferred /
 * declined / accepted / skipped) is permanently excluded for this wave.
 * Retry search clears passive outcomes so a new wave can re-offer.
 * Never re-offers the same pro mid-wave (ghost re-link bug).
 */
async function findCandidate(
  sb: ReturnType<typeof createServiceSupabase>,
  row: PairingRow,
  radiusKm: number,
): Promise<{ candidate: ProCandidate; remaining: number } | null> {
  const { data: queue } = await sb
    .from("request_pairing_queue")
    .select("pro_id, status, responded_at")
    .eq("request_id", row.id);

  const now = Date.now();
  const blocked = new Set<string>();
  for (const q of queue ?? []) {
    const status = String(q.status || "");
    // Anyone already contacted this wave is out including timed_out.
    // Re-offering created "3rd pro doesn't exist" on the pro phone (same
    // job already_shown, no popup) while the job still pointed at them.
    if (
      QUEUE_TERMINAL.has(status) ||
      status === "deferred" ||
      status === "offered"
    ) {
      blocked.add(String(q.pro_id));
    }
  }
  // Current assignee is never re-dispatched until queue settles them.
  if (row.repair_pro_id) blocked.add(row.repair_pro_id);

  const { data: pros } = await sb
    .from("repair_pro_profiles")
    .select(
      "user_id, business_name, primary_service, services, lat, lng, location_updated_at, visibility_tier, is_online, profiles(email, full_name)",
    )
    .eq("is_online", true)
    .neq("status", "suspended")
    .neq("status", "rejected");

  const { lat: cLat, lng: cLng } = {
    lat: Number(row.pickup_lat) || 0,
    lng: Number(row.pickup_lng) || 0,
  };

  const { resolveDispatchTrades, proOffersAnyTrade } =
    await import("@/lib/callout/dispatch-trades");
  const storedTrades = Array.isArray(row.likely_trade_ids)
    ? row.likely_trade_ids.filter(Boolean)
    : [];
  const dispatchTrades = storedTrades.length
    ? storedTrades
    : resolveDispatchTrades(problemText(row), row.service_type).dispatchTrades;

  let candidates = (
    (pros ?? []) as Array<{
      user_id: string;
      business_name: string | null;
      primary_service?: string | null;
      services?: unknown;
      lat: number | null;
      lng: number | null;
      location_updated_at?: string | null;
      profiles?: { email?: string | null; full_name?: string | null } | null;
    }>
  )
    .filter((p) => {
      if (blocked.has(String(p.user_id))) return false;
      if (p.lat == null || p.lng == null) return false;
      // Live flag alone can be stale (pro closed the app without going Away).
      // Require a fresh heartbeat like the marketplace feed, so we never
      // dispatch to a pro who is not actually reachable ("ghost online").
      if (!hasRecentLiveHeartbeat(p.location_updated_at, now)) return false;
      if (!proOffersAnyTrade(dispatchTrades, p)) return false;
      // Never pair a real customer with a demo/audit pro.
      if (
        isSyntheticAccount({
          email: p.profiles?.email,
          fullName: p.profiles?.full_name,
          businessName: p.business_name,
        })
      ) {
        return false;
      }
      return true;
    })
    .map((p) => {
      const dLat = (Number(p.lat) - cLat) * 111;
      const dLng =
        (Number(p.lng) - cLng) * 111 * Math.cos((cLat * Math.PI) / 180);
      return { p, km: Math.hypot(dLat, dLng) };
    })
    .filter((x) => x.km <= radiusKm)
    .map((x) => x.p);

  if (!candidates.length) return null;

  const roadKm = new Map<string, number>();
  try {
    const { loadCalloutPolicy } = await import("@/lib/server/callout/store");
    const { computeDriveMetricsBatch } =
      await import("@/lib/server/google-eta");
    const policy = await loadCalloutPolicy();
    const maxKm = policy.enabled ? policy.maximumRadiusKm : radiusKm;
    if (policy.enabled && Number.isFinite(cLat) && Number.isFinite(cLng)) {
      const dests = candidates.slice(0, 25).map((p) => ({
        lat: Number(p.lat),
        lng: Number(p.lng),
      }));
      const metrics = await computeDriveMetricsBatch(
        { lat: cLat, lng: cLng },
        dests,
      );
      candidates.slice(0, dests.length).forEach((p, i) => {
        const m = metrics[i];
        if (m && m.source === "google_distance_matrix") {
          roadKm.set(String(p.user_id), m.distanceKm);
        }
      });
      if (roadKm.size > 0) {
        candidates = candidates.filter((p) => {
          const road = roadKm.get(String(p.user_id));
          return road != null && road <= maxKm + 1e-9;
        });
      }
    }
  } catch {
    /* keep haversine-filtered pool */
  }

  if (!candidates.length) return null;

  const ordered = await orderCandidatesByMerit(
    candidates.map((p) => ({ user_id: p.user_id, pro: p })),
    (c) => {
      const pro = c.pro;
      const road = roadKm.get(String(pro.user_id));
      if (typeof road === "number") return road;
      const dLat = (Number(pro.lat) - cLat) * 111;
      const dLng =
        (Number(pro.lng) - cLng) * 111 * Math.cos((cLat * Math.PI) / 180);
      return Math.hypot(dLat, dLng);
    },
  );

  const best = ordered[0].pro;
  const { data: profile } = await sb
    .from("profiles")
    .select("full_name, avatar_url")
    .eq("id", best.user_id)
    .maybeSingle();

  return {
    candidate: {
      user_id: best.user_id,
      business_name: best.business_name,
      full_name: profile?.full_name || null,
      avatar_url: profile?.avatar_url || null,
    },
    remaining: Math.max(0, ordered.length - 1),
  };
}

async function notifyPro(
  userId: string,
  jobId: string,
  title: string,
  body: string,
  jobStatus: string,
): Promise<void> {
  try {
    const { insertNotification } = await import("@/lib/server/notifications");
    await insertNotification({
      userId,
      category: "requests",
      priority: "high",
      title,
      body,
      href: `/jobs/${jobId}`,
      actionType: "open_job",
      actionPayload: { jobId },
      jobId,
      jobStatus,
      groupKey: `service-request-${jobId}`,
    });
  } catch {
    /* notifications optional */
  }
}

/** Next radius step, or null when already at the max for this customer.
 * `maxKm` caps expansion at the customer's chosen radius (0-5 slider); when
 * absent it falls back to the global MAX_PAIRING_RADIUS_KM (5 km). */
export function nextRadiusKm(
  current: number | null,
  maxKm?: number | null,
): number | null {
  const cur = Number(current);
  const cap = Math.min(
    maxKm && maxKm > 0 ? maxKm : MAX_PAIRING_RADIUS_KM,
    MAX_PAIRING_RADIUS_KM,
  );
  for (const r of RADIUS_STEPS_KM) {
    if (r > cur && r <= cap) return r;
  }
  return null;
}

/**
 * Offer the request to `candidate` (round = queue_position + 1). The queue row
 * is upserted on (request_id, pro_id) so a recycled pro is bumped back to
 * "offered" at the new round instead of silently colliding with the unique
 * index on (request_id, pro_id).
 */
async function dispatchCandidate(
  sb: ReturnType<typeof createServiceSupabase>,
  row: PairingRow,
  candidate: ProCandidate,
  remaining: number,
  source: "pairing",
): Promise<PairingResult> {
  const ts = nowIso();
  const position = Number(row.queue_position) || 0;
  const name = candidate.full_name || candidate.business_name || "Repair Pro";
  const { error: qErr } = await sb.from("request_pairing_queue").upsert(
    {
      request_id: row.id,
      pro_id: candidate.user_id,
      position: position + 1,
      source,
      status: "offered",
      offered_at: ts,
      responded_at: null,
      result_note: null,
    },
    { onConflict: "request_id,pro_id" },
  );
  if (qErr && !/duplicate|already exists/i.test(qErr.message)) {
    return { ok: false, error: qErr.message, status: 500 };
  }

  const { error } = await sb
    .from("service_requests")
    .update({
      pairing_stage: "waiting_for_pro",
      flow_status: "waiting_for_pro",
      status: "requested",
      // Deadline stays NULL until the request actually appears on the pro's
      // screen (surface endpoint arms it exactly once) otherwise dispatch
      // and surface both arm it and the shared timer rolls back to 144s.
      pairing_deadline: null,
      queue_position: position + 1,
      remaining_candidates: remaining,
      reservation_status: "none",
      repair_pro_id: candidate.user_id,
      repair_pro_name: name,
      ...(candidate.avatar_url
        ? { repair_pro_photo: candidate.avatar_url }
        : {}),
      updated_at: ts,
      status_history: [
        ...history(row),
        {
          status: "waiting_for_pro",
          at: ts,
          by: `pairing:${candidate.user_id}`,
        },
      ],
    })
    .eq("id", row.id)
    .eq("pairing_stage", row.pairing_stage);

  if (error) return { ok: false, error: error.message, status: 500 };

  await notifyPro(
    candidate.user_id,
    row.id,
    "Service Request",
    `New request from ${row.motorist_name || "a customer"} · ${problemText(row).slice(0, 80)}`,
    "waiting_for_pro",
  );

  return {
    ok: true,
    jobId: row.id,
    currentProId: candidate.user_id,
    nextProId: candidate.user_id,
  };
}

/**
 * Advance to the next unique Live pro in the current search wave.
 * - attempts >= MAX → expire (customer Retry)
 * - new Live pro in radius → waiting_for_pro + shared 144s pairing_deadline
 * - none at radius → expand within customer cap, then continue
 * - unique pool empty → expire immediately (Retry). No same-pro recycle.
 */
export async function advancePairing(jobId: string): Promise<PairingResult> {
  if (!isSupabaseAdminConfigured()) {
    return { ok: false, error: "Supabase is not configured", status: 503 };
  }
  const sb = createServiceSupabase();
  const row = await loadPairingRow(sb, jobId);
  if (!row) return { ok: false, error: "Job not found", status: 404 };
  // Guard: never re-advance an already-assigned / negotiating job.
  if (!PAIRING_STAGES.includes(row.pairing_stage as PairingStage)) {
    return { ok: true, noop: true, jobId: row.id };
  }

  const radius = Math.min(
    Number(row.pairing_radius_km) || RADIUS_STEPS_KM[0],
    roundMaxRadiusKm(row),
  );
  const attempts = Number(row.queue_position) || 0;

  // Cap: 6 unique pros per round, then customer must Retry for the next wave.
  if (attempts >= MAX_PAIRING_ATTEMPTS) {
    return markExhausted(sb, row);
  }

  const found = await findCandidate(sb, row, radius);
  if (found) {
    return dispatchCandidate(
      sb,
      row,
      found.candidate,
      found.remaining,
      "pairing",
    );
  }

  // Expand radius within the customer's search radius (not random outside),
  // capped by the current round's max (fresh 2 km → retries 3/4/5 km).
  const nextRadius = nextRadiusKm(radius, roundMaxRadiusKm(row));
  if (nextRadius != null) {
    const { error } = await sb
      .from("service_requests")
      .update({ pairing_radius_km: nextRadius, updated_at: nowIso() })
      .eq("id", row.id)
      .eq("pairing_stage", row.pairing_stage);
    if (!error) {
      return advancePairing(jobId);
    }
  }

  // Unique pool empty never recycle the same pro in this wave.
  // Nobody tried yet (fresh search or a Retry round): hold the 144s pairing
  // window searching instead of instantly exhausting an older request that a
  // Retry just re-opened (the old request-age hold made Retry last ~2s). The
  // sweep re-runs this after the deadline lapses and it exhausts then. Once at
  // least one pro was really tried, empty pool → expire immediately so Retry
  // appears after the last real pro.
  const triedAnyone = attempts >= 1;
  if (!triedAnyone) {
    const armedFuture = windowStillOpen(row.pairing_deadline);
    const needsArm = !row.pairing_deadline;
    if (armedFuture || needsArm) {
      const holdPatch: Record<string, unknown> = {
        pairing_stage: "sequential_pairing",
        flow_status: "sequential_pairing",
        // Unlink so no ghost "assigned to pro X" while empty-searching
        repair_pro_id: null,
        repair_pro_name: null,
        updated_at: nowIso(),
      };
      if (needsArm) holdPatch.pairing_deadline = deadlineIso();
      await sb
        .from("service_requests")
        .update(holdPatch)
        .eq("id", row.id)
        .eq("pairing_stage", row.pairing_stage);
      return { ok: true, jobId: row.id, currentProId: null, noop: true };
    }
  }

  return markExhausted(sb, row);
}

async function markExhausted(
  sb: ReturnType<typeof createServiceSupabase>,
  row: PairingRow,
): Promise<PairingResult> {
  const ts = nowIso();
  const { data, error } = await sb
    .from("service_requests")
    .update({
      pairing_stage: null,
      pairing_deadline: null,
      flow_status: "expired",
      status: "expired",
      // Clear assignee so expired UI is not "linked" to the last timed-out pro
      repair_pro_id: null,
      repair_pro_name: null,
      updated_at: ts,
      status_history: [
        ...history(row),
        { status: "expired", at: ts, by: "pairing_exhausted" },
      ],
    })
    .eq("id", row.id)
    .eq("pairing_stage", row.pairing_stage)
    .select("id");
  if (error) return { ok: false, error: error.message, status: 500 };
  // CAS matched 0 rows → the request moved (a pro confirmed, or the stage
  // changed mid-flight). Never report expired for a job we did not expire.
  if (!data || data.length === 0) {
    return {
      ok: true,
      noop: true,
      jobId: row.id,
      currentProId: currentPro(row),
    };
  }
  return { ok: true, jobId: row.id, currentProId: null, expired: true };
}

/** Max times a customer can re-run a pairing-exhausted search. */
export const MAX_PAIRING_RETRIES = 3;

/**
 * Customer Retry search after a round of up to 6 pros.
 * - Stays on the same job (flow → sequential_pairing / waiting_for_pro)
 * - Keeps declined pros excluded permanently for this request
 * - Clears timed_out / deferred / skipped so the next 6 can include new pros
 * in the customer radius, or reshuffle the same small pool in sequence
 */
export async function retrySearch(jobId: string): Promise<PairingResult> {
  if (!isSupabaseAdminConfigured()) {
    return { ok: false, error: "Supabase is not configured", status: 503 };
  }
  const sb = createServiceSupabase();
  const row = await loadPairingRow(sb, jobId);
  if (!row) return { ok: false, error: "Job not found", status: 404 };

  const exhausted = (row.status_history as Array<{ by?: string }> | null) ?? [];
  const retried = exhausted.filter((h) => h.by === "retry_search").length;
  if (retried >= MAX_PAIRING_RETRIES) {
    return {
      ok: true,
      noop: true,
      jobId: row.id,
      currentProId: currentPro(row),
    };
  }
  const isExpired = row.flow_status === "expired" || row.status === "expired";
  if (!isExpired) {
    return { ok: false, error: "Request is not finished", status: 409 };
  }

  const ts = nowIso();
  const nextRoundCap =
    PAIRING_ROUND_MAX_KM[
      Math.min(retried + 1, PAIRING_ROUND_MAX_KM.length - 1)
    ] ?? MAX_PAIRING_RADIUS_KM;
  const customerCap =
    row.radius_km && row.radius_km > 0 ? row.radius_km : MAX_PAIRING_RADIUS_KM;
  const patch = {
    pairing_stage: "sequential_pairing",
    // Fresh shared 144s clock customer ring + pro popup both use this field
    pairing_deadline: deadlineIso(),
    // Widening radius: fresh searched ≤2 km, this Retry jumps to the next cap
    // (3 → 4 → 5 km) so a nearby pro is found before going further out.
    pairing_radius_km: Math.min(nextRoundCap, customerCap),
    repair_pro_id: null as string | null,
    repair_pro_name: null as string | null,
    queue_position: 0,
    remaining_candidates: null as number | null,
    reservation_status: "none",
    assignment_status: "none",
    flow_status: "sequential_pairing",
    status: "requested",
    updated_at: ts,
    status_history: [
      ...history(row),
      { status: "sequential_pairing", at: ts, by: "retry_search" },
    ],
  };

  const { data: updated, error } = await sb
    .from("service_requests")
    .update(patch)
    .eq("id", row.id)
    .select("id");
  if (error) return { ok: false, error: error.message, status: 500 };
  if (!updated?.length) {
    return { ok: false, error: "Could not restart search", status: 409 };
  }

  // Keep permanent declines (and accepts); clear passive outcomes so the next
  // wave can expand to pros not yet tried, or reshuffle timed-out ones.
  await sb
    .from("request_pairing_queue")
    .delete()
    .eq("request_id", jobId)
    .in("status", ["timed_out", "deferred", "skipped", "offered"]);

  // Dispatch the first pro of the new round immediately (no long lag).
  const next = await advancePairing(jobId);
  return {
    ok: true,
    jobId: row.id,
    currentProId: next.ok ? (next.currentProId ?? null) : null,
    nextProId: next.ok ? (next.nextProId ?? null) : null,
  };
}

/**
 * Pro taps Open. Idempotent via `idempotency_key`. Creates the one active
 * reservation and moves to the "I can fix this / I cannot fix this" screen.
 */
export async function openRequest(
  jobId: string,
  proId: string,
  idempotencyKey?: string | null,
): Promise<PairingResult> {
  if (!isSupabaseAdminConfigured()) {
    return { ok: false, error: "Supabase is not configured", status: 503 };
  }
  const sb = createServiceSupabase();
  const row = await loadPairingRow(sb, jobId);
  if (!row) return { ok: false, error: "Job not found", status: 404 };
  if (currentPro(row) !== proId) {
    return { ok: false, error: "Not assigned to this request", status: 403 };
  }
  if (
    !["waiting_for_selected", "waiting_for_pro"].includes(
      row.pairing_stage || "",
    )
  ) {
    return {
      ok: false,
      error: "Request is not open for this action",
      status: 409,
    };
  }
  if (idempotencyKey && row.idempotency_key === idempotencyKey) {
    return { ok: true, noop: true, jobId };
  }

  const stage: PairingStage =
    row.pairing_stage === "waiting_for_selected"
      ? "selected_review"
      : "reserved";
  const ts = nowIso();

  // Keep the SAME pairing_deadline as the review window whenever it's still
  // healthy (no visible jump when the pro opens) the ring/card count straight
  // through. Only re-arm to a fresh 144s when the current window is unset or
  // nearly spent, so the pro still gets a real review period.
  const currentLeftMs = windowLeftMs(row.pairing_deadline);
  const reviewDeadline =
    currentLeftMs < OPEN_REARM_FLOOR_MS
      ? deadlineIso()
      : String(row.pairing_deadline);

  const { error: resErr } = await sb.from("request_reservations").insert({
    request_id: row.id,
    pro_id: proId,
    stage,
    status: "active",
    expires_at: reviewDeadline,
  });
  if (resErr) return { ok: false, error: resErr.message, status: 500 };

  const patch: Record<string, unknown> = {
    pairing_stage: stage,
    flow_status: stage,
    status: "requested",
    pairing_deadline: reviewDeadline,
    reservation_status: "active",
    updated_at: ts,
    status_history: [
      ...history(row),
      { status: stage, at: ts, by: `open:${proId}` },
    ],
  };
  if (idempotencyKey) patch.idempotency_key = idempotencyKey;

  const { data, error } = await sb
    .from("service_requests")
    .update(patch)
    .eq("id", row.id)
    .eq("pairing_stage", row.pairing_stage)
    .select("id");
  if (error) return { ok: false, error: error.message, status: 500 };
  // CAS matched 0 rows → the request moved while we opened (e.g. the sweep
  // advanced past our deadline). Release the reservation we just inserted so
  // it can never orphan an "active" slot (which blocks the next pro's open).
  if (!data || data.length === 0) {
    await sb
      .from("request_reservations")
      .update({
        status: "cancelled",
        released_at: ts,
        released_by: "open_race",
      })
      .eq("request_id", row.id)
      .eq("pro_id", proId)
      .eq("status", "active");
    return { ok: false, error: "Request moved on while opening", status: 409 };
  }

  return { ok: true, jobId: row.id, currentProId: proId };
}

/**
 * Pro taps "I can fix this" the assignment point. Reservation → confirmed,
 * request enters the existing 20-min negotiation flow, pairing timers stop.
 */
export async function confirmRequest(
  jobId: string,
  proId: string,
  idempotencyKey?: string | null,
  gps?: {
    lat: number;
    lng: number;
    accuracyM?: number | null;
    capturedAt?: string | null;
    mockLocation?: boolean | null;
  } | null,
): Promise<PairingResult> {
  if (!isSupabaseAdminConfigured()) {
    return { ok: false, error: "Supabase is not configured", status: 503 };
  }
  const sb = createServiceSupabase();
  const row = await loadPairingRow(sb, jobId);
  if (!row) return { ok: false, error: "Job not found", status: 404 };
  if (currentPro(row) !== proId) {
    return { ok: false, error: "Not assigned to this request", status: 403 };
  }
  if (!["selected_review", "reserved"].includes(row.pairing_stage || "")) {
    return {
      ok: false,
      error: "Request is not awaiting confirmation",
      status: 409,
    };
  }
  if (idempotencyKey && row.idempotency_key === idempotencyKey) {
    return { ok: true, noop: true, jobId };
  }

  const ts = nowIso();
  // Confirming = "I can fix this" → arm the 20-min negotiation clock now.
  const armedEnds = new Date(Date.now() + NEGOTIATE_WINDOW_MS).toISOString();

  // Reservation confirm + queue acceptance marker are independent writes —
  // run them in one round trip (~600ms per DB query on a typical link was
  // making CONFIRM take ~6s sequentially).
  const [resRes, queueRes] = await Promise.all([
    sb
      .from("request_reservations")
      .update({
        status: "confirmed",
        confirmed_at: ts,
        released_by: "confirm",
      })
      .eq("request_id", row.id)
      .eq("pro_id", proId)
      .eq("status", "active"),
    // Record acceptance so a racing sweep's CAS-on-offered can never mark the
    // pro timed_out after they confirmed ("I can fix this").
    sb
      .from("request_pairing_queue")
      .update({
        status: "accepted",
        responded_at: ts,
        result_note: "pro_confirmed",
      })
      .eq("request_id", row.id)
      .eq("pro_id", proId),
  ]);
  if (resRes.error) return { ok: false, error: resRes.error.message, status: 500 };

  const patch: Record<string, unknown> = {
    // Clear pairing stage so post-assign paths never re-enter SSPE decline/timeout.
    pairing_stage: null,
    pairing_deadline: null,
    flow_status: "negotiating",
    status: "requested",
    reservation_status: "confirmed",
    assignment_status: "assigned",
    negotiate_ends_at: armedEnds,
    updated_at: ts,
    status_history: [
      ...history(row),
      { status: "negotiating", at: ts, by: "confirmed" },
      { status: "negotiating", at: ts, by: "negotiation_timer_start" },
    ],
  };
  if (idempotencyKey) patch.idempotency_key = idempotencyKey;

  const { data, error } = await sb
    .from("service_requests")
    .update(patch)
    .eq("id", row.id)
    .eq("pairing_stage", row.pairing_stage)
    .select("id");
  if (error) return { ok: false, error: error.message, status: 500 };
  // CAS matched 0 rows → a racing sweep already advanced the request past this
  // pro. Revert the reservation so we never leave a "confirmed" reservation on
  // a request that is no longer this pro's (the queue "accepted" marker stays:
  // it truthfully records their intent and blocks re-dispatch to them).
  if (!data || data.length === 0) {
    await sb
      .from("request_reservations")
      .update({
        status: "cancelled",
        released_at: ts,
        released_by: "confirm_race",
      })
      .eq("request_id", row.id)
      .eq("pro_id", proId)
      .eq("status", "confirmed");
    return {
      ok: false,
      error: "Request moved on before confirmation",
      status: 409,
    };
  }

  // A confirmed assignment reflects well on the pro → refresh merit.
  const { recalculateMerit } = await import("@/lib/server/merit/merit-engine");
  void recalculateMerit(proId);

  // Post-accept side effects (linked scheduled dispatch + callout fee lock)
  // are NOT on the confirm critical path the negotiation screen reconciles
  // them via its own fetches seconds later. Awaiting these here added ~2s to
  // every "I can fix this" tap.
  void (async () => {
    // "Add another repair pro": a linked scheduled second request (Tow) becomes
    // dispatchable 60 min after this acceptance. Armed once the sweep only
    // touches requests whose scheduled_dispatch_at is still NULL.
    try {
      await armLinkedScheduledDispatch(sb, row.id, ts);
    } catch (e) {
      console.error("[second-pro] arm linked dispatch failed", e);
    }

    try {
      const { lockCalloutOnAcceptance } =
        await import("@/lib/server/callout/acceptance");
      const destLat = Number(row.pickup_lat);
      const destLng = Number(row.pickup_lng);
      if (Number.isFinite(destLat) && Number.isFinite(destLng)) {
        await lockCalloutOnAcceptance({
          requestId: row.id,
          proId,
          trade: (await import("@/lib/services")).isProService(row.service_type)
            ? (row.service_type as import("@/lib/types").ProService)
            : "mechanic",
          destination: { lat: destLat, lng: destLng },
          gps: gps || null,
          idempotencyKey: idempotencyKey || null,
        });
      }
    } catch (e) {
      console.error("[callout] lock on accept failed", e);
    }
  })();

  return { ok: true, jobId: row.id, currentProId: proId };
}

/** Record the current pro's queue row result and release any active reservation. */
async function settleCurrentPro(
  sb: ReturnType<typeof createServiceSupabase>,
  row: PairingRow,
  status: "declined" | "timed_out" | "deferred",
  reason?: string | null,
): Promise<{ error: string | null }> {
  const proId = currentPro(row);
  const ts = nowIso();
  if (!proId) return { error: null };
  try {
    const { voidCalloutForReroute } =
      await import("@/lib/server/callout/acceptance");
    await voidCalloutForReroute(row.id, status, proId);
  } catch {
    /* call-out optional */
  }
  // Prefer offered → outcome. For Later/Decline after a race where sweep
  // already set timed_out, still upgrade to deferred/declined so that pro
  // is never treated as a recyclable timed_out and re-offered 3s later.
  const fromStatuses =
    status === "timed_out"
      ? ["offered"]
      : status === "deferred" || status === "declined"
        ? ["offered", "timed_out"]
        : ["offered"];
  const { error: qErr } = await sb
    .from("request_pairing_queue")
    .update({ status, responded_at: ts, result_note: reason || null })
    .eq("request_id", row.id)
    .eq("pro_id", proId)
    .in("status", fromStatuses);
  if (qErr) return { error: qErr.message };

  // Only release reservations whose window actually lapsed. openRequest /
  // confirmRequest refresh expires_at to the fresh deadline, so a stale sweep
  // can never cancel a reservation the pro just opened or confirmed.
  const { error: rErr } = await sb
    .from("request_reservations")
    .update({ status: "cancelled", released_at: ts, released_by: status })
    .eq("request_id", row.id)
    .eq("status", "active")
    .lte("expires_at", ts);
  return { error: rErr?.message || null };
}

/** Patch used when leaving a pro (timeout / later / decline) → searching next. */
function sequentialUnlinkPatch(
  row: PairingRow,
  ts: string,
  historyExtra: object[],
) {
  return {
    pairing_stage: "sequential_pairing" as const,
    pairing_deadline: null as string | null,
    flow_status: "sequential_pairing",
    status: "requested",
    reservation_status: "none",
    // Critical: do not stay linked to the previous pro while finding another
    repair_pro_id: null as string | null,
    repair_pro_name: null as string | null,
    updated_at: ts,
    status_history: [...history(row), ...historyExtra],
  };
}

/** Pro declined → per-request permanent exclusion (D6) + immediate next pro. */
export async function declineRequest(
  jobId: string,
  proId: string,
  reason?: string | null,
): Promise<PairingResult> {
  if (!isSupabaseAdminConfigured()) {
    return { ok: false, error: "Supabase is not configured", status: 503 };
  }
  const sb = createServiceSupabase();
  const row = await loadPairingRow(sb, jobId);
  if (!row) return { ok: false, error: "Job not found", status: 404 };
  if (currentPro(row) !== proId) {
    return { ok: false, error: "Not assigned to this request", status: 403 };
  }
  if (!PAIRING_STAGES.includes(row.pairing_stage as PairingStage)) {
    return { ok: false, error: "Request is not pairing", status: 409 };
  }

  const ts = nowIso();
  const settled = await settleCurrentPro(sb, row, "declined", reason);
  if (settled.error) return { ok: false, error: settled.error, status: 500 };

  const { error } = await sb
    .from("service_requests")
    .update(
      sequentialUnlinkPatch(row, ts, [
        { status: "sequential_pairing", at: ts, by: `excluded:${proId}` },
        {
          status: "sequential_pairing",
          at: ts,
          by: `declined:${proId}`,
          note: reason || undefined,
        },
      ]),
    )
    .eq("id", row.id)
    .eq("pairing_stage", row.pairing_stage);
  if (error) return { ok: false, error: error.message, status: 500 };

  const next = await advancePairing(jobId);
  return {
    ok: true,
    jobId: row.id,
    currentProId: null,
    nextProId: next.ok ? (next.currentProId ?? null) : null,
  };
}

/**
 * Pro tapped Later → defer this pro 5 min (queue) and immediately advance to
 * the next merit-ranked pro (product D5 / state-machine LATER → sequential_pairing).
 */
export async function deferRequest(
  jobId: string,
  proId: string,
): Promise<PairingResult> {
  if (!isSupabaseAdminConfigured()) {
    return { ok: false, error: "Supabase is not configured", status: 503 };
  }
  const sb = createServiceSupabase();
  const row = await loadPairingRow(sb, jobId);
  if (!row) return { ok: false, error: "Job not found", status: 404 };
  if (currentPro(row) !== proId) {
    return { ok: false, error: "Not assigned to this request", status: 403 };
  }
  if (!PAIRING_STAGES.includes(row.pairing_stage as PairingStage)) {
    return { ok: false, error: "Request is not pairing", status: 409 };
  }

  const ts = nowIso();
  const settled = await settleCurrentPro(sb, row, "deferred", "pro_later");
  if (settled.error) return { ok: false, error: settled.error, status: 500 };

  // Release any active reservation so the next pro can open cleanly.
  await sb
    .from("request_reservations")
    .update({ status: "released", released_at: ts, released_by: "pro_later" })
    .eq("request_id", row.id)
    .eq("status", "active");

  const { error } = await sb
    .from("service_requests")
    .update(
      sequentialUnlinkPatch(row, ts, [
        { status: "sequential_pairing", at: ts, by: `deferred:${proId}` },
        { status: "sequential_pairing", at: ts, by: `later:${proId}` },
      ]),
    )
    .eq("id", row.id)
    .eq("pairing_stage", row.pairing_stage);
  if (error) return { ok: false, error: error.message, status: 500 };

  const next = await advancePairing(jobId);
  return {
    ok: true,
    jobId: row.id,
    currentProId: null,
    nextProId: next.ok ? (next.currentProId ?? null) : null,
  };
}

/** Server sweep: current pro did not respond within the 144s deadline. */
export async function timeoutRequest(jobId: string): Promise<PairingResult> {
  if (!isSupabaseAdminConfigured()) {
    return { ok: false, error: "Supabase is not configured", status: 503 };
  }
  const sb = createServiceSupabase();
  const row = await loadPairingRow(sb, jobId);
  if (!row) return { ok: false, error: "Job not found", status: 404 };
  if (
    !PAIRING_STAGES.includes(row.pairing_stage as PairingStage) ||
    row.pairing_stage === "sequential_pairing"
  ) {
    return { ok: true, noop: true, jobId };
  }

  // Re-check under the freshest read: a pro may have opened (refreshing the
  // deadline) after the sweep selected this row. If so, this timeout is stale
  // and must not settle or advance.
  const fresh = await loadPairingRow(sb, jobId);
  if (!fresh) return { ok: true, noop: true, jobId };
  if (
    !PAIRING_STAGES.includes(fresh.pairing_stage as PairingStage) ||
    fresh.pairing_stage === "sequential_pairing"
  ) {
    return { ok: true, noop: true, jobId };
  }
  const deadline = fresh.pairing_deadline
    ? Date.parse(fresh.pairing_deadline)
    : 0;
  if (Number.isFinite(deadline) && Date.now() < deadline) {
    return { ok: true, noop: true, jobId };
  }

  const ts = nowIso();
  const settled = await settleCurrentPro(
    sb,
    fresh,
    "timed_out",
    "pairing deadline exceeded",
  );
  if (settled.error) return { ok: false, error: settled.error, status: 500 };

  // CAS the stage to sequential_pairing and only count the timeout + advance
  // when the row actually matched. If it moved (pro opened/confirmed while we
  // were settling), leave the job exactly where it is the opener/confirmer
  // owns it now and the sweep already refreshed its deadline.
  const { data, error } = await sb
    .from("service_requests")
    .update(
      sequentialUnlinkPatch(fresh, ts, [
        { status: "sequential_pairing", at: ts, by: "sweep:timeout" },
      ]),
    )
    .eq("id", row.id)
    .eq("pairing_stage", fresh.pairing_stage)
    .select("id");
  if (error) return { ok: false, error: error.message, status: 500 };
  if (!data || data.length === 0) {
    return { ok: true, noop: true, jobId };
  }

  const next = await advancePairing(jobId);
  return {
    ok: true,
    jobId: row.id,
    currentProId: null,
    nextProId: next.ok ? (next.currentProId ?? null) : null,
  };
}

/**
 * "Add another repair pro": arm a linked scheduled second request so it becomes
 * dispatchable now + SECOND_PRO_DELAY_MS (60 min after the primary's pro accepts).
 * CAS on `flow_status = 'scheduled' AND scheduled_dispatch_at IS NULL` never
 * re-arms and never touches an already-dispatched/cancelled linked request.
 */
async function armLinkedScheduledDispatch(
  sb: ReturnType<typeof createServiceSupabase>,
  primaryRequestId: string,
  ts: string,
): Promise<void> {
  await sb
    .from("service_requests")
    .update({
      scheduled_dispatch_at: new Date(
        Date.now() + SECOND_PRO_DELAY_MS,
      ).toISOString(),
      updated_at: ts,
    })
    .eq("linked_request_id", primaryRequestId)
    .eq("flow_status", "scheduled")
    .is("scheduled_dispatch_at", null);
}

const SCHEDULED_CANCELLED_STATUSES = [
  "cancelled",
  "expired",
  "refunded",
] as const;

/**
 * Scheduled-dispatch sweep for "add another repair pro" (runs ~1/min alongside
 * sweepPairing). For each linked request still `scheduled`:
 * - primary cancelled/expired first → cancel the second silently (no ping);
 * - dispatch time reached and motorist not yet pinged → notify ONCE (in-app +
 * web push) to enter their current address; the /dispatch-scheduled endpoint
 * then books the second pro.
 */
export async function sweepScheduledDispatches(limit = 50): Promise<{
  checked: number;
  cancelled: number;
  notified: number;
}> {
  let checked = 0;
  let cancelled = 0;
  let notified = 0;
  if (!isSupabaseAdminConfigured()) return { checked, cancelled, notified };
  try {
    const sb = createServiceSupabase();
    const { data: rows } = await sb
      .from("service_requests")
      .select(
        "id, linked_request_id, scheduled_dispatch_at, dispatch_notified_at, motorist_id, service_type, problem, pickup_address, status_history",
      )
      .eq("flow_status", "scheduled")
      .not("linked_request_id", "is", null)
      .order("scheduled_dispatch_at", { ascending: true, nullsFirst: false })
      .limit(limit);
    if (!rows?.length) return { checked, cancelled, notified };

    for (const row of rows) {
      checked += 1;
      const secondId = String(row.id);
      const primaryId = String(row.linked_request_id);
      try {
        // Primary's current terminal-ish state decides the second request's fate.
        const { data: primary } = await sb
          .from("service_requests")
          .select("flow_status, status")
          .eq("id", primaryId)
          .maybeSingle();
        const primaryFlow = String(
          primary?.flow_status || primary?.status || "",
        );
        if (
          SCHEDULED_CANCELLED_STATUSES.includes(
            primaryFlow as (typeof SCHEDULED_CANCELLED_STATUSES)[number],
          )
        ) {
          const ts = nowIso();
          const prior = Array.isArray(row.status_history)
            ? (row.status_history as object[])
            : [];
          const updated = await sb
            .from("service_requests")
            .update({
              flow_status: "cancelled",
              status: "cancelled",
              cancelled_at: ts,
              updated_at: ts,
              status_history: [
                ...prior,
                { status: "cancelled", at: ts, by: "second_pro_cancelled" },
              ],
            })
            .eq("id", secondId)
            .eq("flow_status", "scheduled");
          if (!updated.error) cancelled += 1;
          continue;
        }

        const at = row.scheduled_dispatch_at
          ? Date.parse(String(row.scheduled_dispatch_at))
          : NaN;
        const alreadyNotified = Boolean(row.dispatch_notified_at);
        if (!Number.isFinite(at) || alreadyNotified || Date.now() < at)
          continue;

        // Dispatch time reached → ping the motorist ONCE to enter their address.
        const ts = nowIso();
        const flip = await sb
          .from("service_requests")
          .update({
            dispatch_notified_at: ts,
            updated_at: ts,
          })
          .eq("id", secondId)
          .eq("flow_status", "scheduled")
          .is("dispatch_notified_at", null)
          .select("id");
        if (flip.error || !flip.data?.length) continue;

        const trade = String(row.service_type || "mechanic");
        const title = `Your ${trade} pro is ready`;
        const body = "Enter your current address to book them now.";
        try {
          const { insertNotification } =
            await import("@/lib/server/notifications");
          await insertNotification({
            userId: String(row.motorist_id),
            category: "requests",
            priority: "high",
            title,
            body,
            href: `/jobs/${secondId}`,
            actionType: "open_job",
            actionPayload: { jobId: secondId },
            jobId: secondId,
            jobStatus: "scheduled",
            groupKey: `scheduled-dispatch-${secondId}`,
          });
        } catch {
          /* optional */
        }
        try {
          const { sendPushToUser } = await import("@/lib/server/push/webpush");
          await sendPushToUser(String(row.motorist_id), {
            title,
            body,
            url: `/jobs/${secondId}`,
            tag: `scheduled-dispatch-${secondId}`,
          });
        } catch {
          /* optional */
        }
        notified += 1;
      } catch (e) {
        console.error("[second-pro] sweep row failed", secondId, e);
      }
    }
  } catch (e) {
    console.error("[second-pro] sweep failed", e);
  }
  return { checked, cancelled, notified };
}

/** Enforce all expired pairing deadlines (Vercel cron / pg_cron / expire-stale). */
export async function sweepPairing(limit = 50): Promise<{
  checked: number;
  timedOut: number;
  expired: number;
}> {
  let checked = 0;
  let timedOut = 0;
  let expired = 0;
  if (!isSupabaseAdminConfigured()) return { checked, timedOut, expired };

  try {
    const sb = createServiceSupabase();

    const { data: rows } = await sb
      .from("service_requests")
      .select("id, pairing_stage")
      .in("pairing_stage", PAIRING_STAGES)
      // reservation_status is NULL on fresh jobs (chosen pro awaiting reply)
      // `<>` never matches NULL, so mirror the pg_cron wrapper's
      // `coalesce(reservation_status,'') <> 'confirmed'` via an or() filter.
      .or("reservation_status.neq.confirmed,reservation_status.is.null")
      .not("pairing_deadline", "is", null)
      .lte("pairing_deadline", nowIso())
      .order("pairing_deadline", { ascending: true })
      .limit(limit);

    for (const r of rows ?? []) {
      checked++;
      // sequential_pairing holds refresh their own deadline; re-run the search
      // instead of a plain timeout so the screen stays alive while waiting.
      const res =
        String(r.pairing_stage) === "sequential_pairing"
          ? await advancePairing(String(r.id))
          : await timeoutRequest(String(r.id));
      if (res.ok && res.expired) expired++;
      else if (res.ok && !res.noop) timedOut++;
    }

    // Fallback arming for un-surfaced offers: requests whose card never
    // rendered on the pro's device (app closed) keep a NULL pairing_deadline
    // and would never be seen by the timeout query above. Arm them now + 144s
    // (after the grace window) so a later sweep tick times them out / advances
    // the pairing exactly as if the offer had been surfaced. Only arms still-
    // open offers with an assigned union pro or a pending chosen pro.
    const fallbackCutoff = new Date(
      Date.now() - SURFACE_FALLBACK_GRACE_MS,
    ).toISOString();
    const { error: fbErr } = await sb
      .from("service_requests")
      .update({ pairing_deadline: deadlineIso() })
      .in("pairing_stage", PAIRING_STAGES)
      .or("reservation_status.neq.confirmed,reservation_status.is.null")
      .is("pairing_deadline", null)
      .lt("updated_at", fallbackCutoff);
    if (fbErr) console.error("sweepPairing fallback-arm", fbErr.message);
  } catch (e) {
    console.error("sweepPairing", e);
  }
  return { checked, timedOut, expired };
}
