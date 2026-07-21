"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import {
  SettingsComingSoon,
  SettingsField,
  SettingsSaveBar,
  settingsInputClass,
} from "@/components/settings/settings-ui";
import { MAX_RADIUS_KM } from "@/lib/matching";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export default function SettingsAvailabilityPage() {
  const {
    theme,
    accountType,
    userProfile,
    updateUserProfile,
    setProLive,
    proLive,
  } = useApp();
  const isLight = theme === "light";
  const [radius, setRadius] = useState(8);
  const [vacation, setVacation] = useState(false);
  const [days, setDays] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(DAYS.map((d) => [d, true]))
  );
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (userProfile?.serviceRadiusKm != null) {
      setRadius(
        Math.min(MAX_RADIUS_KM, Math.max(1, userProfile.serviceRadiusKm))
      );
    }
    try {
      const raw = localStorage.getItem(
        `ona-pro-schedule:${userProfile?.email || "x"}`
      );
      if (raw) {
        const p = JSON.parse(raw) as {
          days?: Record<string, boolean>;
          vacation?: boolean;
        };
        if (p.days) setDays(p.days);
        if (typeof p.vacation === "boolean") setVacation(p.vacation);
      }
    } catch {
      /* */
    }
  }, [userProfile]);

  if (accountType !== "professional") {
    return (
      <div className={cn("flex h-full flex-col", isLight ? "bg-[#c8c9cd]" : "bg-black")}>
        <PageHeader title="Availability" backHref="/settings" />
        <p className="px-4 text-[13px]">Repair Pros only.</p>
      </div>
    );
  }

  const save = () => {
    setErr(null);
    setMsg(null);
    const e = updateUserProfile({
      serviceRadiusKm: radius,
    });
    if (e) {
      setErr(e);
      return;
    }
    try {
      localStorage.setItem(
        `ona-pro-schedule:${userProfile?.email || "x"}`,
        JSON.stringify({ days, vacation })
      );
    } catch {
      /* */
    }
    if (vacation && proLive) {
      void setProLive(false);
    }
    setMsg(
      vacation
        ? "Saved. Vacation mode — Live turned off for new jobs."
        : "Availability & radius saved."
    );
  };

  return (
    <div
      className={cn(
        "flex h-full flex-col",
        isLight ? "bg-[#c8c9cd]" : "bg-black"
      )}
    >
      <PageHeader
        title="Availability & scheduling"
        subtitle="Hours, time off, coverage"
        backHref="/settings"
      />
      <div className="flex-1 space-y-3 overflow-y-auto px-3 pb-6 scrollbar-hide">
        <div
          className={cn(
            "flex items-center justify-between rounded-md px-3 py-3",
            isLight ? "bg-[#d4d5d9]" : "bg-[#1c1c1e]"
          )}
        >
          <div>
            <p
              className={cn(
                "text-[13px] font-bold",
                isLight ? "text-slate-900" : "text-white"
              )}
            >
              Vacation mode
            </p>
            <p
              className={cn(
                "text-[11px] font-medium",
                isLight ? "text-slate-600" : "text-white/60"
              )}
            >
              Pauses new job requests (turns Live off).
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={vacation}
            onClick={() => setVacation((v) => !v)}
            className={cn(
              "h-7 w-12 shrink-0 rounded-full border-0",
              vacation ? "bg-[#FF6B35]" : isLight ? "bg-black/20" : "bg-white/20"
            )}
          >
            <span
              className={cn(
                "block h-5 w-5 rounded-full bg-white transition-transform",
                vacation ? "translate-x-6" : "translate-x-1"
              )}
            />
          </button>
        </div>

        <div
          className={cn(
            "rounded-md px-3 py-3",
            isLight ? "bg-[#d4d5d9]" : "bg-[#1c1c1e]"
          )}
        >
          <p
            className={cn(
              "mb-2 text-[13px] font-bold",
              isLight ? "text-slate-900" : "text-white"
            )}
          >
            Available days
          </p>
          <div className="flex flex-wrap gap-1.5">
            {DAYS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDays((prev) => ({ ...prev, [d]: !prev[d] }))}
                className={cn(
                  "rounded-md border-0 px-2.5 py-1.5 text-[11px] font-bold",
                  days[d]
                    ? "bg-[#FF6B35] text-white"
                    : isLight
                      ? "bg-black/10 text-slate-700"
                      : "bg-white/10 text-white/70"
                )}
              >
                {d}
              </button>
            ))}
          </div>
          <SettingsComingSoon
            isLight={isLight}
            title="Hourly time blocks (e.g. 9:00–17:00)"
          />
        </div>

        <div
          className={cn(
            "rounded-md px-3 py-3",
            isLight ? "bg-[#d4d5d9]" : "bg-[#1c1c1e]"
          )}
        >
          <SettingsField
            label={`Coverage radius · ${radius} km (max ${MAX_RADIUS_KM})`}
            isLight={isLight}
          >
            <input
              type="range"
              min={1}
              max={MAX_RADIUS_KM}
              step={0.5}
              value={radius}
              onChange={(e) => setRadius(Number(e.target.value))}
              className="radius-slider w-full"
              style={
                {
                  ["--pct" as string]: `${(radius / MAX_RADIUS_KM) * 100}%`,
                } as React.CSSProperties
              }
            />
          </SettingsField>
          <SettingsSaveBar
            isLight={isLight}
            msg={msg}
            err={err}
            onSave={save}
          />
        </div>
      </div>
    </div>
  );
}
