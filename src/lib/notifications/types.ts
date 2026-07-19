/**
 * OgaMecho notification domain — premium minimalist system.
 * Solid fills only; copper #C5A46E accents; no borders/glows/gradients.
 */

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
]);

/** Terminal job statuses — never open job / track / chat links */
export const JOB_FINISHED_STATUSES = CHAT_CLOSED_JOB_STATUSES;

/** Active / ongoing job (user may open request, track, chat) */
export const JOB_ACTIVE_STATUSES = new Set([
  "negotiating",
  "accepted",
  "agreed",
  "paid_booked",
  "en_route",
  "arrived",
  "in_progress",
  "disputed",
  "under_appeal",
]);

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
  if (!status) return false;
  return JOB_FINISHED_STATUSES.has(String(status).toLowerCase());
}

export function isChatClosedForNotification(n: AppNotification): boolean {
  if (n.jobStatus && JOB_FINISHED_STATUSES.has(String(n.jobStatus).toLowerCase())) {
    return n.category === "messages" || n.actionType === "open_chat";
  }
  if (n.category !== "messages" && n.actionType !== "open_chat") return false;
  const payload = n.actionPayload || {};
  if (payload.chatClosed === true || payload.closed === true) return true;
  return false;
}

/** True when this notification must not navigate to job / chat / track links */
export function isNavigationBlocked(
  n: AppNotification,
  liveStatus?: string | null
): boolean {
  const status = (liveStatus || n.jobStatus || "").toLowerCase() || null;

  if (n.actionType === "rate") return false;
  if (n.actionType === "none" || !n.actionType) return true;

  // Closed / finished chat
  if (
    n.actionType === "open_chat" ||
    n.category === "messages"
  ) {
    if (isChatClosedForNotification(n) || isJobFinishedStatus(status)) {
      return true;
    }
  }

  // Job / request / tracking
  const jobLike =
    n.actionType === "open_job" ||
    n.actionType === "view_tracking" ||
    n.actionType === "accept_request" ||
    n.category === "requests";

  if (jobLike) {
    if (isJobFinishedStatus(status)) return true;
    if (status && !JOB_ACTIVE_STATUSES.has(status)) return true;
  }

  // Payments tied to a finished escrow job
  if (
    n.actionType === "view_payment" &&
    n.jobId &&
    (status === "released" || status === "refunded" || status === "satisfied")
  ) {
    return true;
  }

  // href heuristic: never open finished job/message deep links
  const href = n.href || "";
  if (
    isJobFinishedStatus(status) &&
    (href.includes("/jobs/") ||
      href.includes("/messages/") ||
      href.includes("/requests/"))
  ) {
    return true;
  }

  return false;
}

/**
 * Concise popup when user can't open a notification target.
 * No em dashes; simple sentence.
 */
export function blockedActionMessage(
  n: AppNotification,
  liveStatus?: string | null
): string {
  const status = liveStatus || n.jobStatus || null;
  const label = jobStatusLabel(status);

  if (n.category === "requests" || n.actionType === "open_job" || n.actionType === "view_tracking" || n.actionType === "accept_request") {
    if (isJobFinishedStatus(status) || !status) {
      return `Job ${label}. Can't open.`;
    }
    if (status && !JOB_ACTIVE_STATUSES.has(status)) {
      return `Job ${label}. Can't open.`;
    }
  }
  if (n.category === "messages" || n.actionType === "open_chat") {
    if (isChatClosedForNotification(n) || isJobFinishedStatus(status)) {
      return `Chat closed. Job ${label}.`;
    }
  }
  if (n.category === "payments" || n.actionType === "view_payment") {
    if (status === "released" || status === "refunded" || status === "satisfied") {
      return `Payment ${label}. Can't open.`;
    }
  }
  if (n.category === "system") {
    if (isJobFinishedStatus(status) && n.actionType && n.actionType !== "none") {
      return `This is ${label}. Can't open.`;
    }
  }
  return "This is no longer active. Can't open.";
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
