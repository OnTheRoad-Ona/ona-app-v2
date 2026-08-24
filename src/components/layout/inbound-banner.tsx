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

type Banner = {
  kind: "message";
  id: string;
  title: string;
  body: string;
  href: string;
  who: string;
} | null;

/**
 * Anchors survive a reload: store the per-thread "already seen" timestamps in
 * sessionStorage (keyed by role) so a fresh page load re-seeds from what was
 * absorbed before and old chat history can never replay as popups.
 */
const SEEN_ANCHORS_KEY = "ona-inbound-seen-anchors";

function loadSeenAnchors(role: string): Record<string, string> {
  try {
    const raw = window.sessionStorage.getItem(SEEN_ANCHORS_KEY);
    if (!raw) return {};
    const all = JSON.parse(raw) as Record<string, Record<string, string>>;
    return all[role] || {};
  } catch {
    return {};
  }
}

function saveSeenAnchors(role: string, maps: Map<string, string>): void {
  try {
    const raw = window.sessionStorage.getItem(SEEN_ANCHORS_KEY);
    const all = raw
      ? (JSON.parse(raw) as Record<string, Record<string, string>>)
      : {};
    all[role] = Object.fromEntries(maps);
    window.sessionStorage.setItem(SEEN_ANCHORS_KEY, JSON.stringify(all));
  } catch {
    /* private mode */
  }
}

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
  const hideTimer = useRef<number | null>(null);
  /** Identity (userId|role) the anchors below were seeded for changing roles
   * or accounts must re-seed so the other role's history never re-pops. */
  const primedFor = useRef<string>("");
  /** Per-thread latest inbound message timestamp already absorbed/surfaced. */
  const anchors = useRef<Map<string, string>>(new Map());

  // Initial chat pull so inbound detection has a baseline quickly
  useEffect(() => {
    if (!isAuthenticated || !backendUserId || !accountType) return;
    const first = window.setTimeout(() => refreshCloudChats(), 1_500);
    const onVis = () => {
      if (!document.hidden) refreshCloudChats();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearTimeout(first);
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
    // Top banners auto-hide after 3s
    hideTimer.current = window.setTimeout(() => setBanner(null), 3_000);
  }, []);

  // Detect new inbound messages → tone + system notify + in-app banner.
  // Anchored per thread: history loaded at any time (reload, role switch,
  // refresh re-ordering) only seeds the anchor it never re-pops. Only a
  // message NEWER than what we've already absorbed, on an ACTIVE job chat,
  // surfaces. Closed / historical job chats never pop, even when the linked
  // job isn't in the recent live request list.
  useEffect(() => {
    if (!backendUserId || !accountType || !messages.length) return;

    const identity = `${backendUserId}|${accountType}`;
    if (primedFor.current !== identity) {
      primedFor.current = identity;
      // Re-seed from what this role already absorbed before the reload old
      // chat history stays silent no matter how fast/slow the first fetch is.
      anchors.current = new Map(Object.entries(loadSeenAnchors(accountType)));
    }

    type Inbound = {
      at: string;
      who: string;
      text: string;
      threadId: string;
      name: string;
    };

    const inboundByThread = new Map<string, Inbound>();
    for (const th of messages) {
      // Chat only with a real request no orphan threads
      if (!th.requestId || th.requestId.startsWith("chat-")) continue;
      for (const m of th.messages) {
        if (m.sender === "system") continue;
        const mine =
          (accountType === "professional" && m.sender === "professional") ||
          (accountType === "motorist" && m.sender === "motorist");
        if (mine) continue;
        const prev = inboundByThread.get(th.id);
        if (!prev || m.at > prev.at) {
          inboundByThread.set(th.id, {
            at: m.at,
            who:
              m.sender === "professional"
                ? th.technicianId || th.technicianName
                : th.motoristName,
            name:
              m.sender === "professional" ? th.technicianName : th.motoristName,
            text: m.text || "New message",
            threadId: th.id,
          });
        }
      }
    }

    // First sighting of a thread = history. Seed it and stay silent. Only a
    // strictly newer message than the seed can ever pop.
    const candidates: Inbound[] = [];
    for (const inbound of inboundByThread.values()) {
      const prev = anchors.current.get(inbound.threadId);
      if (prev == null) {
        anchors.current.set(inbound.threadId, inbound.at);
        continue;
      }
      if (inbound.at <= prev) continue;
      // Closed / historical job chat never pop. The job must be live and
      // present in the recent request list, else it's old history.
      const thread = messages.find((t) => t.id === inbound.threadId);
      const job = thread
        ? requests.find((r) => r.id === thread.requestId)
        : undefined;
      if (!job) continue; // job status not loaded yet → hold for a later run
      if (CHAT_CLOSED_JOB_STATUSES.has(job.status)) {
        anchors.current.set(inbound.threadId, inbound.at);
        continue;
      }
      candidates.push(inbound);
    }
    // Absorb everything whose job status is known so identical data never
    // re-fires; unknown-status threads stay pending until their job loads.
    for (const inbound of inboundByThread.values()) {
      const prev = anchors.current.get(inbound.threadId) ?? "";
      if (inbound.at <= prev) continue;
      const thread = messages.find((t) => t.id === inbound.threadId);
      const job = thread
        ? requests.find((r) => r.id === thread.requestId)
        : undefined;
      if (job) anchors.current.set(inbound.threadId, inbound.at);
    }
    saveSeenAnchors(accountType, anchors.current);

    if (!candidates.length) return;
    const latest = candidates.reduce((a, b) => (b.at > a.at ? b : a));

    // Already viewing this thread soft tone only
    const onThisThread =
      pathname === `/messages/${latest.threadId}` ||
      pathname.startsWith(`/messages/${latest.threadId}`);

    playPersonTone(latest.who, "message");
    vibrateMessagePattern();

    if (!onThisThread) {
      showBanner({
        kind: "message",
        id: latest.threadId,
        title: latest.name || "New message",
        body: latest.text.slice(0, 120),
        href: `/messages/${latest.threadId}`,
        who: latest.who,
      });
      if (canNotify()) {
        showAppNotification({
          title: latest.name || "Ona",
          body: latest.text.slice(0, 140),
          tag: `msg-${latest.threadId}`,
          href: `/messages/${latest.threadId}`,
        });
      } else {
        void ensureNotifyPermission().then((p) => {
          if (p === "granted") {
            showAppNotification({
              title: latest.name || "Ona",
              body: latest.text.slice(0, 140),
              tag: `msg-${latest.threadId}`,
              href: `/messages/${latest.threadId}`,
            });
          }
        });
      }
    }
  }, [messages, requests, backendUserId, accountType, pathname, showBanner]);

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
            : "border-white/15 bg-[#1a1210]/95 text-white",
        )}
      >
        <span
          className={cn(
            "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
            banner.kind === "message"
              ? "bg-brand/20 text-brand"
              : "bg-emerald-500/20 text-emerald-400",
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
              isLight ? "text-slate-600" : "text-white/65",
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
            isLight ? "text-slate-400" : "text-white/45",
          )}
        >
          <X className="h-3.5 w-3.5" />
        </span>
      </button>
    </div>
  );
}
