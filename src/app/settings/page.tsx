"use client";

/**
 * Settings hub — one row per category → opens that section page.
 * Danger Zone stays on this hub only (not nested).
 * Same layout for Customer and Repair Pro. Fully i18n-aware.
 */

import { useEffect, useRef } from "react";
import {
  BadgeCheck,
  Banknote,
  Bell,
  Briefcase,
  CalendarClock,
  HelpCircle,
  Lock,
  Palette,
  Shield,
  Trash2,
  UserRound,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import {
  SettingsRow,
  SettingsSection,
  restoreSettingsScroll,
  saveSettingsScroll,
} from "@/components/settings/settings-ui";
import { useI18n, type MessageKey } from "@/lib/i18n";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

const HUB_SECTIONS: {
  href: string;
  labelKey: MessageKey;
  detailKey: MessageKey;
  icon: typeof Palette;
}[] = [
  {
    href: "/settings/appearance",
    labelKey: "settings.hub.appearance",
    detailKey: "settings.hub.appearanceDetail",
    icon: Palette,
  },
  {
    href: "/settings/sections/profile",
    labelKey: "settings.hub.profile",
    detailKey: "settings.hub.profileDetail",
    icon: UserRound,
  },
  {
    href: "/settings/sections/availability",
    labelKey: "settings.hub.availability",
    detailKey: "settings.hub.availabilityDetail",
    icon: CalendarClock,
  },
  {
    href: "/settings/sections/pricing",
    labelKey: "settings.hub.pricing",
    detailKey: "settings.hub.pricingDetail",
    icon: Briefcase,
  },
  {
    href: "/settings/sections/payments",
    labelKey: "settings.hub.payments",
    detailKey: "settings.hub.paymentsDetail",
    icon: Banknote,
  },
  {
    href: "/settings/sections/security",
    labelKey: "settings.hub.security",
    detailKey: "settings.hub.securityDetail",
    icon: Lock,
  },
  {
    href: "/settings/sections/notifications",
    labelKey: "settings.hub.notifications",
    detailKey: "settings.hub.notificationsDetail",
    icon: Bell,
  },
  {
    href: "/settings/sections/privacy",
    labelKey: "settings.hub.privacy",
    detailKey: "settings.hub.privacyDetail",
    icon: Shield,
  },
  {
    href: "/settings/sections/support",
    labelKey: "settings.hub.support",
    detailKey: "settings.hub.supportDetail",
    icon: HelpCircle,
  },
];

export default function SettingsPage() {
  const { theme, displayName, accountType } = useApp();
  const { t } = useI18n();
  const isLight = theme === "light";
  const isPro = accountType === "professional";
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    restoreSettingsScroll(scrollRef.current);
  }, []);

  const rememberScroll = () => saveSettingsScroll(scrollRef.current);

  return (
    <div
      className={cn(
        "flex h-full flex-col",
        isLight ? "bg-[#c8c9cd]" : "bg-black"
      )}
    >
      <PageHeader
        title={t("settings.title")}
        subtitle={
          isPro
            ? t("settings.hub.subtitlePro")
            : t("settings.hub.subtitleCustomer")
        }
        backHref={isPro ? "/dashboard" : "/"}
      />

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-3 pb-8 scrollbar-hide"
        onScroll={() => saveSettingsScroll(scrollRef.current)}
      >
        <div className="space-y-0.5 py-1">
          {HUB_SECTIONS.flatMap((item, i) => {
            const rows = [
              <SettingsRow
                key={item.href}
                first={i === 0}
                isLight={isLight}
                icon={item.icon}
                label={t(item.labelKey)}
                detail={t(item.detailKey)}
                href={item.href}
                onClick={rememberScroll}
              />,
            ];
            // Verification as its own top-level menu (not nested under Profile)
            if (item.href === "/settings/sections/profile") {
              rows.push(
                <SettingsRow
                  key="settings-verification"
                  isLight={isLight}
                  icon={BadgeCheck}
                  label={t("settings.hub.verification")}
                  detail={t("settings.hub.verificationDetail")}
                  href={isPro ? "/artisan/verification" : "/verify"}
                  onClick={rememberScroll}
                />
              );
            }
            return rows;
          })}
        </div>

        <SettingsSection title={t("settings.dangerZone")} isLight={isLight}>
          <SettingsRow
            first
            isLight={isLight}
            danger
            icon={Trash2}
            label={t("settings.deleteAccount")}
            detail={t("settings.deleteAccountDetail")}
            href="/settings/delete-account"
            onClick={rememberScroll}
          />
        </SettingsSection>

        <p
          className={cn(
            "mt-4 px-2 text-center text-[10px] font-medium",
            isLight ? "text-slate-500" : "text-white/40"
          )}
        >
          {t("menu.signedInAs", {
            name: displayName || t("menu.guest"),
          })}
          {" · "}
          {isPro ? t("menu.rolePro") : t("menu.roleCustomer")}
        </p>
      </div>
    </div>
  );
}
