"use client";

/**
 * Role-based Settings hub — Customer vs Repair Pro
 * Destructive actions only at the bottom
 * Scroll position restored when returning from a sub-page
 */

import { useEffect, useRef } from "react";
import {
  Accessibility,
  Banknote,
  Bell,
  Briefcase,
  CalendarClock,
  HelpCircle,
  Info,
  Languages,
  Lock,
  MapPin,
  Moon,
  Scale,
  Shield,
  Sun,
  Trash2,
  UserRound,
  Wallet,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import {
  SettingsRow,
  SettingsSection,
  restoreSettingsScroll,
  saveSettingsScroll,
} from "@/components/settings/settings-ui";
import { getLocaleMeta, useI18n } from "@/lib/i18n";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

export default function SettingsPage() {
  const {
    theme,
    toggleTheme,
    displayName,
    isAuthenticated,
    accountType,
  } = useApp();
  const { t, locale } = useI18n();
  const isLight = theme === "light";
  const langMeta = getLocaleMeta(locale);
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
            ? "Business, payouts & account"
            : "Account, privacy & preferences"
        }
        backHref={isPro ? "/dashboard" : "/"}
      />

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-3 pb-8 scrollbar-hide"
        onScroll={() => saveSettingsScroll(scrollRef.current)}
      >
        <SettingsSection title="Appearance" isLight={isLight}>
          <SettingsRow
            first
            isLight={isLight}
            icon={isLight ? Moon : Sun}
            label={isLight ? t("settings.darkMode") : t("settings.lightMode")}
            detail={
              isAuthenticated
                ? t("settings.themeSaved", {
                    name: displayName || "you",
                  })
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
                Tap
              </span>
            }
          />
          <SettingsRow
            isLight={isLight}
            icon={Languages}
            label={t("settings.language")}
            detail={`${langMeta.nativeName} (${langMeta.code.toUpperCase()})`}
            href="/settings/language"
            onClick={rememberScroll}
          />
        </SettingsSection>

        {isPro ? (
          <>
            <SettingsSection title="Profile & business" isLight={isLight}>
              <SettingsRow
                first
                isLight={isLight}
                icon={UserRound}
                label="Profile & business"
                detail="Name, photo, bio, skills"
                href="/settings/profile"
                onClick={rememberScroll}
              />
              <SettingsRow
                isLight={isLight}
                icon={Shield}
                label="Verification status"
                detail="Tiers & documents"
                href="/artisan/verification"
                onClick={rememberScroll}
              />
              <SettingsRow
                isLight={isLight}
                icon={UserRound}
                label="Public profile"
                detail="How customers see you"
                href="/profile"
                onClick={rememberScroll}
              />
            </SettingsSection>

            <SettingsSection title="Availability & scheduling" isLight={isLight}>
              <SettingsRow
                first
                isLight={isLight}
                icon={CalendarClock}
                label="Hours & vacation"
                detail="Schedule, time off, Live pause"
                href="/settings/availability"
                onClick={rememberScroll}
              />
              <SettingsRow
                isLight={isLight}
                icon={MapPin}
                label="Service area"
                detail="Coverage radius & location"
                href="/settings/location"
                onClick={rememberScroll}
              />
            </SettingsSection>

            <SettingsSection title="Pricing & services" isLight={isLight}>
              <SettingsRow
                first
                isLight={isLight}
                icon={Briefcase}
                label="Pricing & services"
                detail="Labour fees by skill"
                href="/settings/pricing"
                onClick={rememberScroll}
              />
            </SettingsSection>

            <SettingsSection title="Payments & payouts" isLight={isLight}>
              <SettingsRow
                first
                isLight={isLight}
                icon={Banknote}
                label="Bank payout (Nigeria)"
                detail="Receive job earnings"
                href="/settings/payments"
                onClick={rememberScroll}
              />
            </SettingsSection>

            <SettingsSection title="Security" isLight={isLight}>
              <SettingsRow
                first
                isLight={isLight}
                icon={Lock}
                label="Security"
                detail="Password, 2FA, sessions"
                href="/settings/security"
                onClick={rememberScroll}
              />
            </SettingsSection>

            <SettingsSection title="Notifications" isLight={isLight}>
              <SettingsRow
                first
                isLight={isLight}
                icon={Bell}
                label="Notifications"
                detail="Jobs, chat, payments"
                href="/settings/notifications"
                onClick={rememberScroll}
              />
            </SettingsSection>

            <SettingsSection title="Privacy & account" isLight={isLight}>
              <SettingsRow
                first
                isLight={isLight}
                icon={Shield}
                label="Privacy & visibility"
                detail="Search, blocked, export"
                href="/settings/privacy"
                onClick={rememberScroll}
              />
            </SettingsSection>

            <SettingsSection title="Support & tools" isLight={isLight}>
              <SettingsRow
                first
                isLight={isLight}
                icon={HelpCircle}
                label="Help & support"
                detail="FAQ & contact care"
                href="/settings/support"
                onClick={rememberScroll}
              />
              <SettingsRow
                isLight={isLight}
                icon={Scale}
                label="Legal"
                detail="Terms & privacy policy"
                href="/settings/legal"
                onClick={rememberScroll}
              />
              <SettingsRow
                isLight={isLight}
                icon={Info}
                label="About Ona"
                detail="App version & info"
                href="/settings/about"
                onClick={rememberScroll}
              />
            </SettingsSection>
          </>
        ) : (
          <>
            <SettingsSection title="Profile & account" isLight={isLight}>
              <SettingsRow
                first
                isLight={isLight}
                icon={UserRound}
                label="Profile & account"
                detail="Name, email, phone, photo"
                href="/settings/profile"
                onClick={rememberScroll}
              />
              <SettingsRow
                isLight={isLight}
                icon={Shield}
                label="Verification"
                detail="Phone · government ID (Tier 1–2)"
                href="/verify"
                onClick={rememberScroll}
              />
              <SettingsRow
                isLight={isLight}
                icon={MapPin}
                label="Addresses & location"
                detail="Home, Work, service pin"
                href="/settings/location"
                onClick={rememberScroll}
              />
              <SettingsRow
                isLight={isLight}
                icon={UserRound}
                label="My profile"
                detail="Public view & vehicles"
                href="/profile"
                onClick={rememberScroll}
              />
            </SettingsSection>

            <SettingsSection title="Payments" isLight={isLight}>
              <SettingsRow
                first
                isLight={isLight}
                icon={Wallet}
                label="Bank account (Nigeria)"
                detail="Refund bank only · NUBAN"
                href="/settings/payments"
                onClick={rememberScroll}
              />
            </SettingsSection>

            <SettingsSection title="Security" isLight={isLight}>
              <SettingsRow
                first
                isLight={isLight}
                icon={Lock}
                label="Security"
                detail="Password, 2FA, devices"
                href="/settings/security"
                onClick={rememberScroll}
              />
            </SettingsSection>

            <SettingsSection title="Notifications" isLight={isLight}>
              <SettingsRow
                first
                isLight={isLight}
                icon={Bell}
                label="Notifications"
                detail="Booking, chat, promo"
                href="/settings/notifications"
                onClick={rememberScroll}
              />
            </SettingsSection>

            <SettingsSection title="Accessibility" isLight={isLight}>
              <SettingsRow
                first
                isLight={isLight}
                icon={Accessibility}
                label="Accessibility"
                detail="Text size & readability"
                href="/settings/accessibility"
                onClick={rememberScroll}
              />
            </SettingsSection>

            <SettingsSection title="Privacy & sharing" isLight={isLight}>
              <SettingsRow
                first
                isLight={isLight}
                icon={Shield}
                label="Privacy"
                detail="Visibility, data, blocked"
                href="/settings/privacy"
                onClick={rememberScroll}
              />
            </SettingsSection>

            <SettingsSection title="Support & legal" isLight={isLight}>
              <SettingsRow
                first
                isLight={isLight}
                icon={HelpCircle}
                label="Help & support"
                detail="FAQ & contact care"
                href="/settings/support"
                onClick={rememberScroll}
              />
              <SettingsRow
                isLight={isLight}
                icon={Scale}
                label="Legal"
                detail="Terms & privacy policy"
                href="/settings/legal"
                onClick={rememberScroll}
              />
              <SettingsRow
                isLight={isLight}
                icon={Info}
                label="About Ona"
                detail="App version & info"
                href="/settings/about"
                onClick={rememberScroll}
              />
            </SettingsSection>
          </>
        )}

        <SettingsSection title="Danger zone" isLight={isLight}>
          <SettingsRow
            first
            isLight={isLight}
            danger
            icon={Trash2}
            label="Delete account"
            detail="Deactivate permanently — cannot undo"
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
          Signed in as {displayName || "Guest"}
          {isPro ? " · Repair Pro" : " · Customer"}
        </p>
      </div>
    </div>
  );
}
