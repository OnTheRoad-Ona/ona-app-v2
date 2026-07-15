"use client";

import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Full-star pattern + text: ★★★☆☆  3 stars of 5 (3.1+ rating)
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
  /** Only the filled/empty star row (no text) */
  starsOnly?: boolean;
}) {
  const r = Math.max(0, Math.min(max, Number(rating) || 0));
  const full = Math.floor(r + 1e-9);
  const dim =
    size === "lg" ? "h-4 w-4" : size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5";
  const starsOf = Math.min(max, Math.max(0, Math.round(r)));

  return (
    <span
      className={cn(
        "inline-flex flex-wrap items-center gap-1.5",
        className
      )}
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
                  ? "fill-amber-400 text-amber-400"
                  : "fill-transparent text-amber-400/35"
              )}
              strokeWidth={2}
            />
          );
        })}
      </span>
      {showNumeric && !starsOnly && (
        <span
          className={cn(
            "font-bold tabular-nums leading-none",
            size === "sm" ? "text-[10px]" : "text-[12px]"
          )}
        >
          {starsOf} star{starsOf === 1 ? "" : "s"} of {max}{" "}
          <span className="font-semibold opacity-80">
            ({r.toFixed(1)}+ rating)
          </span>
        </span>
      )}
    </span>
  );
}
