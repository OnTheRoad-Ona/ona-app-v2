/**
 * Customer CTA for a Repair Pro row / profile:
 * - request → default; always available to request again (incl. after past jobs)
 * - booked  → pro is on the way or working (en_route / arrived / in_progress only)
 *
 * "Open" is intentionally removed — past / early pipeline jobs live in History
 * (or Jobs for live trip via Booked). Pros stay on the discovery list.
 */

import type { JobFlowStatus, JobRecord } from "@/lib/jobs/types";

export type ProCtaKind = "request" | "booked";

/** Mid-trip only — customer can open the live job; button label "Booked" */
const BOOKED: JobFlowStatus[] = ["en_route", "arrived", "in_progress"];

const RANK: Partial<Record<JobFlowStatus, number>> = {
  en_route: 1,
  arrived: 2,
  in_progress: 3,
};

/** True only while the pro is on the way or working this job */
export function isActiveJobWithPro(job: JobRecord): boolean {
  return (
    Boolean(job.repairProId) && BOOKED.includes(job.status as JobFlowStatus)
  );
}

export function proCtaKind(job: JobRecord | null | undefined): ProCtaKind {
  if (!job || !isActiveJobWithPro(job)) return "request";
  return "booked";
}

export function proCtaLabel(kind: ProCtaKind, profile = false): string {
  if (kind === "booked") return "Booked";
  return profile ? "Request Help" : "Request";
}

/**
 * Index mid-trip jobs by pro only (not finished / negotiate / completed).
 * Finished work belongs in History; list CTA stays Request so customers can book again.
 */
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
