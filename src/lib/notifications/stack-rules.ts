/**
 * X-style toast / center stacking rules.
 *
 * Always full row (never deck-stacked): payment, chat, call.
 *
 * Service request (pro incoming + customer accepted):
 * - Same local calendar day → open / not stacked
 * - After that day closes (local midnight) → stack that day only
 */

import type { AppNotification } from "@/lib/notifications/types";

/** Max full banners under the pile (newest first). */
export const TOAST_MAX_NON_STACK = 6;

function textBlob(n: AppNotification): string {
  return `${n.title || ""} ${n.body || ""} ${n.groupKey || ""}`.toLowerCase();
}

/** Local calendar day key YYYY-MM-DD (device timezone). */
export function localDayKey(isoOrDate: string | Date): string {
  const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  if (!Number.isFinite(d.getTime())) return "unknown";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** True while the notification’s local day has not ended yet. */
export function isNotificationDayOpen(
  createdAt: string,
  now: Date = new Date(),
): boolean {
  return localDayKey(createdAt) === localDayKey(now);
}

/** Incoming / missed / in-app call alerts */
export function isCallNotification(n: AppNotification): boolean {
  const t = textBlob(n);
  if (
    /\b(incoming call|missed call|voice call|video call|call ended)\b/.test(t)
  ) {
    return true;
  }
  if (n.groupKey?.toLowerCase().includes("call")) return true;
  if (n.href?.toLowerCase().includes("call")) return true;
  const payload = n.actionPayload || {};
  if (
    typeof payload === "object" &&
    payload &&
    ("callId" in payload || "call_id" in payload)
  ) {
    return true;
  }
  return false;
}

/** Chat / message notifications never stack in the pile. */
export function isChatNotification(n: AppNotification): boolean {
  if (n.category === "messages") return true;
  if (n.actionType === "open_chat") return true;
  return false;
}

/** Payment / escrow / wallet full banner under pile */
export function isPaymentNotification(n: AppNotification): boolean {
  if (n.category === "payments") return true;
  if (n.actionType === "view_payment") return true;
  const t = textBlob(n);
  if (
    /\b(payment|payout|escrow|refund|released)\b/.test(t) &&
    n.category !== "requests"
  ) {
    return true;
  }
  return false;
}

/**
 * Service request notifications (both sides):
 * - Pro: new / incoming service request
 * - Customer: pro accepted / “I can fix this” / request updates
 *
 * Broad: any `requests` category counts, plus accept_request / service-request
 * group keys so day-stack rules actually hit real prod payloads.
 */
export function isServiceRequestNotification(n: AppNotification): boolean {
  if (n.actionType === "accept_request") return true;
  if (
    n.jobStatus === "accepted" ||
    n.jobStatus === "searching" ||
    n.jobStatus === "offered"
  ) {
    return true;
  }
  if ((n.groupKey || "").startsWith("service-request")) return true;
  if (n.category === "requests") return true;

  const t = textBlob(n);
  if (
    /\b(service request|new request|incoming request|can fix this|request accepted)\b/.test(
      t,
    )
  ) {
    return true;
  }
  return false;
}

/** @deprecated use isServiceRequestNotification */
export function isRequestAcceptNotification(n: AppNotification): boolean {
  return isServiceRequestNotification(n);
}

/**
 * Full row under the pile (not deck-stacked):
 * - Payment · Chat · Call (always)
 * - Service request only while its local calendar day is still open
 */
export function isNonStackNotification(
  n: AppNotification,
  now: Date = new Date(),
): boolean {
  if (
    isPaymentNotification(n) ||
    isChatNotification(n) ||
    isCallNotification(n)
  ) {
    return true;
  }
  if (isServiceRequestNotification(n)) {
    // Open day → not stacked. Day closed → stack that day only.
    return isNotificationDayOpen(n.createdAt, now);
  }
  return false;
}

/** Allowed into the X-style deck pile behind the front card */
export function isStackableNotification(
  n: AppNotification,
  now: Date = new Date(),
): boolean {
  return !isNonStackNotification(n, now);
}

/** Center stack key for closed-day service requests: service_req:YYYY-MM-DD */
export function serviceRequestDayStackKey(n: AppNotification): string | null {
  if (!isServiceRequestNotification(n)) return null;
  return `service_req:${localDayKey(n.createdAt)}`;
}

/** Human label e.g. "Service requests · Aug 8" */
export function serviceRequestDayStackLabel(dayKey: string): string {
  const m = /^service_req:(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
  if (!m) return "Service requests";
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const pretty = d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  return `Service requests · ${pretty}`;
}
