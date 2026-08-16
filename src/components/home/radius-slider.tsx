"use client";

import { useT } from "@/lib/i18n";
import { useApp } from "@/lib/store";
import { MAX_RADIUS_KM } from "@/lib/matching";
import { cn } from "@/lib/utils";

/** Compact radius control in kilometers (0–5 km) */
export function RadiusSlider() {
  const { radiusKm, setRadiusKm, theme } = useApp();
  const t = useT();
  const isLight = theme === "light";
  const pct = (radiusKm / MAX_RADIUS_KM) * 100;

  return (
    <div className="flex h-8 items-center gap-2 px-4 py-0">
      <span
        className={cn(
          "shrink-0 text-[10px] font-bold leading-none tracking-wide uppercase",
          isLight ? "text-[#4a5568]" : "text-white/80"
        )}
      >
        {t("home.radius")}
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
        aria-label={t("home.searchRadiusAria")}
      />
      <span
        className="shrink-0 tabular-nums text-[12px] font-black leading-none"
        style={{ color: "#FF6B35" }}
      >
        {radiusKm}
        <span className="ml-0.5 text-[10px] font-bold opacity-80">km</span>
      </span>
    </div>
  );
}
