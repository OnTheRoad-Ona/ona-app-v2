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
  MapPin,
  Palette,
  Shield,
  Trash2,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import {
  SettingsRow,
  SettingsSection,
  restoreSettingsScroll,
  saveSettingsScroll,
} from "@/components/settings/settings-ui";
import { useI18n, type MessageKey } from "@/lib/i18n";
import { getArtisanProfile } from "@/lib/artisan/local-store";
import {
  shouldShowProContinueSetup,
  shouldShowProSettingsVerification,
} from "@/lib/pro-switch-onboarding";
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
    // Role-resolved in render: Customer → /verify, Pro → /artisan/verification
    href: "/settings/verification",
    labelKey: "settings.hub.verification",
    detailKey: "settings.hub.verificationDetail",
    icon: BadgeCheck,
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
    // Customers manage money here (Pros use ☰ → Payments & Payouts only)
    href: "/settings/payments",
    labelKey: "settings.hub.paymentsCustomer",
    detailKey: "settings.hub.paymentsDetailCustomer",
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
  {
    href: "/settings/location",
    labelKey: "settings.hub.addresses",
    detailKey: "settings.hub.addressesDetail",
    icon: MapPin,
  },
];

export default function SettingsPage() {
  const {
    theme,
    displayName,
    accountType,
    userProfile,
    backendUserId,
    hasMotoristAccount,
    hasProAccount,
    primaryAccountType,
    setProOnboardingSheetRequired,
  } = useApp();
  const { t } = useI18n();
  const isLight = theme === "light";
  const isPro = accountType === "professional";
  const scrollRef = useRef<HTMLDivElement>(null);
  const artisan = backendUserId ? getArtisanProfile(backendUserId) : null;
  const showVerification = shouldShowProSettingsVerification({
    hasMotoristAccount,
    hasProAccount,
    accountType,
    primaryAccountType,
    userProfile,
    artisan,
  });
  const showContinueSetup = shouldShowProContinueSetup({
    hasMotoristAccount,
    hasProAccount,
    accountType,
    primaryAccountType,
    userProfile,
    artisan,
  });

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
          hasMotoristAccount && hasProAccount
            ? `Dual Role · ${
                isPro ? "Professional Role" : "Customer Role"
              } active`
            : isPro
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
          {showContinueSetup ? (
            <SettingsRow
              first
              isLight={isLight}
              icon={BadgeCheck}
              label="Continue setup"
              detail="Complete Tier 2 setup for Repair Pro"
              onClick={() => {
                rememberScroll();
                setProOnboardingSheetRequired(true);
                void import("@/components/pro/pro-onboarding-sheet").then(
                  (m) => m.requestProOnboardingSheetExpand()
                );
              }}
            />
          ) : null}
          {HUB_SECTIONS.filter((item) => {
            // Pro: Payments & Payouts lives in the side bar, not Settings
            if (isPro && item.href === "/settings/payments") return false;
            // Dual C→Pro: Verification only after Care-approved T2
            if (
              item.href === "/settings/verification" &&
              isPro &&
              !showVerification
            ) {
              return false;
            }
            return true;
          }).map((item, i) => (
            <SettingsRow
              key={item.href}
              first={!showContinueSetup && i === 0}
              isLight={isLight}
              icon={item.icon}
              label={t(item.labelKey)}
              detail={t(item.detailKey)}
              href={
                item.href === "/settings/verification"
                  ? isPro
                    ? "/artisan/verification"
                    : "/verify"
                  : item.href
              }
              onClick={rememberScroll}
            />
          ))}
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
