"use client";

/**
 * Notification context — list, unread, toasts, center open state.
 * Loads API + samples; Supabase Realtime for live inserts.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  AppNotification,
  NotificationFilter,
} from "@/lib/notifications/types";
import {
  shouldListNotification,
  shouldToastNotification,
} from "@/lib/notifications/types";
import { shouldShowToast } from "@/lib/notifications/quiet-hours";
import {
  TOAST_MAX_STACK,
  TOAST_VISIBLE_MS,
  canAutoShowToast,
} from "@/lib/notifications/toast-timing";
import { useApp } from "@/lib/store";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { playAppSound } from "@/lib/sound-tone";

export type ToastItem = {
  id: string;
  notification: AppNotification;
  expiresAt: number;
};

type Ctx = {
  notifications: AppNotification[];
  unreadCount: number;
  loading: boolean;
  centerOpen: boolean;
  openCenter: () => void;
  closeCenter: () => void;
  filter: NotificationFilter;
  setFilter: (f: NotificationFilter) => void;
  search: string;
  setSearch: (q: string) => void;
  toasts: ToastItem[];
  dismissToast: (id: string) => void;
  markRead: (ids: string[]) => Promise<void>;
  markAllRead: () => Promise<void>;
  refresh: () => Promise<void>;
  filtered: AppNotification[];
  /** Demo: push a local notification (dev / QA) */
  pushLocal: (n: Omit<AppNotification, "id" | "userId" | "createdAt"> & {
    id?: string;
    createdAt?: string;
  }) => void;
};

const NotificationContext = createContext<Ctx | null>(null);

function mapRow(row: Record<string, unknown>): AppNotification {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    category: row.category as AppNotification["category"],
    priority: (row.priority as AppNotification["priority"]) || "normal",
    title: String(row.title || ""),
    body: String(row.body || ""),
    href: (row.href as string) || null,
    actionType: row.action_type as AppNotification["actionType"],
    actionPayload: (row.action_payload as Record<string, unknown>) || {},
    groupKey: (row.group_key as string) || null,
    jobId: (row.job_id as string) || null,
    jobStatus: (row.job_status as string) || null,
    messageText: (row.message_text as string) || null,
    readAt: (row.read_at as string) || null,
    createdAt: String(row.created_at || new Date().toISOString()),
  };
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { backendUserId, accountType, isAuthenticated } = useApp();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [centerOpen, setCenterOpen] = useState(false);
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const [search, setSearch] = useState("");
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const primed = useRef(false);
  const knownIds = useRef<Set<string>>(new Set());
  /** Start of current/last auto-toast wave (throttle + pile window). */
  const lastToastWaveAt = useRef(0);
  /** Avoid double-toast for same notification id. */
  const toastedIds = useRef<Set<string>>(new Set());

  const role =
    accountType === "professional" ? "professional" : "motorist";

  const pushToast = useCallback((n: AppNotification) => {
    if (!shouldToastNotification(n)) return;
    if (!shouldShowToast(n.priority)) return;
    // Never re-toast the same notification row
    if (toastedIds.current.has(n.id)) return;

    const now = Date.now();
    const gate = canAutoShowToast(lastToastWaveAt.current, now);
    if (!gate.allow) {
      // Still land in center list (caller may have added it) — no popup spam
      return;
    }

    if (gate.reason === "new_wave") {
      lastToastWaveAt.current = now;
    }

    toastedIds.current.add(n.id);
    const isMessage = n.category === "messages" || n.actionType === "open_chat";
    const id = `toast-${n.id}-${now}`;
    // Each toast (and pile in same wave) expires after TOAST_VISIBLE_MS (3s)
    const waveStart =
      gate.reason === "pile" && lastToastWaveAt.current > 0
        ? lastToastWaveAt.current
        : now;
    const expiresAt = waveStart + TOAST_VISIBLE_MS;

    setToasts((prev) =>
      [
        {
          id,
          notification: n,
          expiresAt,
        },
        ...prev,
      ].slice(0, TOAST_MAX_STACK)
    );
    if (isMessage) {
      playAppSound("success_soft");
    } else if (n.priority === "critical" || n.priority === "high") {
      playAppSound("request_new");
    } else {
      playAppSound("success_soft");
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!backendUserId || !isAuthenticated) {
      setNotifications([]);
      return;
    }
    // Only show loading on first prime — avoids list flicker on poll/realtime
    if (!primed.current) setLoading(true);
    try {
      const { authFetch } = await import("@/lib/api-auth-headers");
      const res = await authFetch(
        `/api/notifications?userId=${encodeURIComponent(backendUserId)}`,
        { cache: "default" }
      );
      const json = await res.json();
      if (json?.ok && Array.isArray(json.data?.notifications)) {
        const list = json.data.notifications as AppNotification[];
        const surface = list.filter(shouldListNotification);
        setNotifications(surface);
        if (!primed.current) {
          knownIds.current = new Set(list.map((n) => n.id));
          primed.current = true;
        }
      } else {
        setNotifications([]);
      }
    } catch {
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }, [backendUserId, isAuthenticated, role]);

  useEffect(() => {
    primed.current = false;
    knownIds.current = new Set();
    toastedIds.current = new Set();
    lastToastWaveAt.current = 0;
    setToasts([]);
    void refresh();
    // Depend on session identity only — not `refresh` fn identity (avoids fetch storms)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backendUserId, isAuthenticated, role]);

  // Poll backup every 10 min when visible (Realtime is primary — data saver)
  useEffect(() => {
    if (!backendUserId || !isAuthenticated) return;
    const t = window.setInterval(() => {
      if (document.hidden) return;
      void refresh();
    }, 600_000);
    return () => window.clearInterval(t);
  }, [backendUserId, isAuthenticated, refresh]);

  // Realtime inserts
  useEffect(() => {
    if (!backendUserId || !isAuthenticated) return;
    let sb: ReturnType<typeof createBrowserSupabase> | null = null;
    try {
      sb = createBrowserSupabase();
    } catch {
      return;
    }
    if (!sb) return;
    const channel = sb
      .channel(`om-notif-${backendUserId}-${Math.random().toString(36).slice(2, 8)}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${backendUserId}`,
        },
        (payload: { new?: Record<string, unknown> }) => {
          const row = payload.new;
          if (!row?.id) return;
          const n = mapRow(row);
          if (knownIds.current.has(n.id)) return;
          knownIds.current.add(n.id);
          if (shouldListNotification(n)) {
            setNotifications((prev) => [n, ...prev]);
          }
          pushToast(n);
          // Force customer onto release-pay job page (not toast-only)
          try {
            const st = String(n.jobStatus || "").toLowerCase();
            const href = n.href || (n.jobId ? `/jobs/${n.jobId}` : "");
            const releasePay =
              st === "completed" &&
              href.includes("/jobs/") &&
              (n.actionType === "open_job" ||
                n.actionType === "view_payment" ||
                n.category === "payments");
            if (
              releasePay &&
              typeof window !== "undefined" &&
              !window.location.pathname.includes(
                `/jobs/${n.jobId || href.split("/jobs/")[1]?.split("?")[0] || ""}`
              )
            ) {
              window.location.assign(href.startsWith("/") ? href : `/${href}`);
            }
          } catch {
            /* soft navigate optional */
          }
        }
      )
      .subscribe();
    return () => {
      void sb.removeChannel(channel);
    };
  }, [backendUserId, isAuthenticated, pushToast]);

  // Auto-dismiss after 3s (poll often so hide is on-time)
  useEffect(() => {
    const t = window.setInterval(() => {
      const now = Date.now();
      setToasts((prev) => {
        const next = prev.filter((x) => x.expiresAt > now);
        return next.length === prev.length ? prev : next;
      });
    }, 250);
    return () => window.clearInterval(t);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const markRead = useCallback(
    async (ids: string[]) => {
      if (!ids.length) return;
      setNotifications((prev) =>
        prev.map((n) =>
          ids.includes(n.id)
            ? { ...n, readAt: n.readAt || new Date().toISOString() }
            : n
        )
      );
      if (!backendUserId) return;
      if (ids.every((id) => id.startsWith("local-"))) return;
      const { authFetch } = await import("@/lib/api-auth-headers");
      await authFetch("/api/notifications/read", {
        method: "POST",
        body: JSON.stringify({ userId: backendUserId, ids }),
      }).catch(() => null);
    },
    [backendUserId]
  );

  const markAllRead = useCallback(async () => {
    const now = new Date().toISOString();
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, readAt: n.readAt || now }))
    );
    if (!backendUserId) return;
    const { authFetch } = await import("@/lib/api-auth-headers");
    await authFetch("/api/notifications/read-all", {
      method: "POST",
      body: JSON.stringify({ userId: backendUserId }),
    }).catch(() => null);
  }, [backendUserId]);

  const pushLocal = useCallback(
    (
      partial: Omit<AppNotification, "id" | "userId" | "createdAt"> & {
        id?: string;
        createdAt?: string;
      }
    ) => {
      const n: AppNotification = {
        id: partial.id || `local-${Date.now()}`,
        userId: backendUserId || "local",
        createdAt: partial.createdAt || new Date().toISOString(),
        category: partial.category,
        priority: partial.priority,
        title: partial.title,
        body: partial.body,
        href: partial.href,
        actionType: partial.actionType,
        actionPayload: partial.actionPayload,
        groupKey: partial.groupKey,
        jobId: partial.jobId,
        jobStatus: partial.jobStatus,
        messageText: partial.messageText,
        readAt: partial.readAt,
      };
      if (shouldListNotification(n)) {
        setNotifications((prev) => [n, ...prev]);
      }
      knownIds.current.add(n.id);
      pushToast(n);
    },
    [backendUserId, pushToast]
  );

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.readAt).length,
    [notifications]
  );

  const filtered = useMemo(() => {
    let list = notifications;
    if (filter !== "all") {
      list = list.filter((n) => n.category === filter);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (n) =>
          n.title.toLowerCase().includes(q) ||
          n.body.toLowerCase().includes(q) ||
          (n.messageText || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [notifications, filter, search]);

  const value = useMemo<Ctx>(
    () => ({
      notifications,
      unreadCount,
      loading,
      centerOpen,
      openCenter: () => setCenterOpen(true),
      closeCenter: () => setCenterOpen(false),
      filter,
      setFilter,
      search,
      setSearch,
      toasts,
      dismissToast,
      markRead,
      markAllRead,
      refresh,
      filtered,
      pushLocal,
    }),
    [
      notifications,
      unreadCount,
      loading,
      centerOpen,
      filter,
      search,
      toasts,
      dismissToast,
      markRead,
      markAllRead,
      refresh,
      filtered,
      pushLocal,
    ]
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications(): Ctx {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error(
      "useNotifications must be used within NotificationProvider"
    );
  }
  return ctx;
}

export function useNotificationsOptional(): Ctx | null {
  return useContext(NotificationContext);
}
