"use client";

import { useApp } from "@/lib/store";
import { MAX_RADIUS_KM } from "@/lib/matching";
import { cn } from "@/lib/utils";

/** Compact radius control in kilometers (0–10 km) */
export function RadiusSlider() {
  const { radiusKm, setRadiusKm, theme } = useApp();
  const isLight = theme === "light";
  const pct = (radiusKm / MAX_RADIUS_KM) * 100;

  return (
    <div className="flex items-center gap-2 px-4 py-1">
      <span
        className={cn(
          "shrink-0 text-[10px] font-semibold",
          isLight ? "text-slate-500" : "text-white/65"
        )}
      >
        Radius
      </span>
      <input
        type="range"
        min={0}
        max={MAX_RADIUS_KM}
        step={0.5}
        value={radiusKm}
        onChange={(e) => setRadiusKm(Number(e.target.value))}
        className="radius-slider min-w-0 flex-1"
        style={{ ["--pct" as string]: `${pct}%` }}
        aria-label="Search radius in kilometers"
      />
      <span
        className={cn(
          "shrink-0 tabular-nums text-[11px] font-bold",
          isLight ? "text-slate-900" : "text-white"
        )}
      >
        {radiusKm} km
      </span>
    </div>
  );
}
