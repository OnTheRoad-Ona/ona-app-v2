"use client";

/**
 * NotificationCenter icon filters, flat X-style notification cards.
 * Every item renders with the same anatomy as the in-app toasts: category icon
 * chip (orange for high priority), "Ona · time" header, bold title, muted body,
 * action chip, unread dot. Read: solid grey action chips. Unread: orange.
 * Mark read on card click / hover no separate "Mark read" control.
 */

import { useEffect, useMemo, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Info,
  LayoutGrid,
  MessageCircle,
  Phone,
  Settings2,
  Star,
  Wallet,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import {
  MESSAGE_ORANGE,
  blockedActionMessage,
  isChatClosedForNotification,
  isJobHistoryClosedStatus,
  isNavigationBlocked,
  isReleasePayPendingStatus,
  type AppNotification,
  type NotificationCategory,
  type NotificationFilter,
} from "@/lib/notifications/types";
import {
  isCallNotification,
  isChatNotification,
  isPaymentNotification,
  isRequestAcceptNotification,
} from "@/lib/notifications/stack-rules";
import { useNotifications } from "@/components/notifications/notification-provider";
import { ExpiredDialog } from "@/components/ui/expired-dialog";
import {
  CONVERSATION_ENDED_MESSAGE,
  messageThreadIdFromHref,
  readOnlyChatHref,
} from "@/lib/chat-expired";
import { apiGetJob } from "@/lib/jobs/client";
import { useApp } from "@/lib/store";

const FILTERS: {
  id: NotificationFilter;
  label: string;
  icon: LucideIcon;
}[] = [
  { id: "all", label: "All", icon: LayoutGrid },
  { id: "requests", label: "Requests", icon: Wrench },
  { id: "messages", label: "Messages", icon: MessageCircle },
  { id: "payments", label: "Payments", icon: Wallet },
  { id: "system", label: "System", icon: Settings2 },
];

function formatWhen(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  try {
    return new Date(t).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

/** Compact X-style time label for the list: "Ona · now / 5m / 2h / Jan 3 2:31 PM". */
function toastWhen(iso: string, now = Date.now()): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const s = Math.floor((now - t) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return formatWhen(iso);
}

/** Same per-category icon the in-app toasts use identical brand language. */
function categoryIcon(n: AppNotification): LucideIcon {
  if (isCallNotification(n)) return Phone;
  if (isChatNotification(n)) return MessageCircle;
  if (isPaymentNotification(n)) return Wallet;
  if (isRequestAcceptNotification(n) || n.category === "requests")
    return Wrench;
  switch (n.category as NotificationCategory) {
    case "requests":
      return Wrench;
    case "messages":
      return MessageCircle;
    case "payments":
      return Wallet;
    default:
      return Info;
  }
}

/** Per-action icon + label that replaces the old text chips (X-style icon actions). */
type ActionSpec = { icon: LucideIcon | null; label: string };

function actionSpec(
  n: AppNotification,
  opts: {
    navBlocked: boolean;
    accountType?: string | null;
    releasePay: boolean;
  },
): ActionSpec | null {
  const { navBlocked, accountType, releasePay } = opts;
  if (n.actionType === "open_chat" || n.category === "messages") {
    return { icon: MessageCircle, label: navBlocked ? "Open" : "Open chat" };
  }
  if (n.actionType === "accept_request") {
    return {
      icon: null,
      label: navBlocked
        ? "Open"
        : accountType === "professional"
          ? "Open request"
          : "Open",
    };
  }
  if (n.actionType === "view_tracking") {
    return { icon: null, label: navBlocked ? "Open" : "Track" };
  }
  if (
    n.actionType === "open_job" ||
    n.category === "requests" ||
    (n.category === "payments" && releasePay)
  ) {
    return {
      icon: null,
      label: releasePay
        ? "Confirm job & release payment"
        : navBlocked
          ? "Open"
          : "Open job",
    };
  }
  if (n.actionType === "view_payment" && !releasePay) {
    return { icon: Wallet, label: "Payments" };
  }
  if (n.actionType === "rate") {
    return { icon: Star, label: "Rate" };
  }
  if (!n.actionType && n.href) {
    return { icon: null, label: navBlocked ? "Open" : "Open" };
  }
  return null;
}

export function NotificationCenter() {
  const {
    centerOpen,
    closeCenter,
    filter,
    setFilter,
    search,
    setSearch,
    filtered,
    markRead,
    loading,
    unreadCount,
  } = useNotifications();
  const { theme, accountType } = useApp();
  const router = useRouter();
  const isLight = theme === "light";
  /** Deliberate-hover timers: id → timeout that will mark the row read */
  const hoverTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  /** Row currently in its 1.5s hold window (drives the pulse cue) */
  const [hoverHoldId, setHoverHoldId] = useState<string | null>(null);
  useEffect(
    () => () => {
      for (const t of hoverTimers.current.values()) clearTimeout(t);
      hoverTimers.current.clear();
    },
    [],
  );
  const [blockMsg, setBlockMsg] = useState<string | null>(null);
  const [viewHref, setViewHref] = useState<string | null>(null);

  const accent = MESSAGE_ORANGE;
  const stage = isLight ? "#c8c9cd" : "#0a0a0a";
  const searchBg = isLight ? "#bebfc4" : "rgba(255,255,255,0.08)";
  const ink = isLight ? "#1a1b1e" : "#ffffff";
  const muted = isLight ? "#5c6370" : "rgba(255,255,255,0.65)";
  const line = isLight ? "rgba(0,0,0,0.10)" : "rgba(255,255,255,0.12)";

  // Flatten: one X-style card per notification, newest first.
  const sorted = useMemo(
    () =>
      [...filtered].sort(
        (a, b) =>
          (Date.parse(b.createdAt || "") || 0) -
          (Date.parse(a.createdAt || "") || 0),
      ),
    [filtered],
  );

  if (!centerOpen) return null;

  const showBlock = (n: AppNotification, msg: string) => {
    setBlockMsg(msg || CONVERSATION_ENDED_MESSAGE);
    const tid = messageThreadIdFromHref(n.href);
    if (tid) {
      setViewHref(readOnlyChatHref(String(tid)));
      return;
    }
    const jid = n.jobId || null;
    if (jid) {
      setViewHref(`/jobs/${jid}`);
      return;
    }
    setViewHref(null);
  };

  const runAction = async (n: AppNotification) => {
    void markRead([n.id]);
    // Pro pairing request → dashboard + lower panel only
    if (
      accountType === "professional" &&
      (n.actionType === "accept_request" ||
        (n.category === "requests" &&
          (n.groupKey || "").startsWith("service-request")))
    ) {
      try {
        const { clearJobShown, requestForceIncomingPanel } =
          await import("@/lib/jobs/incoming-popup-timing");
        if (n.jobId) {
          clearJobShown(n.jobId);
          requestForceIncomingPanel(n.jobId);
        }
      } catch {
        /* */
      }
      closeCenter();
      router.replace("/dashboard");
      return;
    }
    if (!n.href) return;
    let liveStatus: string | undefined = n.jobStatus || undefined;
    if (n.jobId) {
      try {
        const res = await apiGetJob(n.jobId);
        if (res.ok && res.data.job?.status) {
          liveStatus = res.data.job.status;
        }
      } catch {
        /* use cached */
      }
    }
    if (isReleasePayPendingStatus(liveStatus || n.jobStatus)) {
      closeCenter();
      router.push(n.href.includes("/jobs/") ? n.href : `/jobs/${n.jobId}`);
      return;
    }
    if (isNavigationBlocked({ ...n, jobStatus: liveStatus })) {
      showBlock(n, blockedActionMessage(n, liveStatus));
      return;
    }
    if (
      isChatClosedForNotification(n) ||
      isJobHistoryClosedStatus(liveStatus)
    ) {
      showBlock(n, blockedActionMessage(n, liveStatus));
      return;
    }
    if (
      (n.href.includes("/jobs/") ||
        n.href.includes("/messages/") ||
        n.href.includes("/requests/")) &&
      (/demo/i.test(n.href) || (n.jobId && /demo/i.test(n.jobId)))
    ) {
      showBlock(n, blockedActionMessage(n, liveStatus));
      return;
    }
    closeCenter();
    router.push(n.href);
  };

  return (
    <div
      className="absolute inset-0 z-[95] flex flex-col"
      role="dialog"
      aria-modal
      aria-label="Notifications"
    >
      <button
        type="button"
        className="absolute inset-0 border-0"
        style={{ backgroundColor: isLight ? "#00000055" : "#00000099" }}
        aria-label="Close notifications"
        onClick={closeCenter}
      />
      <div
        className="relative z-10 mt-auto flex h-[92%] max-h-full w-full flex-col animate-[om-sheet-up_0.28s_ease-out] sm:ml-auto sm:mt-0 sm:h-full sm:max-w-[400px]"
        style={{ backgroundColor: stage }}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 px-4 pb-2 pt-4">
          <div className="min-w-0">
            <h2
              className="text-[18px] font-bold tracking-tight"
              style={{ color: ink }}
            >
              Notifications
            </h2>
            <p
              className="mt-0.5 text-[11px] font-medium"
              style={{ color: muted }}
            >
              {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
            </p>
          </div>
        </div>

        <div className="shrink-0 px-4 pb-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search notifications"
            className="h-10 w-full rounded-md border-0 px-3 text-[13px] font-medium outline-none"
            style={{ backgroundColor: searchBg, color: ink }}
          />
        </div>

        <div className="shrink-0 px-3 pb-2">
          <div className="grid w-full grid-cols-5 gap-0">
            {FILTERS.map((f) => {
              const on = filter === f.id;
              const Icon = f.icon;
              return (
                <button
                  key={f.id}
                  type="button"
                  title={f.label}
                  aria-label={f.label}
                  aria-pressed={on}
                  onClick={() => setFilter(f.id)}
                  className="flex h-10 w-full items-center justify-center border-0 bg-transparent"
                  style={{ color: on ? accent : muted }}
                >
                  <Icon
                    className="h-[18px] w-[18px]"
                    strokeWidth={on ? 2.4 : 2}
                  />
                </button>
              );
            })}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pb-8 scrollbar-hide">
          {loading && (
            <p
              className="px-4 py-12 text-center text-[13px] font-medium"
              style={{ color: muted }}
            >
              Loading…
            </p>
          )}
          {!loading && sorted.length === 0 && (
            <div className="px-4 py-20 text-center">
              <p className="text-[15px] font-semibold" style={{ color: ink }}>
                You’re all caught up
              </p>
              <p
                className="mx-auto mt-2 max-w-[240px] text-[12px] font-medium leading-relaxed"
                style={{ color: muted }}
              >
                Job updates, messages, and payments will appear here when
                something needs you.
              </p>
            </div>
          )}

          <ul className="list-none">
            {/* Hold-to-read timers: 1.5s deliberate hover marks read */}
            {sorted.map((n) => {
              const unread = !n.readAt;
              const closed = isChatClosedForNotification(n);
              const historyClosed = isJobHistoryClosedStatus(n.jobStatus);
              const releasePay = isReleasePayPendingStatus(n.jobStatus);
              const navBlocked =
                !releasePay &&
                (isNavigationBlocked(n) || closed || historyClosed);
              // A cancelled/closed job's notification is informational only
              // the request is dead, so the row is inert: no navigation, no
              // tap affordance (mirrors the pro popup card vanishing on cancel).
              const inert = closed || historyClosed;
              const Icon = categoryIcon(n);
              const spec = actionSpec(n, {
                navBlocked,
                accountType,
                releasePay,
              });
              const go = () => {
                markRead([n.id]);
                void runAction(n);
              };
              return (
                <li
                  key={n.id}
                  style={{ borderBottom: `1px solid ${line}` }}
                  onMouseEnter={() => {
                    if (unread) {
                      setHoverHoldId(n.id);
                      const t = setTimeout(() => {
                        void markRead([n.id]);
                        hoverTimers.current.delete(n.id);
                        setHoverHoldId(null);
                      }, 1500);
                      hoverTimers.current.set(n.id, t);
                    }
                  }}
                  onMouseLeave={() => {
                    const t = hoverTimers.current.get(n.id);
                    if (t) {
                      clearTimeout(t);
                      hoverTimers.current.delete(n.id);
                    }
                    setHoverHoldId(null);
                  }}
                >
                  <button
                    type="button"
                    disabled={inert}
                    aria-disabled={inert}
                    className={`flex w-full items-start gap-3.5 px-4 py-4 text-left ${
                      inert
                        ? "cursor-default opacity-70"
                        : isLight
                          ? "active:bg-black/[0.06]"
                          : "active:bg-white/[0.08]"
                    }`}
                    style={{ backgroundColor: "transparent" }}
                    onClick={go}
                  >
                    <Icon
                      className={`mt-1 h-[18px] w-[18px] shrink-0${
                        hoverHoldId === n.id ? " animate-pulse" : ""
                      }`}
                      style={{
                        color: unread ? accent : muted,
                        strokeWidth: unread ? 2.4 : 2,
                      }}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="truncate text-[13px] font-bold leading-tight tracking-[-0.01em]"
                          style={{ color: ink }}
                        >
                          Ona
                        </span>
                        <span
                          className="shrink-0 text-[11px] font-medium"
                          style={{ color: muted }}
                        >
                          · {toastWhen(n.createdAt)}
                        </span>
                      </div>
                      <p
                        className="mt-1 text-[13px] font-semibold leading-snug tracking-[-0.01em]"
                        style={{ color: ink }}
                      >
                        {n.title}
                      </p>
                      <p
                        className="mt-1.5 line-clamp-2 text-[12px] font-normal leading-snug"
                        style={{ color: muted }}
                      >
                        {closed && n.messageText ? n.messageText : n.body}
                      </p>
                      {closed && n.messageText ? (
                        <p
                          className="mt-1 text-[10px] font-semibold"
                          style={{ color: muted }}
                        >
                          Job finished. Full message.
                        </p>
                      ) : null}
                      {historyClosed && !closed && n.category === "requests" ? (
                        <p
                          className="mt-1 text-[10px] font-semibold"
                          style={{ color: muted }}
                        >
                          Job {n.jobStatus?.replace(/_/g, " ") || "closed"}.
                          Link unavailable.
                        </p>
                      ) : null}
                    </div>
                    {spec && spec.icon && spec.icon !== Icon ? (
                      <span
                        className="self-center shrink-0 pl-2"
                        title={spec.label}
                        aria-label={spec.label}
                        style={{ color: unread ? accent : muted }}
                      >
                        <spec.icon
                          className="h-[18px] w-[18px]"
                          strokeWidth={2}
                        />
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <ExpiredDialog
          open={Boolean(blockMsg)}
          isLight={isLight}
          message={blockMsg || CONVERSATION_ENDED_MESSAGE}
          onClose={() => {
            setBlockMsg(null);
            setViewHref(null);
          }}
          onView={
            viewHref
              ? () => {
                  const href = viewHref;
                  setBlockMsg(null);
                  setViewHref(null);
                  closeCenter();
                  router.push(href);
                }
              : undefined
          }
        />
      </div>
    </div>
  );
}
