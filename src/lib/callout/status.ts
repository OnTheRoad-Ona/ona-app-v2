import type { JobFlowStatus } from "@/lib/jobs/types";
import type { CalloutStatus } from "@/lib/callout/constants";

/**
 * Call-out statuses live beside the existing job flow.
 * They never replace SSPE / escrow statuses.
 */
export function calloutStatusFromJobFlow(
  flow: JobFlowStatus,
  current: CalloutStatus | null
): CalloutStatus | null {
  if (current === "NOT_ELIGIBLE" || current === "WAIVED") return current;
  if (current === "LOCKED" && flow === "negotiating") return "LOCKED";
  switch (flow) {
    case "en_route":
    case "paid_booked":
      return "IN_PROGRESS";
    case "arrived":
    case "in_progress":
      return "ARRIVED";
    case "completed":
    case "satisfied":
    case "released":
      return "COMPLETED";
    case "cancelled":
    case "expired":
    case "refunded":
      return "CANCELLED";
    case "disputed":
    case "under_appeal":
      return "DISPUTED";
    default:
      return null;
  }
}
