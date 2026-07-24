"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { SettingsComingSoon } from "@/components/settings/settings-ui";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

const KEY = "ona-privacy-prefs-v1";

type Prefs = {
  profilePrivate: boolean;
  searchVisible: boolean;
  shareAnalytics: boolean;
};

const DEFAULT: Prefs = {
  profilePrivate: true, // highest privacy by default
  searchVisible: true, // pros need discoverability when active
  shareAnalytics: false,
};

function load(userId: string): Prefs {
  try {
    const raw = localStorage.getItem(`${KEY}:${userId}`);
    if (!raw) return DEFAULT;
    return { ...DEFAULT, ...JSON.parse(raw) };
  } catch {
    return DEFAULT;
  }
}

export default function SettingsPrivacyPage() {
  const { theme, userProfile, accountType, backendUserId } = useApp();
  const isLight = theme === "light";
  const isPro = accountType === "professional";
  const uid = backendUserId || userProfile?.email || "guest";
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT);

  useEffect(() => {
    setPrefs(load(uid));
  }, [uid]);

  const set = (partial: Partial<Prefs>) => {
    setPrefs((p) => {
      const next = { ...p, ...partial };
      try {
        localStorage.setItem(`${KEY}:${uid}`, JSON.stringify(next));
      } catch {
        /* */
      }
      return next;
    });
  };

  const Toggle = ({
    on,
    onChange,
    label,
    detail,
  }: {
    on: boolean;
    onChange: (v: boolean) => void;
    label: string;
    detail: string;
  }) => (
    <div
      className={cn(
        "flex items-center justify-between gap-3 px-3 py-3"
      )}
    >
      <div className="min-w-0">
        <p
          className={cn(
            "text-[13px] font-bold",
            isLight ? "text-slate-900" : "text-white"
          )}
        >
          {label}
        </p>
        <p
          className={cn(
            "text-[11px] font-medium leading-snug",
            isLight ? "text-slate-600" : "text-white/60"
          )}
        >
          {detail}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => onChange(!on)}
        className={cn(
          "h-7 w-12 shrink-0 rounded-full border-0",
          on ? "bg-[#FF6B35]" : isLight ? "bg-black/20" : "bg-white/20"
        )}
      >
        <span
          className={cn(
            "block h-5 w-5 rounded-full bg-white transition-transform",
            on ? "translate-x-6" : "translate-x-1"
          )}
        />
      </button>
    </div>
  );

  return (
    <div
      className={cn(
        "flex h-full flex-col",
        isLight ? "bg-[#c8c9cd]" : "bg-black"
      )}
    >
      <PageHeader
        title={isPro ? "Privacy & account" : "Privacy & sharing"}
        subtitle="Highest privacy by default"
        backHref="/settings"
      />
      <div className="flex-1 space-y-3 overflow-y-auto px-3 pb-6 scrollbar-hide">
        <div
          className={cn(
            "overflow-hidden rounded-md",
            "bg-transparent"
          )}
        >
          {!isPro ? (
            <Toggle
              on={prefs.profilePrivate}
              onChange={(v) => set({ profilePrivate: v })}
              label="Keep profile private"
              detail="Default ON. Details stay private until needed for a booking."
            />
          ) : (
            <Toggle
              on={prefs.searchVisible}
              onChange={(v) => set({ searchVisible: v })}
              label="Discoverable in search"
              detail="When ON and you are Live/approved, customers can find you. Off hides you from discovery."
            />
          )}
          <Toggle
            on={prefs.shareAnalytics}
            onChange={(v) => set({ shareAnalytics: v })}
            label="Share usage analytics"
            detail="Default OFF. Helps improve Ona; never sells your data."
          />
        </div>

        <SettingsComingSoon isLight={isLight} title="Export personal data" />
        <SettingsComingSoon isLight={isLight} title="Blocked users" />

        {isPro ? (
          <p
            className={cn(
              "text-[11px] font-medium leading-snug",
              isLight ? "text-slate-600" : "text-white/55"
            )}
          >
            Verification status is view-only under Settings → Verification
            status (not editable here).
          </p>
        ) : null}

        <Link
          href="/settings/delete-account"
          className="block rounded-md bg-red-500/10 px-3 py-3 text-center text-[13px] font-bold text-red-600 no-underline"
        >
          Delete account →
        </Link>
      </div>
    </div>
  );
}
