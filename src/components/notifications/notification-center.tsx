"use client";

/**
 * NotificationCenter — icon filter tabs, gated job/chat/payment open,
 * soft light chrome, near-square cards.
 * Light theme accents: Message orange #FF6B35. Dark: copper #C5A46E.
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
  isJobFinishedStatus,
  isNavigationBlocked,
  type AppNotification,
  type NotificationFilter,
} from "@/lib/notifications/types";
import { useNotifications } from "@/components/notifications/notification-provider";
import { ExpiredDialog } from "@/components/ui/expired-dialog";
import {
  CONVERSATION_ENDED_MESSAGE,
  JOB_CLOSED_MESSAGE,
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

  /** Notifications accent — always Message orange */
  const accent = MESSAGE_ORANGE;

  const stage = isLight ? "#c8c9cd" : "#0a0a0a";
  // Light: blend with sheet (not pure white). Dark: charcoal card.
  const card = isLight ? "#d4d5d9" : CHARCOAL;
  const searchBg = isLight ? "#bebfc4" : "rgba(255,255,255,0.08)";
  const ink = isLight ? "#1a1b1e" : "#ffffff";
  const muted = isLight ? "#5c6370" : "rgba(255,255,255,0.65)";

  const grouped = useMemo(
    () => groupNotifications(filtered),
    [filtered]
  );

  if (!centerOpen) return null;

  const showBlock = (n: AppNotification, msg: string) => {
    setBlockMsg(msg || CONVERSATION_ENDED_MESSAGE);
    // 4C: View → read-only chat, or process summary for jobs
    const tid = messageThreadIdFromHref(n.href);
    if (tid) {
      setViewHref(readOnlyChatHref(String(tid)));
      return;
    }
    const jid = n.jobId || null;
    if (
      jid &&
      (n.category === "messages" ||
        n.actionType === "open_chat" ||
        n.category === "requests" ||
        n.actionType === "open_job" ||
        n.actionType === "view_tracking" ||
        n.actionType === "accept_request")
    ) {
      setViewHref(`/requests/${jid}`);
      return;
    }
    if (n.href?.includes("/jobs/")) {
      const id = n.href.split("/jobs/")[1]?.split("?")[0];
      if (id) {
        setViewHref(`/requests/${id}`);
        return;
      }
    }
    if (n.href?.includes("/requests/")) {
      setViewHref(n.href);
      return;
    }
    setViewHref(null);
  };

  const runAction = async (n: AppNotification) => {
    void markRead([n.id]);

    // Rate after complete is always allowed (deep link to rate UI)
    if (n.actionType === "rate" && n.href) {
      closeCenter();
      router.push(n.href);
      return;
    }

    if (n.actionType === "none") {
      return;
    }

    // Resolve live job status when we have a real id
    let liveStatus = n.jobStatus || null;
    const jobKey = n.jobId || null;
    if (jobKey && !String(jobKey).startsWith("demo-")) {
      try {
        const res = await apiGetJob(jobKey);
        if (res.ok && res.data?.job?.status) {
          liveStatus = res.data.job.status;
        }
      } catch {
        /* use stored status */
      }
    }

    // Always gate finished / demo / closed — show popup, never live navigate
    if (isNavigationBlocked(n, liveStatus) || isJobFinishedStatus(liveStatus) || isJobFinishedStatus(n.jobStatus)) {
      showBlock(n, blockedActionMessage(n, liveStatus));
      return;
    }

    // No href and blocked types — still popup rather than no-op silence
    if (!n.href) {
      if (
        n.actionType === "open_chat" ||
        n.actionType === "open_job" ||
        n.category === "messages" ||
        n.category === "requests"
      ) {
        showBlock(n, blockedActionMessage(n, liveStatus));
      }
      return;
    }

    // Payments tied to finished escrow
    if (n.actionType === "view_payment" && n.jobId && isJobFinishedStatus(liveStatus)) {
      showBlock(n, blockedActionMessage(n, liveStatus));
      return;
    }

    // Sensitive deep links without confirmed live status + demo
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
        className="absolute inset-0 border-0 transition-opacity duration-200"
        style={{ backgroundColor: isLight ? "#00000055" : "#00000099" }}
        aria-label="Close notifications"
        onClick={closeCenter}
      />
      <div
        className="relative z-10 mt-auto flex h-[92%] max-h-full w-full flex-col animate-[om-sheet-up_0.28s_ease-out] sm:ml-auto sm:mt-0 sm:h-full sm:max-w-[400px]"
        style={{ backgroundColor: stage }}
      >
        {/* Header */}
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
          <button
            type="button"
            onClick={() => void markAllRead()}
            className="shrink-0 border-0 bg-transparent px-1 py-1.5 text-[12px] font-bold transition-opacity active:opacity-70"
            style={{ color: accent }}
          >
            Mark all as read
          </button>
        </div>

        {/* Search — blends with light sheet (not pure white) */}
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

        {/* Icon filters — equal width, one row, no side scroll, no chip fills */}
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
                  className="flex h-10 w-full items-center justify-center border-0 bg-transparent transition-colors"
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

        {/* List */}
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

          <ul className="space-y-2">
            {grouped.map((item) => {
              if (isGroup(item)) {
                const open = expanded[item.key];
                const head = item.head;
                const high = isHighPriority(head.priority);
                return (
                  <li
                    key={item.key}
                    className="overflow-hidden rounded-md"
                    style={{ backgroundColor: card }}
                  >
                    <div className="flex gap-0">
                      {high ? (
                        <div
                          className="w-1 shrink-0 self-stretch"
                          style={{ backgroundColor: accent }}
                        />
                      ) : null}
                      <div className="min-w-0 flex-1 px-3 py-3">
                        <div className="flex items-start justify-between gap-2">
                          <p
                            className="text-[13px] font-bold leading-snug"
                            style={{ color: ink }}
                          >
                            {head.title}
                            {item.unread > 0 ? (
                              <span
                                className="ml-1.5 inline-flex min-w-[1.15rem] items-center justify-center rounded-sm px-1 text-[9px] font-bold text-white"
                                style={{ backgroundColor: accent }}
                              >
                                {item.unread}
                              </span>
                            ) : null}
                          </p>
                          <span
                            className="shrink-0 text-[10px] font-medium"
                            style={{ color: muted }}
                          >
                            {formatWhen(head.createdAt)}
                          </span>
                        </div>
                        <p
                          className="mt-1 text-[12px] font-medium leading-snug"
                          style={{ color: muted }}
                        >
                          {item.items.length} updates · {head.body}
                        </p>
                        <button
                          type="button"
                          className="mt-2 border-0 bg-transparent p-0 text-[12px] font-bold"
                          style={{ color: accent }}
                          onClick={() =>
                            setExpanded((e) => ({
                              ...e,
                              [item.key]: !open,
                            }))
                          }
                        >
                          {open ? "Hide updates" : "View updates"}
                        </button>
                        {open ? (
                          <ul className="mt-2 space-y-2">
                            {item.items.map((n) => (
                              <NotificationCardBody
                                key={n.id}
                                n={n}
                                ink={ink}
                                muted={muted}
                                accent={accent}
                                isLight={isLight}
                                accountType={accountType}
                                onAction={() => void runAction(n)}
                                onRead={() => void markRead([n.id])}
                              />
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    </div>
                  </li>
                );
              }

              const n = item;
              const high = isHighPriority(n.priority);
              return (
                <li
                  key={n.id}
                  className="overflow-hidden rounded-md"
                  style={{ backgroundColor: card }}
                >
                  <div className="flex gap-0">
                    {high ? (
                      <div
                        className="w-1 shrink-0 self-stretch"
                        style={{ backgroundColor: accent }}
                      />
                    ) : null}
                    <div className="min-w-0 flex-1 px-3 py-3">
                      <NotificationCardBody
                        n={n}
                        ink={ink}
                        muted={muted}
                        accent={accent}
                        isLight={isLight}
                        accountType={accountType}
                        showMeta
                        onAction={() => void runAction(n)}
                        onRead={() => void markRead([n.id])}
                      />
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
          // View only for job-closed (not conversation ended)
          onView={
            blockMsg === JOB_CLOSED_MESSAGE && viewHref
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
  accent,
  isLight,
  accountType,
  showMeta,
  onAction,
  onRead,
}: {
  n: AppNotification;
  ink: string;
  muted: string;
  accent: string;
  isLight: boolean;
  accountType: string | null;
  showMeta?: boolean;
  onAction: () => void;
  onRead: () => void;
}) {
  const closed = isChatClosedForNotification(n);
  const unread = !n.readAt;
  const finished = isJobFinishedStatus(n.jobStatus);
  const navBlocked = isNavigationBlocked(n) || closed || finished;

  return (
    <div>
      {showMeta ? (
        <div className="flex items-start justify-between gap-2">
          <p
            className={cn(
              "text-[13px] font-bold leading-snug",
              unread && "font-black"
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
      {finished && !closed && n.category === "requests" ? (
        <p className="mt-1 text-[10px] font-semibold" style={{ color: muted }}>
          Job {n.jobStatus?.replace(/_/g, " ") || "closed"}. Link unavailable.
        </p>
      ) : null}

      <div className="mt-2.5 flex flex-wrap gap-2">
        {/* Always show primary action — blocked → popup (not silent hide) */}
        {n.actionType === "open_chat" || n.category === "messages" ? (
          <SolidBtn
            label={navBlocked ? "View" : "Open chat"}
            accent={accent}
            onClick={() => {
              onRead();
              onAction();
            }}
          />
        ) : null}
        {n.actionType === "accept_request" ? (
          <SolidBtn
            label={
              navBlocked
                ? "View"
                : accountType === "professional"
                  ? "View request"
                  : "View"
            }
            accent={accent}
            onClick={() => {
              onRead();
              onAction();
            }}
          />
        ) : null}
        {n.actionType === "view_tracking" ? (
          <SolidBtn
            label={navBlocked ? "View" : "Track"}
            accent={accent}
            onClick={() => {
              onRead();
              onAction();
            }}
          />
        ) : null}
        {n.actionType === "open_job" ||
        (n.category === "requests" && n.actionType !== "accept_request") ? (
          <SolidBtn
            label={navBlocked ? "View" : "View job"}
            accent={accent}
            onClick={() => {
              onRead();
              onAction();
            }}
          />
        ) : null}
        {n.actionType === "view_payment" ? (
          <SolidBtn
            label="Payments"
            accent={accent}
            onClick={() => {
              onRead();
              onAction();
            }}
          />
        ) : null}
        {n.actionType === "rate" ? (
          <SolidBtn
            label="Rate"
            accent={accent}
            onClick={() => {
              onRead();
              onAction();
            }}
          />
        ) : null}
        {/* Generic href-only cards */}
        {!n.actionType && n.href ? (
          <SolidBtn
            label={navBlocked ? "View" : "Open"}
            accent={accent}
            onClick={() => {
              onRead();
              onAction();
            }}
          />
        ) : null}
        {unread ? (
          <SolidBtn label="Mark read" onClick={onRead} isLight={isLight} />
        ) : null}
      </div>
    </div>
  );
}

function SolidBtn({
  label,
  onClick,
  accent,
  isLight,
}: {
  label: string;
  onClick: () => void;
  accent?: string;
  isLight?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-8 rounded-md border-0 px-3 text-[11px] font-bold transition-opacity active:opacity-80"
      style={
        accent
          ? { backgroundColor: accent, color: "#ffffff" }
          : {
              backgroundColor: isLight ? "#bebfc4" : "#2c2c2e",
              color: isLight ? "#1a1b1e" : "#ffffff",
            }
      }
    >
      {label}
    </button>
  );
}
