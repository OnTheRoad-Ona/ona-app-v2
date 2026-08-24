"use client";

import { Bell } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { SettingsRow } from "@/components/settings/settings-ui";
import { useT } from "@/lib/i18n";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

export default function SettingsNotificationsSectionPage() {
  const { theme, accountType } = useApp();
  const t = useT();
  const isLight = theme === "light";
  const isPro = accountType === "professional";

  return (
    <div
      className={cn(
        "flex h-full flex-col",
        isLight ? "bg-[#c8c9cd]" : "bg-black",
      )}
    >
      <PageHeader
        title={t("settings.hub.notifications")}
        subtitle={t("settings.hub.notificationsDetail")}
        backHref="/settings"
      />
      <div className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-8 scrollbar-hide">
        <SettingsRow
          first
          isLight={isLight}
          icon={Bell}
          label="Notifications"
          detail={isPro ? "Jobs, chat, payments" : "Booking, chat, promo"}
          href="/settings/notifications"
        />
      </div>
    </div>
  );
}
