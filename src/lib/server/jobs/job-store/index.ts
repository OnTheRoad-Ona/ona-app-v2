/**
 * Job store — modular split from the original 5,018-line god file.
 * Each module handles a single concern (payments, dispatch, transitions, etc.).
 *
 * Barrel export: re-exports every public API so existing imports like
 * `import { createJob } from "@/lib/server/jobs/job-store"` continue to work.
 */

// ── Types & constants ──────────────────────────────────────────────
export { memory, READ_CACHE_MS, FLOW_STATUSES } from "./constants";

// ── Mappers ────────────────────────────────────────────────────────
export {
  rowToJob,
  jobToDbPatch,
  flowToLegacyStatus,
  legacyToFlowStatus,
  resolveFlowStatus,
  nowIso,
  uid,
  splitMinor,
} from "./mappers";

// ── Cache & persist ────────────────────────────────────────────────
export { cacheJob, persist, persistIfUnchanged } from "./cache";

// ── Hydration ──────────────────────────────────────────────────────
export {
  hydrateMotoristPhoto,
  hydrateMotoristVehicle,
  hydrateJobPhones,
  hydrateJobContacts,
  hydrateJobCallout,
} from "./hydrate";

// ── Reads ──────────────────────────────────────────────────────────
export {
  getJob,
  getJobRaw,
  listJobsForUser,
  listDisputedJobs,
  publicJobView,
  isDeferredByPro,
} from "./reads";

// ── Create ─────────────────────────────────────────────────────────
export { createJob } from "./create";

// ── Payments ───────────────────────────────────────────────────────
export {
  reconcileJobPayment,
  cancelOpenPaymentSession,
  refundJobEscrow,
  releaseJobEscrow,
  mockPayJob,
  startJobEscrowPayment,
  markJobPaidFromReference,
} from "./payments";

// ── Expiry ─────────────────────────────────────────────────────────
export { maybeExpire, expireOverdueBookedJobs } from "./expiry";

// ── Dispatch ───────────────────────────────────────────────────────
export {
  listActiveExclusions,
  deferJob,
  expireUnacceptedJobs,
  rerouteDeclinedJob,
  forceRerouteJob,
  clearJobCooldowns,
  adminExpireJob,
  adminReassignJob,
} from "./dispatch";

// ── Transitions ────────────────────────────────────────────────────
export {
  fireMeritRecalc,
  applyEvent,
  transitionJob,
} from "./transitions";

// ── Negotiation ────────────────────────────────────────────────────
export { placeOffer, acceptOffer } from "./negotiation";

// ── Disputes ───────────────────────────────────────────────────────
export {
  openDispute,
  resolveDispute,
  openAppeal,
  resolveAppeal,
} from "./disputes";

// ── Location ───────────────────────────────────────────────────────
export { updateTripPartyLocation, updateJobLocation } from "./location";

// ── Rating ─────────────────────────────────────────────────────────
export { rateJob } from "./rating";

// ── Notifications ──────────────────────────────────────────────────
export {
  notifyPayoutReleased,
  notifyPayoutPendingSettlement,
  bumpProJobsCompleted,
} from "./notifications";

// ── Recovery ───────────────────────────────────────────────────────
export {
  canRecoverReleaseFromJob,
  recoverReleasedFromFlutterwave,
  clearFalseSatisfiedStamp,
} from "./recovery";
