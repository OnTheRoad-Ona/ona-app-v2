"use client";

import { useRef } from "react";
import {
  Battery,
  Car,
  CircleDot,
  Cpu,
  Droplets,
  Fan,
  Grid2x2,
  Paintbrush,
  Plug,
  Wrench,
} from "lucide-react";
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
  { id: "battery", label: "Battery", icon: Battery },
  { id: "ac", label: "A/C", icon: Fan },
  { id: "body", label: "Body", icon: Paintbrush },
  { id: "electrical", label: "Electric", icon: Plug },
  { id: "diagnostics", label: "Scan", icon: Cpu },
  { id: "wash", label: "Wash", icon: Droplets },
  { id: "all", label: "All", icon: Grid2x2 },
];

/**
 * One continuous gray banner of service options (no cell borders).
 * Scroll gestures: inverted so trackpad/wheel feel natural —
 * content-scroll-up (deltaY > 0) expands panel; opposite collapses.
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

  /**
   * Natural scroll direction (fixes inverted feel):
   * scroll content up / fingers swipe up → panel up (expand)
   * scroll content down → panel down (collapse)
   * On wheel: content up ≈ deltaY > 0 with natural scrolling.
   */
  const onAxisWheel = (e: React.WheelEvent) => {
    if (!onExpand || !onCollapse) return;
    // Scroll up (content moves up) → panel expands
    if (e.deltaY > 0 && !expanded) {
      e.preventDefault();
      e.stopPropagation();
      onExpand();
      return;
    }
    // Scroll down → panel collapses
    if (e.deltaY < 0 && expanded) {
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
    // Finger moves up on screen → panel up
    if (!expanded && dy < -14) {
      onExpand();
      touchY.current = null;
      return;
    }
    // Finger moves down → panel down
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
          "grid grid-cols-5 gap-0 rounded-lg p-0.5",
          isLight
            ? "bg-gradient-to-b from-slate-100 to-slate-50"
            : "bg-gradient-to-b from-[#1a1a1a] to-[#141414]"
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
                "flex min-w-0 flex-col items-center justify-center gap-0.5 border-0 px-0.5 py-2 text-[9px] font-semibold transition-colors",
                active
                  ? "metallic-orange text-white rounded-md"
                  : isLight
                    ? "bg-transparent text-slate-500 hover:text-slate-800"
                    : "bg-transparent text-[#a0a0a0] hover:text-white"
              )}
            >
              <Icon
                className="h-4 w-4 shrink-0"
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
