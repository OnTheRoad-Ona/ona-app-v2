"use client";

import { useState } from "react";
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
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * Full settings hub — opened from Profile (not the hamburger).
 */
export default function SettingsPage() {
  const { theme, toggleTheme, retryLocation, isLocating, location } = useApp();
  const isLight = theme === "light";
  const [notifyOn, setNotifyOn] = useState(true);

  const row = (opts: {
    icon: typeof Bell;
    label: string;
    detail?: string;
    onClick?: () => void;
    href?: string;
  }) => {
    const Icon = opts.icon;
    const body = (
      <>
        <span
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-lg",
            isLight ? "bg-[#bebfc4]/80" : "bg-white/10"
          )}
        >
          <Icon className="h-4 w-4 text-brand" />
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
            <span className="block text-[11px] text-muted">{opts.detail}</span>
          ) : null}
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
      </>
    );
    if (opts.href) {
      return (
        <Link
          key={opts.label}
          href={opts.href}
          className={cn(
            "flex items-center gap-3 px-3 py-3",
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
          "flex w-full items-center gap-3 border-0 bg-transparent px-3 py-3 text-left",
          isLight ? "hover:bg-black/[0.04]" : "hover:bg-white/[0.04]"
        )}
      >
        {body}
      </button>
    );
  };

  return (
    <div
      className={cn(
        "flex h-full flex-col",
        isLight ? "bg-[#c8c9cd]" : "bg-black"
      )}
    >
      <PageHeader title="Settings" subtitle="App preferences" />

      <div className="flex-1 space-y-3 overflow-y-auto p-3 scrollbar-hide">
        <section
          className={cn(
            "overflow-hidden rounded-xl",
            isLight ? "bg-[#d4d5d9]" : "bg-neutral-950"
          )}
        >
          {row({
            icon: isLight ? Moon : Sun,
            label: isLight ? "Dark background" : "Light background",
            detail: "Double-tap free space also toggles theme",
            onClick: () => toggleTheme(),
          })}
          {row({
            icon: Bell,
            label: "Notifications",
            detail: notifyOn ? "On" : "Off",
            onClick: () => setNotifyOn((v) => !v),
          })}
          {row({
            icon: Languages,
            label: "Language",
            detail: "English (EN)",
          })}
        </section>

        <section
          className={cn(
            "overflow-hidden rounded-xl",
            isLight ? "bg-[#d4d5d9]" : "bg-neutral-950"
          )}
        >
          {row({
            icon: MapPin,
            label: "Refresh location",
            detail: isLocating
              ? "Updating…"
              : `${location.label} · ${location.city}`,
            onClick: () => retryLocation(),
          })}
          {row({
            icon: Shield,
            label: "Privacy & account",
            detail: "Profile, verification, identity",
            href: "/profile",
          })}
          {row({
            icon: HelpCircle,
            label: "Help",
            detail: "How OgaMecho works",
            href: "/profile",
          })}
          {row({
            icon: Info,
            label: "About OgaMecho",
            detail: "Version 0.1",
          })}
        </section>
      </div>
    </div>
  );
}
