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

/**
 * Full gray segmented control — active & inactive both gray so the bar
 * blends as one unit (no orange). Active is a slightly lifted gray +
 * brighter label; inactive stays softer on the same track.
 */
export function FilterChips() {
  const { filters, toggleFilter, theme } = useApp();
  const isLight = theme === "light";

  return (
    <div className="px-3 py-1">
      <div
        className={cn(
          "flex w-full gap-px overflow-hidden rounded-none",
          isLight
            ? "bg-[#d0d5de] backdrop-blur-sm"
            : "bg-[#2a2a2a]"
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
              onClick={() => toggleFilter(key)}
              className={cn(
                "inline-flex min-w-0 flex-1 items-center justify-center gap-0.5 rounded-none border-0 px-1 py-1.5 text-[10px] font-semibold transition-colors",
                active
                  ? isLight
                    ? "bg-[#b8c0cc] text-[#1e293b]"
                    : "bg-[#3d3d3d] text-white"
                  : isLight
                    ? "bg-transparent text-[#6b7585] hover:bg-[#c4cad4]/55 hover:text-[#1e293b]"
                    : "bg-transparent text-[#c4c4c4] hover:bg-white/[0.06] hover:text-white"
              )}
              aria-pressed={active}
            >
              {star && (
                <Star
                  className={cn(
                    "h-2.5 w-2.5 shrink-0",
                    active
                      ? isLight
                        ? "fill-[#1e293b] text-[#1e293b]"
                        : "fill-white text-white"
                      : "fill-amber-400 text-amber-400"
                  )}
                />
              )}
              <span className="truncate">{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
