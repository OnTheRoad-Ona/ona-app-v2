"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CategoryTabs } from "@/components/home/category-tabs";
import { FilterChips } from "@/components/home/filter-chips";
import { RadiusSlider } from "@/components/home/radius-slider";
import { TechCard } from "@/components/technician/tech-card";
import { useApp } from "@/lib/store";
import type { Technician } from "@/lib/types";
import { cn } from "@/lib/utils";
import { MAX_TECHNICIANS } from "@/lib/matching";

const PAGE_SIZE = 10;

/**
 * Expand/collapse via flip pill + category axis only.
 * Natural direction (fixed invert):
 *  - Scroll content up / swipe fingers up → panel up (expand)
 *  - Scroll content down → panel down (collapse)
 * List scrolls independently inside one gray banner.
 */
export function HomePanel({
  expanded,
  onExpand,
  onCollapse,
  className,
}: {
  expanded: boolean;
  onExpand: () => void;
  onCollapse: () => void;
  className?: string;
}) {
  const router = useRouter();
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const gestureY = useRef<number | null>(null);

  const {
    visibleTechnicians,
    radiusKm,
    setRadiusKm,
    setSelectedTechId,
    selectedTechId,
    locationError,
    retryLocation,
    theme,
  } = useApp();
  const isLight = theme === "light";

  const handleRequest = (tech: Technician) => {
    setSelectedTechId(tech.id);
    router.push(`/request?tech=${tech.id}`);
  };

  // Reset page size when filters / radius / category / query change
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [radiusKm, visibleTechnicians.length]);

  const total = Math.min(visibleTechnicians.length, MAX_TECHNICIANS);
  const list = visibleTechnicians.slice(0, Math.min(visibleCount, total));
  const canShowMore = list.length < total;

  /**
   * Natural scroll: content up (deltaY > 0) → expand;
   * content down (deltaY < 0) → collapse.
   */
  const onSheetWheel = (e: React.WheelEvent) => {
    if (e.deltaY > 0 && !expanded) {
      e.preventDefault();
      onExpand();
      return;
    }
    if (e.deltaY < 0 && expanded) {
      e.preventDefault();
      onCollapse();
    }
  };

  const onSheetTouchStart = (e: React.TouchEvent) => {
    gestureY.current = e.touches[0].clientY;
  };

  const onSheetTouchMove = (e: React.TouchEvent) => {
    if (gestureY.current == null) return;
    const dy = e.touches[0].clientY - gestureY.current;
    // Finger up on screen → panel up
    if (!expanded && dy < -14) {
      onExpand();
      gestureY.current = null;
      return;
    }
    // Finger down → panel down
    if (expanded && dy > 14) {
      onCollapse();
      gestureY.current = null;
    }
  };

  const onPillClick = () => {
    if (expanded) onCollapse();
    else onExpand();
  };

  return (
    <div
      className={cn(
        "relative z-30 flex min-h-0 flex-col transition-all duration-300 ease-out",
        isLight ? "bg-[#c8c9cd]" : "bg-black",
        className
      )}
    >
      <div
        onWheel={onSheetWheel}
        onTouchStart={onSheetTouchStart}
        onTouchMove={onSheetTouchMove}
        className="shrink-0"
      >
        <div
          role="button"
          tabIndex={0}
          aria-label={
            expanded
              ? "Scroll down to collapse panel"
              : "Scroll up to expand panel"
          }
          onClick={onPillClick}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onPillClick();
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              onExpand();
            }
            if (e.key === "ArrowDown") {
              e.preventDefault();
              onCollapse();
            }
          }}
          className="flex cursor-grab justify-center active:cursor-grabbing pb-1 pt-2"
        >
          <span
            className={cn(
              "h-1 w-10 rounded-full",
              isLight ? "bg-[#c5cbd6]" : "bg-white/35"
            )}
          />
        </div>

        <CategoryTabs
          expanded={expanded}
          onExpand={onExpand}
          onCollapse={onCollapse}
        />
        <RadiusSlider />
        <FilterChips />
      </div>

      {locationError && (
        <div
          className="mx-3 mb-1 shrink-0 rounded-md bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-900"
          role="status"
        >
          {locationError}{" "}
          <button
            type="button"
            onClick={retryLocation}
            className="font-bold underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* One continuous gray banner — no borders / card gaps */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-1 scrollbar-hide">
        <div
          className={cn(
            "min-h-full overflow-hidden rounded-lg",
            isLight
              ? "bg-[#d8dce4]/90 backdrop-blur-sm"
              : "bg-gradient-to-b from-[#1a1a1a] via-[#151515] to-[#121212]"
          )}
        >
          {list.length === 0 ? (
            <div className="p-4 text-center">
              <p
                className={cn(
                  "text-sm font-semibold",
                  isLight ? "text-slate-800" : "text-white"
                )}
              >
                No technicians nearby
              </p>
              <p
                className={cn(
                  "mt-1 text-[12px]",
                  isLight ? "text-slate-500" : "text-white/75"
                )}
              >
                Nothing within {radiusKm} km.
              </p>
              <button
                type="button"
                onClick={() => setRadiusKm(10)}
                className="mt-2 text-[12px] font-bold text-brand"
              >
                Set 10 km
              </button>
            </div>
          ) : (
            <>
              {list.map((tech) => (
                <div
                  key={tech.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedTechId(tech.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelectedTechId(tech.id);
                    }
                  }}
                  className="cursor-pointer outline-none"
                >
                  <TechCard
                    tech={tech}
                    onRequest={handleRequest}
                    selected={selectedTechId === tech.id}
                  />
                </div>
              ))}

              {canShowMore && (
                <button
                  type="button"
                  onClick={() =>
                    setVisibleCount((n) =>
                      Math.min(n + PAGE_SIZE, MAX_TECHNICIANS, total)
                    )
                  }
                  className={cn(
                    "w-full border-0 py-2.5 text-[12px] font-bold",
                    isLight
                      ? "bg-transparent text-slate-700 hover:bg-slate-200/60"
                      : "bg-transparent text-white/80 hover:bg-white/[0.04]"
                  )}
                >
                  See more ({list.length} of {total})
                </button>
              )}

              {!canShowMore && total > PAGE_SIZE && (
                <p
                  className={cn(
                    "py-1.5 text-center text-[10px]",
                    isLight ? "text-slate-400" : "text-white/45"
                  )}
                >
                  Showing all {total} within {radiusKm} km
                </p>
              )}
            </>
          )}

          {!expanded && list.length > 0 && (
            <p
              className={cn(
                "py-2 text-center text-[10px]",
                isLight ? "text-slate-400" : "text-white/45"
              )}
            >
              Swipe up to expand · swipe down to collapse
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
