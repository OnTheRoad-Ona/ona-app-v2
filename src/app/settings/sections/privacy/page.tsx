"use client";

import { AppWindow, Shield } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { SettingsRow } from "@/components/settings/settings-ui";
import { useT } from "@/lib/i18n";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

export default function SettingsPrivacySectionPage() {
  const { theme, accountType } = useApp();
  const t = useT();
  const isLight = theme === "light";
  const isPro = accountType === "professional";

  return (
    <div
      className={cn(
        "flex h-full flex-col",
        isLight ? "bg-[#c8c9cd]" : "bg-black"
      )}
    >
      <PageHeader
        title={t("settings.hub.privacy")}
        subtitle={t("settings.hub.privacyDetail")}
        backHref="/settings"
      />
      <div className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-8 scrollbar-hide">
        <SettingsRow
          first
          isLight={isLight}
          icon={Shield}
          label={isPro ? "Privacy & visibility" : "Privacy"}
          detail={
            isPro
              ? "Search, blocked, export"
              : "Visibility, data, blocked"
          }
          href="/settings/privacy"
        />
        <SettingsRow
          isLight={isLight}
          icon={AppWindow}
          label="App permissions"
          detail="Location, camera, and microphone"
          href="/settings/permissions"
        />
      </div>
    </div>
  );
}
