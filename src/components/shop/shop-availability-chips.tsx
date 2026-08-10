"use client";

import {
  Ban,
  CalendarClock,
  LayoutGrid,
  PackageCheck,
  PackageMinus,
  PackageX,
  Timer,
  type LucideIcon,
} from "lucide-react";
import { LISTING_FILTER_CHIPS, type ListingFilterKey } from "@/lib/shop/listing-status";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

const STOCK_ICONS: Record<string, LucideIcon> = {
  all: LayoutGrid,
  available: PackageCheck,
  low_stock: PackageMinus,
  out_of_stock: PackageX,
  pre_order: CalendarClock,
  coming_soon: Timer,
  discontinued: Ban,
};

type Props = {
  value: ListingFilterKey;
  onChange: (next: ListingFilterKey) => void;
  className?: string;
};

/**
 * Icon + tiny sub-label inventory filter row: All / Available / Low stock /
 * Out of stock / Pre-order / Coming soon / Discontinued.
 */
export function ShopAvailabilityChips({ value, onChange, className }: Props) {
  const { theme } = useApp();
  const isLight = theme === "light";

  const track = isLight ? "bg-[#b4b6bd]" : "bg-[#2a2a2a]";
  const activeBox = isLight ? "bg-white text-slate-900 shadow-sm" : "bg-[#3d3d3d] text-white";
  const inactiveBox = isLight
    ? "bg-transparent text-slate-800"
    : "bg-transparent text-[#d0d0d0]";
  const subMuted = isLight ? "text-slate-500" : "text-white/50";

  return (
    <div className={cn("px-3 pt-3", className)}>
      <div
        className={cn(
          "flex w-full items-stretch gap-px overflow-x-auto rounded-xl",
          track
        )}
        role="group"
        aria-label="Availability"
      >
        {LISTING_FILTER_CHIPS.map((chip) => {
          const active = value === chip.key;
          const Icon = STOCK_ICONS[chip.key] ?? PackageCheck;
          return (
            <button
              key={chip.key}
              type="button"
              onClick={() => onChange(chip.key)}
              aria-pressed={active}
              className={cn(
                "flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-none border-0 px-1 py-1.5 transition-colors",
                active ? activeBox : inactiveBox
              )}
            >
              <Icon
                className={cn(
                  "h-4 w-4",
                  active
                    ? "text-[#FF6B35]"
                    : isLight
                      ? "text-slate-700"
                      : "text-[#d0d0d0]"
                )}
                strokeWidth={2.2}
              />
              <span className="flex w-full justify-center">
                <span
                  className={cn(
                    "text-center text-[9px] font-bold leading-tight",
                    active ? undefined : subMuted
                  )}
                >
                  {chip.label}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}