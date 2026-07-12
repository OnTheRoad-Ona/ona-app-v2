"use client";

import { useRef } from "react";
import { Car, CircleDot, Grid2x2, Wrench } from "lucide-react";
import { useApp } from "@/lib/store";
import type { ServiceCategory } from "@/lib/types";
import { cn } from "@/lib/utils";

const tabs: {
  id: ServiceCategory;
  label: string;
  icon: typeof Wrench;
}[] = [
  { id: "mechanic", label: "Mechanic", icon: Wrench },
  { id: "vulcanizer", label: "Vulcanizer", icon: CircleDot },
  { id: "towing", label: "Tow", icon: Car },
  { id: "all", label: "All", icon: Grid2x2 },
];

/**
 * Service category axis — also expands/collapses the sheet
 * (with the flip pill). List scroll does not.
 */
export function CategoryTabs({
  expanded,
  onExpand,
  onCollapse,
}: {
  expanded?: boolean;
  onExpand?: () => void;
  onCollapse?: () => void;
}) {
  const { category, setCategory, theme } = useApp();
  const isLight = theme === "light";
  const touchY = useRef<number | null>(null);

  /** Scroll up → panel up; scroll down → panel down */
  const onAxisWheel = (e: React.WheelEvent) => {
    if (!onExpand || !onCollapse) return;
    // Scroll up → expand (panel up)
    if (e.deltaY < 0 && !expanded) {
      e.preventDefault();
      e.stopPropagation();
      onExpand();
      return;
    }
    // Scroll down → collapse (panel down)
    if (e.deltaY > 0 && expanded) {
      e.preventDefault();
      e.stopPropagation();
      onCollapse();
    }
  };

  const onAxisTouchStart = (e: React.TouchEvent) => {
    touchY.current = e.touches[0].clientY;
  };

  const onAxisTouchMove = (e: React.TouchEvent) => {
    if (!onExpand || !onCollapse || touchY.current == null) return;
    const dy = e.touches[0].clientY - touchY.current;
    // Drag up → panel up
    if (!expanded && dy < -14) {
      onExpand();
      touchY.current = null;
      return;
    }
    // Drag down → panel down
    if (expanded && dy > 14) {
      onCollapse();
      touchY.current = null;
    }
  };

  return (
    <div
      className="px-3 pt-1 pb-1"
      onWheel={onAxisWheel}
      onTouchStart={onAxisTouchStart}
      onTouchMove={onAxisTouchMove}
    >
      <div
        role="tablist"
        aria-label="Service category"
        className={cn(
          "grid grid-cols-4 gap-1 rounded-xl p-1",
          isLight
            ? "border border-slate-200/80 bg-slate-50"
            : "border border-white/15 bg-black"
        )}
      >
        {tabs.map(({ id, label, icon: Icon }) => {
          const active = category === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setCategory(id)}
              className={cn(
                "flex min-w-0 flex-col items-center justify-center gap-1 rounded-md px-1 py-2 text-[10px] font-semibold border-0 transition-colors",
                active
                  ? "metallic-orange text-white"
                  : isLight
                    ? "bg-transparent text-slate-500 hover:bg-white hover:text-slate-800"
                    : "bg-transparent text-white/75 hover:bg-white/10 hover:text-white"
              )}
            >
              <Icon
                className="h-[18px] w-[18px] shrink-0"
                strokeWidth={active ? 2.4 : 2}
              />
              <span className="truncate leading-none">{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
