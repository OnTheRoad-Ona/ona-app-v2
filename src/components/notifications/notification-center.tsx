"use client";

/**
 * NotificationCenter — icon filters, Twitter-style stacks, cascade expand.
 * Read: solid grey action buttons (no border/glow). Unread: orange.
 * Mark read on card click / hover — no separate “Mark read” control.
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  LayoutGrid,
  Wrench,
  MessageCircle,
  Wallet,
  Settings2,
  type LucideIcon,
} from "lucide-react";
import {
  groupNotifications,
  isGroup,
} from "@/lib/notifications/group";
import {
  MESSAGE_ORANGE,
  CHARCOAL,
  blockedActionMessage,
  isChatClosedForNotification,
  isHighPriority,
  isJobHistoryClosedStatus,
  isNavigationBlocked,
  isReleasePayPendingStatus,
  type AppNotification,
  type NotificationFilter,
} from "@/lib/notifications/types";
import { useNotifications } from "@/components/notifications/notification-provider";
import { ExpiredDialog } from "@/components/ui/expired-dialog";
import {
  CONVERSATION_ENDED_MESSAGE,
  messageThreadIdFromHref,
  readOnlyChatHref,
} from "@/lib/chat-expired";
import { apiGetJob } from "@/lib/jobs/client";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

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

/** Solid action chip — orange when unread, blended grey when read. No border/glow. */
function ActionBtn({
  label,
  onClick,
  read,
  isLight,
}: {
  label: string;
  onClick: () => void;
  read: boolean;
  isLight: boolean;
}) {
  const orange = MESSAGE_ORANGE;
  // Well-blended grey, high-contrast text, both themes
  const bg = read
    ? isLight
      ? "#8b8d94"
      : "#4a4a50"
    : orange;
  const color = "#ffffff";
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="h-8 rounded-md border-0 px-3 text-[11px] font-bold active:opacity-85"
      style={{
        backgroundColor: bg,
        color,
        boxShadow: "none",
        outline: "none",
      }}
    >
      {label}
    </button>
  );
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
    markAllRead,
    loading,
    unreadCount,
  } = useNotifications();
  const { theme, accountType } = useApp();
  const router = useRouter();
  const isLight = theme === "light";
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [blockMsg, setBlockMsg] = useState<string | null>(null);
  const [viewHref, setViewHref] = useState<string | null>(null);

  const accent = MESSAGE_ORANGE;
  const stage = isLight ? "#c8c9cd" : "#0a0a0a";
  const card = isLight ? "#d4d5d9" : CHARCOAL;
  const searchBg = isLight ? "#bebfc4" : "rgba(255,255,255,0.08)";
  const ink = isLight ? "#1a1b1e" : "#ffffff";
  const muted = isLight ? "#5c6370" : "rgba(255,255,255,0.65)";

  const grouped = useMemo(() => groupNotifications(filtered), [filtered]);

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
    if (isChatClosedForNotification(n) || isJobHistoryClosedStatus(liveStatus)) {
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

  const markStackRead = (ids: string[]) => {
    void markRead(ids);
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
            <p className="mt-0.5 text-[11px] font-medium" style={{ color: muted }}>
              {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void markAllRead()}
            className="shrink-0 border-0 bg-transparent px-1 py-1.5 text-[12px] font-bold active:opacity-70"
            style={{ color: accent }}
          >
            Mark all as read
          </button>
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

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8 scrollbar-hide">
          {loading && (
            <p
              className="py-12 text-center text-[13px] font-medium"
              style={{ color: muted }}
            >
              Loading…
            </p>
          )}
          {!loading && grouped.length === 0 && (
            <div className="px-2 py-20 text-center">
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

          <ul className="list-none space-y-2">
            {grouped.map((item) => {
              if (isGroup(item)) {
                const open = expanded[item.key];
                const head = item.head;
                const high = isHighPriority(head.priority);
                const stackRead = item.unread === 0;
                const ids = item.items.map((i) => i.id);
                return (
                  <li
                    key={item.key}
                    className="overflow-hidden rounded-md"
                    style={{ backgroundColor: card }}
                    onMouseEnter={() => markStackRead(ids)}
                  >
                    {/* Stack header — type label + count + time */}
                    <div
                      className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2.5 active:opacity-80"
                      onClick={() => {
                        markStackRead(ids);
                        setExpanded((e) => ({ ...e, [item.key]: !open }));
                      }}
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        {high && !stackRead ? (
                          <span
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ backgroundColor: accent }}
                          />
                        ) : null}
                        <p
                          className="truncate text-[13px] font-bold leading-snug"
                          style={{ color: ink }}
                        >
                          {item.typeLabel}
                        </p>
                        <span
                          className={cn(
                            "inline-flex min-w-[1.15rem] items-center justify-center rounded-sm px-1 text-[9px] font-bold",
                            item.unread > 0
                              ? "text-white"
                              : "text-[10px] font-semibold"
                          )}
                          style={{
                            backgroundColor:
                              item.unread > 0 ? accent : "transparent",
                            color:
                              item.unread > 0
                                ? "#fff"
                                : muted,
                          }}
                        >
                          {item.items.length}
                        </span>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span
                          className="text-[10px] font-medium"
                          style={{ color: muted }}
                        >
                          {formatWhen(head.createdAt)}
                        </span>
                        <span
                          className="text-[10px] font-bold transition-transform"
                          style={{
                            color: accent,
                            transform: open ? "rotate(180deg)" : "rotate(0deg)",
                          }}
                        >
                          ▼
                        </span>
                      </div>
                    </div>

                    {/* Cascade stack — X/Twitter-style nested items */}
                    {open ? (
                      <ul
                        className="border-t pl-0"
                        style={{
                          borderColor: isLight
                            ? "rgba(0,0,0,0.06)"
                            : "rgba(255,255,255,0.06)",
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {item.items.map((n, idx) => {
                          const isLast = idx === item.items.length - 1;
                          return (
                            <li
                              key={n.id}
                              className={cn(
                                "cursor-pointer px-3 py-2.5 transition-colors",
                                !isLast &&
                                  "border-b"
                              )}
                              style={{
                                backgroundColor: "transparent",
                                borderColor: isLight
                                  ? "rgba(0,0,0,0.04)"
                                  : "rgba(255,255,255,0.04)",
                              }}
                              onMouseEnter={() => markStackRead([n.id])}
                              onClick={() => {
                                markStackRead([n.id]);
                                void runAction(n);
                              }}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <p
                                  className="text-[12px] font-semibold leading-snug"
                                  style={{ color: ink }}
                                >
                                  {n.title}
                                </p>
                                <span
                                  className="shrink-0 text-[9px] font-medium"
                                  style={{ color: muted }}
                                >
                                  {formatWhen(n.createdAt)}
                                </span>
                              </div>
                              <p
                                className="mt-0.5 text-[11px] font-medium leading-snug"
                                style={{ color: muted }}
                              >
                                {n.body}
                              </p>
                              {n.jobId && !n.jobId.startsWith("demo-") ? (
                                <p
                                  className="mt-1 text-[9px] font-semibold uppercase tracking-wide"
                                  style={{ color: accent }}
                                >
                                  Job #{n.jobId.slice(-6)}
                                </p>
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <div
                        className="border-t px-3 py-2.5"
                        style={{
                          borderColor: isLight
                            ? "rgba(0,0,0,0.06)"
                            : "rgba(255,255,255,0.06)",
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p
                            className="min-w-0 flex-1 text-[12px] font-medium leading-snug"
                            style={{ color: muted }}
                          >
                            {head.body}
                          </p>
                          <ActionBtn
                            label={
                              isReleasePayPendingStatus(head.jobStatus)
                                ? "Release"
                                : "Open"
                            }
                            read={stackRead}
                            isLight={isLight}
                            onClick={() => {
                              markStackRead(ids);
                              void runAction(head);
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </li>
                );
              }

              const n = item;
              const high = isHighPriority(n.priority);
              const isRead = Boolean(n.readAt);
              return (
                <li
                  key={n.id}
                  className="overflow-hidden rounded-md"
                  style={{ backgroundColor: card }}
                  onMouseEnter={() => markStackRead([n.id])}
                  onClick={() => {
                    markStackRead([n.id]);
                    void runAction(n);
                  }}
                >
                  <div className="flex cursor-pointer items-start gap-2 px-3 py-2.5 active:opacity-80">
                    {high && !isRead ? (
                      <span
                        className="mt-1 h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: accent }}
                      />
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p
                          className="text-[13px] font-bold leading-snug"
                          style={{ color: ink }}
                        >
                          {n.title}
                        </p>
                        <span
                          className="shrink-0 text-[10px] font-medium"
                          style={{ color: muted }}
                        >
                          {formatWhen(n.createdAt)}
                        </span>
                      </div>
                      <p
                        className="mt-0.5 text-[12px] font-medium leading-snug"
                        style={{ color: muted }}
                      >
                        {n.body}
                      </p>
                    </div>
                  </div>
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

function NotificationCardBody({
  n,
  ink,
  muted,
  isLight,
  accountType,
  showMeta,
  stacked,
  onAction,
  onRead,
}: {
  n: AppNotification;
  ink: string;
  muted: string;
  isLight: boolean;
  accountType: string | null;
  showMeta?: boolean;
  stacked?: boolean;
  stackIndex?: number;
  onAction: () => void;
  onRead: () => void;
}) {
  const closed = isChatClosedForNotification(n);
  const unread = !n.readAt;
  const historyClosed = isJobHistoryClosedStatus(n.jobStatus);
  const releasePay = isReleasePayPendingStatus(n.jobStatus);
  const navBlocked =
    !releasePay && (isNavigationBlocked(n) || closed || historyClosed);

  const go = () => {
    onRead();
    onAction();
  };

  return (
    <div>
      {showMeta ? (
        <div className="flex items-start justify-between gap-2">
          <p
            className={cn(
              "text-[13px] font-bold leading-snug",
              unread && "font-black",
              stacked && "text-[12px]"
            )}
            style={{ color: ink }}
          >
            {n.title}
          </p>
          <span
            className="shrink-0 text-[10px] font-medium"
            style={{ color: muted }}
          >
            {formatWhen(n.createdAt)}
          </span>
        </div>
      ) : null}
      <p
        className={cn(
          "text-[12px] font-medium leading-snug",
          showMeta && "mt-1"
        )}
        style={{ color: muted }}
      >
        {closed && n.messageText ? n.messageText : n.body}
      </p>
      {closed && n.messageText ? (
        <p className="mt-1 text-[10px] font-semibold" style={{ color: muted }}>
          Job finished. Full message.
        </p>
      ) : null}
      {historyClosed && !closed && n.category === "requests" ? (
        <p className="mt-1 text-[10px] font-semibold" style={{ color: muted }}>
          Job {n.jobStatus?.replace(/_/g, " ") || "closed"}. Link unavailable.
        </p>
      ) : null}

      <div className="mt-2.5 flex flex-wrap gap-2">
        {n.actionType === "open_chat" || n.category === "messages" ? (
          <ActionBtn
            label={navBlocked ? "View" : "Open chat"}
            read={!unread}
            isLight={isLight}
            onClick={go}
          />
        ) : null}
        {n.actionType === "accept_request" ? (
          <ActionBtn
            label={
              navBlocked
                ? "View"
                : accountType === "professional"
                  ? "View request"
                  : "View"
            }
            read={!unread}
            isLight={isLight}
            onClick={go}
          />
        ) : null}
        {n.actionType === "view_tracking" ? (
          <ActionBtn
            label={navBlocked ? "View" : "Track"}
            read={!unread}
            isLight={isLight}
            onClick={go}
          />
        ) : null}
        {n.actionType === "open_job" ||
        (n.category === "requests" && n.actionType !== "accept_request") ||
        (n.category === "payments" && releasePay) ? (
          <ActionBtn
            label={
              releasePay
                ? "Confirm Job & Release Payment"
                : navBlocked
                  ? "View"
                  : "View job"
            }
            read={!unread}
            isLight={isLight}
            onClick={go}
          />
        ) : null}
        {n.actionType === "view_payment" && !releasePay ? (
          <ActionBtn
            label="Payments"
            read={!unread}
            isLight={isLight}
            onClick={go}
          />
        ) : null}
        {n.actionType === "rate" ? (
          <ActionBtn
            label="Rate"
            read={!unread}
            isLight={isLight}
            onClick={go}
          />
        ) : null}
        {!n.actionType && n.href ? (
          <ActionBtn
            label={navBlocked ? "View" : "Open"}
            read={!unread}
            isLight={isLight}
            onClick={go}
          />
        ) : null}
      </div>
    </div>
  );
}
