import type { JobRecord } from "@/lib/jobs/types";
import { nowIso } from "./mappers";
import { persist } from "./cache";

export function canRecoverReleaseFromJob(job: {
  status?: string;
  releasedAt?: string | null;
  escrowStatus?: string | null;
}): boolean {
  if (job.releasedAt || job.status === "released") return false;
  if (job.status === "satisfied") return true;
  if (job.escrowStatus === "release_pending") return true;
  return job.escrowStatus === "pending_settlement";
}

/**
 * If FLW already paid the pro transfer but job still shows satisfied/held
 * (cancel race or missed finalize), mark released so UI leaves "Payout processing".
 */
export async function recoverReleasedFromFlutterwave(
  job: JobRecord,
): Promise<JobRecord> {
  if (!canRecoverReleaseFromJob(job)) return job;
  try {
    const { attemptProPayout } =
      await import("@/lib/server/payments/payout-settlement");
    // force false is fine: FLW success is recovered before cancel gate
    const result = await attemptProPayout({
      jobId: job.id,
      repairProId: job.repairProId,
      amountMinor: job.amountMinor,
      agreedMajor: job.agreedMajor,
      currency: job.currency,
      paymentReference: job.paymentReference,
      force: false,
    });
    if (result.ok) {
      const ts = nowIso();
      const next: JobRecord = {
        ...job,
        status: "released",
        escrowStatus: "released",
        releasedAt: job.releasedAt || ts,
        amountMinor: result.totalMinor ?? job.amountMinor,
        proPayoutMinor: result.proPayoutMinor ?? job.proPayoutMinor,
        platformFeeMinor: result.platformFeeMinor ?? job.platformFeeMinor,
        statusHistory: [
          ...job.statusHistory,
          { status: "released", at: ts, by: "system_flw_recover" },
        ],
        updatedAt: ts,
      };
      const saved = await persist(next);
      // Notify once if this was the first time we learned FLW already paid
      if (!result.alreadyReleased || !job.releasedAt) {
        try {
          const { finalizeJobReleasedAfterPayout } =
            await import("@/lib/server/payments/payout-settlement");
          await finalizeJobReleasedAfterPayout(job.id, {
            transferRef: result.transferRef || "",
            totalMinor: result.totalMinor,
            proPayoutMinor: result.proPayoutMinor,
            platformFeeMinor: result.platformFeeMinor,
          });
        } catch {
          /* notifications optional */
        }
      }
      return saved;
    }
  } catch (e) {
    console.error("recoverReleasedFromFlutterwave", job.id, e);
  }
  return job;
}

/**
 * Fix bad rows: satisfiedAt set while job still completed and escrow held
 * (failed release / auto-release stamp). Clear so customer can act again.
 */
export async function clearFalseSatisfiedStamp(job: JobRecord): Promise<JobRecord> {
  if (job.status !== "completed") return job;
  if (!job.satisfiedAt) return job;
  if (job.releasedAt || job.escrowStatus === "released") return job;
  // Escrow still held or never paid out → stamp was premature
  if (
    job.escrowStatus === "held" ||
    job.escrowStatus === "release_pending" ||
    !job.escrowStatus ||
    job.escrowStatus === "none"
  ) {
    return persist({
      ...job,
      satisfiedAt: null,
      updatedAt: nowIso(),
    });
  }
  return job;
}
