"use client";

import { Star } from "lucide-react";
import { useApp } from "@/lib/store";
import type { AppFilters } from "@/lib/types";
import { cn } from "@/lib/utils";

const chips: { key: keyof AppFilters; label: string; star?: boolean }[] = [
  { key: "nearest", label: "Nearest" },
  { key: "rating45", label: "4.5+", star: true },
  { key: "availableNow", label: "Available" },
  { key: "verified", label: "Verified" },
  { key: "fastResponse", label: "Fast" },
];

const FILTER_HINT: Record<keyof AppFilters, string> = {
  nearest: "Sort by closest first",
  rating45: "Only pros rated 4.5 or higher",
  availableNow: "Only Live pros with GPS",
  verified: "Only verified pros",
  fastResponse: "Only fast-reply pros",
};

/**
 * Segmented filters — each chip filters map pins + list (see matching.ts).
 */
export function FilterChips() {
  const { filters, toggleFilter, theme, visibleTechnicians } = useApp();
  const isLight = theme === "light";

  return (
    <div className="px-3 py-1">
      <div
        className={cn(
          "flex w-full gap-px overflow-hidden rounded-md",
          isLight ? "bg-[#c5ccd6]" : "bg-[#2a2a2a]"
        )}
        role="group"
        aria-label="Filters"
      >
        {chips.map(({ key, label, star }) => {
          const active = filters[key];

          return (
            <button
              key={key}
              type="button"
              title={FILTER_HINT[key]}
              onClick={() => toggleFilter(key)}
              className={cn(
                "inline-flex min-w-0 flex-1 items-center justify-center gap-0.5 rounded-none border-0 px-1 py-1.5 text-[10px] font-bold transition-colors",
                active
                  ? isLight
                    ? "bg-white text-slate-900 shadow-sm"
                    : "bg-[#3d3d3d] text-white"
                  : isLight
                    ? "bg-transparent text-slate-800 hover:bg-white/50"
                    : "bg-transparent text-[#d0d0d0] hover:bg-white/[0.06] hover:text-white"
              )}
              aria-pressed={active}
              aria-label={`${label}. ${FILTER_HINT[key]}. ${visibleTechnicians.length} match.`}
            >
              {star && (
                <Star
                  className={cn(
                    "h-2.5 w-2.5 shrink-0",
                    active
                      ? isLight
                        ? "fill-[#f59e0b] text-[#d97706]"
                        : "fill-amber-400 text-amber-400"
                      : isLight
                        ? "fill-[#f59e0b] text-[#b45309]"
                        : "fill-amber-400 text-amber-400"
                  )}
                  strokeWidth={2.25}
                />
              )}
              <span
                className={cn(
                  "truncate",
                  // Available chip: extra emphasis so it never washes out
                  key === "availableNow" &&
                    !active &&
                    (isLight ? "text-emerald-800" : "text-emerald-300"),
                  key === "availableNow" &&
                    active &&
                    (isLight ? "text-emerald-800" : "text-emerald-300")
                )}
              >
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
