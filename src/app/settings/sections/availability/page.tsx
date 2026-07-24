"use client";

import { CalendarClock, MapPin } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { SettingsRow } from "@/components/settings/settings-ui";
import { useT } from "@/lib/i18n";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

export default function SettingsAvailabilitySectionPage() {
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
        title={t("settings.hub.availability")}
        subtitle={t("settings.hub.availabilityDetail")}
        backHref="/settings"
      />
      <div className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-8 scrollbar-hide">
        {isPro ? (
          <>
            <SettingsRow
              first
              isLight={isLight}
              icon={CalendarClock}
              label="Hours & vacation"
              detail="Schedule, time off, Live pause"
              href="/settings/availability"
            />
            <SettingsRow
              isLight={isLight}
              icon={MapPin}
              label="Service area"
              detail="Coverage radius & location"
              href="/settings/location"
            />
          </>
        ) : (
          <SettingsRow
            first
            isLight={isLight}
            icon={MapPin}
            label="Addresses & location"
            detail="Home, Work, service pin"
            href="/settings/location"
          />
        )}
      </div>
    </div>
  );
}
