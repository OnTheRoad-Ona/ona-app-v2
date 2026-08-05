"use client";

/**
 * In-app toasts — X-style top banners, inDrive pile as requests arrive.
 * Visible 3s then fully hide (provider).
 * Swipe up to dismiss. Never navigates for finished jobs / closed chats.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  MessageCircle,
  Wrench,
  Wallet,
  Info,
} from "lucide-react";
import {
  MESSAGE_ORANGE,
  CONVERSATION_ENDED_MESSAGE,
  JOB_CLOSED_MESSAGE,
  blockedActionMessage,
  isChatClosedForNotification,
  isJobHistoryClosedStatus,
  isNavigationBlocked,
  isReleasePayPendingStatus,
  shouldToastNotification,
  type AppNotification,
  type NotificationCategory,
} from "@/lib/notifications/types";
import { useNotificationsOptional } from "@/components/notifications/notification-provider";
import { ExpiredDialog } from "@/components/ui/expired-dialog";
import {
  messageThreadIdFromHref,
  readOnlyChatHref,
} from "@/lib/chat-expired";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

function categoryIcon(cat: NotificationCategory) {
  switch (cat) {
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

export function NotificationToasts() {
  const ctx = useNotificationsOptional();
  const { theme, accountType } = useApp();
  const router = useRouter();
  const isLight = theme === "light";
  const [expiredOpen, setExpiredOpen] = useState(false);
  const [expiredMsg, setExpiredMsg] = useState(CONVERSATION_ENDED_MESSAGE);
  const [viewHref, setViewHref] = useState<string | null>(null);
  if (!ctx) return null;
  const { toasts, dismissToast, markRead, openCenter } = ctx;

  const visible = toasts.filter((t) =>
    shouldToastNotification(t.notification)
  );

  // X-style: frosted dark/light surface, soft shadow, compact pill
  const solid = isLight
    ? "rgba(255,255,255,0.94)"
    : "rgba(28,28,30,0.94)";
  const ink = isLight ? "#0f1419" : "#e7e9ea";
  const muted = isLight ? "#536471" : "#71767b";
  const hairline = isLight
    ? "rgba(0,0,0,0.08)"
    : "rgba(255,255,255,0.08)";
  const accent = MESSAGE_ORANGE;
  const iconBg = isLight ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.08)";

  const safePush = (n: AppNotification, tId: string) => {
    void markRead([n.id]);
    dismissToast(tId);

    if (
      isReleasePayPendingStatus(n.jobStatus) ||
      (n.category === "payments" &&
        n.actionType === "open_job" &&
        n.href?.includes("/jobs/"))
    ) {
      const href =
        n.href || (n.jobId ? `/jobs/${n.jobId}` : null);
      if (href) {
        router.push(href);
        return;
      }
    }

    if (
      isNavigationBlocked(n) ||
      isChatClosedForNotification(n) ||
      isJobHistoryClosedStatus(n.jobStatus)
    ) {
      const tid = messageThreadIdFromHref(n.href);
      const jid =
        n.jobId && !String(n.jobId).startsWith("demo-") ? n.jobId : null;
      if (tid && !String(tid).startsWith("demo-")) {
        setViewHref(readOnlyChatHref(tid));
      } else if (jid) {
        setViewHref(`/requests/${jid}`);
      } else {
        setViewHref(null);
      }
      setExpiredMsg(blockedActionMessage(n));
      setExpiredOpen(true);
      return;
    }
    if (n.href) {
      router.push(n.href);
    } else {
      openCenter();
    }
  };

  if (!visible.length && !expiredOpen) return null;

  // Newest first; pile older cards behind with slight scale/offset (inDrive)
  const pile = visible.slice(0, 4);

  return (
    <>
      <div
        className="pointer-events-none absolute inset-x-0 top-2 z-[90] flex flex-col items-center px-3"
        aria-live="polite"
      >
        <div className="relative w-full max-w-[380px]">
          {pile.map((t, index) => {
            const n = t.notification;
            const closed = isChatClosedForNotification(n);
            const releasePay = isReleasePayPendingStatus(n.jobStatus);
            const historyClosed = isJobHistoryClosedStatus(n.jobStatus);
            const blocked =
              !releasePay &&
              (isNavigationBlocked(n) || closed || historyClosed);
            const Icon = categoryIcon(n.category);
            // index 0 = front; deeper cards sit slightly smaller / lower (pile)
            const depth = index;
            const scale = 1 - depth * 0.03;
            const y = depth * 6;
            const opacity = 1 - depth * 0.12;

            return (
              <div
                key={t.id}
                className={cn(
                  "pointer-events-auto w-full",
                  depth === 0
                    ? "relative animate-[om-toast-in_0.32s_cubic-bezier(0.2,0.8,0.2,1)]"
                    : "absolute left-0 right-0 top-0"
                )}
                style={{
                  zIndex: 40 - depth,
                  transform:
                    depth === 0
                      ? undefined
                      : `translateY(${y}px) scale(${scale})`,
                  opacity: depth === 0 ? 1 : opacity,
                  // Keep stacked cards from eating taps
                  pointerEvents: depth === 0 ? "auto" : "none",
                }}
                onTouchStart={
                  depth === 0
                    ? (e) => {
                        const y0 = e.touches[0]?.clientY ?? 0;
                        const el = e.currentTarget;
                        const move = (ev: TouchEvent) => {
                          const dy = (ev.touches[0]?.clientY ?? y0) - y0;
                          if (dy < -28) {
                            dismissToast(t.id);
                            cleanup();
                          }
                        };
                        const end = () => cleanup();
                        const cleanup = () => {
                          el.removeEventListener("touchmove", move);
                          el.removeEventListener("touchend", end);
                        };
                        el.addEventListener("touchmove", move, {
                          passive: true,
                        });
                        el.addEventListener("touchend", end);
                      }
                    : undefined
                }
              >
                <button
                  type="button"
                  className="w-full border-0 p-0 text-left"
                  style={{
                    background: "transparent",
                  }}
                  onClick={() => safePush(n, t.id)}
                >
                  <div
                    className="flex items-start gap-2.5 rounded-[18px] px-3 py-2.5 shadow-[0_8px_28px_rgba(0,0,0,0.18)] backdrop-blur-xl"
                    style={{
                      backgroundColor: solid,
                      boxShadow: isLight
                        ? "0 8px 28px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.06)"
                        : "0 8px 28px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.06)",
                      border: `0.5px solid ${hairline}`,
                    }}
                  >
                    <div
                      className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                      style={{ backgroundColor: iconBg }}
                      aria-hidden
                    >
                      <Icon
                        className="h-[18px] w-[18px]"
                        style={{
                          color:
                            n.priority === "critical" || n.priority === "high"
                              ? accent
                              : muted,
                        }}
                        strokeWidth={2}
                      />
                    </div>
                    <div className="min-w-0 flex-1 pt-0.5">
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
                          · now
                        </span>
                        {(n.priority === "critical" ||
                          n.priority === "high") && (
                          <Bell
                            className="ml-auto h-3 w-3 shrink-0"
                            style={{ color: accent }}
                            aria-hidden
                          />
                        )}
                      </div>
                      <p
                        className="mt-0.5 text-[13px] font-semibold leading-snug tracking-[-0.01em]"
                        style={{ color: ink }}
                      >
                        {n.title}
                      </p>
                      <p
                        className="mt-0.5 line-clamp-2 text-[12px] font-normal leading-snug"
                        style={{ color: muted }}
                      >
                        {closed && n.messageText ? n.messageText : n.body}
                      </p>
                      {depth === 0 ? (
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                          {n.actionType === "accept_request" ? (
                            <span
                              className="text-[11px] font-bold"
                              style={{ color: accent }}
                            >
                              {blocked
                                ? "View"
                                : accountType === "professional"
                                  ? "View request"
                                  : "View"}
                            </span>
                          ) : null}
                          {n.actionType === "open_chat" ? (
                            <span
                              className="text-[11px] font-bold"
                              style={{ color: accent }}
                            >
                              {blocked ? "View" : "Open chat"}
                            </span>
                          ) : null}
                          {n.actionType === "view_tracking" ? (
                            <span
                              className="text-[11px] font-bold"
                              style={{ color: accent }}
                            >
                              {blocked ? "View" : "Track"}
                            </span>
                          ) : null}
                          {n.actionType === "open_job" ||
                          (n.category === "requests" &&
                            n.actionType !== "accept_request" &&
                            n.actionType !== "view_tracking") ||
                          (n.category === "payments" && releasePay) ? (
                            <span
                              className="text-[11px] font-bold"
                              style={{ color: accent }}
                            >
                              {releasePay
                                ? "Confirm & release"
                                : blocked
                                  ? "View"
                                  : "View job"}
                            </span>
                          ) : null}
                          {n.actionType === "view_payment" && !releasePay ? (
                            <span
                              className="text-[11px] font-bold"
                              style={{ color: accent }}
                            >
                              Payments
                            </span>
                          ) : null}
                          {n.actionType === "rate" ? (
                            <span
                              className="text-[11px] font-bold"
                              style={{ color: accent }}
                            >
                              Rate
                            </span>
                          ) : null}
                          <span
                            role="button"
                            tabIndex={0}
                            className="text-[11px] font-semibold"
                            style={{ color: muted }}
                            onClick={(e) => {
                              e.stopPropagation();
                              void markRead([n.id]);
                              dismissToast(t.id);
                              openCenter();
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                e.stopPropagation();
                                void markRead([n.id]);
                                dismissToast(t.id);
                                openCenter();
                              }
                            }}
                          >
                            Open center
                          </span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </button>
              </div>
            );
          })}
          {/* Spacer so absolute pile cards don’t collapse layout height */}
          {pile.length > 1 ? (
            <div
              aria-hidden
              style={{ height: Math.min(pile.length - 1, 3) * 6 }}
            />
          ) : null}
        </div>
      </div>
      <ExpiredDialog
        open={expiredOpen}
        isLight={isLight}
        message={expiredMsg || JOB_CLOSED_MESSAGE}
        onClose={() => {
          setExpiredOpen(false);
          setViewHref(null);
        }}
        onView={
          viewHref
            ? () => {
                const href = viewHref;
                setExpiredOpen(false);
                setViewHref(null);
                router.push(href);
              }
            : undefined
        }
      />
    </>
  );
}
