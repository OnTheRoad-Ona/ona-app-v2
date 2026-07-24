"use client";

import { MapPin, Shield, UserRound } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { SettingsRow } from "@/components/settings/settings-ui";
import { useT } from "@/lib/i18n";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

export default function SettingsProfileSectionPage() {
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
        title={t("settings.hub.profile")}
        subtitle={t("settings.hub.profileDetail")}
        backHref="/settings"
      />
      <div className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-8 scrollbar-hide">
        {isPro ? (
          <>
            <SettingsRow
              first
              isLight={isLight}
              icon={UserRound}
              label={t("settings.hub.profileInner")}
              detail="Name photo bio skills"
              href="/settings/profile"
            />
            <SettingsRow
              isLight={isLight}
              icon={Shield}
              label="Verification status"
              detail="Tiers & documents"
              href="/artisan/verification"
            />
            <SettingsRow
              isLight={isLight}
              icon={UserRound}
              label="Public profile"
              detail="How customers see you"
              href="/profile"
            />
          </>
        ) : (
          <>
            <SettingsRow
              first
              isLight={isLight}
              icon={UserRound}
              label={t("settings.hub.profileInner")}
              detail="Name email phone photo"
              href="/settings/profile"
            />
            <SettingsRow
              isLight={isLight}
              icon={Shield}
              label="Verification"
              detail="Phone government ID Tier 1 2"
              href="/verify"
            />
            <SettingsRow
              isLight={isLight}
              icon={MapPin}
              label="Addresses & location"
              detail="Home Work service pin"
              href="/settings/location"
            />
            <SettingsRow
              isLight={isLight}
              icon={UserRound}
              label="My profile"
              detail="Public view & vehicles"
              href="/profile"
            />
          </>
        )}
      </div>
    </div>
  );
}
