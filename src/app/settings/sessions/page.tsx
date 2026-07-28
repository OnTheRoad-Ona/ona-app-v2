"use client";

/**
 * Login sessions & connected devices — customer + repair pro.
 * Lists active sessions from /api/sessions; can revoke other devices.
 */

import { useCallback, useEffect, useState } from "react";
import { MonitorSmartphone, Smartphone, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

type SessionRow = {
  id: string;
  device_label: string | null;
  user_agent: string | null;
  ip: string | null;
  last_seen_at: string | null;
  created_at: string | null;
};

function deviceHint(ua: string | null | undefined, label: string | null | undefined) {
  const s = `${label || ""} ${ua || ""}`.toLowerCase();
  if (/iphone|android|mobile|ipad/.test(s)) return "Mobile";
  if (/mac|windows|linux|chrome|safari|firefox|edge/.test(s)) return "Browser";
  return label?.trim() || "Device";
}

function shortUa(ua: string | null | undefined) {
  if (!ua) return "Unknown browser";
  const m = ua.match(/(Chrome|Firefox|Safari|Edg|OPR|SamsungBrowser)\/[\d.]+/i);
  if (m) return m[0].replace("Edg", "Edge").replace("OPR", "Opera");
  return ua.slice(0, 48) + (ua.length > 48 ? "…" : "");
}

export default function SettingsSessionsPage() {
  const { theme, backendUserId, isAuthenticated } = useApp();
  const isLight = theme === "light";
  const ink = isLight ? "text-slate-900" : "text-white";
  const muted = isLight ? "text-slate-600" : "text-white/60";

  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!backendUserId) {
      setSessions([]);
      setLoading(false);
      setErr(isAuthenticated ? "Account id missing" : "Sign in to manage sessions");
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(
        `/api/sessions?userId=${encodeURIComponent(backendUserId)}`,
        { credentials: "include" }
      );
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        data?: { sessions?: SessionRow[] };
        error?: { message?: string };
      } | null;
      if (!res.ok || json?.ok === false) {
        setErr(json?.error?.message || "Could not load sessions");
        setSessions([]);
      } else {
        setSessions(json?.data?.sessions || []);
      }
    } catch {
      setErr("Network error loading sessions");
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, [backendUserId, isAuthenticated]);

  useEffect(() => {
    void load();
  }, [load]);

  // Register this browser as a connected session (idempotent soft register)
  useEffect(() => {
    if (!backendUserId || !isAuthenticated) return;
    const key = `ona-session-reg:${backendUserId}`;
    try {
      if (sessionStorage.getItem(key) === "1") return;
    } catch {
      /* */
    }
    void fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        userId: backendUserId,
        deviceLabel: "This browser",
        userAgent:
          typeof navigator !== "undefined" ? navigator.userAgent : undefined,
      }),
    })
      .then(() => {
        try {
          sessionStorage.setItem(key, "1");
        } catch {
          /* */
        }
        void load();
      })
      .catch(() => undefined);
  }, [backendUserId, isAuthenticated, load]);

  async function revoke(id: string) {
    if (!backendUserId) return;
    setBusyId(id);
    setMsg(null);
    setErr(null);
    try {
      const res = await fetch(
        `/api/sessions?sessionId=${encodeURIComponent(id)}&userId=${encodeURIComponent(backendUserId)}`,
        { method: "DELETE", credentials: "include" }
      );
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: { message?: string };
      } | null;
      if (!res.ok || json?.ok === false) {
        setErr(json?.error?.message || "Could not sign out device");
      } else {
        setMsg("Device signed out");
        setSessions((prev) => prev.filter((s) => s.id !== id));
      }
    } catch {
      setErr("Network error");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div
      className={cn(
        "flex h-full flex-col",
        isLight ? "bg-[#c8c9cd]" : "bg-black"
      )}
    >
      <PageHeader
        title="Login sessions & devices"
        subtitle="Where you’re signed in"
        backHref="/settings/sections/security"
      />
      <div className="flex-1 space-y-2 overflow-y-auto px-3 pb-8 scrollbar-hide">
        <p className={cn("px-1 text-[12px] font-medium leading-snug", muted)}>
          Review browsers and phones using your account. Sign out any device you
          don’t recognise.
        </p>
        {err ? (
          <p className="rounded-md bg-red-500/10 px-3 py-2 text-[12px] font-semibold text-red-600">
            {err}
          </p>
        ) : null}
        {msg ? (
          <p className="rounded-md bg-emerald-500/10 px-3 py-2 text-[12px] font-semibold text-emerald-700">
            {msg}
          </p>
        ) : null}

        {loading ? (
          <p className={cn("px-1 py-4 text-[13px] font-medium", muted)}>
            Loading sessions…
          </p>
        ) : sessions.length === 0 ? (
          <p className={cn("px-1 py-4 text-[13px] font-medium", muted)}>
            No active sessions stored yet. Sign in again on a device to register
            it here.
          </p>
        ) : (
          <ul className="space-y-0.5">
            {sessions.map((s, i) => {
              const kind = deviceHint(s.user_agent, s.device_label);
              const Icon = kind === "Mobile" ? Smartphone : MonitorSmartphone;
              return (
                <li
                  key={s.id}
                  className={cn(
                    "flex items-start gap-2 px-2 py-3",
                    i === 0 ? "" : isLight ? "" : ""
                  )}
                >
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center">
                    <Icon className="h-4 w-4 text-brand" strokeWidth={2.2} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={cn("text-[13px] font-bold", ink)}>
                      {s.device_label || kind}
                    </p>
                    <p className={cn("mt-0.5 text-[11px] font-medium", muted)}>
                      {shortUa(s.user_agent)}
                      {s.ip ? ` · ${s.ip}` : ""}
                    </p>
                    <p className={cn("mt-0.5 text-[10px] font-medium", muted)}>
                      Last active{" "}
                      {s.last_seen_at
                        ? new Date(s.last_seen_at).toLocaleString()
                        : "—"}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={busyId === s.id}
                    onClick={() => void revoke(s.id)}
                    className={cn(
                      "flex shrink-0 items-center gap-1 rounded-md border-0 px-2 py-1.5 text-[11px] font-bold",
                      isLight
                        ? "bg-black/10 text-slate-800"
                        : "bg-white/10 text-white"
                    )}
                    aria-label="Sign out this device"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {busyId === s.id ? "…" : "Sign out"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
