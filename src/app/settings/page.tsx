"use client";

import { useCallback, useEffect, useState } from "react";
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
  SlidersHorizontal,
  Sun,
  Volume2,
  VolumeX,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { NotificationSettings } from "@/components/notifications/notification-settings";
import { MAX_RADIUS_KM } from "@/lib/matching";
import { useApp } from "@/lib/store";
import type { AppFilters } from "@/lib/types";
import { cn } from "@/lib/utils";

const SETTINGS_KEY = "oga-mecho-app-settings";

type AppSettingsLocal = {
  soundsOn: boolean;
};

function readLocalSettings(): AppSettingsLocal {
  if (typeof window === "undefined") {
    return { soundsOn: true };
  }
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { soundsOn: true };
    const p = JSON.parse(raw) as Partial<AppSettingsLocal & { notifyOn?: boolean }>;
    return {
      soundsOn: p.soundsOn !== false,
    };
  } catch {
    return { soundsOn: true };
  }
}

function writeLocalSettings(s: AppSettingsLocal) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

const FILTER_ROWS: {
  key: keyof AppFilters;
  label: string;
  detail: string;
}[] = [
  { key: "nearest", label: "Nearest first", detail: "Sort map & list by distance" },
  { key: "rating45", label: "4.5+ rating", detail: "Hide lower-rated pros" },
  {
    key: "availableNow",
    label: "Available (Live GPS)",
    detail: "Only pros with a live location pin",
  },
  { key: "verified", label: "Verified only", detail: "NIN / docs verified" },
  {
    key: "fastResponse",
    label: "Fast reply",
    detail: "Pros that typically reply quickly",
  },
];

/**
 * OgaMecho app settings — appearance, discovery, notifications, account.
 */
export default function SettingsPage() {
  const {
    theme,
    toggleTheme,
    retryLocation,
    isLocating,
    location,
    displayName,
    isAuthenticated,
    radiusKm,
    setRadiusKm,
    filters,
    toggleFilter,
    accountType,
  } = useApp();
  const isLight = theme === "light";
  const [local, setLocal] = useState<AppSettingsLocal>({
    soundsOn: true,
  });

  useEffect(() => {
    setLocal(readLocalSettings());
  }, []);

  const patchLocal = useCallback((partial: Partial<AppSettingsLocal>) => {
    setLocal((prev) => {
      const next = { ...prev, ...partial };
      writeLocalSettings(next);
      return next;
    });
  }, []);

  const row = (opts: {
    icon: typeof Bell;
    label: string;
    detail?: string;
    onClick?: () => void;
    href?: string;
    trailing?: React.ReactNode;
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

  const toggleSwitch = (on: boolean) => (
    <span
      className={cn(
        "relative h-6 w-11 shrink-0 rounded-full transition-colors",
        on ? "bg-brand" : isLight ? "bg-black/20" : "bg-white/20"
      )}
      aria-hidden
    >
      <span
        className={cn(
          "absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform",
          on ? "left-5" : "left-0.5"
        )}
      />
    </span>
  );

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
        title="Settings"
        subtitle="Ona app"
        backHref={accountType === "professional" ? "/dashboard" : "/"}
      />

      <div className="flex-1 overflow-y-auto px-3 pb-6 scrollbar-hide">
        {sectionTitle("Appearance")}
        {row({
          icon: isLight ? Moon : Sun,
          label: isLight ? "Dark mode" : "Light mode",
          detail: isAuthenticated
            ? `Saved for ${displayName || "your account"}`
            : "Device preference · sign in to save per account",
          onClick: () => toggleTheme(),
        })}

        {sectionTitle("Notifications & sound")}
        <div className="px-0.5 pb-1">
          <NotificationSettings />
        </div>
        {row({
          icon: local.soundsOn ? Volume2 : VolumeX,
          label: "App sounds",
          detail: local.soundsOn
            ? "Job, chat, and Live tones"
            : "Muted on this device",
          onClick: () => patchLocal({ soundsOn: !local.soundsOn }),
          trailing: toggleSwitch(local.soundsOn),
        })}

        {sectionTitle("Discovery (home map & list)")}
        <div className="px-2 py-2">
          <div className="mb-1 flex items-center justify-between">
            <span
              className={cn(
                "text-[13px] font-semibold",
                isLight ? "text-slate-900" : "text-white"
              )}
            >
              Search radius
            </span>
            <span className="text-[12px] font-bold text-brand">
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
            className="w-full accent-[#e85a12]"
            aria-label="Search radius in kilometres"
          />
          <p
            className={cn(
              "mt-1 text-[10px] font-medium",
              isLight ? "text-slate-600" : "text-white/55"
            )}
          >
            Max {MAX_RADIUS_KM} km · applies to map pins and the pro list
          </p>
        </div>

        <div className="mt-1">
          {FILTER_ROWS.map((f) =>
            row({
              icon: SlidersHorizontal,
              label: f.label,
              detail: f.detail,
              onClick: () => toggleFilter(f.key),
              trailing: toggleSwitch(filters[f.key]),
            })
          )}
        </div>

        {sectionTitle("Location")}
        {row({
          icon: MapPin,
          label: "Refresh my location",
          detail: isLocating
            ? "Updating…"
            : location.label || "Getting address…",
          onClick: () => retryLocation(),
        })}

        {sectionTitle("Account & privacy")}
        {row({
          icon: Shield,
          label: "Profile & verification",
          detail:
            accountType === "professional"
              ? "Repair Pro profile, docs, prices"
              : "Motorist profile, vehicles, identity",
          href: "/profile",
        })}
        {accountType === "professional"
          ? row({
              icon: Shield,
              label: "Artisan verification tiers",
              detail: "Phone, ID, BVN, liveness, skill proof",
              href: "/artisan/verification",
            })
          : null}
        {row({
          icon: HelpCircle,
          label: "Help",
          detail: "How Ona works",
          href: "/profile",
        })}
        {row({
          icon: Languages,
          label: "Language",
          detail: "English (EN)",
        })}
        {row({
          icon: Info,
          label: "About Ona",
          detail: "Version 0.1 · roadside help nearby",
        })}
      </div>
    </div>
  );
}
