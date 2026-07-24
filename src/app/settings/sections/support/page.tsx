"use client";

import { HelpCircle, Info, Scale } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { SettingsRow } from "@/components/settings/settings-ui";
import { useT } from "@/lib/i18n";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

export default function SettingsSupportSectionPage() {
  const { theme } = useApp();
  const t = useT();
  const isLight = theme === "light";

  return (
    <div
      className={cn(
        "flex h-full flex-col",
        isLight ? "bg-[#c8c9cd]" : "bg-black"
      )}
    >
      <PageHeader
        title={t("settings.hub.support")}
        subtitle={t("settings.hub.supportDetail")}
        backHref="/settings"
      />
      <div className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-8 scrollbar-hide">
        <SettingsRow
          first
          isLight={isLight}
          icon={HelpCircle}
          label="Help & support"
          detail="FAQ & contact care"
          href="/settings/support"
        />
        <SettingsRow
          isLight={isLight}
          icon={Scale}
          label="Legal"
          detail="Terms & privacy policy"
          href="/settings/legal"
        />
        <SettingsRow
          isLight={isLight}
          icon={Info}
          label="About Ona"
          detail="App version & info"
          href="/settings/about"
        />
      </div>
    </div>
  );
}
