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

export function FilterChips() {
  const { filters, toggleFilter, theme } = useApp();
  const isLight = theme === "light";

  return (
    <div className="flex gap-1.5 overflow-x-auto px-3 py-1.5 scrollbar-hide">
      {chips.map(({ key, label, star }) => {
        const active = filters[key];
        return (
          <button
            key={key}
            type="button"
            onClick={() => toggleFilter(key)}
            className={cn(
              "inline-flex shrink-0 items-center gap-0.5 rounded-md border-0 px-2 py-1 text-[10px] font-semibold transition-colors",
              active
                ? "metallic-orange text-white"
                : isLight
                  ? "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  : "matte-metal-inset text-white/90 hover:brightness-110"
            )}
            aria-pressed={active}
          >
            {star && (
              <Star
                className={cn(
                  "h-2.5 w-2.5",
                  active
                    ? "fill-white text-white"
                    : "fill-amber-400 text-amber-400"
                )}
              />
            )}
            {label}
          </button>
        );
      })}
    </div>
  );
}
