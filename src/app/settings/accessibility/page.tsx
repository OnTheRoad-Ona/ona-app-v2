"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

const KEY = "ona-a11y-font-scale";

export default function SettingsAccessibilityPage() {
  const { theme } = useApp();
  const isLight = theme === "light";
  const [scale, setScale] = useState(100);
  const [highContrast, setHighContrast] = useState(false);

  useEffect(() => {
    try {
      const s = Number(localStorage.getItem(KEY) || "100");
      if (s >= 90 && s <= 130) setScale(s);
      setHighContrast(localStorage.getItem(`${KEY}-hc`) === "1");
    } catch {
      /* */
    }
  }, []);

  const applyScale = (n: number) => {
    const next = Math.min(130, Math.max(90, n));
    setScale(next);
    try {
      localStorage.setItem(KEY, String(next));
      document.documentElement.style.fontSize = `${next}%`;
    } catch {
      /* */
    }
  };

  const applyHc = (on: boolean) => {
    setHighContrast(on);
    try {
      localStorage.setItem(`${KEY}-hc`, on ? "1" : "0");
      document.documentElement.dataset.a11yHc = on ? "1" : "0";
    } catch {
      /* */
    }
  };

  return (
    <div
      className={cn(
        "flex h-full flex-col",
        isLight ? "bg-[#c8c9cd]" : "bg-black",
      )}
    >
      <PageHeader
        title="Accessibility"
        subtitle="Text size & readability"
        backHref="/settings"
      />
      <div className="flex-1 space-y-3 overflow-y-auto px-3 pb-6 scrollbar-hide">
        <div className={cn("rounded-md px-3 py-3", "bg-transparent")}>
          <p
            className={cn(
              "text-[13px] font-bold",
              isLight ? "text-slate-900" : "text-white",
            )}
          >
            Text size
          </p>
          <p
            className={cn(
              "mt-0.5 text-[11px] font-medium",
              isLight ? "text-slate-600" : "text-white/60",
            )}
          >
            Current {scale}%
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              className="h-10 flex-1 rounded-md border-0 bg-[#323231] text-[13px] font-bold text-white"
              onClick={() => applyScale(scale - 10)}
            >
              A− Decrease
            </button>
            <button
              type="button"
              className="h-10 flex-1 rounded-md border-0 bg-[#323231] text-[13px] font-bold text-white"
              onClick={() => applyScale(scale + 10)}
            >
              A+ Increase
            </button>
          </div>
          <button
            type="button"
            className={cn(
              "mt-2 w-full border-0 bg-transparent text-[11px] font-semibold",
              isLight ? "text-slate-600" : "text-white/55",
            )}
            onClick={() => applyScale(100)}
          >
            Reset to default
          </button>
        </div>

        <div
          className={cn(
            "flex items-center justify-between gap-3 rounded-md px-3 py-3",
            "bg-transparent",
          )}
        >
          <div>
            <p
              className={cn(
                "text-[13px] font-bold",
                isLight ? "text-slate-900" : "text-white",
              )}
            >
              Stronger contrast
            </p>
            <p
              className={cn(
                "text-[11px] font-medium",
                isLight ? "text-slate-600" : "text-white/60",
              )}
            >
              Preference saved on this device.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={highContrast}
            onClick={() => applyHc(!highContrast)}
            className={cn(
              "h-7 w-12 shrink-0 rounded-full border-0",
              highContrast
                ? "bg-[#FF6B35]"
                : isLight
                  ? "bg-black/20"
                  : "bg-white/20",
            )}
          >
            <span
              className={cn(
                "block h-5 w-5 rounded-full bg-white transition-transform",
                highContrast ? "translate-x-6" : "translate-x-1",
              )}
            />
          </button>
        </div>
      </div>
    </div>
  );
}
