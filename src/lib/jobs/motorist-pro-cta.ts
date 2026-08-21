/**
 * Customer CTA for a Repair Pro row / profile:
 *
 * - **Open**  → customer already has a live pipeline job with this pro
 *   (negotiate, pay, booked, en route, working, confirm release, dispute…)
 *   so they can reopen it after leaving dashboard / minimizing.
 * - **Request** → only when there is no open job with this pro
 *   (no job, or last job is terminal: released / cancelled / expired / refunded).
 */

import type { JobFlowStatus, JobRecord } from "@/lib/jobs/types";

export type ProCtaKind = "request" | "open";

/**
 * Still “in flight” for the customer — not finished.
 * Includes payment + satisfaction so they can always reopen.
 */
const OPEN_JOB: JobFlowStatus[] = [
  "scheduled",
  "waiting_for_selected",
  "selected_review",
  "sequential_pairing",
  "waiting_for_pro",
  "reserved",
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
];

/** Terminal — customer may request this pro again */
const TERMINAL: JobFlowStatus[] = [
  "released",
  "cancelled",
  "expired",
  "refunded",
];

const RANK: Partial<Record<JobFlowStatus, number>> = {
  completed: 10, // release pay first
  satisfied: 9,
  disputed: 8,
  under_appeal: 8,
  in_progress: 7,
  arrived: 6,
  en_route: 5,
  paid_booked: 4,
  agreed: 3,
  negotiating: 2,
  reserved: 1,
  waiting_for_pro: 1,
  sequential_pairing: 1,
  selected_review: 1,
  waiting_for_selected: 1,
  scheduled: 0,
};

export function isOpenCustomerJob(job: JobRecord): boolean {
  const s = job.status as JobFlowStatus;
  if (TERMINAL.includes(s)) return false;
  return OPEN_JOB.includes(s);
}

export function isOpenJobWithPro(job: JobRecord): boolean {
  if (!job.repairProId) return false;
  return isOpenCustomerJob(job);
}

/** @deprecated use isOpenJobWithPro */
export function isActiveJobWithPro(job: JobRecord): boolean {
  return isOpenJobWithPro(job);
}

export function proCtaKind(job: JobRecord | null | undefined): ProCtaKind {
  if (!job || !isOpenJobWithPro(job)) return "request";
  return "open";
}

export function proCtaLabel(kind: ProCtaKind, profile = false): string {
  if (kind === "open") return "Open";
  return profile ? "Request Help" : "Request";
}

/**
 * Index open (non-terminal) jobs by repairProId.
 * Prefer the most advanced job when multiple exist with the same pro.
 */
export function listOpenCustomerJobs(jobs: JobRecord[]): JobRecord[] {
  return jobs
    .filter(isOpenCustomerJob)
    .sort((a, b) => {
      const ra = RANK[a.status as JobFlowStatus] ?? 0;
      const rb = RANK[b.status as JobFlowStatus] ?? 0;
      if (rb !== ra) return rb - ra;
      return Date.parse(b.updatedAt || b.createdAt) - Date.parse(a.updatedAt || a.createdAt);
    });
}

export function indexJobsByProId(jobs: JobRecord[]): Record<string, JobRecord> {
  const map: Record<string, JobRecord> = {};
  for (const j of jobs) {
    if (!isOpenJobWithPro(j) || !j.repairProId) continue;
    const prev = map[j.repairProId];
    const r = RANK[j.status as JobFlowStatus] ?? 0;
    const pr = prev ? RANK[prev.status as JobFlowStatus] ?? 0 : -1;
    if (!prev || r >= pr) map[j.repairProId] = j;
  }
  return map;
}
