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
  const hasRating = r > 0;
  const dim =
    size === "lg" ? "h-4 w-4" : size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5";

  return (
    <span
      className={cn("inline-flex items-center gap-1", className)}
      aria-label={
        hasRating
          ? `${r.toFixed(1)} out of ${max} stars`
          : `No ratings yet · ${max} empty stars`
      }
    >
      <span className="inline-flex items-center gap-0.5" aria-hidden>
        {Array.from({ length: max }, (_, i) => {
          const filled = hasRating && i < full;
          return (
            <Star
              key={i}
              className={cn(
                dim,
                filled
                  ? "fill-[#FF6B35] text-[#FF6B35]"
                  : isLight
                    ? // Empty / transparent outline until users rate
                      "fill-transparent text-slate-400/55"
                    : "fill-transparent text-white/30",
              )}
              strokeWidth={1.75}
            />
          );
        })}
      </span>
      {showNumeric && !starsOnly && hasRating && (
        <span
          className={cn(
            "font-bold tabular-nums leading-none",
            size === "sm" ? "text-[10px]" : "text-[12px]",
            isLight ? "text-slate-900" : "text-white",
          )}
        >
          {r.toFixed(1)}
        </span>
      )}
    </span>
  );
}
