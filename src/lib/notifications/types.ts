/**
 * Ona notification domain — premium minimalist system.
 * Solid fills only; copper #FF6B35 accents; no borders/glows/gradients.
 */

import {
  CONVERSATION_ENDED_MESSAGE,
  JOB_CLOSED_MESSAGE,
  JOB_LIVE_CHAT_STATUSES,
  closedOpenMessage,
  isJobEndedStatus,
  isJobHistoryOnlyStatus,
  isJobLiveShellStatus,
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
export const COPPER = "#FF6B35";
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
  isJobHistoryOnlyStatus,
  isJobLiveShellStatus,
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

/**
 * Chat / mid-job ended (includes `completed` — chat closes, but live
 * /jobs/[id] shell stays open for “I’m Satisfied” release pay).
 * Prefer isJobHistoryOnlyStatus for “no live job page”.
 */
export function isJobFinishedStatus(status: string | null | undefined): boolean {
  return isJobEndedStatus(status);
}

/** True only when job is fully closed (no live /jobs/[id] actions left). */
export function isJobHistoryClosedStatus(
  status: string | null | undefined
): boolean {
  return isJobHistoryOnlyStatus(status);
}

/**
 * Customer must still open live job shell for release pay.
 * Never treat these as “link unavailable” in notification UI.
 */
export function isReleasePayPendingStatus(
  status: string | null | undefined
): boolean {
  const s = String(status || "")
    .toLowerCase()
    .trim();
  return s === "completed" || s === "satisfied";
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

  // Release-pay notifications must always open /jobs/[id] (completed is live shell)
  const status = liveStatus ?? n.jobStatus;
  if (
    isReleasePayPendingStatus(status) &&
    (n.actionType === "open_job" ||
      n.actionType === "view_payment" ||
      n.category === "payments" ||
      (n.href && n.href.includes("/jobs/")))
  ) {
    return false;
  }

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

/**
 * Toasts (top in-app stack): never for closed-chat messages.
 * Incoming service requests are handled only by the lower Incoming panel
 * (+ OS push) — do not also pile a top toast with the same text.
 */
export function shouldToastNotification(n: AppNotification): boolean {
  if (isChatClosedForNotification(n)) return false;
  // A cancelled service request always deserves a toast — the pro must learn
  // their live request died the moment it happens, on every screen, whether or
  // not the incoming card was surfaced this session.
  if (
    String(n.jobStatus || "") === "cancelled" &&
    isHighPriority(n.priority)
  ) {
    return true;
  }
  if (
    n.actionType === "open_job" ||
    n.actionType === "accept_request" ||
    (n.category === "requests" && n.jobId)
  ) {
    return false;
  }
  return true;
}

export function isHighPriority(p: NotificationPriority): boolean {
  return p === "high" || p === "critical";
}

export function isStickyPriority(p: NotificationPriority): boolean {
  return p === "high" || p === "critical";
}
