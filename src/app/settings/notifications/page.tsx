"use client";

import { useCallback, useEffect, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { NotificationSettings } from "@/components/notifications/notification-settings";
import { useT } from "@/lib/i18n";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

const SETTINGS_KEY = "ona-app-settings";

type AppSettingsLocal = { soundsOn: boolean };

function readLocalSettings(): AppSettingsLocal {
  if (typeof window === "undefined") return { soundsOn: true };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { soundsOn: true };
    const p = JSON.parse(raw) as Partial<AppSettingsLocal>;
    return { soundsOn: p.soundsOn !== false };
  } catch {
    return { soundsOn: true };
  }
}

function writeLocalSettings(s: AppSettingsLocal) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

/**
 * Full-page Notifications & sound (opened from Settings menu).
 */
export default function SettingsNotificationsPage() {
  const { theme } = useApp();
  const t = useT();
  const isLight = theme === "light";
  const [local, setLocal] = useState<AppSettingsLocal>({ soundsOn: true });

  useEffect(() => {
    setLocal(readLocalSettings());
  }, []);

  const patchLocal = useCallback((partial: Partial<AppSettingsLocal>) => {
    setLocal((prev) => {
      const next = { ...prev, ...partial };
      writeLocalSettings(next);
      return next;
    });
  }, []);

  return (
    <div
      className={cn(
        "flex h-full flex-col",
        isLight ? "bg-[#c8c9cd]" : "bg-black",
      )}
    >
      <PageHeader
        title={t("notif.title")}
        subtitle={t("notif.subtitle")}
        backHref="/settings"
      />

      <div className="flex-1 overflow-y-auto px-3 pb-6 scrollbar-hide">
        <NotificationSettings />

        <button
          type="button"
          onClick={() => patchLocal({ soundsOn: !local.soundsOn })}
          className={cn(
            "mt-3 flex w-full items-center gap-2 rounded-xl border-0 px-3 py-3 text-left",
            "bg-transparent",
          )}
        >
          <span className="flex h-9 w-9 items-center justify-center">
            {local.soundsOn ? (
              <Volume2
                className="h-4 w-4"
                style={{ color: "#FF6B35" }}
                strokeWidth={2.2}
              />
            ) : (
              <VolumeX
                className="h-4 w-4"
                style={{ color: "#FF6B35" }}
                strokeWidth={2.2}
              />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span
              className={cn(
                "block text-[14px] font-semibold",
                isLight ? "text-slate-900" : "text-white",
              )}
            >
              {t("notif.appSounds")}
            </span>
            <span
              className={cn(
                "block text-[11px] font-medium",
                isLight ? "text-slate-600" : "text-white/65",
              )}
            >
              {local.soundsOn ? t("notif.soundsOn") : t("notif.soundsOff")}
            </span>
          </span>
          <span
            className={cn(
              "relative h-6 w-11 shrink-0 rounded-full transition-colors",
              !local.soundsOn && (isLight ? "bg-black/20" : "bg-white/20"),
            )}
            style={local.soundsOn ? { backgroundColor: "#FF6B35" } : undefined}
            aria-hidden
          >
            <span
              className={cn(
                "absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform",
                local.soundsOn ? "left-5" : "left-0.5",
              )}
            />
          </span>
        </button>
      </div>
    </div>
  );
}
