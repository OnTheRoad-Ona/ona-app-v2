"use client";

import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

/** Modern single-line radius control (Uber-style) */
export function RadiusSlider() {
  const { radiusMiles, setRadiusMiles, theme } = useApp();
  const isLight = theme === "light";

  return (
    <div className="px-4 py-2">
      <div
        className={cn(
          "flex items-center gap-3 rounded-xl px-3 py-2.5",
          isLight ? "bg-slate-50" : "matte-metal-inset"
        )}
      >
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex items-center justify-between">
            <span
              className={cn(
                "text-[11px] font-semibold tracking-wide uppercase",
                isLight ? "text-slate-500" : "text-white/60"
              )}
            >
              Radius
            </span>
            <span
              className={cn(
                "rounded-md px-2 py-0.5 text-[12px] font-bold tabular-nums",
                isLight
                  ? "bg-white text-slate-900 shadow-sm"
                  : "bg-white/15 text-white"
              )}
            >
              {radiusMiles} mi
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={radiusMiles}
            onChange={(e) => setRadiusMiles(Number(e.target.value))}
            className="radius-slider w-full"
            style={{ ["--pct" as string]: `${radiusMiles}%` }}
            aria-label="Search radius in miles"
          />
        </div>
      </div>
    </div>
  );
}
