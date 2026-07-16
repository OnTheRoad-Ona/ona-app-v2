"use client";

import { Star } from "lucide-react";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * Compact stars + number: ★★★★☆  4.5
 * High contrast on light gray / white sheets and dark surfaces.
 */
export function StarRatingDisplay({
  rating,
  max = 5,
  className,
  size = "md",
  showNumeric = true,
  starsOnly = false,
}: {
  rating: number;
  max?: number;
  className?: string;
  size?: "sm" | "md" | "lg";
  showNumeric?: boolean;
  starsOnly?: boolean;
}) {
  const { theme } = useApp();
  const isLight = theme === "light";
  const r = Math.max(0, Math.min(max, Number(rating) || 0));
  const full = Math.floor(r + 1e-9);
  const dim =
    size === "lg" ? "h-4 w-4" : size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5";

  return (
    <span
      className={cn("inline-flex items-center gap-1", className)}
      aria-label={`${r.toFixed(1)} out of ${max} stars`}
    >
      <span className="inline-flex items-center gap-0.5" aria-hidden>
        {Array.from({ length: max }, (_, i) => {
          const filled = i < full;
          return (
            <Star
              key={i}
              className={cn(
                dim,
                filled
                  ? // Solid gold — readable on white / light gray / dark
                    "fill-[#f59e0b] text-[#d97706]"
                  : isLight
                    ? // Empty outline clearly visible on white/light wash
                      "fill-none text-slate-500"
                    : "fill-none text-white/55"
              )}
              strokeWidth={2.25}
            />
          );
        })}
      </span>
      {showNumeric && !starsOnly && (
        <span
          className={cn(
            "font-bold tabular-nums leading-none",
            size === "sm" ? "text-[10px]" : "text-[12px]",
            isLight ? "text-slate-900" : "text-white"
          )}
        >
          {r.toFixed(1)}
        </span>
      )}
    </span>
  );
}
