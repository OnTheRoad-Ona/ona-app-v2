/**
 * Closed job / chat gate.
 * 5C: anything not mid-job active is ended.
 */

/** Live chat / live job open only while mid-flow */
export const JOB_LIVE_CHAT_STATUSES = new Set<string>([
  "negotiating",
  "accepted",
  "agreed",
  "paid_booked",
  "en_route",
  "arrived",
  "in_progress",
]);

/**
 * Statuses that still use the live job shell (actions remaining).
 * Includes post-work satisfaction — customer must release pay on /jobs/[id].
 * Chat may still be closed for these (see isJobEndedStatus).
 */
export const JOB_LIVE_SHELL_STATUSES = new Set<string>([
  ...JOB_LIVE_CHAT_STATUSES,
  "completed",
  "satisfied",
  "disputed",
  "under_appeal",
]);

/** Short, fixed copy — chat */
export const CONVERSATION_ENDED_MESSAGE =
  "Conversation ended. You can still read.";

/** Short, fixed copy — View job / job deep links */
export const JOB_CLOSED_MESSAGE = "This job is closed. You can still read.";

/**
 * Pick popup copy for a blocked open (chat vs job).
 */
export function closedOpenMessage(input: {
  href?: string | null;
  actionType?: string | null;
  category?: string | null;
}): string {
  const action = input.actionType || "";
  const cat = input.category || "";
  const href = input.href || "";
  const chatLike =
    action === "open_chat" ||
    cat === "messages" ||
    href.includes("/messages/");
  if (chatLike) return CONVERSATION_ENDED_MESSAGE;
  return JOB_CLOSED_MESSAGE;
}

/** Query flag for intentional read-only open (View) */
export const CHAT_VIEW_ONLY_PARAM = "view";
export const CHAT_VIEW_ONLY_VALUE = "1";

export function isJobEndedStatus(
  status: string | null | undefined
): boolean {
  if (status == null || status === "") return false;
  const s = String(status).toLowerCase().trim();
  if (!s) return false;
  return !JOB_LIVE_CHAT_STATUSES.has(s);
}

export function isJobLiveChatStatus(
  status: string | null | undefined
): boolean {
  if (status == null || status === "") return false;
  return JOB_LIVE_CHAT_STATUSES.has(String(status).toLowerCase().trim());
}

/** True while the job still needs the live /jobs/[id] flow (incl. I’m Satisfied). */
export function isJobLiveShellStatus(
  status: string | null | undefined
): boolean {
  if (status == null || status === "") return false;
  return JOB_LIVE_SHELL_STATUSES.has(String(status).toLowerCase().trim());
}

/** History-only: released / cancelled / expired / refunded — no live actions. */
export function isJobHistoryOnlyStatus(
  status: string | null | undefined
): boolean {
  if (status == null || status === "") return false;
  return isJobEndedStatus(status) && !isJobLiveShellStatus(status);
}

export function isDemoJobOrHref(
  href?: string | null,
  jobId?: string | null
): boolean {
  const h = href || "";
  const j = jobId || "";
  return /demo[-_]/i.test(h) || /demo[-_]/i.test(j);
}

/** Paths that must not open live when job is ended */
export function isSensitiveAppHref(href?: string | null): boolean {
  if (!href) return false;
  const path = href.split("?")[0] || href;
  return (
    path.includes("/messages/") ||
    path.includes("/jobs/") ||
    path.includes("/requests/")
  );
}

export function jobIdFromHref(href?: string | null): string | null {
  if (!href) return null;
  try {
    const path = href.startsWith("http")
      ? new URL(href).pathname
      : href.split("?")[0] || href;
    const m = path.match(/\/(?:jobs|requests)\/([^/]+)/);
    return m?.[1] || null;
  } catch {
    return null;
  }
}

/** Open thread in read-only mode (View action) */
export function readOnlyChatHref(threadId: string): string {
  const id = threadId.replace(/^\/messages\//, "").split("?")[0] || threadId;
  return `/messages/${id}?${CHAT_VIEW_ONLY_PARAM}=${CHAT_VIEW_ONLY_VALUE}`;
}

/** Extract thread id from /messages/:id or /messages/:id?… */
export function messageThreadIdFromHref(
  href: string | null | undefined
): string | null {
  if (!href) return null;
  try {
    const path = href.startsWith("http")
      ? new URL(href).pathname
      : href.split("?")[0] || href;
    const m = path.match(/\/messages\/([^/]+)/);
    return m?.[1] || null;
  } catch {
    return null;
  }
}

export function isReadOnlyChatUrl(
  search: string | { get: (k: string) => string | null }
): boolean {
  if (typeof search === "string") {
    const q = new URLSearchParams(
      search.startsWith("?") ? search.slice(1) : search
    );
    return q.get(CHAT_VIEW_ONLY_PARAM) === CHAT_VIEW_ONLY_VALUE;
  }
  return search.get(CHAT_VIEW_ONLY_PARAM) === CHAT_VIEW_ONLY_VALUE;
}

/**
 * Unified gate for notifications / deep links.
 * Blocks live open of chat/job/request when ended, demo, or closed payload.
 */
export function shouldBlockLiveOpen(input: {
  href?: string | null;
  jobId?: string | null;
  jobStatus?: string | null;
  liveStatus?: string | null;
  actionType?: string | null;
  category?: string | null;
  actionPayload?: Record<string, unknown> | null;
  /** When true, rate links still allowed */
  allowRate?: boolean;
}): boolean {
  const action = input.actionType || null;
  if (input.allowRate !== false && action === "rate") return false;
  if (action === "none") return true;

  const status = input.liveStatus || input.jobStatus || null;
  const href = input.href || "";
  const jobId = input.jobId || jobIdFromHref(href);
  const cat = input.category || "";
  const payload = input.actionPayload || {};

  if (payload.chatClosed === true || payload.closed === true) return true;

  const chatLike =
    action === "open_chat" ||
    cat === "messages" ||
    href.includes("/messages/");
  const jobLike =
    action === "open_job" ||
    action === "view_tracking" ||
    action === "accept_request" ||
    cat === "requests" ||
    href.includes("/jobs/") ||
    href.includes("/requests/");

  if (!chatLike && !jobLike && action !== "view_payment") {
    // unknown action with sensitive href
    if (isSensitiveAppHref(href) && isJobEndedStatus(status)) return true;
    if (isSensitiveAppHref(href) && isDemoJobOrHref(href, jobId)) return true;
    return false;
  }

  // Demo / sample deep links never open live
  if (isDemoJobOrHref(href, jobId) && (chatLike || jobLike)) return true;

  // Chat: block once job is no longer mid-flow (incl. completed)
  if (chatLike && isJobEndedStatus(status)) return true;

  // Job / payment deep links: allow live shell statuses (completed = release pay)
  if (jobLike || action === "view_payment") {
    if (status && isJobHistoryOnlyStatus(status)) return true;
    if (status && !isJobLiveShellStatus(status) && isJobEndedStatus(status)) {
      return true;
    }
    return false;
  }

  if (isJobEndedStatus(status)) return true;

  return false;
}
