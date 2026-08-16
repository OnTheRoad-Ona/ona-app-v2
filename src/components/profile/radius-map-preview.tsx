"use client";

import { MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Lightweight service-radius preview (no heavy map dependency).
 * Shows pin + radius ring scaled to max 5 km marketplace.
 */
export function RadiusMapPreview({
  radiusKm,
  label,
  isLight,
  className,
}: {
  radiusKm: number;
  label?: string;
  isLight: boolean;
  className?: string;
}) {
  const r = Math.min(5, Math.max(0.5, radiusKm));
  // Ring size: 28%–88% of box
  const pct = 28 + (r / 5) * 60;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl",
        isLight ? "bg-[#0a1610]" : "bg-[#0a0000]",
        className
      )}
      style={{ height: 140 }}
      aria-label={`Service radius ${r} km${label ? ` near ${label}` : ""}`}
    >
      {/* Fake map grid */}
      <div
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            "linear-gradient(rgba(168,201,181,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(168,201,181,0.15) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-brand/80 bg-brand/15"
        style={{ width: `${pct}%`, height: `${pct}%` }}
      />
      <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center">
        <MapPin className="h-6 w-6 fill-brand text-brand" strokeWidth={1.5} />
      </div>
      <div className="absolute bottom-2 left-2 rounded-lg bg-black/55 px-2 py-1 text-[10px] font-bold text-white">
        {r} km radius
        {label ? ` · ${label}` : ""}
      </div>
    </div>
  );
}
