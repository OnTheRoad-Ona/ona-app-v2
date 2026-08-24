"use client";

import { Accessibility, Briefcase } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { SettingsRow } from "@/components/settings/settings-ui";
import { useT } from "@/lib/i18n";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

export default function SettingsPricingSectionPage() {
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
        title={t("settings.hub.pricing")}
        subtitle={t("settings.hub.pricingDetail")}
        backHref="/settings"
      />
      <div className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-8 scrollbar-hide">
        {isPro ? (
          <SettingsRow
            first
            isLight={isLight}
            icon={Briefcase}
            label="Pricing & services"
            detail="Labour fees by skill"
            href="/settings/pricing"
          />
        ) : (
          <SettingsRow
            first
            isLight={isLight}
            icon={Accessibility}
            label="Accessibility"
            detail="Text size & readability"
            href="/settings/accessibility"
          />
        )}
      </div>
    </div>
  );
}
