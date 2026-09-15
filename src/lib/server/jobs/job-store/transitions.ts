import { NEGOTIATE_WINDOW_MS } from "@/lib/jobs/constants";
import {
  assertTransition,
  type TransitionActor,
  type TransitionEvent,
} from "@/lib/jobs/state-machine";
import type { JobRecord } from "@/lib/jobs/types";
import { memory } from "./constants";
import { nowIso } from "./mappers";
import { persist } from "./cache";
import { getJob } from "./reads";

/**
 * Fire-and-forget Merit Ranking Engine refresh for a pro. Safe to call on any
 * completion / cancellation / dispute transition recomputing is idempotent.
 * Keeps ranking current after completed jobs, cancellations and disputes.
 */
export async function fireMeritRecalc(proId?: string | null): Promise<void> {
  if (!proId) return;
  try {
    const { recalculateMerit } =
      await import("@/lib/server/merit/merit-engine");
    void recalculateMerit(proId);
  } catch {
    /* merit recalc is best-effort */
  }
}

export async function applyEvent(
  job: JobRecord,
  event: TransitionEvent,
  actor: TransitionActor,
): Promise<JobRecord> {
  const nextRaw = assertTransition(job.status, event);
  // Customer (or admin/system) cancelling during negotiation/search fully
  // cancels the job only a Repair Pro decline enters the "searching"
  // (find-another-pro) phase, and that path is handled by rerouteDeclinedJob.
  const next =
    event.type === "CANCEL" && nextRaw === "searching" ? "cancelled" : nextRaw;
  const ts = nowIso();

  // Pro accepts request → arm 20 min negotiate timer (does not change status)
  if (event.type === "START_NEGOTIATION") {
    const ends = new Date(Date.now() + NEGOTIATE_WINDOW_MS).toISOString();
    // Notify customer that pro accepted
    try {
      const { insertNotification } = await import("@/lib/server/notifications");
      await insertNotification({
        userId: job.motoristId,
        category: "requests",
        priority: "high",
        title: "Pro can fix this",
        body: `${job.repairProName} confirmed they can fix your issue.`,
        href: `/jobs/${job.id}`,
        actionType: "open_job",
        actionPayload: { jobId: job.id },
        jobId: job.id,
        jobStatus: "negotiating",
        groupKey: `pro-accepted-${job.id}`,
      });
    } catch {
      /* notification optional */
    }
    return persist({
      ...job,
      negotiateEndsAt: ends,
      updatedAt: ts,
      statusHistory: [
        ...job.statusHistory,
        { status: job.status, at: ts, by: "negotiation_timer_start" },
      ],
    });
  }

  const updated: JobRecord = {
    ...job,
    status: next,
    updatedAt: ts,
    statusHistory: [
      ...job.statusHistory,
      {
        status: next,
        at: ts,
        by: actor,
        note:
          event.type === "CANCEL" && "reason" in event
            ? event.reason
            : undefined,
      },
    ],
  };

  if (next === "cancelled") {
    updated.cancelledAt = ts;
    updated.paymentSessionEndsAt = null;
    await fireMeritRecalc(job.repairProId);
    // Customer cancelled → notify the assigned pro so the cancellation PERSISTS
    // in their notification center list (the in-app banner is transient).
    // groupKey dedupes, so a cancel never notifies twice.
    if (actor === "motorist" && job.repairProId) {
      try {
        const { insertNotification } =
          await import("@/lib/server/notifications");
        const cname = job.motoristName?.split(/\s+/)[0];
        const subject = job.motoristVehicle?.trim();
        const body =
          cname && subject
            ? `${cname} cancelled the ${subject} request.`
            : cname
              ? `${cname} cancelled this request.`
              : "A customer cancelled this request.";
        await insertNotification({
          userId: job.repairProId,
          category: "requests",
          priority: "high",
          title: "Request cancelled",
          body,
          href: `/jobs/${job.id}`,
          actionType: "open_job",
          actionPayload: { jobId: job.id },
          jobId: job.id,
          jobStatus: "cancelled",
          groupKey: `request-cancelled-${job.id}`,
        });
        // OS push (web-push, VAPID) even when the app is closed or the tab is
        // hidden the in-app card + banner close from realtime/poll, but the
        // pro must still hear about the cancel without the app foregrounded.
        try {
          const { sendPushToUser } = await import("@/lib/server/push/webpush");
          await sendPushToUser(job.repairProId, {
            title: "Request cancelled",
            body,
            url: "/dashboard",
            tag: `cancelled-${job.id}`,
          });
        } catch {
          /* push best-effort */
        }
      } catch {
        /* notifications optional */
      }
    }
    // Full refund if money was held (so customer can pay fresh on a new request)
    if (
      job.paymentId ||
      job.escrowStatus === "held" ||
      job.escrowStatus === "release_pending"
    ) {
      const { refundJobEscrow } = await import("./payments");
      await refundJobEscrow(updated);
      updated.escrowStatus = "refunded";
    }
  }
  if (next === "expired") {
    updated.cancelledAt = ts;
    // Quiet persistent entry for the assigned pro: the request timed out and
    // is no longer theirs, even if they missed the live card/banner. groupKey
    // dedupes so it never notifies twice.
    if (job.repairProId) {
      try {
        const { insertNotification } =
          await import("@/lib/server/notifications");
        const cname = job.motoristName?.split(/\s+/)[0];
        await insertNotification({
          userId: job.repairProId,
          category: "requests",
          priority: "normal",
          title: "Request expired",
          body: cname ? `${cname}'s request expired.` : "This request expired.",
          href: `/jobs/${job.id}`,
          actionType: "open_job",
          actionPayload: { jobId: job.id },
          jobId: job.id,
          jobStatus: "expired",
          groupKey: `request-expired-${job.id}`,
        });
      } catch {
        /* notifications optional */
      }
    }
  }
  if (next === "cancelled" || next === "expired" || next === "refunded") {
    // Leave the pairing flow cleanly: drop pairing stage/timer/reservation so
    // the pairing sweep never re-times-out a terminal job.
    updated.pairingStage = null;
    updated.pairingDeadline = null;
    updated.reservationStatus = null;
    updated.assignmentStatus = null;
  }
  if (next === "paid_booked") {
    updated.paidAt = ts;
    updated.escrowStatus = "held";
  }
  if (next === "completed") {
    // Prompt customer to confirm and release pay
    try {
      const { insertNotification } = await import("@/lib/server/notifications");
      await insertNotification({
        userId: job.motoristId,
        category: "payments",
        priority: "critical",
        title: "Confirm Job & Release Payment",
        body: "Tap Release to pay the pro (87.5% · 5% Ona · 7.5% VAT on FLW).",
        href: `/jobs/${job.id}`,
        actionType: "open_job",
        actionPayload: { jobId: job.id },
        jobId: job.id,
        jobStatus: "completed",
        groupKey: `job-complete-${job.id}`,
      });
    } catch {
      /* notifications optional */
    }
  }
  if (next === "satisfied") {
    await fireMeritRecalc(job.repairProId);
    // Customer "I am satisfied" → try instant pro transfer (87.5% of service).
    // If FLW Available is not ready → PENDING_SETTLEMENT (escrow kept, auto-retry).
    // Customer is not asked to manual-retry for settlement delays.
    //
    // UX: never leave the client hanging until FLW finishes (caused "signal aborted"
    // at 15s). Race payout for a short budget; if still running, return confirmed
    // pending_settlement and finish release in the background (idempotent).
    const confirmedBase: JobRecord = {
      ...updated,
      status: "satisfied",
      satisfiedAt: ts,
      escrowStatus: "pending_settlement",
      statusHistory: [
        ...job.statusHistory,
        { status: "satisfied", at: ts, by: actor },
      ],
      updatedAt: ts,
    };

    const payoutJob = { ...confirmedBase, satisfiedAt: ts };
    const { releaseJobEscrow } = await import("./payments");
    const payoutPromise = releaseJobEscrow(payoutJob);
    const PAYOUT_BUDGET_MS = 10_000;
    type PayoutResult = Awaited<ReturnType<typeof releaseJobEscrow>>;
    const raced = await Promise.race([
      payoutPromise.then((p) => ({ kind: "done" as const, p })),
      new Promise<{ kind: "timeout" }>((resolve) =>
        setTimeout(() => resolve({ kind: "timeout" }), PAYOUT_BUDGET_MS),
      ),
    ]);

    const finishFromPayout = async (
      payout: PayoutResult,
    ): Promise<JobRecord> => {
      if (payout.ok) {
        const released: JobRecord = {
          ...confirmedBase,
          status: "released",
          releasedAt: nowIso(),
          escrowStatus: "released",
          amountMinor: payout.totalMinor ?? confirmedBase.amountMinor,
          proPayoutMinor: payout.proPayoutMinor ?? confirmedBase.proPayoutMinor,
          platformFeeMinor:
            payout.platformFeeMinor ?? confirmedBase.platformFeeMinor,
          statusHistory: [
            ...job.statusHistory,
            { status: "satisfied", at: ts, by: actor },
            { status: "released", at: nowIso(), by: "system" },
          ],
          updatedAt: nowIso(),
        };
        const { bumpProJobsCompleted, notifyPayoutReleased } =
          await import("./notifications");
        await bumpProJobsCompleted(job.repairProId);
        await notifyPayoutReleased(released);
        return persist(released);
      }
      if (payout.pendingSettlement) {
        const pending: JobRecord = {
          ...confirmedBase,
          amountMinor: payout.totalMinor ?? confirmedBase.amountMinor,
          proPayoutMinor: payout.proPayoutMinor ?? confirmedBase.proPayoutMinor,
          platformFeeMinor:
            payout.platformFeeMinor ?? confirmedBase.platformFeeMinor,
        };
        const { notifyPayoutPendingSettlement } =
          await import("./notifications");
        await notifyPayoutPendingSettlement(pending);
        return persist(pending);
      }
      // Hard fail (bad bank, etc.) stay completed so customer can retry or open dispute
      throw new Error(
        payout.message ||
          "Could not pay the Repair Pro (87.5%). Funds stay held. Fix pro bank details or contact support.",
      );
    };

    if (raced.kind === "timeout") {
      // Confirm immediately so the customer can rate/review without aborting.
      const { notifyPayoutPendingSettlement } =
        await import("./notifications");
      const pending = await persist(confirmedBase);
      await notifyPayoutPendingSettlement(pending);
      void payoutPromise
        .then(async (payout) => {
          try {
            // Only advance if still waiting on settlement (never double-release).
            const fresh = await getJob(job.id);
            if (!fresh) return;
            if (
              fresh.status === "released" ||
              fresh.escrowStatus === "released" ||
              fresh.releasedAt
            ) {
              return;
            }
            if (payout.ok) {
              await finishFromPayout(payout);
              return;
            }
            if (payout.pendingSettlement) {
              await finishFromPayout(payout);
              return;
            }
            // Hard fail (bad bank etc.) after the client already left completed:
            // bounce back so customer can fix / dispute not silent forever-pending.
            const revert: JobRecord = {
              ...fresh,
              status: "completed",
              satisfiedAt: null,
              escrowStatus: "held",
              updatedAt: nowIso(),
              statusHistory: [
                ...fresh.statusHistory,
                {
                  status: "completed",
                  at: nowIso(),
                  by: "system",
                  note: `payout_hard_fail:${payout.message || "unknown"}`,
                },
              ],
            };
            await persist(revert);
            console.error(
              "SATISFIED background hard fail reverted to completed",
              job.id,
              payout.message,
            );
          } catch (e) {
            console.error("SATISFIED background payout", job.id, e);
          }
        })
        .catch((e) => console.error("SATISFIED background payout", job.id, e));
      return pending;
    }

    return finishFromPayout(raced.p);
  }
  if (next === "released") {
    updated.releasedAt = ts;
    await fireMeritRecalc(job.repairProId);
    const { releaseJobEscrow } = await import("./payments");
    const payout = await releaseJobEscrow(updated);
    if (payout.ok) {
      updated.escrowStatus = "released";
      if (payout.totalMinor != null) updated.amountMinor = payout.totalMinor;
      if (payout.proPayoutMinor != null)
        updated.proPayoutMinor = payout.proPayoutMinor;
      if (payout.platformFeeMinor != null)
        updated.platformFeeMinor = payout.platformFeeMinor;
      const { notifyPayoutReleased } = await import("./notifications");
      await notifyPayoutReleased({ ...updated, status: "released" });
    } else if (payout.pendingSettlement) {
      updated.status = "satisfied";
      updated.escrowStatus = "pending_settlement";
      updated.satisfiedAt = updated.satisfiedAt || ts;
      const { notifyPayoutPendingSettlement } =
        await import("./notifications");
      await notifyPayoutPendingSettlement(updated);
      return persist(updated);
    } else {
      throw new Error(
        payout.message ||
          "Could not release payout to Repair Pro. Funds still held.",
      );
    }
  }
  if (next === "refunded") {
    updated.escrowStatus = "refunded";
    const { refundJobEscrow } = await import("./payments");
    await refundJobEscrow(updated);
  }

  return persist(updated);
}

export async function transitionJob(input: {
  jobId: string;
  event: TransitionEvent;
  actor: TransitionActor;
  actorId?: string;
  proLocation?: { lat: number; lng: number };
  etaMinutes?: number;
  distanceKm?: number;
  etaText?: string;
  distanceText?: string;
  etaSource?: string;
}): Promise<{ job: JobRecord } | { error: string }> {
  let job = await getJob(input.jobId);
  if (!job) return { error: "Job not found" };

  // After pro marks complete: no cancel/close only Release, Dispute, or 6h auto-release
  if (input.event.type === "CANCEL" && job.status === "completed") {
    return {
      error:
        "This job is completed and cannot be closed. Release payment, open a dispute, or wait for auto-release after 6 hours.",
    };
  }

  try {
    if (input.proLocation) {
      job = {
        ...job,
        proLocation: input.proLocation,
        proLocationAt: nowIso(),
        etaMinutes: input.etaMinutes ?? job.etaMinutes,
        distanceKm: input.distanceKm ?? job.distanceKm,
        etaText: input.etaText ?? job.etaText,
        distanceText: input.distanceText ?? job.distanceText,
        etaSource: input.etaSource ?? job.etaSource,
      };
    }
    if (input.event.type === "MARK_ARRIVED") {
      const { isWithinArrivalProximity } =
        await import("@/lib/callout/arrival");
      const pin = input.proLocation || job.proLocation;
      if (!pin) {
        return {
          error:
            "Turn on location so we can confirm you are with the customer.",
        };
      }
      const near = isWithinArrivalProximity(pin, job.motoristLocation);
      if (!near.ok) {
        return {
          error: `You need to be closer to the customer (within ${near.maxMeters} m) to mark arrived.`,
        };
      }
    }

    const updated = await applyEvent(job, input.event, input.actor);
    try {
      const { syncCalloutStatusFromJob } =
        await import("@/lib/server/callout/quote");
      await syncCalloutStatusFromJob({
        requestId: updated.id,
        flow: updated.status,
      });
      if (input.event.type === "START_TRIP") {
        const { setCalloutTravelPhase } =
          await import("@/lib/server/callout/acceptance");
        await setCalloutTravelPhase(updated.id, "travelling");
      }
      if (input.event.type === "CANCEL") {
        const { setCalloutTravelPhase } =
          await import("@/lib/server/callout/acceptance");
        const phase =
          job.status === "arrived" || job.status === "in_progress"
            ? "arrived"
            : job.status === "en_route" || job.status === "paid_booked"
              ? "travelling"
              : "before_travel";
        await setCalloutTravelPhase(updated.id, phase);
      }
      if (
        input.event.type === "CANCEL" &&
        input.actor === "repair_pro" &&
        (job.status === "negotiating" ||
          job.status === "waiting_for_pro" ||
          job.status === "reserved" ||
          job.status === "selected_review" ||
          job.status === "waiting_for_selected")
      ) {
        const { voidCalloutForReroute } =
          await import("@/lib/server/callout/acceptance");
        await voidCalloutForReroute(
          updated.id,
          "pro_cancelled_before_travel",
          input.actorId || job.repairProId,
        );
      }
      if (input.event.type === "MARK_ARRIVED") {
        const { recordArrivalIntegrity } =
          await import("@/lib/server/callout/acceptance");
        await recordArrivalIntegrity({
          requestId: updated.id,
          proId: updated.repairProId,
          gps: input.proLocation
            ? {
                lat: input.proLocation.lat,
                lng: input.proLocation.lng,
                capturedAt: new Date().toISOString(),
              }
            : null,
          customer: updated.motoristLocation,
        });
      }
    } catch {
      /* call-out table optional */
    }
    return { job: updated };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Transition failed",
    };
  }
}
