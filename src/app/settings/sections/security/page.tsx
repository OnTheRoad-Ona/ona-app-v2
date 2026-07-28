"use client";

import { BellRing, Lock, MonitorSmartphone } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { SettingsRow } from "@/components/settings/settings-ui";
import { useT } from "@/lib/i18n";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

export default function SettingsSecuritySectionPage() {
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
        title={t("settings.hub.security")}
        subtitle={t("settings.hub.securityDetail")}
        backHref="/settings"
      />
      <div className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-8 scrollbar-hide">
        <SettingsRow
          first
          isLight={isLight}
          icon={Lock}
          label="Password & 2FA"
          detail={
            isPro
              ? "Password and two-factor authentication"
              : "Password and two-factor authentication"
          }
          href="/settings/security"
        />
        <SettingsRow
          isLight={isLight}
          icon={MonitorSmartphone}
          label="Login sessions & devices"
          detail="See connected browsers and sign out others"
          href="/settings/sessions"
        />
        <SettingsRow
          isLight={isLight}
          icon={BellRing}
          label="Security alerts"
          detail="New logins, password changes, device sign-outs"
          href="/settings/security-alerts"
        />
      </div>
    </div>
  );
}
