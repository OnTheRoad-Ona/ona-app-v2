/**
 * Ona Smart Sequential Pairing Engine (SSPE).
 *
 * Server-owned dispatch that runs the customer-chosen pro first, then
 * advances one pro at a time with a 66s deadline. DB-persisted
 * `pairing_deadline` is the single source of truth (D3); clients only
 * render it. Every transition is idempotent and race-safe via
 * compare-and-set `UPDATE ... WHERE pairing_stage = <expected>`.
 *
 * See docs/SSPE_REFACTOR_PLAN.md §6.
 */

import { createServiceSupabase } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { NEGOTIATE_WINDOW_MS } from "@/lib/jobs/constants";
import { orderCandidatesByMerit } from "@/lib/server/merit/merit-engine";

export const PAIRING_WINDOW_MS = 66_000; // 66s per pro (display + enforce)
export const DEFER_DURATION_MS = 5 * 60_000; // Later = 5 min per pro (D5)
export const RADIUS_STEPS_KM = [15, 20, 30, 50];
export const MAX_PAIRING_RADIUS_KM = RADIUS_STEPS_KM[RADIUS_STEPS_KM.length - 1];
/** Minimum job age before we expire it when candidates are exhausted. */
const MIN_EXHAUSTED_HOLD_MS = 2 * 60_000;

export const PAIRING_STAGES = [
  "waiting_for_selected",
  "selected_review",
  "sequential_pairing",
  "waiting_for_pro",
  "reserved",
] as const;
export type PairingStage = (typeof PAIRING_STAGES)[number];

const QUEUE_TERMINAL = new Set(["declined", "timed_out", "accepted", "skipped"]);

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
  problem_text: string | null;
  description: string | null;
  pickup_lat: number | null;
  pickup_lng: number | null;
  pairing_stage: string | null;
  pairing_deadline: string | null;
  pairing_radius_km: number | null;
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
const deadlineIso = () => new Date(Date.now() + PAIRING_WINDOW_MS).toISOString();

async function loadPairingRow(
  sb: ReturnType<typeof createServiceSupabase>,
  jobId: string
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
        "problem_text",
        "description",
        "pickup_lat",
        "pickup_lng",
        "pairing_stage",
        "pairing_deadline",
        "pairing_radius_km",
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
      ].join(",")
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

function problemText(row: PairingRow): string {
  return String(row.problem_text || row.description || "");
}

/** The pro currently holding this request (chosen or pairing). */
function currentPro(row: PairingRow): string | null {
  return row.repair_pro_id || null;
}

function offersTrade(serviceType: string, p: { primary_service?: string | null; services?: unknown }): boolean {
  const want = String(serviceType || "").trim().toLowerCase();
  if (!want) return true;
  if (String(p.primary_service || "").trim().toLowerCase() === want) return true;
  const list = p.services;
  if (Array.isArray(list)) {
    return list.some((s) => String(s || "").trim().toLowerCase() === want);
  }
  return false;
}

/**
 * Next eligible pro of the same trade within `radiusKm`, ordered by merit
 * (score desc, distance as tiebreak within merit bands). Pros already
 * resolved in this request's queue are excluded (per-request exclusion, D6;
 * deferral lasts 5 min, D5). Returns the candidate plus how many more
 * candidates were still available (for remaining_candidates).
 */
async function findCandidate(
  sb: ReturnType<typeof createServiceSupabase>,
  row: PairingRow,
  radiusKm: number
): Promise<{ candidate: ProCandidate; remaining: number } | null> {
  const { data: queue } = await sb
    .from("request_pairing_queue")
    .select("pro_id, status, responded_at")
    .eq("request_id", row.id);

  const now = Date.now();
  const blocked = new Set<string>();
  for (const q of queue ?? []) {
    const status = String(q.status || "");
    if (QUEUE_TERMINAL.has(status)) {
      blocked.add(String(q.pro_id));
      continue;
    }
    if (status === "deferred") {
      const at = q.responded_at ? Date.parse(String(q.responded_at)) : 0;
      if (!Number.isFinite(at) || now - at < DEFER_DURATION_MS) {
        blocked.add(String(q.pro_id));
      }
    }
  }
  // The current pro (already offered / awaiting) is never re-dispatched here.
  if (row.repair_pro_id) blocked.add(row.repair_pro_id);

  const { data: pros } = await sb
    .from("repair_pro_profiles")
    .select(
      "user_id, business_name, primary_service, services, lat, lng, location_updated_at, visibility_tier, is_online"
    )
    .eq("is_online", true)
    .neq("status", "suspended")
    .neq("status", "rejected");

  const { lat: cLat, lng: cLng } = {
    lat: Number(row.pickup_lat) || 0,
    lng: Number(row.pickup_lng) || 0,
  };

  const candidates = ((pros ?? []) as Array<{
    user_id: string;
    business_name: string | null;
    primary_service?: string | null;
    services?: unknown;
    lat: number | null;
    lng: number | null;
  }>)
    .filter((p) => {
      if (blocked.has(String(p.user_id))) return false;
      if (p.lat == null || p.lng == null) return false;
      if (!offersTrade(row.service_type, p)) return false;
      return true;
    })
    .map((p) => {
      const dLat = (Number(p.lat) - cLat) * 111;
      const dLng =
        (Number(p.lng) - cLng) * 111 * Math.cos((cLat * Math.PI) / 180);
      return { p, km: Math.hypot(dLat, dLng) };
    })
    .filter((x) => x.km <= radiusKm + 0.75)
    .map((x) => x.p);

  if (!candidates.length) return null;

  const ordered = await orderCandidatesByMerit(
    candidates.map((p) => ({ user_id: p.user_id, pro: p })),
    (c) => {
      const pro = c.pro;
      const dLat = (Number(pro.lat) - cLat) * 111;
      const dLng =
        (Number(pro.lng) - cLng) * 111 * Math.cos((cLat * Math.PI) / 180);
      return Math.hypot(dLat, dLng);
    }
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
  jobStatus: string
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
    });
  } catch {
    /* notifications optional */
  }
}

/** Next radius step, or null when already at max. */
export function nextRadiusKm(current: number | null): number | null {
  const cur = Number(current);
  const idx = RADIUS_STEPS_KM.findIndex((r) => r > cur);
  return idx >= 0 ? RADIUS_STEPS_KM[idx] : null;
}

/**
 * Advance an exhausted / responsive request to the next pro.
 * - candidate found  → waiting_for_pro + 66s deadline + notify
 * - none at radius   → expand radius and retry once
 * - none at max      → expire only after MIN_EXHAUSTED_HOLD_MS, else stay in
 *                      sequential_pairing (sweep retries, screen stays alive)
 */
export async function advancePairing(jobId: string): Promise<PairingResult> {
  if (!isSupabaseAdminConfigured()) {
    return { ok: false, error: "Supabase is not configured", status: 503 };
  }
  const sb = createServiceSupabase();
  const row = await loadPairingRow(sb, jobId);
  if (!row) return { ok: false, error: "Job not found", status: 404 };
  // Guard: never re-advance an already-assigned / negotiating job. A stale
  // decline/defer/timeout/sequential call can reach here AFTER a pro confirmed
  // ("I can fix this"), and would otherwise clobber the active 20-min
  // negotiation back to sequential pairing — making it "close after seconds".
  if (!PAIRING_STAGES.includes(row.pairing_stage as PairingStage)) {
    return { ok: true, noop: true, jobId: row.id };
  }

  const radius = Number(row.pairing_radius_km) || RADIUS_STEPS_KM[0];
  const found = await findCandidate(sb, row, radius);

  if (found) {
    const { candidate, remaining } = found;
    const ts = nowIso();
    const position = Number(row.queue_position) || 0;
    const name = candidate.full_name || candidate.business_name || "Repair Pro";
    const { error: qErr } = await sb.from("request_pairing_queue").insert({
      request_id: row.id,
      pro_id: candidate.user_id,
      position: position + 1,
      source: "pairing",
      status: "offered",
      offered_at: ts,
    });
    if (qErr && !/duplicate|already exists/i.test(qErr.message)) {
      return { ok: false, error: qErr.message, status: 500 };
    }

    const { error } = await sb
      .from("service_requests")
      .update({
        pairing_stage: "waiting_for_pro",
        flow_status: "waiting_for_pro",
        status: "requested",
        pairing_deadline: deadlineIso(),
        queue_position: position + 1,
        remaining_candidates: remaining,
        reservation_status: "none",
        repair_pro_id: candidate.user_id,
        repair_pro_name: name,
        ...(candidate.avatar_url ? { repair_pro_photo: candidate.avatar_url } : {}),
        updated_at: ts,
        status_history: [
          ...history(row),
          { status: "waiting_for_pro", at: ts, by: `pairing:${candidate.user_id}` },
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
      "waiting_for_pro"
    );

    return { ok: true, jobId: row.id, currentProId: candidate.user_id, nextProId: candidate.user_id };
  }

  // No candidate at current radius — expand and retry once.
  const nextRadius = nextRadiusKm(radius);
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

  // Radius maxed with no candidate. Hold briefly to keep the screen alive,
  // then expire so the customer sees the retry state (existing semantics).
  const created = row.created_at ? Date.parse(row.created_at) : Date.now();
  if (Number.isFinite(created) && Date.now() - created < MIN_EXHAUSTED_HOLD_MS) {
    // Refresh a pairing_deadline so the sweep re-runs advancePairing while we
    // wait for a pro to free up (no deadline would orphan the hold forever).
    await sb
      .from("service_requests")
      .update({ pairing_deadline: deadlineIso(), updated_at: nowIso() })
      .eq("id", row.id)
      .eq("pairing_stage", row.pairing_stage);
    return { ok: true, jobId: row.id, currentProId: currentPro(row), noop: true };
  }

  return markExhausted(sb, row);
}

async function markExhausted(
  sb: ReturnType<typeof createServiceSupabase>,
  row: PairingRow
): Promise<PairingResult> {
  const ts = nowIso();
  const { error } = await sb
    .from("service_requests")
    .update({
      pairing_stage: null,
      pairing_deadline: null,
      flow_status: "expired",
      status: "expired",
      updated_at: ts,
      status_history: [
        ...history(row),
        { status: "expired", at: ts, by: "pairing_exhausted" },
      ],
    })
    .eq("id", row.id)
    .eq("pairing_stage", row.pairing_stage);
  if (error) return { ok: false, error: error.message, status: 500 };
  return { ok: true, jobId: row.id, currentProId: currentPro(row), expired: true };
}

/**
 * Pro taps Open. Idempotent via `idempotency_key`. Creates the one active
 * reservation and moves to the "I can fix this / I cannot fix this" screen.
 */
export async function openRequest(
  jobId: string,
  proId: string,
  idempotencyKey?: string | null
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
  if (!["waiting_for_selected", "waiting_for_pro"].includes(row.pairing_stage || "")) {
    return { ok: false, error: "Request is not open for this action", status: 409 };
  }
  if (idempotencyKey && row.idempotency_key === idempotencyKey) {
    return { ok: true, noop: true, jobId };
  }

  const stage: PairingStage = row.pairing_stage === "waiting_for_selected" ? "selected_review" : "reserved";
  const ts = nowIso();

  const { error: resErr } = await sb.from("request_reservations").insert({
    request_id: row.id,
    pro_id: proId,
    stage,
    status: "active",
    expires_at: deadlineIso(),
  });
  if (resErr) return { ok: false, error: resErr.message, status: 500 };

  const patch: Record<string, unknown> = {
    pairing_stage: stage,
    flow_status: stage,
    status: "requested",
    pairing_deadline: deadlineIso(),
    reservation_status: "active",
    updated_at: ts,
    status_history: [
      ...history(row),
      { status: stage, at: ts, by: `open:${proId}` },
    ],
  };
  if (idempotencyKey) patch.idempotency_key = idempotencyKey;

  const { error } = await sb
    .from("service_requests")
    .update(patch)
    .eq("id", row.id)
    .eq("pairing_stage", row.pairing_stage);
  if (error) return { ok: false, error: error.message, status: 500 };

  return { ok: true, jobId: row.id, currentProId: proId };
}

/**
 * Pro taps "I can fix this" — the assignment point. Reservation → confirmed,
 * request enters the existing 20-min negotiation flow, pairing timers stop.
 */
export async function confirmRequest(
  jobId: string,
  proId: string,
  idempotencyKey?: string | null
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
    return { ok: false, error: "Request is not awaiting confirmation", status: 409 };
  }
  if (idempotencyKey && row.idempotency_key === idempotencyKey) {
    return { ok: true, noop: true, jobId };
  }

  const ts = nowIso();
  // Confirming = "I can fix this" → arm the 20-min negotiation clock now.
  const armedEnds = new Date(Date.now() + NEGOTIATE_WINDOW_MS).toISOString();

  const { error: resErr } = await sb
    .from("request_reservations")
    .update({ status: "confirmed", confirmed_at: ts, released_by: "confirm" })
    .eq("request_id", row.id)
    .eq("pro_id", proId)
    .eq("status", "active");
  if (resErr) return { ok: false, error: resErr.message, status: 500 };

  // Record acceptance so a racing sweep's CAS-on-offered can never mark the
  // pro timed_out after they confirmed ("I can fix this").
  await sb
    .from("request_pairing_queue")
    .update({
      status: "accepted",
      responded_at: ts,
      result_note: "pro_confirmed",
    })
    .eq("request_id", row.id)
    .eq("pro_id", proId);

  const patch: Record<string, unknown> = {
    pairing_stage: "negotiating",
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

  const { error } = await sb
    .from("service_requests")
    .update(patch)
    .eq("id", row.id)
    .eq("pairing_stage", row.pairing_stage);
  if (error) return { ok: false, error: error.message, status: 500 };

  // A confirmed assignment reflects well on the pro → refresh merit.
  const { recalculateMerit } = await import("@/lib/server/merit/merit-engine");
  void recalculateMerit(proId);

  return { ok: true, jobId: row.id, currentProId: proId };
}

/** Record the current pro's queue row result and release any active reservation. */
async function settleCurrentPro(
  sb: ReturnType<typeof createServiceSupabase>,
  row: PairingRow,
  status: "declined" | "timed_out" | "deferred",
  reason?: string | null
): Promise<{ error: string | null }> {
  const proId = currentPro(row);
  const ts = nowIso();
  if (!proId) return { error: null };
  // CAS on `status = offered`: a pro who already confirmed ("accepted") or
  // deferred ("deferred") must never be re-marked timed_out/declined by a
  // racing sweep. The stage CAS in the caller is the real gate; this keeps
  // the queue audit trail consistent under the confirm/timeout race.
  const { error: qErr } = await sb
    .from("request_pairing_queue")
    .update({ status, responded_at: ts, result_note: reason || null })
    .eq("request_id", row.id)
    .eq("pro_id", proId)
    .eq("status", "offered");
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

/** Pro declined → per-request permanent exclusion (D6) + immediate next pro. */
export async function declineRequest(
  jobId: string,
  proId: string,
  reason?: string | null
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
    .update({
      pairing_stage: "sequential_pairing",
      pairing_deadline: null,
      flow_status: "sequential_pairing",
      status: "requested",
      reservation_status: "none",
      updated_at: ts,
      status_history: [
        ...history(row),
        // per-request permanent exclusion marker (legacy compat + audit)
        { status: "sequential_pairing", at: ts, by: `excluded:${proId}` },
        { status: "sequential_pairing", at: ts, by: `declined:${proId}`, note: reason || undefined },
      ],
    })
    .eq("id", row.id)
    .eq("pairing_stage", row.pairing_stage);
  if (error) return { ok: false, error: error.message, status: 500 };

  const next = await advancePairing(jobId);
  return { ok: true, jobId: row.id, currentProId: null, nextProId: next.ok ? next.currentProId ?? null : null };
}

/**
 * Pro tapped Later → keep the request in the pro's incoming list and still
 * acceptable until the 66s pairing deadline expires (new spec). We record the
 * pro's intent as `deferred` for the queue audit trail, but do NOT advance:
 * pairing_stage / pairing_deadline / reservation stay untouched so the sweep
 * enforces the window and advances to the next pro once it lapses.
 */
export async function deferRequest(
  jobId: string,
  proId: string
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
  await sb
    .from("request_pairing_queue")
    .update({
      status: "deferred",
      responded_at: ts,
      result_note: "pro_later",
    })
    .eq("request_id", row.id)
    .eq("pro_id", proId)
    .eq("status", "offered");

  // No pairing state change — the request stays with this pro until the
  // deadline, after which the sweep times it out and advances.
  return { ok: true, jobId: row.id, currentProId: proId };
}

/** Server sweep: current pro did not respond within the 66s deadline. */
export async function timeoutRequest(jobId: string): Promise<PairingResult> {
  if (!isSupabaseAdminConfigured()) {
    return { ok: false, error: "Supabase is not configured", status: 503 };
  }
  const sb = createServiceSupabase();
  const row = await loadPairingRow(sb, jobId);
  if (!row) return { ok: false, error: "Job not found", status: 404 };
  if (!PAIRING_STAGES.includes(row.pairing_stage as PairingStage) || row.pairing_stage === "sequential_pairing") {
    return { ok: true, noop: true, jobId };
  }

  // Re-check under the freshest read: a pro may have opened (refreshing the
  // deadline) after the sweep selected this row. If so, this timeout is stale
  // and must not settle or advance.
  const fresh = await loadPairingRow(sb, jobId);
  if (!fresh) return { ok: true, noop: true, jobId };
  if (!PAIRING_STAGES.includes(fresh.pairing_stage as PairingStage) || fresh.pairing_stage === "sequential_pairing") {
    return { ok: true, noop: true, jobId };
  }
  const deadline = fresh.pairing_deadline ? Date.parse(fresh.pairing_deadline) : 0;
  if (Number.isFinite(deadline) && Date.now() < deadline) {
    return { ok: true, noop: true, jobId };
  }

  const ts = nowIso();
  const settled = await settleCurrentPro(sb, fresh, "timed_out", "pairing deadline exceeded");
  if (settled.error) return { ok: false, error: settled.error, status: 500 };

  // CAS the stage to sequential_pairing and only count the timeout + advance
  // when the row actually matched. If it moved (pro opened/confirmed while we
  // were settling), leave the job exactly where it is — the opener/confirmer
  // owns it now and the sweep already refreshed its deadline.
  const { data, error } = await sb
    .from("service_requests")
    .update({
      pairing_stage: "sequential_pairing",
      pairing_deadline: null,
      flow_status: "sequential_pairing",
      status: "requested",
      reservation_status: "none",
      updated_at: ts,
      status_history: [
        ...history(fresh),
        { status: "sequential_pairing", at: ts, by: "sweep:timeout" },
      ],
    })
    .eq("id", row.id)
    .eq("pairing_stage", fresh.pairing_stage)
    .select("id");
  if (error) return { ok: false, error: error.message, status: 500 };
  if (!data || data.length === 0) {
    return { ok: true, noop: true, jobId };
  }

  const next = await advancePairing(jobId);
  return { ok: true, jobId: row.id, currentProId: null, nextProId: next.ok ? next.currentProId ?? null : null };
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
      // reservation_status is NULL on fresh jobs (chosen pro awaiting reply) —
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
  } catch (e) {
    console.error("sweepPairing", e);
  }
  return { checked, timedOut, expired };
}

