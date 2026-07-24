"use client";

import { Languages, Moon, Sun } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { SettingsRow } from "@/components/settings/settings-ui";
import { getLocaleMeta, useI18n } from "@/lib/i18n";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

export default function SettingsAppearancePage() {
  const { theme, toggleTheme, displayName, isAuthenticated } = useApp();
  const { t, locale } = useI18n();
  const isLight = theme === "light";
  const langMeta = getLocaleMeta(locale);

  return (
    <div
      className={cn(
        "flex h-full flex-col",
        isLight ? "bg-[#c8c9cd]" : "bg-black"
      )}
    >
      <PageHeader
        title={t("settings.hub.appearance")}
        subtitle={t("settings.hub.appearanceDetail")}
        backHref="/settings"
      />
      <div className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-8 scrollbar-hide">
        <SettingsRow
          first
          isLight={isLight}
          icon={isLight ? Moon : Sun}
          label={isLight ? t("settings.darkMode") : t("settings.lightMode")}
          detail={
            isAuthenticated
              ? t("settings.themeSaved", { name: displayName || "you" })
              : t("settings.themeDevice")
          }
          onClick={() => toggleTheme()}
          trailing={
            <span
              className={cn(
                "text-[11px] font-bold",
                isLight ? "text-slate-500" : "text-white/45"
              )}
            >
              {t("settings.theme.tap")}
            </span>
          }
        />
        <SettingsRow
          isLight={isLight}
          icon={Languages}
          label={t("settings.language")}
          detail={`${langMeta.nativeName} (${langMeta.code.toUpperCase()})`}
          href="/settings/language"
        />
      </div>
    </div>
  );
}
