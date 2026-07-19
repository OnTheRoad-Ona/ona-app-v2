"use client";

/**
 * App-wide toast for new chat messages (and optional call hint).
 * Renders inside the phone shell so alerts appear on any screen.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { MessageCircle, Phone, X } from "lucide-react";
import {
  canNotify,
  ensureNotifyPermission,
  showAppNotification,
  vibrateMessagePattern,
} from "@/lib/app-notify";
import { CHAT_CLOSED_JOB_STATUSES } from "@/lib/notifications/types";
import { playPersonTone } from "@/lib/sound-tone";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

type Banner =
  | {
      kind: "message";
      id: string;
      title: string;
      body: string;
      href: string;
      who: string;
    }
  | null;

export function InboundBanner() {
  const {
    messages,
    requests,
    backendUserId,
    accountType,
    theme,
    refreshCloudChats,
    isAuthenticated,
  } = useApp();
  const isLight = theme === "light";
  const pathname = usePathname() || "";
  const router = useRouter();
  const [banner, setBanner] = useState<Banner>(null);
  const prevSig = useRef<string>("");
  const primed = useRef(false);
  const hideTimer = useRef<number | null>(null);

  // Chat sync backup (Realtime + open-thread poll handle active chat)
  useEffect(() => {
    if (!isAuthenticated || !backendUserId || !accountType) return;
    refreshCloudChats();
    const id = window.setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      refreshCloudChats();
    }, 60_000);
    const onVis = () => {
      if (!document.hidden) refreshCloudChats();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [isAuthenticated, backendUserId, accountType, refreshCloudChats]);

  // Ask notification permission after first user gesture (tap anywhere)
  useEffect(() => {
    if (!isAuthenticated) return;
    const once = () => {
      void ensureNotifyPermission();
      window.removeEventListener("pointerdown", once);
      window.removeEventListener("keydown", once);
    };
    window.addEventListener("pointerdown", once, { passive: true });
    window.addEventListener("keydown", once);
    return () => {
      window.removeEventListener("pointerdown", once);
      window.removeEventListener("keydown", once);
    };
  }, [isAuthenticated]);

  const showBanner = useCallback((b: NonNullable<Banner>) => {
    setBanner(b);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setBanner(null), 8000);
  }, []);

  // Detect new inbound messages → tone + system notify + in-app banner
  useEffect(() => {
    if (!backendUserId || !messages.length) return;

    let latest: {
      at: string;
      who: string;
      text: string;
      threadId: string;
      name: string;
    } | null = null;

    for (const th of messages) {
      // Closed job chats must never pop up as banners
      if (th.requestId) {
        const job = requests.find((r) => r.id === th.requestId);
        if (job && CHAT_CLOSED_JOB_STATUSES.has(job.status)) continue;
      }
      for (const m of th.messages) {
        if (m.sender === "system") continue;
        const mine =
          (accountType === "professional" && m.sender === "professional") ||
          (accountType === "motorist" && m.sender === "motorist");
        if (mine) continue;
        const who =
          m.sender === "professional"
            ? th.technicianId || th.technicianName
            : th.motoristName;
        const name =
          m.sender === "professional" ? th.technicianName : th.motoristName;
        if (!latest || m.at > latest.at) {
          latest = {
            at: m.at,
            who,
            text: m.text || "New message",
            threadId: th.id,
            name,
          };
        }
      }
    }

    if (!latest) return;
    const sig = `${latest.threadId}|${latest.at}|${latest.who}`;

    // Prime baseline so login / first load does not spam
    if (!primed.current) {
      primed.current = true;
      prevSig.current = sig;
      return;
    }
    if (sig === prevSig.current) return;
    prevSig.current = sig;

    // Already viewing this thread — soft tone only
    const onThisThread =
      pathname === `/messages/${latest.threadId}` ||
      pathname.startsWith(`/messages/${latest.threadId}`);

    playPersonTone(latest.who, "message");
    vibrateMessagePattern();

    if (!onThisThread) {
      showBanner({
        kind: "message",
        id: sig,
        title: latest.name || "New message",
        body: latest.text.slice(0, 120),
        href: `/messages/${latest.threadId}`,
        who: latest.who,
      });
      if (canNotify()) {
        showAppNotification({
          title: latest.name || "OgaMecho",
          body: latest.text.slice(0, 140),
          tag: `msg-${latest.threadId}`,
          href: `/messages/${latest.threadId}`,
        });
      } else {
        void ensureNotifyPermission().then((p) => {
          if (p === "granted") {
            showAppNotification({
              title: latest.name || "OgaMecho",
              body: latest.text.slice(0, 140),
              tag: `msg-${latest.threadId}`,
              href: `/messages/${latest.threadId}`,
            });
          }
        });
      }
    }
  }, [messages, backendUserId, accountType, pathname, showBanner]);

  if (!banner) return null;

  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 z-[190] flex justify-center px-3 pt-3"
      role="status"
      aria-live="polite"
    >
      <button
        type="button"
        onClick={() => {
          const href = banner.href;
          setBanner(null);
          router.push(href);
        }}
        className={cn(
          "pointer-events-auto flex w-full max-w-[360px] items-start gap-3 rounded-2xl border px-3 py-3 text-left shadow-lg backdrop-blur-md",
          isLight
            ? "border-black/10 bg-white/95 text-slate-900"
            : "border-white/15 bg-[#1a1210]/95 text-white"
        )}
      >
        <span
          className={cn(
            "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
            banner.kind === "message"
              ? "bg-brand/20 text-brand"
              : "bg-emerald-500/20 text-emerald-400"
          )}
        >
          {banner.kind === "message" ? (
            <MessageCircle className="h-4 w-4" />
          ) : (
            <Phone className="h-4 w-4" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-bold leading-tight">
            {banner.title}
          </span>
          <span
            className={cn(
              "mt-0.5 block line-clamp-2 text-[11px] leading-snug",
              isLight ? "text-slate-600" : "text-white/65"
            )}
          >
            {banner.body}
          </span>
        </span>
        <span
          role="presentation"
          onClick={(e) => {
            e.stopPropagation();
            setBanner(null);
          }}
          className={cn(
            "mt-0.5 shrink-0 rounded-full p-1",
            isLight ? "text-slate-400" : "text-white/45"
          )}
        >
          <X className="h-3.5 w-3.5" />
        </span>
      </button>
    </div>
  );
}
