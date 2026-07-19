"use client";

/**
 * ToastNotification — top-center mobile, solid fills, copper/orange actions.
 * Auto-dismiss 5–6s; high/critical sticky until action.
 * Swipe up to dismiss. Never navigates for finished jobs / closed chats.
 */

import { useRouter } from "next/navigation";
import {
  COPPER,
  MESSAGE_ORANGE,
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
import { useApp } from "@/lib/store";

export function NotificationToasts() {
  const ctx = useNotificationsOptional();
  const { theme, accountType } = useApp();
  const router = useRouter();
  const isLight = theme === "light";
  if (!ctx) return null;
  const { toasts, dismissToast, markRead, openCenter } = ctx;

  const visible = toasts.filter((t) =>
    shouldToastNotification(t.notification)
  );
  if (!visible.length) return null;

  const solid = isLight ? SOFT_WHITE : CHARCOAL;
  const ink = isLight ? "#1a1b1e" : SOFT_WHITE;
  const muted = isLight ? "#6B7280" : "rgba(255,255,255,0.65)";
  const accent = isLight ? MESSAGE_ORANGE : COPPER;

  const safePush = (n: AppNotification, tId: string) => {
    void markRead([n.id]);
    dismissToast(tId);
    if (isNavigationBlocked(n) || isChatClosedForNotification(n) || isJobFinishedStatus(n.jobStatus)) {
      openCenter();
      return;
    }
    if (n.href) {
      router.push(n.href);
    } else {
      openCenter();
    }
  };

  return (
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
                  {!blocked && n.actionType === "accept_request" ? (
                    <Action
                      label={
                        accountType === "professional"
                          ? "View request"
                          : "View"
                      }
                      accent={accent}
                      onClick={() => safePush(n, t.id)}
                    />
                  ) : null}
                  {!blocked && n.actionType === "open_chat" && n.href ? (
                    <Action
                      label="Open chat"
                      accent={accent}
                      onClick={() => safePush(n, t.id)}
                    />
                  ) : null}
                  {!blocked && n.actionType === "view_tracking" ? (
                    <Action
                      label="Track"
                      accent={accent}
                      onClick={() => safePush(n, t.id)}
                    />
                  ) : null}
                  {!blocked && n.actionType === "open_job" ? (
                    <Action
                      label="View job"
                      accent={accent}
                      onClick={() => safePush(n, t.id)}
                    />
                  ) : null}
                  {!blocked && n.actionType === "view_payment" ? (
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
