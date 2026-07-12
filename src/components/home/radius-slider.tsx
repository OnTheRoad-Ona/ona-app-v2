"use client";

import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

export function RadiusSlider() {
  const { radiusMiles, setRadiusMiles, visibleTechnicians, theme } = useApp();
  const isLight = theme === "light";

  return (
    <div className="px-3 pt-0.5 pb-0.5">
      <div className="mb-1 flex items-center justify-between text-[11px]">
        <span
          className={cn(
            "font-semibold",
            isLight ? "text-slate-700" : "text-white/90"
          )}
        >
          Search Radius
        </span>
        <span
          className={cn(
            "font-bold tabular-nums",
            isLight ? "text-slate-900" : "text-white"
          )}
        >
          {radiusMiles} mi · {visibleTechnicians.length} nearby
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
      <div
        className={cn(
          "mt-0.5 flex justify-between text-[9px]",
          isLight ? "text-slate-400" : "text-white/50"
        )}
      >
        <span>0</span>
        <span>100 miles</span>
      </div>
    </div>
  );
}
