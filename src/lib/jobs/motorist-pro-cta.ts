/**
 * Motorist CTA for a Repair Pro row / profile:
 * - request → no active job with this pro
 * - open    → pro accepted / job in pipeline (negotiate → paid)
 * - booked  → pro is on the way or working
 */

import type { JobFlowStatus, JobRecord } from "@/lib/jobs/types";

export type ProCtaKind = "request" | "open" | "booked";

/** Jobs that still link motorist ↔ this pro (not finished/cancelled) */
const ACTIVE: JobFlowStatus[] = [
  "negotiating",
  "agreed",
  "paid_booked",
  "en_route",
  "arrived",
  "in_progress",
  "completed",
  "disputed",
  "under_appeal",
];

const OPEN: JobFlowStatus[] = [
  "negotiating",
  "agreed",
  "paid_booked",
  "completed",
  "disputed",
  "under_appeal",
];

const BOOKED: JobFlowStatus[] = ["en_route", "arrived", "in_progress"];

const RANK: Partial<Record<JobFlowStatus, number>> = {
  negotiating: 1,
  agreed: 2,
  paid_booked: 3,
  en_route: 4,
  arrived: 5,
  in_progress: 6,
  completed: 7,
  disputed: 8,
  under_appeal: 9,
};

export function isActiveJobWithPro(job: JobRecord): boolean {
  return (
    Boolean(job.repairProId) && ACTIVE.includes(job.status as JobFlowStatus)
  );
}

export function proCtaKind(job: JobRecord | null | undefined): ProCtaKind {
  if (!job || !isActiveJobWithPro(job)) return "request";
  if (BOOKED.includes(job.status as JobFlowStatus)) return "booked";
  if (OPEN.includes(job.status as JobFlowStatus)) return "open";
  return "request";
}

export function proCtaLabel(kind: ProCtaKind, profile = false): string {
  if (kind === "open") return "Open";
  if (kind === "booked") return "Booked";
  return profile ? "Request Help" : "Request";
}

/** Prefer the furthest-along active job per pro */
export function indexJobsByProId(jobs: JobRecord[]): Record<string, JobRecord> {
  const map: Record<string, JobRecord> = {};
  for (const j of jobs) {
    if (!isActiveJobWithPro(j) || !j.repairProId) continue;
    const prev = map[j.repairProId];
    const r = RANK[j.status as JobFlowStatus] ?? 0;
    const pr = prev ? RANK[prev.status as JobFlowStatus] ?? 0 : -1;
    if (!prev || r >= pr) map[j.repairProId] = j;
  }
  return map;
}
