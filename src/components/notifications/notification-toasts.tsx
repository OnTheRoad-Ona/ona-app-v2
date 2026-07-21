"use client";

/**
 * ToastNotification — top-center mobile, solid fills, copper/orange actions.
 * Auto-dismiss 5–6s; high/critical sticky until action.
 * Swipe up to dismiss. Never navigates for finished jobs / closed chats.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  MESSAGE_ORANGE,
  CONVERSATION_ENDED_MESSAGE,
  JOB_CLOSED_MESSAGE,
  blockedActionMessage,
  isChatClosedForNotification,
  isJobFinishedStatus,
  isNavigationBlocked,
  isStickyPriority,
  shouldToastNotification,
  CHARCOAL,
  SOFT_WHITE,
  type AppNotification,
} from "@/lib/notifications/types";
import { useNotificationsOptional } from "@/components/notifications/notification-provider";
import { ExpiredDialog } from "@/components/ui/expired-dialog";
import {
  messageThreadIdFromHref,
  readOnlyChatHref,
} from "@/lib/chat-expired";
import { useApp } from "@/lib/store";

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

  const solid = isLight ? SOFT_WHITE : CHARCOAL;
  const ink = isLight ? "#1a1b1e" : SOFT_WHITE;
  const muted = isLight ? "#6B7280" : "rgba(255,255,255,0.65)";
  const accent = MESSAGE_ORANGE;

  const safePush = (n: AppNotification, tId: string) => {
    void markRead([n.id]);
    dismissToast(tId);
    if (
      isNavigationBlocked(n) ||
      isChatClosedForNotification(n) ||
      isJobFinishedStatus(n.jobStatus)
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

  return (
    <>
    <div
      className="pointer-events-none absolute inset-x-0 top-2 z-[90] flex flex-col items-center gap-2 px-3 sm:items-end sm:pr-4"
      aria-live="polite"
    >
      {visible.map((t) => {
        const n = t.notification;
        const sticky = isStickyPriority(n.priority);
        const closed = isChatClosedForNotification(n);
        const finished = isJobFinishedStatus(n.jobStatus);
        const blocked =
          isNavigationBlocked(n) || closed || finished;

        return (
          <div
            key={t.id}
            className="pointer-events-auto w-full max-w-[360px] animate-[om-toast-in_0.28s_ease-out]"
            style={{ backgroundColor: solid }}
            onTouchStart={(e) => {
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
              el.addEventListener("touchmove", move, { passive: true });
              el.addEventListener("touchend", end);
            }}
          >
            <div className="flex gap-0">
              {sticky ? (
                <div
                  className="w-1 shrink-0 self-stretch"
                  style={{ backgroundColor: accent }}
                  aria-hidden
                />
              ) : null}
              <div className="min-w-0 flex-1 px-3.5 py-3">
                <div className="flex items-start justify-between gap-2">
                  <p
                    className="text-[13px] font-bold leading-snug"
                    style={{ color: ink }}
                  >
                    {n.title}
                  </p>
                  <button
                    type="button"
                    aria-label="Dismiss"
                    className="shrink-0 border-0 bg-transparent p-0 text-[11px] font-semibold"
                    style={{ color: muted }}
                    onClick={() => dismissToast(t.id)}
                  >
                    ✕
                  </button>
                </div>
                <p
                  className="mt-1 text-[12px] font-medium leading-snug"
                  style={{ color: muted }}
                >
                  {closed && n.messageText ? n.messageText : n.body}
                </p>
                <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1">
                  {n.actionType === "accept_request" ? (
                    <Action
                      label={
                        blocked
                          ? "View"
                          : accountType === "professional"
                            ? "View request"
                            : "View"
                      }
                      accent={accent}
                      onClick={() => safePush(n, t.id)}
                    />
                  ) : null}
                  {n.actionType === "open_chat" ? (
                    <Action
                      label={blocked ? "View" : "Open chat"}
                      accent={accent}
                      onClick={() => safePush(n, t.id)}
                    />
                  ) : null}
                  {n.actionType === "view_tracking" ? (
                    <Action
                      label={blocked ? "View" : "Track"}
                      accent={accent}
                      onClick={() => safePush(n, t.id)}
                    />
                  ) : null}
                  {n.actionType === "open_job" ||
                  (n.category === "requests" &&
                    n.actionType !== "accept_request" &&
                    n.actionType !== "view_tracking") ? (
                    <Action
                      label={blocked ? "View" : "View job"}
                      accent={accent}
                      onClick={() => safePush(n, t.id)}
                    />
                  ) : null}
                  {n.actionType === "view_payment" && !blocked ? (
                    <Action
                      label="Payments"
                      accent={accent}
                      onClick={() => {
                        void markRead([n.id]);
                        dismissToast(t.id);
                        router.push(n.href || "/payments/history");
                      }}
                    />
                  ) : null}
                  <button
                    type="button"
                    className="border-0 bg-transparent p-0 text-[11px] font-semibold"
                    style={{ color: muted }}
                    onClick={() => {
                      void markRead([n.id]);
                      dismissToast(t.id);
                      openCenter();
                    }}
                  >
                    Open center
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
    <ExpiredDialog
      open={expiredOpen}
      isLight={isLight}
      message={expiredMsg || JOB_CLOSED_MESSAGE}
      onClose={() => {
        setExpiredOpen(false);
        setViewHref(null);
      }}
      // View only for job-closed (not conversation ended)
      onView={
        expiredMsg === JOB_CLOSED_MESSAGE && viewHref
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

function Action({
  label,
  onClick,
  accent,
}: {
  label: string;
  onClick: () => void;
  accent: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="border-0 bg-transparent p-0 text-[11px] font-bold"
      style={{ color: accent }}
    >
      {label}
    </button>
  );
}
