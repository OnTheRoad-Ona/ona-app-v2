"use client";

import type { JobRecord } from "@/lib/jobs/types";

type ApiOk<T> = { ok: true; data: T };
type ApiErr = { ok: false; message: string };

const FETCH_TIMEOUT = 15_000;

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {}
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

async function parse<T>(res: Response): Promise<ApiOk<T> | ApiErr> {
  const json = (await res.json().catch(() => null)) as {
    ok?: boolean;
    data?: T;
    error?: { message?: string };
  } | null;
  if (!json?.ok) {
    return {
      ok: false,
      message: json?.error?.message || `Request failed (${res.status})`,
    };
  }
  return { ok: true, data: json.data as T };
}

export async function apiCreateJob(body: Record<string, unknown>) {
  const res = await fetchWithTimeout("/api/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parse<{ job: JobRecord }>(res);
}

export async function apiGetJob(id: string) {
  const res = await fetchWithTimeout(`/api/jobs/${id}`, { cache: "no-store" });
  return parse<{ job: JobRecord }>(res);
}

/**
 * Server sweep: Booked jobs not completed within 6h of payment →
 * cancel + full refund. Safe no-op when none are overdue.
 */
export async function apiExpireStaleBookedJobs() {
  const res = await fetchWithTimeout("/api/jobs/expire-stale", {
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
  const res = await fetchWithTimeout(`/api/jobs?${qs}`, { cache: "no-store" });
  return parse<{ jobs: JobRecord[] }>(res);
}

/** Retry a fetch up to `tries` times with exponential backoff. */
async function retryFetch(
  url: string,
  init: RequestInit,
  tries = 3
): Promise<Response> {
  for (let i = 0; i < tries; i++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
      try {
        const res = await fetch(url, { ...init, signal: ctrl.signal });
        if (res.ok || i === tries - 1) return res;
      } finally {
        clearTimeout(timer);
      }
    } catch {
      if (i === tries - 1) throw new Error("Network offline");
    }
    await new Promise((r) => setTimeout(r, 1000 * 2 ** i));
  }
  throw new Error("Retry exhausted");
}

const OFFER_QUEUE_KEY = "om-pending-offers";

function enqueuePendingOffer(input: {
  jobId: string;
  side: "repair_pro" | "motorist";
  actorId: string;
  amountMajor: number;
}) {
  try {
    const raw = localStorage.getItem(OFFER_QUEUE_KEY);
    const queue = raw ? JSON.parse(raw) : [];
    queue.push({ ...input, ts: Date.now() });
    localStorage.setItem(OFFER_QUEUE_KEY, JSON.stringify(queue));
  } catch {
    /* localStorage unavailable */
  }
}

export async function processPendingOffers(): Promise<void> {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(OFFER_QUEUE_KEY);
  } catch {
    return;
  }
  if (!raw) return;
  let queue: Array<{
    jobId: string;
    side: "repair_pro" | "motorist";
    actorId: string;
    amountMajor: number;
    ts: number;
  }> = [];
  try {
    queue = JSON.parse(raw);
  } catch {
    localStorage.removeItem(OFFER_QUEUE_KEY);
    return;
  }
  if (!queue.length) return;
  const remaining: typeof queue = [];
  for (const item of queue) {
    try {
      const res = await retryFetch(`/api/jobs/${item.jobId}/offer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "place",
          side: item.side,
          actorId: item.actorId,
          amountMajor: item.amountMajor,
        }),
      });
      if (!res.ok) remaining.push(item);
    } catch {
      remaining.push(item);
    }
  }
  if (remaining.length) {
    localStorage.setItem(OFFER_QUEUE_KEY, JSON.stringify(remaining));
  } else {
    localStorage.removeItem(OFFER_QUEUE_KEY);
  }
}

export async function apiPlaceOffer(input: {
  jobId: string;
  side: "repair_pro" | "motorist";
  actorId: string;
  amountMajor: number;
}) {
  try {
    const res = await retryFetch(`/api/jobs/${input.jobId}/offer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "place",
        side: input.side,
        actorId: input.actorId,
        amountMajor: input.amountMajor,
      }),
    });
    return parse<{ job: JobRecord }>(res);
  } catch {
    enqueuePendingOffer(input);
    return {
      ok: false as const,
      message:
        "Offer queued — will be sent when connection is restored.",
    };
  }
}

export async function apiAcceptOffer(input: {
  jobId: string;
  side: "repair_pro" | "motorist";
  actorId: string;
}) {
  const res = await fetchWithTimeout(`/api/jobs/${input.jobId}/offer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
  const res = await fetchWithTimeout(`/api/jobs/${input.jobId}/pay`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
  const res = await fetchWithTimeout(`/api/jobs/${input.jobId}/pay`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
    | "EXPIRE_NEGOTIATION";
  actor: "motorist" | "repair_pro" | "system" | "admin";
  actorId?: string;
  /** Real GPS — server computes Google Distance Matrix ETA */
  proLat?: number;
  proLng?: number;
}) {
  const res = await fetchWithTimeout(`/api/jobs/${input.jobId}/transition`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
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
  const res = await fetchWithTimeout(`/api/jobs/${input.jobId}/location`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
  const res = await fetchWithTimeout(`/api/jobs/${input.jobId}/rate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
  const res = await fetchWithTimeout(`/api/jobs/${input.jobId}/dispute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
  const res = await fetchWithTimeout(`/api/jobs/${input.jobId}/appeal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
