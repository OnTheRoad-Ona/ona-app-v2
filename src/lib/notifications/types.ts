/**
 * OgaMecho notification domain — premium minimalist system.
 * Solid fills only; copper #C5A46E accents; no borders/glows/gradients.
 */

import {
  CONVERSATION_ENDED_MESSAGE,
  JOB_CLOSED_MESSAGE,
  JOB_LIVE_CHAT_STATUSES,
  closedOpenMessage,
  isJobEndedStatus,
  shouldBlockLiveOpen,
} from "@/lib/chat-expired";

export type NotificationCategory =
  | "requests"
  | "messages"
  | "payments"
  | "system";

export type NotificationPriority = "low" | "normal" | "high" | "critical";

export type NotificationActionType =
  | "open_job"
  | "open_chat"
  | "view_tracking"
  | "accept_request"
  | "view_payment"
  | "rate"
  | "none"
  | null
  | undefined;

export type AppNotification = {
  id: string;
  userId: string;
  category: NotificationCategory;
  priority: NotificationPriority;
  title: string;
  body: string;
  href?: string | null;
  actionType?: NotificationActionType;
  actionPayload?: Record<string, unknown>;
  groupKey?: string | null;
  jobId?: string | null;
  jobStatus?: string | null;
  /** Full chat text when job finished — inline only, no open-chat */
  messageText?: string | null;
  readAt?: string | null;
  createdAt: string;
};

export type NotificationFilter =
  | "all"
  | "requests"
  | "messages"
  | "payments"
  | "system";

/** Spec palette */
export const COPPER = "#C5A46E";
/** Message / glassy orange — light-theme Notifications chrome only */
export const MESSAGE_ORANGE = "#FF6B35";
export const CHARCOAL = "#1c1c1e";
export const SOFT_WHITE = "#FFFFFF";
export const SOFT_GRAY = "#F5F5F5";
export const MUTED_LIGHT = "#6B7280";
export const MUTED_DARK = "rgba(255,255,255,0.65)";

/** Job statuses that lock chat → show full message text, no open chat */
export const CHAT_CLOSED_JOB_STATUSES = new Set([
  "completed",
  "satisfied",
  "released",
  "cancelled",
  "expired",
  "refunded",
  "disputed",
  "under_appeal",
]);

/** Terminal / ended (5C: anything not live mid-job) — use isJobFinishedStatus */
export const JOB_FINISHED_STATUSES = CHAT_CLOSED_JOB_STATUSES;

/** Active / ongoing job — live chat only */
export const JOB_ACTIVE_STATUSES = JOB_LIVE_CHAT_STATUSES;

export {
  CONVERSATION_ENDED_MESSAGE,
  JOB_CLOSED_MESSAGE,
  closedOpenMessage,
  isJobEndedStatus,
};

/** Human-readable status for blocked-open popups (no dashes) */
export function jobStatusLabel(status: string | null | undefined): string {
  const s = (status || "").toLowerCase();
  const map: Record<string, string> = {
    negotiating: "negotiating",
    agreed: "agreed",
    paid_booked: "booked",
    en_route: "en route",
    arrived: "arrived",
    in_progress: "in progress",
    completed: "completed",
    satisfied: "completed",
    released: "finished",
    cancelled: "cancelled",
    expired: "expired",
    disputed: "disputed",
    under_appeal: "under appeal",
    refunded: "refunded",
  };
  return map[s] || s || "closed";
}

export function isJobFinishedStatus(status: string | null | undefined): boolean {
  return isJobEndedStatus(status);
}

export function isChatClosedForNotification(n: AppNotification): boolean {
  if (n.jobStatus && isJobEndedStatus(n.jobStatus)) {
    return n.category === "messages" || n.actionType === "open_chat";
  }
  if (n.category !== "messages" && n.actionType !== "open_chat") return false;
  const payload = n.actionPayload || {};
  if (payload.chatClosed === true || payload.closed === true) return true;
  return false;
}

/** True when this notification must not navigate live to job / chat / track */
export function isNavigationBlocked(
  n: AppNotification,
  liveStatus?: string | null
): boolean {
  if (n.actionType === "rate") return false;
  if (n.actionType === "none") return true;
  // Missing action but has sensitive href — still evaluate
  if (!n.actionType && !n.href) return true;

  return shouldBlockLiveOpen({
    href: n.href,
    jobId: n.jobId,
    jobStatus: n.jobStatus,
    liveStatus: liveStatus ?? n.jobStatus,
    actionType: n.actionType,
    category: n.category,
    actionPayload: n.actionPayload,
    allowRate: true,
  });
}

/**
 * Concise popup when user can't open a notification target.
 * Chat → conversation ended; View job → job closed.
 */
export function blockedActionMessage(
  n?: AppNotification,
  _liveStatus?: string | null
): string {
  if (!n) return CONVERSATION_ENDED_MESSAGE;
  return closedOpenMessage({
    href: n.href,
    actionType: n.actionType,
    category: n.category,
  });
}

/** Center list: hide closed-chat rows that have no full message text */
export function shouldListNotification(n: AppNotification): boolean {
  if (!isChatClosedForNotification(n)) return true;
  return Boolean(n.messageText?.trim());
}

/** Toasts: never for closed-chat message notifications */
export function shouldToastNotification(n: AppNotification): boolean {
  return !isChatClosedForNotification(n);
}

export function isHighPriority(p: NotificationPriority): boolean {
  return p === "high" || p === "critical";
}

export function isStickyPriority(p: NotificationPriority): boolean {
  return p === "high" || p === "critical";
}
