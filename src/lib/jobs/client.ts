"use client";

import type { JobRecord } from "@/lib/jobs/types";
import {
  ensureAppSession,
  SESSION_RELOGIN_MESSAGE,
} from "@/lib/supabase/session";
import { syncServerClock } from "@/lib/jobs/server-clock";
import { clearIdemKey, getOrCreateIdemKey } from "@/lib/jobs/idempotency";

type ApiOk<T> = { ok: true; data: T };
type ApiErr = { ok: false; message: string };

const FETCH_TIMEOUT = 15_000;
/** Release/payout can wait on Flutterwave transfer — must not abort at 15s. */
const RELEASE_FETCH_TIMEOUT = 90_000;

/**
 * Attach Bearer token so job APIs can enforce auth server-side.
 * Waits briefly for storage rehydrate (post-navigation race) and
 * optionally force-refreshes after a 401.
 */
async function authHeaders(
  extra?: Record<string, string>,
  opts?: { forceRefresh?: boolean }
): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    ...(extra || {}),
  };
  try {
    const session = await ensureAppSession({
      waitForSessionMs: opts?.forceRefresh ? 4000 : 3500,
      forceRefresh: opts?.forceRefresh,
      refreshIfExpiresWithinMs: opts?.forceRefresh ? 3_600_000 : undefined,
    });
    if (session?.accessToken) {
      headers.Authorization = `Bearer ${session.accessToken}`;
      headers["x-access-token"] = session.accessToken;
    }
  } catch {
    /* unauthenticated call — server will 401 */
  }
  return headers;
}

function isAbortError(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const name = (e as { name?: string }).name;
  const msg = String((e as { message?: string }).message || "").toLowerCase();
  return (
    name === "AbortError" ||
    msg.includes("aborted") ||
    msg.includes("abort")
  );
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = FETCH_TIMEOUT
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    return res;
  } catch (e) {
    if (isAbortError(e)) {
      const err = new Error(
        timeoutMs >= RELEASE_FETCH_TIMEOUT
          ? "Release is taking longer than expected. Checking status…"
          : "Request timed out. Please try again."
      );
      err.name = "AbortError";
      throw err;
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Job API fetch: attach session, retry once on 401 after forced refresh.
 * Prevents "Loading job… Not authenticated" right after create → navigate.
 */
async function jobFetch(
  url: string,
  init: RequestInit = {},
  timeoutMs = FETCH_TIMEOUT
): Promise<Response> {
  const headers1 = await authHeaders(
    init.headers as Record<string, string> | undefined
  );
  if (!headers1.Authorization) {
    // Last chance: forced refresh before failing open without token
    const headersRetry = await authHeaders(
      init.headers as Record<string, string> | undefined,
      { forceRefresh: true }
    );
    if (!headersRetry.Authorization) {
      // Synthetic 401 so parse surfaces a clear message
      return new Response(
        JSON.stringify({
          ok: false,
          error: { code: "auth", message: SESSION_RELOGIN_MESSAGE },
        }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }
    return fetchWithTimeout(url, { ...init, headers: headersRetry }, timeoutMs);
  }

  const res = await fetchWithTimeout(
    url,
    { ...init, headers: headers1 },
    timeoutMs
  );
  if (res.status !== 401) return res;

  // Token rejected — refresh once and retry
  const headers2 = await authHeaders(
    init.headers as Record<string, string> | undefined,
    { forceRefresh: true }
  );
  if (!headers2.Authorization) return res;
  return fetchWithTimeout(url, { ...init, headers: headers2 }, timeoutMs);
}

async function parse<T>(res: Response): Promise<ApiOk<T> | ApiErr> {
  const json = (await res.json().catch(() => null)) as {
    ok?: boolean;
    data?: T & { serverNow?: string };
    error?: { message?: string };
  } | null;
  if (!json?.ok) {
    return {
      ok: false,
      message:
        json?.error?.message ||
        (res.status === 401
          ? SESSION_RELOGIN_MESSAGE
          : `Request failed (${res.status})`),
    };
  }
  syncServerClock(json.data?.serverNow);
  return { ok: true, data: json.data as T };
}

export async function apiCreateJob(body: Record<string, unknown>) {
  // Prefer real session user id so motoristId always matches requireUser
  try {
    const session = await ensureAppSession({ waitForSessionMs: 4000 });
    if (session?.userId) {
      body = { ...body, motoristId: session.userId };
    } else {
      return {
        ok: false as const,
        message: SESSION_RELOGIN_MESSAGE,
      };
    }
  } catch {
    /* keep caller motoristId */
  }
  // One sticker per composed request (stable payload hash). Retries reuse it
  // so a lost response can never create the request twice; editing the
  // request changes the hash and gets a fresh sticker.
  const intentKey = `request|${hashBody(body)}`;
  const clientRequestId = getOrCreateIdemKey(intentKey);
  const res = await jobFetch("/api/jobs", {
    method: "POST",
    body: JSON.stringify({
      ...body,
      clientRequestId,
    }),
  });
  const parsed = await parse<{ job: JobRecord }>(res);
  if (parsed.ok) clearIdemKey(intentKey);
  return parsed;
}

/** Cheap deterministic fingerprint of the request body (djb2). */
function hashBody(body: Record<string, unknown>): string {
  const s = JSON.stringify(body);
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  }
  return h.toString(36);
}

export async function apiGetJob(id: string) {
  // Up to 3 attempts — covers create→navigate session race.
  // Prefer POST: production previously returned 401 on GET /api/jobs/[id]
  // with the same Bearer that succeeded on POST /api/jobs (create).
  let last: ApiOk<{ job: JobRecord }> | ApiErr = {
    ok: false,
    message: SESSION_RELOGIN_MESSAGE,
  };
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 400 * attempt));
      await ensureAppSession({
        waitForSessionMs: 3000,
        forceRefresh: attempt === 2,
      });
    }
    const session = await ensureAppSession({ waitForSessionMs: 2500 });
    const access_token = session?.accessToken || "";
    // POST body carries token as belt-and-suspenders (matches create job)
    const res = await jobFetch(`/api/jobs/${id}`, {
      method: "POST",
      cache: "no-store",
      body: JSON.stringify({
        action: "get",
        ...(access_token ? { access_token } : {}),
      }),
    });
    last = await parse<{ job: JobRecord }>(res);
    if (last.ok) return last;
    const authFail =
      /not authenticated|session|sign in|refresh/i.test(last.message) ||
      last.message === SESSION_RELOGIN_MESSAGE;
    if (!authFail) return last;
  }
  return last;
}

/**
 * Server sweep: Booked jobs not completed within 6h of payment →
 * cancel + full refund. Safe no-op when none are overdue.
 */
export async function apiExpireStaleBookedJobs() {
  const res = await jobFetch("/api/jobs/expire-stale", {
    method: "POST",
    cache: "no-store",
  });
  return parse<{
    checked: number;
    cancelled: number;
    ids: string[];
  }>(res);
}

export async function apiListJobs(
  userId: string,
  role: "motorist" | "repair_pro"
) {
  const qs = new URLSearchParams({ userId, role });
  const res = await jobFetch(`/api/jobs?${qs}`, {
    cache: "no-store",
  });
  return parse<{ jobs: JobRecord[] }>(res);
}

export async function apiPlaceOffer(input: {
  jobId: string;
  side: "repair_pro" | "motorist";
  actorId: string;
  amountMajor: number;
}) {
  // One sticker per (job, side, amount) intent. Retries reuse it so a lost
  // response can never double-place an offer; a different amount is a new
  // intent and gets its own sticker.
  const intentKey = `offer|${input.jobId}|${input.side}|${input.amountMajor}`;
  const clientOfferId = getOrCreateIdemKey(intentKey);
  try {
    const res = await jobFetch(`/api/jobs/${input.jobId}/offer`, {
      method: "POST",
      body: JSON.stringify({
        action: "place",
        side: input.side,
        actorId: input.actorId,
        amountMajor: input.amountMajor,
        clientOfferId,
      }),
    });
    const parsed = await parse<{ job: JobRecord }>(res);
    if (parsed.ok) clearIdemKey(intentKey);
    return parsed;
  } catch {
    // Fail fast — no silent queue. The sticker makes the manual retry safe.
    return {
      ok: false as const,
      message: "Couldn't send — check your connection and tap Send again.",
    };
  }
}

export async function apiAcceptOffer(input: {
  jobId: string;
  side: "repair_pro" | "motorist";
  actorId: string;
}) {
  const res = await jobFetch(`/api/jobs/${input.jobId}/offer`, {
    method: "POST",
    body: JSON.stringify({
      action: "accept",
      side: input.side,
      actorId: input.actorId,
    }),
  });
  return parse<{ job: JobRecord }>(res);
}

export async function apiPayJob(input: {
  jobId: string;
  motoristId: string;
  email?: string;
  customerName?: string;
  customerPhone?: string;
  /** Force mock (dev only). Default: live Flutterwave when keys exist */
  provider?: "mock" | "flutterwave" | "paystack";
  /** Default true — Flutterwave modal on Ona page */
  preferInline?: boolean;
}) {
  const returnOrigin =
    typeof window !== "undefined" ? window.location.origin : undefined;
  const res = await jobFetch(`/api/jobs/${input.jobId}/pay`, {
    method: "POST",
    body: JSON.stringify({
      motoristId: input.motoristId,
      email: input.email,
      customerName: input.customerName,
      customerPhone: input.customerPhone,
      provider: input.provider,
      returnOrigin,
      preferInline: input.preferInline !== false,
      action: "start",
    }),
  });
  return parse<{
    job?: JobRecord;
    jobId?: string;
    reference?: string;
    message?: string;
    provider?: string;
    authorizationUrl?: string | null;
    useInline?: boolean;
    useInAppBankTransfer?: boolean;
    bankTransfer?: {
      accountNumber: string;
      bankName: string;
      accountName: string;
      amountMajor: number;
      currency: string;
      expiresAt: string | null;
      note: string;
      flwRef: string | null;
    } | null;
    publicKey?: string | null;
    amountMajor?: number;
    currency?: string;
    platformSubaccount?: string | null;
    alreadyPaid?: boolean;
    paymentSessionEndsAt?: string;
    paymentAttemptCount?: number;
    paymentAttemptsRemaining?: number;
    returnPath?: string;
  }>(res);
}

/** Close open pay session — does not count as attempt; next Pay gets fresh 20 min */
export async function apiCancelPaySession(input: {
  jobId: string;
  motoristId: string;
}) {
  const res = await jobFetch(`/api/jobs/${input.jobId}/pay`, {
    method: "POST",
    body: JSON.stringify({
      motoristId: input.motoristId,
      action: "cancel",
    }),
  });
  return parse<{
    cancelled?: boolean;
    timerReset?: boolean;
    job?: JobRecord;
    message?: string;
  }>(res);
}

export async function apiTransition(input: {
  jobId: string;
  event:
    | "CANCEL"
    | "START_TRIP"
    | "MARK_ARRIVED"
    | "START_WORK"
    | "MARK_COMPLETED"
    | "SATISFIED"
    | "START_NEGOTIATION"
    | "RELEASE"
    | "EXPIRE_NEGOTIATION"
    | "OPEN"
    | "CONFIRM"
    | "LATER"
    | "DECLINE";
  actor: "motorist" | "repair_pro" | "system" | "admin";
  actorId?: string;
  reason?: string;
  cancelReason?: string;
  /** Client-generated idempotency key (SSPE Open/Confirm/Later/Decline) */
  idempotencyKey?: string;
  /** Real GPS — server computes Google Distance Matrix ETA */
  proLat?: number;
  proLng?: number;
}) {
  // SATISFIED/RELEASE may call Flutterwave transfer — allow up to 90s.
  const timeoutMs =
    input.event === "SATISFIED" || input.event === "RELEASE"
      ? RELEASE_FETCH_TIMEOUT
      : FETCH_TIMEOUT;
  try {
    const res = await jobFetch(
      `/api/jobs/${input.jobId}/transition`,
      {
        method: "POST",
        body: JSON.stringify(input),
      },
      timeoutMs
    );
    return parse<{ job: JobRecord }>(res);
  } catch (e) {
    // Network/abort mid-release: payout may still have completed on server.
    if (
      (input.event === "SATISFIED" || input.event === "RELEASE") &&
      isAbortError(e)
    ) {
      for (let i = 0; i < 4; i++) {
        await new Promise((r) => setTimeout(r, 800 + i * 400));
        const again = await apiGetJob(input.jobId);
        if (
          again.ok &&
          (again.data.job.status === "released" ||
            again.data.job.status === "satisfied" ||
            again.data.job.releasedAt ||
            again.data.job.escrowStatus === "released" ||
            again.data.job.escrowStatus === "pending_settlement" ||
            again.data.job.escrowStatus === "release_pending")
        ) {
          return { ok: true as const, data: { job: again.data.job } };
        }
      }
    }
    return {
      ok: false as const,
      message:
        e instanceof Error
          ? e.message
          : "Could not update job. Please try again.",
    };
  }
}

export async function apiDeferJob(
  jobId: string,
  proId: string
): Promise<ApiOk<{ job: JobRecord }> | ApiErr> {
  const res = await jobFetch(`/api/jobs/${jobId}/defer`, {
    method: "POST",
    body: JSON.stringify({ proId }),
  });
  return parse<{ job: JobRecord }>(res);
}

/** Customer re-runs a pairing-exhausted search (max MAX_PAIRING_RETRIES). */
export async function apiRetrySearch(
  jobId: string
): Promise<ApiOk<{ job: JobRecord }> | ApiErr> {
  const res = await jobFetch(`/api/jobs/${jobId}/retry`, {
    method: "POST",
  });
  return parse<{ job: JobRecord }>(res);
}

/** Live GPS ping (Repair Pro or Motorist) → ETA refresh */
export async function apiPushTripLocation(input: {
  jobId: string;
  lat: number;
  lng: number;
  actor: "motorist" | "repair_pro";
  actorId?: string;
}) {
  const res = await jobFetch(`/api/jobs/${input.jobId}/location`, {
    method: "POST",
    body: JSON.stringify({
      lat: input.lat,
      lng: input.lng,
      actor: input.actor,
      actorId: input.actorId,
    }),
  });
  // job may be a slim location patch (not full JobRecord)
  return parse<{
    job: Partial<JobRecord> & { id: string };
    metrics: {
      distanceKm: number;
      etaMinutes: number;
      source: string;
      durationText?: string;
      distanceText?: string;
    };
  }>(res);
}

/** @deprecated use apiPushTripLocation */
export async function apiPushProLocation(input: {
  jobId: string;
  lat: number;
  lng: number;
  actorId?: string;
}) {
  return apiPushTripLocation({
    ...input,
    actor: "repair_pro",
  });
}

/** Stars + optional text review (motorist, max 144 chars) */
export async function apiRateJob(input: {
  jobId: string;
  rating: number;
  note?: string;
  actor?: "motorist" | "repair_pro";
}) {
  const res = await jobFetch(`/api/jobs/${input.jobId}/rate`, {
    method: "POST",
    body: JSON.stringify({
      rating: input.rating,
      note: input.note,
      actor: input.actor,
    }),
  });
  return parse<{ job: JobRecord }>(res);
}

/** Browser geolocation promise */
export function getCurrentPosition(
  opts?: PositionOptions
): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Location not available on this device."));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 5000,
      ...opts,
    });
  });
}

export async function apiOpenDispute(input: {
  jobId: string;
  by: "motorist" | "repair_pro";
  reason: string;
  description: string;
  media?: unknown[];
}) {
  const res = await jobFetch(`/api/jobs/${input.jobId}/dispute`, {
    method: "POST",
    body: JSON.stringify({ action: "open", ...input }),
  });
  return parse<{ job: JobRecord }>(res);
}

export async function apiOpenAppeal(input: {
  jobId: string;
  by: "motorist" | "repair_pro";
  reason: string;
  media?: unknown[];
}) {
  const res = await jobFetch(`/api/jobs/${input.jobId}/appeal`, {
    method: "POST",
    body: JSON.stringify({ action: "open", ...input }),
  });
  return parse<{ job: JobRecord }>(res);
}

/** Poll job every `ms` until unmounted */
export function useJobPoll(
  jobId: string | null,
  onJob: (j: JobRecord) => void,
  ms = 2500
) {
  if (typeof window === "undefined") return;
  // callers use useEffect themselves — helper only
  void jobId;
  void onJob;
  void ms;
}
