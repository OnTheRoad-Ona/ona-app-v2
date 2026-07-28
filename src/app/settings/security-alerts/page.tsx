"use client";

/**
 * Security alerts — notify on new logins, password changes, and device events.
 * Customer + repair pro. Prefs local; alert feed local + optional sample.
 */

import { useEffect, useState } from "react";
import { BellRing, KeyRound, LogIn, ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

const PREFS_KEY = "ona-security-alerts-prefs-v1";
const FEED_KEY = "ona-security-alerts-feed-v1";

type Prefs = {
  newLogin: boolean;
  passwordChange: boolean;
  deviceChange: boolean;
  pushCopy: boolean;
};

const DEFAULT_PREFS: Prefs = {
  newLogin: true,
  passwordChange: true,
  deviceChange: true,
  pushCopy: true,
};

type AlertItem = {
  id: string;
  type: "login" | "password" | "device" | "other";
  title: string;
  body: string;
  at: string;
  read: boolean;
};

function loadPrefs(uid: string): Prefs {
  try {
    const raw = localStorage.getItem(`${PREFS_KEY}:${uid}`);
    if (!raw) return DEFAULT_PREFS;
    return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_PREFS;
  }
}

function loadFeed(uid: string): AlertItem[] {
  try {
    const raw = localStorage.getItem(`${FEED_KEY}:${uid}`);
    if (!raw) return [];
    const arr = JSON.parse(raw) as AlertItem[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveFeed(uid: string, items: AlertItem[]) {
  try {
    localStorage.setItem(`${FEED_KEY}:${uid}`, JSON.stringify(items.slice(0, 40)));
  } catch {
    /* */
  }
}

export default function SettingsSecurityAlertsPage() {
  const { theme, backendUserId, userProfile, isAuthenticated } = useApp();
  const isLight = theme === "light";
  const uid = backendUserId || userProfile?.email || "guest";
  const ink = isLight ? "text-slate-900" : "text-white";
  const muted = isLight ? "text-slate-600" : "text-white/60";

  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [feed, setFeed] = useState<AlertItem[]>([]);

  useEffect(() => {
    setPrefs(loadPrefs(uid));
    let items = loadFeed(uid);
    // Seed a helpful empty-state sample once for signed-in users
    if (items.length === 0 && isAuthenticated) {
      items = [
        {
          id: `seed-${Date.now()}`,
          type: "other",
          title: "Security alerts are on",
          body: "You’ll see new logins, password changes, and device sign-outs here.",
          at: new Date().toISOString(),
          read: false,
        },
      ];
      saveFeed(uid, items);
    }
    setFeed(items);
  }, [uid, isAuthenticated]);

  const setPref = (partial: Partial<Prefs>) => {
    setPrefs((p) => {
      const next = { ...p, ...partial };
      try {
        localStorage.setItem(`${PREFS_KEY}:${uid}`, JSON.stringify(next));
      } catch {
        /* */
      }
      return next;
    });
  };

  const markAllRead = () => {
    setFeed((prev) => {
      const next = prev.map((a) => ({ ...a, read: true }));
      saveFeed(uid, next);
      return next;
    });
  };

  const Toggle = ({
    on,
    onChange,
    label,
    detail,
  }: {
    on: boolean;
    onChange: (v: boolean) => void;
    label: string;
    detail: string;
  }) => (
    <div className="flex items-center justify-between gap-3 px-2 py-3">
      <div className="min-w-0">
        <p className={cn("text-[13px] font-bold", ink)}>{label}</p>
        <p className={cn("mt-0.5 text-[11px] font-medium leading-snug", muted)}>
          {detail}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => onChange(!on)}
        className={cn(
          "h-7 w-12 shrink-0 rounded-full border-0",
          on ? "bg-[#FF6B35]" : isLight ? "bg-black/20" : "bg-white/20"
        )}
      >
        <span
          className={cn(
            "block h-5 w-5 rounded-full bg-white transition-transform",
            on ? "translate-x-6" : "translate-x-1"
          )}
        />
      </button>
    </div>
  );

  const iconFor = (t: AlertItem["type"]) => {
    if (t === "login") return LogIn;
    if (t === "password") return KeyRound;
    if (t === "device") return ShieldAlert;
    return BellRing;
  };

  return (
    <div
      className={cn(
        "flex h-full flex-col",
        isLight ? "bg-[#c8c9cd]" : "bg-black"
      )}
    >
      <PageHeader
        title="Security alerts"
        subtitle="Logins, password & devices"
        backHref="/settings/sections/security"
      />
      <div className="flex-1 space-y-3 overflow-y-auto px-3 pb-8 scrollbar-hide">
        <p className={cn("px-1 text-[12px] font-medium leading-snug", muted)}>
          Choose what security events you want to be notified about. Alerts stay
          on this device; turn push copy on to mirror critical ones into app
          notifications when available.
        </p>

        <div>
          <p
            className={cn(
              "px-2 pb-1 pt-1 text-[10px] font-bold uppercase tracking-[0.14em]",
              muted
            )}
          >
            Notify me about
          </p>
          <Toggle
            on={prefs.newLogin}
            onChange={(v) => setPref({ newLogin: v })}
            label="New login"
            detail="Someone signs in with your account"
          />
          <Toggle
            on={prefs.passwordChange}
            onChange={(v) => setPref({ passwordChange: v })}
            label="Password change"
            detail="Your password is updated"
          />
          <Toggle
            on={prefs.deviceChange}
            onChange={(v) => setPref({ deviceChange: v })}
            label="Device signed out"
            detail="A session is revoked from Sessions & devices"
          />
          <Toggle
            on={prefs.pushCopy}
            onChange={(v) => setPref({ pushCopy: v })}
            label="Also show in Notifications"
            detail="Mirror critical security events in the bell feed"
          />
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between px-2">
            <p
              className={cn(
                "text-[10px] font-bold uppercase tracking-[0.14em]",
                muted
              )}
            >
              Recent alerts
            </p>
            {feed.some((a) => !a.read) ? (
              <button
                type="button"
                onClick={markAllRead}
                className={cn(
                  "border-0 bg-transparent text-[11px] font-bold",
                  "text-brand"
                )}
              >
                Mark all read
              </button>
            ) : null}
          </div>
          {feed.length === 0 ? (
            <p className={cn("px-2 py-3 text-[12px] font-medium", muted)}>
              No security alerts yet.
            </p>
          ) : (
            <ul className="space-y-0.5">
              {feed.map((a) => {
                const Icon = iconFor(a.type);
                return (
                  <li
                    key={a.id}
                    className={cn(
                      "flex gap-2 px-2 py-3",
                      !a.read &&
                        (isLight ? "bg-black/[0.03]" : "bg-white/[0.04]")
                    )}
                  >
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center">
                      <Icon className="h-4 w-4 text-brand" strokeWidth={2.2} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className={cn("text-[13px] font-bold", ink)}>
                        {a.title}
                      </p>
                      <p
                        className={cn(
                          "mt-0.5 text-[11px] font-medium leading-snug",
                          muted
                        )}
                      >
                        {a.body}
                      </p>
                      <p className={cn("mt-1 text-[10px] font-medium", muted)}>
                        {new Date(a.at).toLocaleString()}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
