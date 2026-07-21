"use client";

import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import {
  Bell,
  ChevronRight,
  HelpCircle,
  Info,
  Languages,
  MapPin,
  Moon,
  Shield,
  Sun,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { getLocaleMeta, useI18n } from "@/lib/i18n";
import { MAX_RADIUS_KM } from "@/lib/matching";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * Ona app settings — menu rows open real pages where needed.
 */
export default function SettingsPage() {
  const {
    theme,
    toggleTheme,
    location,
    displayName,
    isAuthenticated,
    radiusKm,
    setRadiusKm,
    accountType,
  } = useApp();
  const { t, locale } = useI18n();
  const isLight = theme === "light";
  const langMeta = getLocaleMeta(locale);

  const row = (opts: {
    icon: typeof Bell;
    label: string;
    detail?: string;
    onClick?: () => void;
    href?: string;
    trailing?: ReactNode;
  }) => {
    const Icon = opts.icon;
    const body = (
      <>
        <span className="flex h-9 w-9 items-center justify-center">
          <Icon className="h-4 w-4 text-brand" strokeWidth={2.2} />
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              "block text-[14px] font-semibold",
              isLight ? "text-slate-900" : "text-white"
            )}
          >
            {opts.label}
          </span>
          {opts.detail ? (
            <span
              className={cn(
                "block text-[11px] font-medium",
                isLight ? "text-slate-600" : "text-white/65"
              )}
            >
              {opts.detail}
            </span>
          ) : null}
        </span>
        {opts.trailing ?? (
          <ChevronRight
            className={cn(
              "h-4 w-4 shrink-0",
              isLight ? "text-slate-500" : "text-white/40"
            )}
          />
        )}
      </>
    );
    if (opts.href) {
      return (
        <Link
          key={opts.label}
          href={opts.href}
          className={cn(
            "flex items-center gap-2 border-0 px-2 py-3",
            isLight ? "hover:bg-black/[0.04]" : "hover:bg-white/[0.04]"
          )}
        >
          {body}
        </Link>
      );
    }
    return (
      <button
        key={opts.label}
        type="button"
        onClick={opts.onClick}
        className={cn(
          "flex w-full items-center gap-2 border-0 bg-transparent px-2 py-3 text-left",
          isLight ? "hover:bg-black/[0.04]" : "hover:bg-white/[0.04]"
        )}
      >
        {body}
      </button>
    );
  };

  const sectionTitle = (label: string) => (
    <p
      className={cn(
        "px-2 pb-1 pt-3 text-[10px] font-bold uppercase tracking-wide",
        isLight ? "text-slate-600" : "text-white/55"
      )}
    >
      {label}
    </p>
  );

  return (
    <div
      className={cn(
        "flex h-full flex-col",
        isLight ? "bg-[#c8c9cd]" : "bg-black"
      )}
    >
      <PageHeader
        title={t("settings.title")}
        subtitle={t("settings.subtitle")}
        backHref={accountType === "professional" ? "/dashboard" : "/"}
      />

      <div className="flex-1 overflow-y-auto px-3 pb-6 scrollbar-hide">
        {sectionTitle(t("settings.appearance"))}
        {row({
          icon: isLight ? Moon : Sun,
          label: isLight ? t("settings.darkMode") : t("settings.lightMode"),
          detail: isAuthenticated
            ? t("settings.themeSaved", {
                name: displayName || "you",
              })
            : t("settings.themeDevice"),
          onClick: () => toggleTheme(),
        })}

        {sectionTitle(t("settings.alerts"))}
        {row({
          icon: Bell,
          label: t("settings.notificationsSound"),
          detail: t("settings.notificationsDetail"),
          href: "/settings/notifications",
        })}

        {sectionTitle(t("settings.discovery"))}
        <div className="px-2 py-2">
          <div className="mb-1 flex items-center justify-between">
            <span
              className={cn(
                "text-[13px] font-semibold",
                isLight ? "text-slate-900" : "text-white"
              )}
            >
              {t("settings.searchRadius")}
            </span>
            <span
              className="text-[12px] font-bold tabular-nums"
              style={{ color: "#FF6B35" }}
            >
              {radiusKm.toFixed(radiusKm < 10 ? 1 : 0)} km
            </span>
          </div>
          <input
            type="range"
            min={1}
            max={MAX_RADIUS_KM}
            step={0.5}
            value={radiusKm}
            onChange={(e) => setRadiusKm(Number(e.target.value))}
            className="radius-slider w-full"
            style={
              {
                ["--pct" as string]: `${(radiusKm / MAX_RADIUS_KM) * 100}%`,
              } as CSSProperties
            }
            aria-label={t("settings.searchRadius")}
          />
          <p
            className={cn(
              "mt-1 text-[10px] font-medium",
              isLight ? "text-slate-600" : "text-white/55"
            )}
          >
            {t("settings.radiusHelp", { max: MAX_RADIUS_KM })}
          </p>
        </div>

        {sectionTitle(t("settings.location"))}
        {row({
          icon: MapPin,
          label: t("settings.myLocation"),
          detail: location.label || t("settings.myLocationDetail"),
          href: "/settings/location",
        })}

        {sectionTitle(t("settings.accountPrivacy"))}
        {accountType === "professional"
          ? row({
              icon: Shield,
              label: t("settings.artisanTiers"),
              detail: t("settings.artisanTiersDetail"),
              href: "/artisan/verification",
            })
          : null}
        {row({
          icon: HelpCircle,
          label: t("settings.help"),
          detail: t("settings.helpDetail"),
          href: "/profile",
        })}
        {row({
          icon: Languages,
          label: t("settings.language"),
          detail: `${langMeta.nativeName} (${langMeta.code.toUpperCase()})`,
          href: "/settings/language",
        })}
        {row({
          icon: Info,
          label: t("settings.about"),
          detail: t("settings.aboutDetail"),
        })}
      </div>
    </div>
  );
}
