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

/** Single gray banner of filters — no chip borders / gaps between options */
export function FilterChips() {
  const { filters, toggleFilter, theme } = useApp();
  const isLight = theme === "light";

  return (
    <div className="px-3 py-1">
      <div
        className={cn(
          "flex w-full overflow-hidden rounded-lg",
          isLight
            ? "bg-gradient-to-r from-slate-100 via-slate-50 to-slate-100"
            : "bg-gradient-to-r from-[#1a1a1a] via-[#161616] to-[#1a1a1a]"
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
                "inline-flex min-w-0 flex-1 items-center justify-center gap-0.5 border-0 px-1 py-1.5 text-[10px] font-semibold transition-colors",
                active
                  ? "metallic-orange text-white"
                  : isLight
                    ? "bg-transparent text-slate-600 hover:text-slate-900"
                    : "bg-transparent text-[#b0b0b0] hover:text-white"
              )}
              aria-pressed={active}
            >
              {star && (
                <Star
                  className={cn(
                    "h-2.5 w-2.5 shrink-0",
                    active
                      ? "fill-white text-white"
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
