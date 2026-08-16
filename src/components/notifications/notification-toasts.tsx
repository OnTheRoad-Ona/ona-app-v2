"use client";

/**
 * In-app toasts — X-style layout:
 * 1) Stacked pile (top) — general updates only
 * 2) Full banners under the pile — chat, call, payment, request accept
 *    (never deck-stacked; newest first by time)
 */

import { createElement, useState } from "react";
import { useRouter } from "next/navigation";
import {
  MessageCircle,
  Phone,
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
import {
  isCallNotification,
  isChatNotification,
  isNonStackNotification,
  isPaymentNotification,
  isRequestAcceptNotification,
} from "@/lib/notifications/stack-rules";
import {
  clearJobShown,
  requestForceIncomingPanel,
} from "@/lib/jobs/incoming-popup-timing";
import { useNotificationsOptional } from "@/components/notifications/notification-provider";
import type { ToastItem } from "@/components/notifications/notification-provider";
import { ExpiredDialog } from "@/components/ui/expired-dialog";
import {
  messageThreadIdFromHref,
  readOnlyChatHref,
} from "@/lib/chat-expired";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

function categoryIcon(n: AppNotification) {
  if (isCallNotification(n)) return Phone;
  if (isChatNotification(n)) return MessageCircle;
  if (isPaymentNotification(n)) return Wallet;
  if (isRequestAcceptNotification(n) || n.category === "requests") return Wrench;
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

function toastCreatedMs(t: ToastItem): number {
  const raw = t.notification.createdAt;
  const n = raw ? Date.parse(raw) : NaN;
  return Number.isFinite(n) ? n : 0;
}

function ToastCard({
  t,
  depth,
  stacked,
  accent,
  onTap,
  onSwipeDismiss,
}: {
  t: ToastItem;
  depth: number;
  stacked: boolean;
  accent: string;
  onTap: () => void;
  onSwipeDismiss?: () => void;
}) {
  const n = t.notification;
  const closed = isChatClosedForNotification(n);
  const iconType = categoryIcon(n);
  const scale = stacked && depth > 0 ? 1 - depth * 0.03 : 1;
  const y = stacked && depth > 0 ? depth * 6 : 0;
  const opacity = stacked && depth > 0 ? 1 - depth * 0.12 : 1;
  const showActions = !stacked || depth === 0;

  return (
    <div
      className={cn(
        "pointer-events-auto w-full",
        stacked
          ? depth === 0
            ? "relative animate-[om-toast-in_0.32s_cubic-bezier(0.2,0.8,0.2,1)]"
            : "absolute left-0 right-0 top-0"
          : "relative animate-[om-toast-in_0.32s_cubic-bezier(0.2,0.8,0.2,1)]"
      )}
      style={{
        zIndex: stacked ? 40 - depth : 50,
        transform:
          stacked && depth > 0
            ? `translateY(${y}px) scale(${scale})`
            : undefined,
        opacity,
        pointerEvents: stacked && depth > 0 ? "none" : "auto",
      }}
      onTouchStart={
        showActions && onSwipeDismiss
          ? (e) => {
              const y0 = e.touches[0]?.clientY ?? 0;
              const el = e.currentTarget;
              const move = (ev: TouchEvent) => {
                const dy = (ev.touches[0]?.clientY ?? y0) - y0;
                if (dy < -28) {
                  onSwipeDismiss();
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
            }
          : undefined
      }
    >
      <button
        type="button"
        className="w-full border-0 p-0 text-left"
        style={{ background: "transparent" }}
        onClick={onTap}
      >
        <div
          className="flex h-16 w-full items-center gap-2.5 rounded-xl px-3"
          style={{
            backgroundColor: "#F0F2F5",
            boxShadow: "0 8px 24px rgba(15,20,27,0.14)",
          }}
        >
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
            style={{ backgroundColor: accent }}
            aria-hidden
          >
            {createElement(iconType, {
              className: "h-5 w-5",
              style: { color: "#FFFFFF" },
              strokeWidth: 2,
            })}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-[13px] font-bold leading-tight tracking-[-0.01em] text-[#0F141B]">
                Ona
              </span>
              <span className="shrink-0 text-[11px] font-medium text-[#0F141B]/50">
                · now
              </span>
            </div>
            <p className="mt-0.5 truncate text-[13px] font-semibold leading-snug tracking-[-0.01em] text-[#0F141B]">
              {n.title}
            </p>
            <p className="mt-0.5 truncate text-[12px] font-normal leading-snug text-[#5B6572]">
              {closed && n.messageText ? n.messageText : n.body}
            </p>
          </div>
        </div>
      </button>
    </div>
  );
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

  const accent = MESSAGE_ORANGE;

  const safePush = (n: AppNotification, tId: string) => {
    void markRead([n.id]);
    dismissToast(tId);

    // Pro service request → dashboard + lower panel only (never full /jobs page)
    if (
      accountType === "professional" &&
      (n.actionType === "accept_request" ||
        (n.category === "requests" &&
          (n.groupKey || "").startsWith("service-request")))
    ) {
      if (n.jobId) {
        clearJobShown(n.jobId);
        requestForceIncomingPanel(n.jobId);
      }
      router.replace("/dashboard");
      return;
    }

    if (
      isReleasePayPendingStatus(n.jobStatus) ||
      (n.category === "payments" &&
        n.actionType === "open_job" &&
        n.href?.includes("/jobs/"))
    ) {
      const href = n.href || (n.jobId ? `/jobs/${n.jobId}` : null);
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

  // Order: ALL stacked pile first, then full rows below (newest first each)
  const stackable = visible
    .filter((t) => !isNonStackNotification(t.notification))
    .sort((a, b) => toastCreatedMs(b) - toastCreatedMs(a))
    .slice(0, 4);
  const fullRows = visible
    .filter((t) => isNonStackNotification(t.notification))
    .sort((a, b) => toastCreatedMs(b) - toastCreatedMs(a));

  if (!stackable.length && !fullRows.length && !expiredOpen) return null;

  const cardProps = {
    accent,
    accountType,
  };

  return (
    <>
      <div
        className="pointer-events-none absolute inset-x-0 top-2 z-[90] flex flex-col items-center px-4"
        aria-live="polite"
      >
        <div className="flex w-full max-w-[460px] flex-col gap-2">
          {/* 1) Stacked pile — general only */}
          {stackable.length > 0 ? (
            <div className="relative w-full">
              {stackable.map((t, index) => (
                <ToastCard
                  key={t.id}
                  t={t}
                  depth={index}
                  stacked
                  {...cardProps}
                  onTap={() => safePush(t.notification, t.id)}
                  onSwipeDismiss={() => dismissToast(t.id)}
                />
              ))}
              {stackable.length > 1 ? (
                <div
                  aria-hidden
                  style={{ height: Math.min(stackable.length - 1, 3) * 6 }}
                />
              ) : null}
            </div>
          ) : null}

          {/* 2) Full banners under pile — chat / call / payment / accept */}
          {fullRows.map((t) => (
            <ToastCard
              key={t.id}
              t={t}
              depth={0}
              stacked={false}
              {...cardProps}
              onTap={() => safePush(t.notification, t.id)}
              onSwipeDismiss={() => dismissToast(t.id)}
            />
          ))}
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
