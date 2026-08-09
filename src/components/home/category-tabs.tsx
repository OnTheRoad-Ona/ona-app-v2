"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Car,
  ChevronRight,
  CircleDot,
  Cpu,
  Droplets,
  Fan,
  Grid2x2,
  Hammer,
  Paintbrush,
  PaintRoller,
  Plug,
  ShowerHead,
  Sun,
  Wrench,
  Zap,
} from "lucide-react";
import { isSpecialtyPickerTrade } from "@/lib/artisan/catalog";
import { useT, type MessageKey } from "@/lib/i18n";
import { useApp } from "@/lib/store";
import { CarBattery } from "@/lib/services";
import type { ServiceCategory } from "@/lib/types";
import { cn } from "@/lib/utils";

const ALL_TABS: {
  id: ServiceCategory;
  labelKey: MessageKey;
  icon: typeof Wrench;
}[] = [
  { id: "mechanic", labelKey: "trade.mechanic", icon: Wrench },
  { id: "vulcanizer", labelKey: "trade.vulcanizer", icon: CircleDot },
  { id: "towing", labelKey: "trade.towing", icon: Car },
  { id: "battery", labelKey: "trade.battery", icon: CarBattery },
  { id: "ac", labelKey: "trade.ac", icon: Fan },
  { id: "body", labelKey: "trade.body", icon: Paintbrush },
  { id: "electrical", labelKey: "trade.electrical", icon: Plug },
  { id: "diagnostics", labelKey: "trade.diagnostics", icon: Cpu },
  { id: "wash", labelKey: "trade.wash", icon: Droplets },
  { id: "plumber", labelKey: "trade.plumber", icon: ShowerHead },
  { id: "carpenter", labelKey: "trade.carpenter", icon: Hammer },
  { id: "painter", labelKey: "trade.painter", icon: PaintRoller },
  { id: "solar", labelKey: "trade.solar", icon: Sun },
  { id: "generator", labelKey: "trade.generator", icon: Zap },
  /** Replaces former "All" — opens ONA Shop (repair commerce) */
  { id: "all", labelKey: "trade.shop", icon: Grid2x2 },
];

/**
 * Trade strip (5 columns, wraps rows). Swipe left → help page.
 */
export function CategoryTabs({
  expanded,
  onExpand,
  onCollapse,
  onSwipeLeft,
  onSwipeRight,
  onOpenHelp,
  menuOpen,
}: {
  expanded?: boolean;
  onExpand?: () => void;
  onCollapse?: () => void;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onOpenHelp?: () => void;
  menuOpen?: boolean;
}) {
  const { category, setCategory, openSpecialtyPicker, theme } = useApp();
  const t = useT();
  const router = useRouter();
  const isLight = theme === "light";
  const start = useRef<{ x: number; y: number } | null>(null);
  const moved = useRef(false);
  // Full motorist trade bar — always show every shipped trade
  const tabs = ALL_TABS;

  const onAxisWheel = (e: React.WheelEvent) => {
    if (!onExpand || !onCollapse) return;
    if (e.deltaY > 0 && !expanded) {
      e.preventDefault();
      e.stopPropagation();
      onExpand();
      return;
    }
    if (e.deltaY < 0 && expanded) {
      e.preventDefault();
      e.stopPropagation();
      onCollapse();
    }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    start.current = { x: e.clientX, y: e.clientY };
    moved.current = false;
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!start.current) return;
    const dx = e.clientX - start.current.x;
    const dy = e.clientY - start.current.y;
    if (Math.abs(dx) > 12 || Math.abs(dy) > 12) moved.current = true;
  };

  const finishGesture = (clientX: number, clientY: number) => {
    if (!start.current) return;
    const dx = clientX - start.current.x;
    const dy = clientY - start.current.y;
    start.current = null;

    // Horizontal swipe (lower threshold so it fires on mobile)
    if (Math.abs(dx) >= 28 && Math.abs(dx) > Math.abs(dy) * 0.9) {
      if (dx < 0) onSwipeLeft?.();
      else onSwipeRight?.();
      return;
    }

    if (!onExpand || !onCollapse) return;
    if (!expanded && dy < -18) onExpand();
    else if (expanded && dy > 18) onCollapse();
  };

  const onPointerUp = (e: React.PointerEvent) => {
    finishGesture(e.clientX, e.clientY);
  };

  const onTouchStart = (e: React.TouchEvent) => {
    start.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };
    moved.current = false;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!start.current) return;
    const dx = e.touches[0].clientX - start.current.x;
    const dy = e.touches[0].clientY - start.current.y;
    if (Math.abs(dx) > 12 || Math.abs(dy) > 12) moved.current = true;
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    const t = e.changedTouches[0];
    if (!t) {
      start.current = null;
      return;
    }
    finishGesture(t.clientX, t.clientY);
  };

  return (
    <div
      className="relative px-3 pt-1 pb-1"
      onWheel={onAxisWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        start.current = null;
      }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      style={{ touchAction: "pan-y pinch-zoom" }}
    >
      <div
        role="tablist"
        aria-label={t("home.serviceCategory")}
        className={cn(
          "relative grid grid-cols-5 gap-0 rounded-xl p-0.5",
                isLight
                  ? "bg-[#d8dce4]/90"
                  : "bg-gradient-to-b from-[#1a1a1a] to-[#141414]"
        )}
      >
        {tabs.map(({ id, labelKey, icon: Icon }) => {
          const active = category === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => {
                // Ignore click if this was a swipe
                if (moved.current) return;
                // Former "All" → ONA Shop (repair commerce)
                if (id === "all") {
                  router.push("/shop");
                  return;
                }
                // Re-tap same specialty trade → show Home/Office/… strip again
                if (id === category && isSpecialtyPickerTrade(id)) {
                  openSpecialtyPicker();
                  return;
                }
                setCategory(id);
              }}
              style={{
                fontSize: expanded ? 10.08 : 9,
              }}
              className={cn(
                "flex min-w-0 flex-col items-center justify-center gap-0.5 border-0 px-1 py-2.5 font-semibold rounded-md",
                active && !menuOpen
                  ? "metallic-orange text-white"
                  : isLight
                    ? "bg-transparent text-black hover:text-black"
                    : "bg-transparent text-[#a0a0a0] hover:text-white"
              )}
            >
              <Icon
                style={{
                  width: expanded ? 18.24 : 16,
                  height: expanded ? 18.24 : 16,
                }}
                className={cn(
                  "shrink-0",
                  !active && isLight && "text-black"
                )}
                strokeWidth={active ? 2.4 : 2}
              />
              <span className="truncate leading-none">{t(labelKey)}</span>
            </button>
          );
        })}

        {/* Small bounce arrow: middle of A/C (top-right) and All (bottom-right) — no 3rd row */}
        {onOpenHelp && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenHelp();
            }}
            aria-label={t("home.helpSomeone")}
            className={cn(
              "absolute right-0.5 top-1/2 z-10 flex h-6 w-6 -translate-y-1/2 items-center justify-center border-0 bg-transparent p-0"
            )}
          >
            <span
              className={cn(
                "om-bounce-arrow flex h-5 w-5 items-center justify-center rounded-full",
                isLight
                  ? "bg-white/90 text-black shadow-sm ring-1 ring-black/8"
                  : "bg-white/15 text-white ring-1 ring-white/15"
              )}
            >
              <ChevronRight className="h-3 w-3" strokeWidth={2.75} />
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
