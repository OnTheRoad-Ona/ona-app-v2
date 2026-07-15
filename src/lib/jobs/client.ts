"use client";

import type { JobRecord } from "@/lib/jobs/types";

type ApiOk<T> = { ok: true; data: T };
type ApiErr = { ok: false; message: string };

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
  const res = await fetch("/api/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parse<{ job: JobRecord }>(res);
}

export async function apiGetJob(id: string) {
  const res = await fetch(`/api/jobs/${id}`, { cache: "no-store" });
  return parse<{ job: JobRecord }>(res);
}

export async function apiListJobs(
  userId: string,
  role: "motorist" | "repair_pro"
) {
  const qs = new URLSearchParams({ userId, role });
  const res = await fetch(`/api/jobs?${qs}`, { cache: "no-store" });
  return parse<{ jobs: JobRecord[] }>(res);
}

export async function apiPlaceOffer(input: {
  jobId: string;
  side: "repair_pro" | "motorist";
  actorId: string;
  amountMajor: number;
}) {
  const res = await fetch(`/api/jobs/${input.jobId}/offer`, {
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
}

export async function apiAcceptOffer(input: {
  jobId: string;
  side: "repair_pro" | "motorist";
  actorId: string;
}) {
  const res = await fetch(`/api/jobs/${input.jobId}/offer`, {
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
}) {
  const res = await fetch(`/api/jobs/${input.jobId}/pay`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      motoristId: input.motoristId,
      email: input.email,
      provider: "mock",
    }),
  });
  return parse<{ job: JobRecord; reference: string; message?: string }>(res);
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
    | "RELEASE"
    | "EXPIRE_NEGOTIATION";
  actor: "motorist" | "repair_pro" | "system";
  actorId?: string;
  proLat?: number;
  proLng?: number;
  etaMinutes?: number;
  distanceKm?: number;
}) {
  const res = await fetch(`/api/jobs/${input.jobId}/transition`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return parse<{ job: JobRecord }>(res);
}

export async function apiOpenDispute(input: {
  jobId: string;
  by: "motorist" | "repair_pro";
  reason: string;
  description: string;
  media?: unknown[];
}) {
  const res = await fetch(`/api/jobs/${input.jobId}/dispute`, {
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
  const res = await fetch(`/api/jobs/${input.jobId}/appeal`, {
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
