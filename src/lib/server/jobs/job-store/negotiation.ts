import { formatMoney, toMinorUnits } from "@/lib/pricing";
import {
  assertTransition,
  canPlaceOffer,
  hasIdempotentOffer,
  validateOfferAmount,
  type TransitionActor,
  type TransitionEvent,
} from "@/lib/jobs/state-machine";
import type { JobOffer, JobRecord, OfferSide } from "@/lib/jobs/types";
import { nowIso, uid, splitMinor } from "./mappers";
import { persist, persistIfUnchanged } from "./cache";
import { getJob } from "./reads";

async function notifyOfferPlaced(job: JobRecord, offer: JobOffer) {
  try {
    const { insertNotification } = await import("@/lib/server/notifications");
    const toUserId =
      offer.side === "repair_pro" ? job.motoristId : job.repairProId;
    if (!toUserId) return;
    const who = offer.side === "repair_pro" ? "Repair Pro" : "Customer";
    await insertNotification({
      userId: toUserId,
      category: "requests",
      priority: "high",
      title: "New labour price",
      body: `${who} offered ${formatMoney(offer.amountMajor)}`,
      href: `/jobs/${job.id}`,
      actionType: "open_job",
      actionPayload: { jobId: job.id },
      jobId: job.id,
      jobStatus: job.status,
      groupKey: `offer-${job.id}-${offer.offerIndex}`,
    });
  } catch {
    /* optional */
  }
}

export async function placeOffer(input: {
  jobId: string;
  side: OfferSide;
  amountMajor: number;
  actorId: string;
  clientOfferId?: string | null;
}): Promise<{ job: JobRecord } | { error: string }> {
  // Up to 2 attempts under CAS conflict
  for (let attempt = 0; attempt < 2; attempt++) {
    const job = await getJob(input.jobId);
    if (!job) return { error: "Job not found" };

    // Idempotent replay: this sticker already placed an offer on this side.
    // Return the job unchanged a retry after a lost response must never
    // double-place. Checked before the gate so a now-closed negotiation
    // still replays the original result instead of erroring.
    if (hasIdempotentOffer(job.offers, input.clientOfferId, input.side)) {
      return { job };
    }

    const gate = canPlaceOffer({
      status: job.status,
      offerCount: job.offers.length,
      side: input.side,
      negotiateEndsAt: job.negotiateEndsAt,
    });
    if (!gate.ok) return { error: gate.reason };

    const lastPro = [...job.offers]
      .reverse()
      .find((o) => o.side === "repair_pro");
    const amountCheck = validateOfferAmount({
      side: input.side,
      amountMajor: input.amountMajor,
      proBaseMajor: job.proBaseMajor,
      lastProOfferMajor: lastPro?.amountMajor ?? null,
    });
    if (!amountCheck.ok) return { error: amountCheck.reason };

    const expectedUpdatedAt = job.updatedAt;
    const offer: JobOffer = {
      id: uid("off"),
      side: input.side,
      amountMajor: input.amountMajor,
      amountMinor: toMinorUnits(input.amountMajor, job.currency),
      currency: job.currency,
      createdAt: nowIso(),
      offerIndex: job.offers.length + 1,
      clientOfferId: input.clientOfferId || null,
    };

    const proBase =
      input.side === "repair_pro"
        ? input.amountMajor
        : (job.proBaseMajor ?? lastPro?.amountMajor ?? null);

    const next: JobRecord = {
      ...job,
      // Negotiation owns the row never re-write stale pairing stages.
      pairingStage: null,
      pairingDeadline: null,
      offers: [...job.offers, offer],
      proBaseMajor: proBase,
      updatedAt: nowIso(),
    };
    const saved = await persistIfUnchanged(next, expectedUpdatedAt);
    if (!saved) {
      if (attempt === 0) continue;
      return {
        error: "Price updated by the other party. Refresh and try again.",
      };
    }
    await notifyOfferPlaced(saved, offer);
    return { job: saved };
  }
  return { error: "Could not place offer. Try again." };
}

export async function acceptOffer(input: {
  jobId: string;
  by: "motorist" | "repair_pro";
  actorId: string;
}): Promise<{ job: JobRecord } | { error: string }> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const job = await getJob(input.jobId);
    if (!job) return { error: "Job not found" };
    if (job.status !== "negotiating") {
      return { error: "Negotiation is closed." };
    }
    if (job.offers.length === 0) {
      return { error: "No offer to accept yet." };
    }
    const last = job.offers[job.offers.length - 1];
    // Accepting party must be the other side
    if (last.side === input.by) {
      return { error: "You cannot accept your own offer. Wait for a counter." };
    }

    let nextStatus;
    try {
      nextStatus = assertTransition(job.status, {
        type: "ACCEPT_OFFER",
        by: input.by,
      });
    } catch (e) {
      return {
        error: e instanceof Error ? e.message : "Cannot accept offer now",
      };
    }

    const expectedUpdatedAt = job.updatedAt;
    const agreedMajor = last.amountMajor;
    const amountMinor = last.amountMinor;
    const split = splitMinor(amountMinor);
    const ts = nowIso();

    const updated: JobRecord = {
      ...job,
      status: nextStatus,
      pairingStage: null,
      pairingDeadline: null,
      agreedMajor,
      amountMinor,
      platformFeeMinor: split.platformFeeMinor,
      proPayoutMinor: split.proPayoutMinor,
      statusHistory: [
        ...job.statusHistory,
        { status: nextStatus, at: ts, by: input.by },
      ],
      updatedAt: ts,
    };

    const saved = await persistIfUnchanged(updated, expectedUpdatedAt);
    if (!saved) {
      if (attempt === 0) continue;
      return {
        error: "Job changed while accepting. Refresh and try again.",
      };
    }
    return { job: saved };
  }
  return { error: "Could not accept offer. Refresh and try again." };
}
