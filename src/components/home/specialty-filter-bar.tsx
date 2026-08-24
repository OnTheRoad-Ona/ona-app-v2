"use client";

/**
 * Temporary strip that replaces Radius for Plumber / Carpenter / Painter /
 * Solar / Generator.
 *
 * Pick → orange highlight + list/map filter immediately → after 2s strip
 * hides and Radius returns (filter stays applied).
 */

import {
  isSpecialtyPickerTrade,
  specialtyChipLabel,
  tradeDef,
} from "@/lib/artisan/catalog";
import { useApp } from "@/lib/store";
import type { ProService } from "@/lib/types";
import { cn } from "@/lib/utils";

export function SpecialtyFilterBar() {
  const { category, specialtyFilter, setSpecialtyFilter, theme } = useApp();
  const isLight = theme === "light";

  if (!isSpecialtyPickerTrade(category)) return null;

  const trade = tradeDef(category as ProService);
  const options = trade?.specialties ?? [];
  if (options.length === 0) return null;

  return (
    <div
      className="flex items-center gap-1 overflow-x-auto px-4 py-1 scrollbar-hide"
      role="group"
      aria-label={`${trade?.homeLabel || category} specialty`}
    >
      {options.map((opt) => {
        const selected = specialtyFilter === opt;
        return (
          <button
            key={opt}
            type="button"
            title={opt}
            aria-pressed={selected}
            onClick={() => setSpecialtyFilter(opt)}
            className={cn(
              "inline-flex shrink-0 items-center justify-center rounded-md border-0 px-2.5 py-1.5 text-[10px] font-bold transition-colors",
              selected
                ? "bg-[#FF6B35] text-white"
                : isLight
                  ? "bg-transparent text-[#475569]"
                  : "bg-transparent text-white/75",
            )}
          >
            {specialtyChipLabel(opt)}
          </button>
        );
      })}
    </div>
  );
}
